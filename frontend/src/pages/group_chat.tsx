import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { useWebSocket } from '../utils/websocket';
import type { WsMessage } from '../utils/websocket';
import { BACKEND_URL, FAILURE_PREFIX } from '../constants/string';
import { Avatar, Button, Input, message, Spin } from 'antd';
import {
  SendOutlined,
  PaperClipOutlined,
  ClockCircleOutlined,
  ArrowLeftOutlined,
  PictureOutlined,
  UserOutlined, // 使用 UserOutlined 替代 AtOutlined
  MoreOutlined
} from '@ant-design/icons';

// 扩展群聊消息类型
interface GroupWsMessage extends WsMessage {
  message_id: string; // 确保 message_id 是必需的
  group_id?: string;
  mention_users?: { user_id: number; user_name: string }[];
  sender_nickname?: string;
  sender_avatar?: string;
  is_edited?: boolean;
  reply_to?: {
    message_id: string;
    content: string;
    sender_name: string;
    sender_nickname?: string;
  };
}

// 群成员类型
interface GroupMember {
  user_id: number;
  username: string;
  nickname: string;
  avatar?: string;
  role: "owner" | "admin" | "member";
}

const GroupChatScreen = () => {
  const router = useRouter();
  const { group_id, group_name, group_avatar } = router.query;
  const { name: currentUserName, isLogin, token, user_id: reduxUserId } = useSelector((state: RootState) => state.auth);
  const [currentUserId, setCurrentUserId] = useState(0);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [mentionVisible, setMentionVisible] = useState(false);
  // const [mentionValue, setMentionValue] = useState("");
  const [filteredMembers, setFilteredMembers] = useState<GroupMember[]>([]);
  const [showMemberList, setShowMemberList] = useState(false);

  const { wsClient, onWsMessage, onWsTyping, onWsError, onWsConnect } = useWebSocket();
  
  // Use refs to track groupMembers and prevent infinite loops in useEffect
  const groupMembersRef = useRef<GroupMember[]>([]);
  const handlersSetupRef = useRef<string | undefined>(undefined);
  const processedMessageIdsRef = useRef<Set<string>>(new Set()); // Track processed messages to prevent duplicates
  
  // Keep ref in sync with state
  useEffect(() => {
    groupMembersRef.current = groupMembers;
  }, [groupMembers]);
  const [messages, setMessages] = useState<GroupWsMessage[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [typingStatus, setTypingStatus] = useState('');
  const [replyToMsg, setReplyToMsg] = useState<GroupWsMessage | undefined>(undefined);
  const [editingMsg, setEditingMsg] = useState<GroupWsMessage | undefined>(undefined);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 获取当前用户ID - use same robust approach as chat.tsx
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Try to get user_id from multiple sources (in priority order)
    let userId: number | undefined;
    
    // 1. Try to get from Redux store (most reliable, already set from login)
    if (reduxUserId && reduxUserId > 0) {
      userId = reduxUserId;
    }
    
    // 2. Try to get from localStorage authInfo (fallback for page refresh)
    if (!userId) {
      const authInfo = window.localStorage.getItem('authInfo');
      if (authInfo) {
        try {
          const parsed = JSON.parse(authInfo);
          userId = parsed.user_id ? Number(parsed.user_id) : undefined;
        } catch {
          // Failed to parse authInfo
        }
      }
    }
    
    // 3. If not found, try to decode from JWT token (last resort)
    if (!userId && token) {
      try {
        // Decode JWT token (base64 decode the payload)
        const payload = token.split('.')[1];
        if (payload) {
          // Handle base64url encoding (JWT uses base64url, not standard base64)
          const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = JSON.parse(atob(base64));
          // Backend JWT payload structure: { user_id: number, username: string, iat: number, exp: number }
          userId = decoded.user_id ? Number(decoded.user_id) : undefined;
        }
      } catch {
        // Failed to decode JWT token
      }
    }
    
    if (userId && userId > 0) {
      setCurrentUserId(userId);
    } else {
      setCurrentUserId(0);
      // Don't show error immediately - let the main effect handle validation
      // This prevents duplicate error messages
    }
  }, [router, token, reduxUserId]);

  // 获取有效群ID
  const getValidGroupId = (): string | undefined => {
    if (typeof group_id === 'string' && group_id.trim()) {
      return group_id.trim();
    }
    console.error("无效的group_id:", group_id);
    return undefined;
  };

  // 拉取群成员
  const fetchGroupMembers = useCallback(async () => {
    const validGroupId = getValidGroupId();
    if (!validGroupId || !token) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${validGroupId}/members/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        const members = res.results || [];
        setGroupMembers(members);
        setFilteredMembers(members);
        // Update ref to keep it in sync
        groupMembersRef.current = members;
      } else {
        message.error('获取群成员失败');
      }
    } catch (err) {
      message.error(FAILURE_PREFIX + String(err));
    }
  }, [token]);

  // 拉取历史消息
  const fetchMessageHistory = useCallback(async () => {
    const validGroupId = getValidGroupId();
    if (!validGroupId || !token) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/conversations/${validGroupId}/messages/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        const formattedMessages = res.results.map((msg: any) => ({
          ...msg,
          message_id: msg.message_id || `temp_${Date.now()}_${Math.random()}`, // 确保 message_id 存在
          sender_nickname: groupMembersRef.current.find(m => m.user_id === msg.sender)?.nickname || msg.sender_name,
          sender_avatar: groupMembersRef.current.find(m => m.user_id === msg.sender)?.avatar || `${BACKEND_URL}/media/default-avatar.png`,
          is_edited: msg.is_edited || false
        }));
        setMessages(formattedMessages);
      }
    } catch (err) {
      message.error(FAILURE_PREFIX + String(err));
    }
  }, [token]);

  // WebSocket连接与消息处理
  useEffect(() => {
    const validGroupId = getValidGroupId();
    // Check user ID from both Redux (immediate) and state (might be set async)
    const effectiveUserId = currentUserId > 0 ? currentUserId : (reduxUserId && reduxUserId > 0 ? reduxUserId : 0);
    
    if (!validGroupId || typeof group_name !== 'string' || !isLogin || effectiveUserId === 0 || !token) {
      const errMsg = !validGroupId ? '缺少群ID' :
        typeof group_name !== 'string' ? '缺少群名称' :
          !isLogin ? '未登录' :
            !token ? '缺少认证Token' : '用户ID无效';
      message.error(`缺少群聊参数（${errMsg}），即将跳转群列表`);
      setTimeout(() => router.push('/group_list'), 1500);
      handlersSetupRef.current = undefined;
      return;
    }

    // Prevent re-setting handlers if already set up for this group
    const handlerKey = validGroupId;
    if (handlersSetupRef.current === handlerKey) {
      // Handlers already set up for this group, skip
      return;
    }
    
    // Mark that we're setting up handlers for this group
    handlersSetupRef.current = handlerKey;

    const loadingTimer = setTimeout(() => {
      setIsLoading(false);
    }, 600);

    // 拉取数据
    fetchGroupMembers();
    setTimeout(fetchMessageHistory, 300);

    // WebSocket连接
    onWsConnect(() => {
      message.success(`已连接到群聊：${group_name}`);
    });

    // 接收消息
    onWsMessage((rawMsg) => {
      const msg = rawMsg as GroupWsMessage;
      
      // Filter out system messages early to prevent infinite loops
      const systemMessageTypes = ['read_receipt', 'read_receipt_sent', 'ping', 'pong', 'connection_established', 'typing_status', 'message_sent'];
      if (systemMessageTypes.includes(msg.type)) {
        return; // Ignore system messages
      }
      
      // Filter by group/conversation ID
      if (msg.group_id !== validGroupId && msg.conversation_id !== validGroupId) return;
      
      // Only process new_message and command_message types
      if (msg.type !== 'new_message' && msg.type !== 'command_message') {
        return;
      }

      // Use ref to get latest groupMembers without triggering re-renders
      const senderMember = groupMembersRef.current.find(m => m.user_id === msg.sender_id);
      const processedMsg: GroupWsMessage = {
        ...msg,
        message_id: msg.message_id || `temp_${Date.now()}_${Math.random()}`, // 确保 message_id 存在
        sender_nickname: senderMember?.nickname || msg.sender_name,
        sender_avatar: senderMember?.avatar || `${BACKEND_URL}/media/default-avatar.png`,
        is_edited: msg.is_edited || false
      };

      // 处理撤回消息
      if (msg.type === 'command_message' && msg.command_type === 'recall') {
        const recalledMsgId = msg.command_data?.recalled_message_id;
        if (recalledMsgId) {
          setMessages(prev =>
            prev.map(item =>
              item.message_id === recalledMsgId
                ? { ...item, is_recalled: true }
                : item
            )
          );
          message.info("有消息已撤回");
        }
        return;
      }

      // 处理编辑消息
      if (msg.type === 'command_message' && msg.command_type === 'edit') {
        const editedMsgId = msg.command_data?.edited_message_id;
        const newContent = msg.command_data?.new_content;
        if (editedMsgId && newContent) {
          setMessages(prev =>
            prev.map(item =>
              item.message_id === editedMsgId
                ? { ...item, content: newContent, is_edited: true }
                : item
            )
          );
        }
        return;
      }

      // 普通消息处理 - only process new_message type
      if (msg.type !== 'new_message') {
        return; // Already handled command_message above, ignore other types
      }
      
      // Filter out empty messages (no content and no image)
      if (!msg.content && !msg.image_url) {
        return;
      }
      
      // Handle messages from current user (optimistic updates)
      if (msg.sender_id === effectiveUserId) {
        setMessages(prev =>
          prev.map(item =>
            item.message_id === msg.message_id ? processedMsg : item
          )
        );
        return;
      }
      
      // Handle messages from other users
      setMessages(prev => {
        // Check if message already exists (prevent duplicates)
        if (msg.message_id) {
          const existingIndex = prev.findIndex(m => m.message_id === msg.message_id);
          if (existingIndex >= 0) {
            // Message already exists - update it
            return prev.map((item, index) =>
              index === existingIndex ? processedMsg : item
            );
          }
        }
        // New message - add it
        return [...prev, processedMsg];
      });
      
      // Show notification and send read receipt only for valid messages from others
      // Track processed messages to prevent duplicate notifications and read receipts
      if (msg.sender_id !== effectiveUserId && (msg.content || msg.image_url) && msg.message_id) {
        // Check if we've already processed this message
        if (!processedMessageIdsRef.current.has(msg.message_id)) {
          processedMessageIdsRef.current.add(msg.message_id);
          
          const senderName = senderMember?.nickname || msg.sender_name || '群成员';
          // Only show notification for messages with actual content
          if (msg.content?.trim() || msg.image_url) {
            message.info(`收到群聊 ${group_name} 中 ${senderName} 的消息`);
          }
          // Send read receipt for valid messages (only once per message)
          wsClient?.sendReadReceipt(validGroupId, msg.message_id);
        }
      }

      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });

    // 输入状态处理
    onWsTyping((status) => {
      if (status.conversation_id !== validGroupId || status.user_id === effectiveUserId) return;

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);

      // Use ref to get latest groupMembers without triggering re-renders
      const typingMember = groupMembersRef.current.find(m => m.user_id === status.user_id);
      const memberName = typingMember?.nickname || typingMember?.username || '有人';

      if (status.is_typing) {
        setTypingStatus(`${memberName} 正在输入...`);
        typingTimerRef.current = setTimeout(() => {
          setTypingStatus('');
        }, 3000);
      } else {
        setTypingStatus('');
      }
    });

    // 错误处理
    onWsError((errMsg) => {
      console.error("WebSocket错误:", errMsg);
      message.error(`群聊连接错误: ${errMsg}`);
      if (wsClient && !wsClient.isConnected) {
        setTimeout(() => wsClient.connect(), 3000);
      }
    });

    // 滚动到底部
    const scrollToBottom = () => {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    scrollToBottom();

    // 清理函数 - only clean up timers, don't close WebSocket unnecessarily
    return () => {
      clearTimeout(loadingTimer);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      // Don't close WebSocket here - it's managed by useWebSocket hook
      // Reset handlersSetupRef when group_id changes so new handlers can be set up
      handlersSetupRef.current = undefined;
      // Clear processed message IDs when group changes to prevent memory leaks
      processedMessageIdsRef.current.clear();
    };
  }, [group_id, group_name, isLogin, currentUserId, reduxUserId, token, router]);

  // 输入框变化处理
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trimStart();
    setInputContent(value);

    // @提及功能
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex > -1) {
      const mentionText = value.slice(lastAtIndex + 1);
      // setMentionValue(mentionText);
      setMentionVisible(true);

      if (mentionText) {
        const filtered = groupMembers.filter(member =>
          member.nickname.toLowerCase().includes(mentionText.toLowerCase()) ||
          member.username.toLowerCase().includes(mentionText.toLowerCase())
        );
        setFilteredMembers(filtered);
      } else {
        setFilteredMembers([...groupMembers]);
      }
    } else {
      setMentionVisible(false);
      // setMentionValue("");
    }

    // 输入状态通知
    const validGroupId = getValidGroupId();
    if (!wsClient || !validGroupId) return;
    wsClient.sendTypingStatus(validGroupId, !!value);

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (value) {
      typingTimerRef.current = setTimeout(() => {
        wsClient.sendTypingStatus(validGroupId, false);
        setTypingStatus('');
      }, 1000);
    }
  }, [wsClient, groupMembers]);

  // 选择@成员
  const handleMentionSelect = (member: GroupMember) => {
    const lastAtIndex = inputContent.lastIndexOf('@');
    const newContent = inputContent.slice(0, lastAtIndex + 1) + member.nickname + ' ';
    setInputContent(newContent);
    setMentionVisible(false);
    // setMentionValue("");
  };

  // 发送消息
  const handleSendMessage = useCallback(() => {
    const validGroupId = getValidGroupId();
    if (!inputContent.trim() || !wsClient || !validGroupId || !currentUserName || currentUserId === 0 || !token) {
      console.error("发送群消息条件不满足");
      return;
    }

    // 编辑消息逻辑
    if (editingMsg) {
      wsClient?.sendEditCommand(
        validGroupId,
        editingMsg.message_id,
        inputContent.trim()
      );

      // 更新本地消息
      setMessages(prev =>
        prev.map(item =>
          item.message_id === editingMsg.message_id
            ? { ...item, content: inputContent.trim(), is_edited: true }
            : item
        )
      );
      setEditingMsg(undefined);
      setInputContent('');
      setReplyToMsg(undefined);
      return;
    }

    // 普通/回复消息逻辑
    const mentionUsers: { user_id: number; user_name: string }[] = [];
    groupMembers.forEach(member => {
      if (inputContent.includes(`@${member.nickname}`)) {
        mentionUsers.push({
          user_id: member.user_id,
          user_name: member.nickname
        });
      }
    });

    // 修复 reply_to 类型问题
    const replyTo = replyToMsg ? {
      message_id: replyToMsg.message_id || "",
      content: replyToMsg.content || "",
      sender_name: replyToMsg.sender_name || "",
      sender_nickname: replyToMsg.sender_nickname || ""
    } : undefined;

    const messageData: Partial<GroupWsMessage> = {
      type: 'chat_message',
      content: inputContent.trim(),
      conversation_id: validGroupId,
      group_id: validGroupId,
      mention_users: mentionUsers.length > 0 ? mentionUsers : undefined,
      reply_to: replyTo,
      timestamp: Date.now().toString()
    };

    // 发送消息
    wsClient.sendMessage(messageData);

    // 本地临时消息
    const currentMember = groupMembers.find(m => m.user_id === currentUserId);
    const tempMsg: GroupWsMessage = {
      type: 'new_message',
      message_id: `temp_${Date.now()}_${Math.random()}`, // 确保 message_id 存在
      content: inputContent.trim(),
      message_type: 'text',
      sender_id: currentUserId,
      sender_name: currentUserName,
      sender_nickname: currentMember?.nickname || currentUserName,
      sender_avatar: currentMember?.avatar || `${BACKEND_URL}/media/default-avatar.png`,
      conversation_id: validGroupId,
      group_id: validGroupId,
      mention_users: mentionUsers,
      timestamp: new Date().toISOString(),
      is_recalled: false,
      reply_to: replyTo,
      image_url: undefined,
      is_edited: false
    };
    setMessages(prev => [...prev, tempMsg]);

    // 重置状态
    setInputContent('');
    setReplyToMsg(undefined);
    wsClient.sendTypingStatus(validGroupId, false);
    setTypingStatus('');
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [inputContent, wsClient, currentUserId, currentUserName, groupMembers, replyToMsg, editingMsg, token]);

  // 回车发送
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 图片上传
  const handleImageUpload = () => {
    const validGroupId = getValidGroupId();
    if (!validGroupId || !token) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('image', file);
      formData.append('conversation_id', validGroupId);
      formData.append('is_group', 'true');

      try {
        const response = await fetch(`${BACKEND_URL}/api/chat/upload/image/`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const res = await response.json();
        if (Number(res.code) === 0) {
          const imageMsgData: Partial<GroupWsMessage> = {
            type: 'chat_message',
            content: file.name,
            message_type: 'image',
            image_url: res.url,
            conversation_id: validGroupId,
            group_id: validGroupId,
            timestamp: Date.now().toString()
          };
          wsClient?.sendMessage(imageMsgData);

          const currentMember = groupMembers.find(m => m.user_id === currentUserId);
          const tempImageMsg: GroupWsMessage = {
            type: 'new_message',
            message_id: `temp_${Date.now()}_${Math.random()}`, // 确保 message_id 存在
            content: file.name,
            message_type: 'image',
            image_url: res.url,
            sender_id: currentUserId,
            sender_name: currentUserName,
            sender_nickname: currentMember?.nickname || currentUserName,
            sender_avatar: currentMember?.avatar || `${BACKEND_URL}/media/default-avatar.png`,
            conversation_id: validGroupId,
            group_id: validGroupId,
            timestamp: new Date().toISOString(),
            is_recalled: false,
            reply_to: undefined,
            is_edited: false
          };
          setMessages(prev => [...prev, tempImageMsg]);
          messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
          message.error('图片上传失败: ' + res.info);
        }
      } catch (err) {
        message.error(FAILURE_PREFIX + String(err));
      }
    };
    fileInput.click();
  };

  // 撤回消息
  const handleRecallMessage = (msg: GroupWsMessage) => {
    const validGroupId = getValidGroupId();
    if (!wsClient || !validGroupId || !msg.message_id) {
      message.error("撤回条件不满足");
      return;
    }

    // 检查权限和时间限制
    if (msg.sender_id !== currentUserId) {
      message.error("只能撤回自己发送的消息");
      return;
    }

    const createTime = new Date(msg.timestamp || 0).getTime();
    const now = Date.now();
    if ((now - createTime) > 2 * 60 * 1000) { // 2分钟内可撤回
      message.error("超过撤回时间限制");
      return;
    }

    wsClient.sendRecallCommand(validGroupId, msg.message_id);
    setMessages(prev =>
      prev.map(item =>
        item.message_id === msg.message_id ? { ...item, is_recalled: true } : item
      )
    );
    message.success("消息已撤回");
  };

  // 加载状态
  if (isLoading) {
    return (
      <div style={{
        textAlign: 'center',
        marginTop: '100px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <Spin size="large" />
        <div style={{ marginTop: '16px', color: '#666', fontSize: '14px' }}>
          正在连接群聊服务器...
        </div>
      </div>
    );
  }

  const validGroupId = getValidGroupId();
  if (!validGroupId || typeof group_name !== 'string') {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px', color: '#ff4444' }}>
        <p>群聊参数无效，即将跳转群列表</p>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: '800px',
      margin: '20px auto',
      height: '85vh',
      border: '1px solid #eee',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      backgroundColor: 'white'
    }}>
      {/* 顶部群聊栏 */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        backgroundColor: '#fafafa',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <Button
          icon={<ArrowLeftOutlined />}
          size="small"
          onClick={() => router.back()}
          style={{ padding: '4px', borderRadius: '50%' }}
          type="text"
        />

        <Avatar style={{
          backgroundColor: '#2196F3',
          width: '40px',
          height: '40px',
          fontSize: '16px'
        }}>
          {group_avatar && typeof group_avatar === 'string' ? (
            <img
              src={group_avatar.startsWith("http") ? group_avatar : `${BACKEND_URL}${group_avatar}`}
              alt="群头像"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            group_name.charAt(0).toUpperCase()
          )}
        </Avatar>

        <div style={{ flex: 1 }}>
          <h4 style={{
            margin: '0 0 4px 0',
            fontSize: '16px',
            fontWeight: 500,
            color: '#333'
          }}>
            {group_name}
          </h4>
          <div style={{ display: "flex", alignItems: "center", fontSize: "12px", color: "#666" }}>
            <span>{groupMembers.length} 成员</span>
            <Button
              type="text"
              size="small"
              onClick={() => router.push(`/group_detail?group_id=${validGroupId}`)}
              style={{ padding: '0 8px', marginLeft: '8px' }}
            >
              群详情
            </Button>
          </div>
        </div>

        <Button
          icon={<MoreOutlined />}
          size="small"
          onClick={() => setShowMemberList(!showMemberList)}
          type="text"
          style={{ padding: '4px' }}
        />
      </div>

      {/* 群成员列表弹窗 */}
      {showMemberList && (
        <div style={{
          position: 'absolute',
          top: '60px',
          right: '20px',
          width: '250px',
          backgroundColor: 'white',
          border: '1px solid #eee',
          borderRadius: '8px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          zIndex: 100,
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          <div style={{ padding: '12px', borderBottom: '1px solid #f0f0f0' }}>
            <h5 style={{ margin: 0, fontSize: '14px' }}>群成员</h5>
          </div>
          {groupMembers.map(member => (
            <div
              key={member.user_id}
              style={{
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => (e.target as HTMLDivElement).style.backgroundColor = '#f5f5f5'}
              onMouseLeave={(e) => (e.target as HTMLDivElement).style.backgroundColor = 'white'}
              onClick={() => {
                setInputContent(prev => `${prev}@${member.nickname} `);
                setShowMemberList(false);
              }}
            >
              <Avatar
                src={member.avatar || `${BACKEND_URL}/media/default-avatar.png`}
                size="small"
              />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: member.role === 'owner' ? 'bold' : 'normal' }}>
                  {member.nickname}
                  {member.role === 'owner' && <span style={{ fontSize: '11px', color: '#ff4444', marginLeft: '4px' }}>群主</span>}
                  {member.role === 'admin' && <span style={{ fontSize: '11px', color: '#2196F3', marginLeft: '4px' }}>管理员</span>}
                </p>
                <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>
                  @{member.username}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 消息列表区域 */}
      <div style={{
        height: 'calc(100% - 120px)',
        overflowY: 'auto',
        padding: '16px',
        backgroundColor: '#f9f9f9'
      }}>
        {messages.length === 0 && typingStatus === '' ? (
          <div style={{
            textAlign: 'center',
            padding: '80px 0',
            color: '#999',
            fontSize: '14px'
          }}>
            <p>还没有群消息，开始聊天吧～</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isSelf = msg.sender_id === currentUserId;
              const senderName = msg.sender_nickname || msg.sender_name || '未知成员';
              const isRecalled = msg.is_recalled || false;
              const isEdited = msg.is_edited || false;
              const messageTime = msg.timestamp
                ? new Date(msg.timestamp).toLocaleTimeString()
                : new Date().toLocaleTimeString();
              const isMentioned = msg.mention_users?.some(u => u.user_id === currentUserId) || false;

              return (
                <div
                  key={msg.message_id}
                  style={{
                    display: 'flex',
                    marginBottom: '16px',
                    justifyContent: isSelf ? 'flex-end' : 'flex-start',
                    animation: 'fadeIn 0.3s ease'
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (isRecalled) return;

                    const menu = document.createElement("div");
                    menu.style.cssText = `
                      position: fixed;
                      top: ${e.clientY}px;
                      left: ${e.clientX}px;
                      background: white;
                      border: 1px solid #ddd;
                      borderRadius: 4px;
                      padding: 8px 0;
                      minWidth: 120px;
                      boxShadow: 0 2px 8px rgba(0,0,0,0.1);
                      zIndex: 1000;
                    `;

                    // 回复选项
                    const replyItem = document.createElement("div");
                    replyItem.style.cssText = `
                      padding: 6px 16px;
                      cursor: pointer;
                      fontSize: 14px;
                    `;
                    replyItem.textContent = "回复";
                    replyItem.onclick = () => {
                      setReplyToMsg(msg);
                      document.body.removeChild(menu);
                    };
                    menu.appendChild(replyItem);

                    // 编辑选项（仅自己的2分钟内文本消息）
                    if (isSelf && msg.message_type === 'text') {
                      const createTime = new Date(msg.timestamp || 0).getTime();
                      const now = Date.now();
                      const isEditable = (now - createTime) < 2 * 60 * 1000;

                      if (isEditable) {
                        const editItem = document.createElement("div");
                        editItem.style.cssText = `
                          padding: 6px 16px;
                          cursor: pointer;
                          fontSize: 14px;
                          color: #2196F3;
                        `;
                        editItem.textContent = "编辑";
                        editItem.onclick = () => {
                          setEditingMsg(msg);
                          setInputContent(msg.content || "");
                          document.body.removeChild(menu);
                        };
                        menu.appendChild(editItem);
                      }
                    }

                    // 撤回选项（仅自己的消息）
                    if (isSelf) {
                      const recallItem = document.createElement("div");
                      recallItem.style.cssText = `
                        padding: 6px 16px;
                        cursor: pointer;
                        fontSize: 14px;
                        color: #ff4444;
                      `;
                      recallItem.textContent = "撤回";
                      recallItem.onclick = () => {
                        handleRecallMessage(msg);
                        document.body.removeChild(menu);
                      };
                      menu.appendChild(recallItem);
                    }

                    // 关闭菜单
                    const closeMenu = () => {
                      document.body.removeChild(menu);
                      document.removeEventListener("click", closeMenu);
                    };
                    document.body.appendChild(menu);
                    document.addEventListener("click", closeMenu);
                  }}
                >
                  <Avatar
                    style={{
                      marginRight: isSelf ? '8px' : 0,
                      marginLeft: isSelf ? 0 : '8px',
                      alignSelf: 'flex-start',
                      width: '36px',
                      height: '36px',
                      fontSize: '14px'
                    }}
                    src={msg.sender_avatar || `${BACKEND_URL}/media/default-avatar.png`}
                  >
                    {senderName.charAt(0).toUpperCase()}
                  </Avatar>

                  <div
                    style={{
                      maxWidth: '65%',
                      padding: '10px 14px',
                      borderRadius: isSelf
                        ? '18px 18px 4px 18px'
                        : '18px 18px 18px 4px',
                      backgroundColor: isSelf ? '#2196F3' : 'white',
                      color: isSelf ? 'white' : '#333',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      position: 'relative'
                    }}>
                    {isMentioned && (
                      <div style={{
                        position: 'absolute',
                        top: '-8px',
                        left: '12px',
                        backgroundColor: '#ff4444',
                        color: 'white',
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        @我
                      </div>
                    )}

                    {isRecalled ? (
                      <p style={{ margin: 0, lineHeight: '1.5', color: '#999', fontSize: '14px' }}>
                        [消息已撤回]
                      </p>
                    ) : (
                      <>
                        {/* 回复引用块 */}
                        {msg.reply_to && (
                          <div style={{
                            marginBottom: '6px',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            backgroundColor: isSelf
                              ? 'rgba(255,255,255,0.2)'
                              : 'rgba(0,0,0,0.05)',
                            fontSize: '12px'
                          }}>
                            <p style={{
                              margin: 0,
                              color: isSelf
                                ? 'rgba(255,255,255,0.9)'
                                : '#666'
                            }}>
                              回复 @{msg.reply_to.sender_nickname || msg.reply_to.sender_name}: {msg.reply_to.content}
                            </p>
                          </div>
                        )}

                        {/* 消息内容（文本/图片） */}
                        {msg.message_type === 'image' && msg.image_url ? (
                          <img
                            src={msg.image_url.startsWith('http://') || msg.image_url.startsWith('https://') || msg.image_url.startsWith('data:')
                              ? msg.image_url
                              : `${BACKEND_URL}${msg.image_url}`}
                            alt="群聊图片"
                            style={{
                              maxWidth: '100%',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'block'
                            }}
                            onClick={() => {
                              const url = msg.image_url?.startsWith('http://') || msg.image_url?.startsWith('https://')
                                ? msg.image_url
                                : `${BACKEND_URL}${msg.image_url}`;
                              window.open(url, '_blank');
                            }}
                          />
                        ) : (
                          <p style={{ margin: 0, lineHeight: '1.5', fontSize: '14px' }}>
                            {msg.content || ''}
                          </p>
                        )}

                        {/* 时间、编辑标记、发送者昵称 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <p style={{
                            margin: '4px 0 0 0',
                            fontSize: '10px',
                            opacity: 0.7,
                            color: isSelf ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'
                          }}>
                            {messageTime}
                            {isEdited && (
                              <span style={{ marginLeft: '4px' }}>已编辑</span>
                            )}
                          </p>
                          {!isSelf && (
                            <p style={{
                              margin: '4px 0 0 8px',
                              fontSize: '10px',
                              opacity: 0.7,
                              color: isSelf ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'
                            }}>
                              {senderName}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {typingStatus && (
              <div style={{
                textAlign: 'center',
                fontSize: '12px',
                color: '#666',
                margin: '8px 0',
                animation: 'fadeIn 0.3s ease'
              }}>
                <ClockCircleOutlined style={{ marginRight: '4px' }} />
                {typingStatus}
              </div>
            )}

            {/* @成员列表弹窗 */}
            {mentionVisible && (
              <div style={{
                position: 'absolute',
                bottom: '120px',
                left: '40px',
                right: '40px',
                backgroundColor: 'white',
                border: '1px solid #ddd',
                borderRadius: '8px',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                {filteredMembers.length > 0 ? (
                  filteredMembers.map(member => (
                    <div
                      key={member.user_id}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLDivElement).style.backgroundColor = '#f5f5f5';
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLDivElement).style.backgroundColor = 'white';
                      }}
                      onClick={() => handleMentionSelect(member)}
                    >
                      <Avatar
                        src={member.avatar || `${BACKEND_URL}/media/default-avatar.png`}
                        size="small"
                      />
                      <div>
                        <p style={{ margin: 0, fontSize: '14px' }}>{member.nickname}</p>
                        <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>@{member.username}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
                    未找到匹配成员
                  </div>
                )}
              </div>
            )}

            <div ref={messageEndRef} />
          </>
        )}
      </div>

      {/* 底部输入区域 */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: 'white',
        position: 'sticky',
        bottom: 0,
        zIndex: 10
      }}>
        {/* 图片上传按钮 */}
        <Button
          icon={<PictureOutlined />}
          size="middle"
          onClick={handleImageUpload}
          type="text"
          style={{
            padding: '8px',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            color: '#666'
          }}
        />

        {/* 文件上传按钮 */}
        <Button
          icon={<PaperClipOutlined />}
          size="middle"
          onClick={() => message.info('文件上传功能后续实现')}
          type="text"
          style={{
            padding: '8px',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            color: '#666'
          }}
        />

        {/* @成员按钮 - 使用 UserOutlined */}
        <Button
          icon={<UserOutlined />}
          size="middle"
          onClick={() => {
            setInputContent(prev => `${prev}@`);
            setMentionVisible(true);
            setFilteredMembers([...groupMembers]);
          }}
          type="text"
          style={{
            padding: '8px',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            color: '#666'
          }}
        />

        {/* 输入框容器 */}
        <div style={{ flex: 1, position: 'relative' }}>
          {/* 回复提示 */}
          {replyToMsg && (
            <div style={{
              position: 'absolute',
              top: '-30px',
              left: 0,
              right: 0,
              padding: '4px 16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px 4px 0 0',
              fontSize: '12px',
              color: '#666',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span>回复 @{replyToMsg.sender_nickname || replyToMsg.sender_name}:</span>
              <button
                onClick={() => setReplyToMsg(undefined)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#999',
                  cursor: 'pointer',
                  padding: '0',
                  fontSize: '14px',
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* 消息输入框 */}
          <Input
            value={inputContent}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder={replyToMsg 
              ? `回复 @${replyToMsg.sender_nickname || replyToMsg.sender_name}...` 
              : "输入群消息..."}
            style={{
              flex: 1,
              borderRadius: replyToMsg ? '0 0 20px 20px' : '20px',
              padding: '8px 16px',
              height: '40px',
              borderColor: '#ddd',
              fontSize: '14px'
            }}
            bordered
            maxLength={500}
          />
        </div>

        {/* 发送按钮 */}
        <Button
          icon={<SendOutlined />}
          type="primary"
          size="middle"
          onClick={handleSendMessage}
          disabled={!inputContent.trim()}
          style={{
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            padding: 0,
            backgroundColor: '#2196F3',
            borderColor: '#2196F3'
          }}
        />
      </div>

      {/* 全局样式 */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f9f9f9; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #bbb; }
      `}</style>
    </div>
  );
};

export default GroupChatScreen;