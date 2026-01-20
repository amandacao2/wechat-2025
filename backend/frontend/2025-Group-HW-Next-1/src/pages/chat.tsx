import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { useWebSocket } from '../utils/websocket';
import type { WsMessage } from '../utils/websocket';
import { BACKEND_URL } from '../constants/string';
import { Avatar, Button, Input, message, Spin, Modal, DatePicker, Select, List, Typography, Tooltip, Popover } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
// 修复2：替换 ImageOutlined 为正确的图标（如 PictureOutlined，Ant Design 5.x 中无 ImageOutlined）
import {
  SendOutlined,
  ArrowLeftOutlined,
  PictureOutlined, // 正确图标：图片上传用 PictureOutlined
  SmileOutlined,
  VideoCameraOutlined,
  SoundOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  UndoOutlined,
  DeleteOutlined,
  SearchOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined
} from '@ant-design/icons';

const ChatScreen = () => {
  const router = useRouter();
  const { conv_id, target, friend_id } = router.query;
  const { name: currentUserName, isLogin, token, user_id: reduxUserId } = useSelector((state: RootState) => state.auth);


  // Helper function to normalize URL protocol (fix mixed content issues)
  // Ensures HTTP URLs are converted to HTTPS when page is loaded over HTTPS
  // Also normalizes backend URLs to always use HTTPS in production
  const normalizeUrlProtocol = useCallback((url: string | undefined | null): string | undefined => {
    if (!url) return undefined;
    
    // Always normalize backend URLs to HTTPS in production
    // Check if URL is for the backend domain
    const isBackendUrl = url.includes('2025-group-hw-django-1-owowowo.app.secoder.net') || 
                         url.includes(BACKEND_URL.replace(/^https?:\/\//, ''));
    
    // If page is loaded over HTTPS OR it's a backend URL, ensure HTTPS
    if (typeof window !== 'undefined') {
      const isHttpsPage = window.location.protocol === 'https:';
      if (isHttpsPage || (isBackendUrl && process.env.NODE_ENV === 'production')) {
        // Replace http:// with https:// for backend URLs (fix mixed content error)
        return url.replace(/^http:\/\//, 'https://');
      }
    }
    
    return url;
  }, []);

  // Helper function to normalize media URLs (images, audio, video) for production
  const normalizeMediaUrl = useCallback((mediaUrl: string | undefined | null): string | undefined => {
    if (!mediaUrl) return undefined;
    
    // Handle data URLs - return as-is (no protocol normalization needed)
    if (mediaUrl.startsWith('data:')) {
      return mediaUrl;
    }
    
    // Handle absolute URLs (http/https) - normalize protocol if needed
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
      return normalizeUrlProtocol(mediaUrl);
    }
    
    // Handle relative URLs (starting with /)
    if (mediaUrl.startsWith('/')) {
      // Keep the leading slash for absolute paths from root
      return normalizeUrlProtocol(`${BACKEND_URL}${mediaUrl}`);
    }
    
    // Handle relative URLs without leading slash
    // Assumes it's relative to backend root
    return normalizeUrlProtocol(`${BACKEND_URL}/${mediaUrl}`);
  }, [normalizeUrlProtocol]);

  // Helper function to normalize image URLs for production (backward compatibility)
  const normalizeImageUrl = useCallback((imageUrl: string | undefined | null): string | undefined => {
    if (!imageUrl) return undefined;
    
    // Handle data URLs - return as-is (no protocol normalization needed)
    if (imageUrl.startsWith('data:')) {
      return imageUrl;
    }
    
    // Handle absolute URLs (http/https) - normalize protocol if needed
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      return normalizeUrlProtocol(imageUrl);
    }
    
    // Handle relative URLs (starting with /)
    if (imageUrl.startsWith('/')) {
      // Keep the leading slash for absolute paths from root
      // Ensure BACKEND_URL doesn't end with / to avoid double slashes
      const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
      return normalizeUrlProtocol(`${baseUrl}${imageUrl}`);
    }
    
    // Handle relative URLs without leading slash (relative to current path)
    const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL : `${BACKEND_URL}/`;
    return normalizeUrlProtocol(`${baseUrl}${imageUrl}`);
  }, [normalizeUrlProtocol]);

  const [currentUserId, setCurrentUserId] = useState(0);
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
      message.error('User information not found, redirecting to login page');
      setTimeout(() => router.push('/login'), 1500);
    }
  }, [router, token, reduxUserId]);

  const { wsClient, onWsMessage, onWsTyping, onWsError, onWsConnect } = useWebSocket();

  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [typingStatus, setTypingStatus] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | undefined>(undefined);
  const [editingContent, setEditingContent] = useState('');
  const [originalEditContent, setOriginalEditContent] = useState<string>(''); // Store original content before edit
  const [nickname, setNickname] = useState<string>(''); // Nickname for the current conversation
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [isSearchModalVisible, setIsSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMessageType, setSearchMessageType] = useState<string>('all');
  const [searchDateRange, setSearchDateRange] = useState<[Dayjs | undefined, Dayjs | undefined] | undefined>(undefined);
  const [searchResults, setSearchResults] = useState<WsMessage[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | undefined>(undefined);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());


  // Update nickname for the current conversation
  const updateNickname = async (newNickname: string) => {
    const currentConvId = conversationId || getValidConvId();
    if (!token || !currentConvId) {
      message.error('无法更新昵称: 缺少会话ID或未登录');
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/conversations/${currentConvId}/member_settings/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          nickname: newNickname.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.settings) {
          const updatedNickname = data.settings.nickname || '';
          setNickname(updatedNickname);
          message.success('昵称已更新');
          setIsEditingNickname(false);
          setNicknameInput(''); // Clear input
          // Refresh friend list to show updated nickname
          // This will be handled by friend_list fetching the nickname
        } else if (data.success) {
          // Handle case where backend returns success but no settings
          const updatedNickname = newNickname.trim() || '';
          setNickname(updatedNickname);
          message.success('昵称已更新');
          setIsEditingNickname(false);
          setNicknameInput('');
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        message.error(`更新昵称失败: ${errorData.error || errorData.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('[Chat] Failed to update nickname:', error);
      message.error(`更新昵称失败: ${error.message || 'Unknown error'}`);
    }
  };
  // Use ref to track editing message ID for error handling (since state might be cleared before error arrives)
  const editingMessageIdRef = useRef<string | undefined>(undefined);
  const originalEditContentRef = useRef<string>('');
  const [replyTarget, setReplyTarget] = useState<WsMessage | undefined>(undefined); // 当前正在回复的消息
  const [hoveredMessageId, setHoveredMessageId] = useState<string | undefined>(undefined); // 控制悬停时显示回复按钮
  const [replyChainModalVisible, setReplyChainModalVisible] = useState(false); // 回复链弹窗显示状态
  const [replyChainData, setReplyChainData] = useState<{
    root_message: any;
    reply_chain: any[];
    total_replies: number;
  } | null>(null); // 回复链数据
  const [loadingReplyChain, setLoadingReplyChain] = useState(false); // 加载回复链状态
  const [_selectedMessageForChain, setSelectedMessageForChain] = useState<string | undefined>(undefined); // 选中的消息ID用于显示回复链
  const [readStatusMap, setReadStatusMap] = useState<Map<string, {
    message_id: string;
    total_recipients: number;
    read_count: number;
    unread_count: number;
    readers: { user_id: string; username: string; read_at: string; read_delay: number }[];
    unread_users: { user_id: string; username: string; last_active: string }[];
    sent_at: string;
  }>>(new Map());
  const [readStatusUpdateCounter, setReadStatusUpdateCounter] = useState(0); // Force re-render when read status updates
  const [loadingReadStatus, setLoadingReadStatus] = useState<Set<string>>(new Set());
  const [_unreadMessageIds, setUnreadMessageIds] = useState<Set<string>>(new Set()); // Track which message IDs are unread for current user
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isEmojiPickerVisible, setIsEmojiPickerVisible] = useState(false);
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | undefined>(undefined);
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | undefined>(undefined);
  const [_isMuted, setIsMuted] = useState<boolean>(false); // Do not disturb state for current conversation
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement | undefined>(undefined);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const typingDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined); // Debounce typing status sends
  const lastSentTypingStatusRef = useRef<boolean>(false); // Track last sent typing status to avoid duplicate sends

  const getValidConvId = (): string | undefined => {
    // Handle empty string, undefined, null, or array cases
    if (typeof conv_id === 'string' && conv_id.trim()) {
      return conv_id.trim();
    }
    // Invalid conv_id if explicitly provided but not a valid string
    return undefined;
  };

  // State to store the conversation ID (may be fetched/created)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  // const [isCreatingConversation, setIsCreatingConversation] = useState(false); // Unused

  // Track which conversation IDs we've already fetched to prevent duplicates
  const fetchedHistoryRef = useRef<Set<string>>(new Set());
  // Prevent duplicate message sends
  const isSendingRef = useRef(false);
  // Track processed message IDs to prevent duplicate notifications and read receipts
  const processedMessageIdsRef = useRef<Set<string>>(new Set());
  // Track last received typing status to prevent duplicate notifications
  const lastReceivedTypingStatusRef = useRef<{ userId: number; isTyping: boolean; timestamp: number } | undefined>(undefined);
  // Store fetchReadStatus in a ref so it's always available
  const fetchReadStatusRef = useRef<((messageId: string, forceRefetch?: boolean) => Promise<void>) | undefined>(undefined);
  // Track messages that failed to fetch read_status (404/403) to avoid retrying
  const failedReadStatusRef = useRef<Set<string>>(new Set());
  
  // Mark messages as read in a conversation
  const markMessagesAsRead = useCallback(async (convId: string, messageId?: string) => {
    if (!token || !convId) return;
    
    try {
      const requestBody: any = {};
      // If message_id is provided, mark read up to that specific message
      // This updates last_read_at to that message's created_at timestamp
      if (messageId) {
        requestBody.message_id = messageId;
      }
      // Empty body marks all messages as read (updates last_read_at to current time)
      
      
      const response = await fetch(`${BACKEND_URL}/api/chat/conversations/${convId}/mark_read/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        await response.json().catch(() => ({}));
        // Successfully marked as read - the backend will update last_read_at
        // The unread count will be recalculated on next fetch
        
        // Don't proactively refetch read status here - the backend will send WebSocket notification
        // when messages are marked as read, and the WebSocket handler will update the read status
        // Proactively refetching can cause race conditions and incorrect read indicators
        
        // Update unread tracking - if messageId is provided, mark it and all earlier messages as read
        // If no messageId, mark all messages in the conversation as read
        setMessages(prev => {
          const currentConvId = convId;
          const messagesInConv = prev.filter(m => String(m.conversation_id) === String(currentConvId));
          
          if (messageId) {
            // Find the message and mark it and all earlier messages as read
            const messageIndex = messagesInConv.findIndex(m => m.message_id === messageId);
            if (messageIndex >= 0) {
              // Mark this message and all messages up to it as read
              const messagesToMark = messagesInConv.slice(0, messageIndex + 1);
              setUnreadMessageIds(prevUnread => {
                const newUnread = new Set(prevUnread);
                messagesToMark.forEach(msg => {
                  if (msg.message_id) {
                    newUnread.delete(msg.message_id);
                  }
                });
                return newUnread;
              });
            }
          } else {
            // Mark all messages in the conversation as read
            setUnreadMessageIds(prevUnread => {
              const newUnread = new Set(prevUnread);
              messagesInConv.forEach(msg => {
                if (msg.message_id) {
                  newUnread.delete(msg.message_id);
                }
              });
              return newUnread;
            });
          }
          return prev;
        });
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.warn('[Chat] Failed to mark messages as read:', {
          status: response.status,
          conversation_id: convId,
          message_id: messageId,
          error: errorData
        });
      }
    } catch (err) {
      console.error('[Chat] Error marking messages as read:', {
        conversation_id: convId,
        message_id: messageId,
        error: err
      });
      // Don't show error to user - this is a background operation
    }
  }, [token]);

 // Fetch message history when conversation is available
const fetchMessageHistory = useCallback(
  async (convId: string) => {
    if (!token || !convId) return;

    // Prevent duplicate fetches only if we're currently fetching
    const fetchKey = `fetching_${convId}`;
    if (fetchedHistoryRef.current.has(fetchKey)) {
      return;
    }

    try {
      fetchedHistoryRef.current.add(fetchKey);

      // Helper function to normalize URL protocol (fix mixed content issues)
      // Defined locally inside fetchMessageHistory to ensure it's always available
      const normalizeUrlProtocolLocal = (url: string | undefined | null): string | undefined => {
        if (!url) return undefined;
        
        // Always normalize backend URLs to HTTPS when page is HTTPS
        if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
          // Replace http:// with https:// for all URLs (fix mixed content error)
          return url.replace(/^http:\/\//, 'https://');
        }
        
        return url;
      };

      const endpoint = `${BACKEND_URL}/api/chat/conversations/${convId}/messages/?page_size=1000`;

      let messagesData: WsMessage[] = [];

      // Helper function to parse messages from response
      const parseMessages = (rawMessages: any[]): WsMessage[] =>
        rawMessages
          .map((msg: any): WsMessage | undefined => {
            if (!msg) return undefined;

            const messageId = msg.id || msg.message_id;

            // sender_id handling - normalize to number, handle both string and integer formats
            let senderId: number | undefined =
              msg.sender_id ||
              msg.sender?.id ||
              msg.sender?.user_id;

            if (!senderId && typeof msg.sender === "number") {
              senderId = msg.sender;
            }
            
            // Normalize senderId to number (backend may return string in some endpoints)
            if (senderId !== undefined) {
              senderId = Number(senderId);
              // If conversion resulted in NaN, set to undefined
              if (isNaN(senderId)) {
                senderId = undefined;
              }
            }

            const senderName =
              msg.sender_name ||
              msg.sender?.username ||
              msg.sender?.userName ||
              (typeof msg.sender === "object"
                ? msg.sender.username
                : undefined) ||
              "未知用户";

            const timestamp =
              msg.timestamp ||
              msg.created_at ||
              new Date().toISOString();

            const messageType = msg.message_type || "text";

            // Skip command / empty messages
            // Don't skip audio or video messages even if content is empty
            if (
              messageType === "command" ||
              (messageType === "text" && !msg.content && !msg.image_url && !msg.audio_url && !msg.video_url)
            ) {
              return undefined;
            }

            //reply to handling 
            let replyToInfo: WsMessage["reply_to"];

            if (msg.reply_to) {
              if (typeof msg.reply_to === "string") {
                replyToInfo = {
                  message_id: msg.reply_to,
                  content:
                    msg.reply_to_content || msg.quote_text || "",
                  sender_name:
                    msg.reply_to_sender_name || "未知用户",
                };
              } else if (typeof msg.reply_to === "object") {
                replyToInfo = {
                  message_id:
                    msg.reply_to.message_id ||
                    msg.reply_to.id ||
                    String(msg.reply_to),
                  content: msg.reply_to.content || "",
                  sender_name:
                    msg.reply_to.sender_name ||
                    msg.reply_to.sender?.username ||
                    "未知用户",
                };
              }
            } else if (msg.quoted_message) {
              replyToInfo = {
                message_id:
                  msg.quoted_message.message_id ||
                  msg.quoted_message.id ||
                  String(msg.quoted_message),
                content: msg.quoted_message.content || "",
                sender_name:
                  msg.quoted_message.sender_name ||
                  msg.quoted_message.sender?.username ||
                  "未知用户",
              };
            } else if (msg.reply_to_message) {
              replyToInfo = {
                message_id:
                  msg.reply_to_message.message_id ||
                  msg.reply_to_message.id ||
                  String(msg.reply_to_message),
                content: msg.reply_to_message.content || "",
                sender_name:
                  msg.reply_to_message.sender_name ||
                  msg.reply_to_message.sender?.username ||
                  "未知用户",
              };
            }

            // If message is recalled, override content to show recall message
            const isRecalled = msg.is_recalled || false;
            const messageContent = isRecalled ? '[消息已撤回]' : (msg.content || "");

            return {
              type: "new_message" as const,
              message_id:
                messageId?.toString() ??
                `msg_${Date.now()}_${Math.random()}`,
              content: messageContent,
              sender_id: senderId, // Already normalized to number above
              sender_name: senderName,
              conversation_id: String(
                msg.conversation_id || msg.conversation || convId
              ),
              timestamp,
              message_type: messageType,
              is_recalled: isRecalled,
              image_url: msg.image_url ? normalizeImageUrl(msg.image_url) : undefined,
              // @ts-ignore - audio_url and audio_duration not in WsMessage type yet
              audio_url: msg.audio_url ? normalizeMediaUrl(msg.audio_url) : undefined,
              audio_duration: msg.audio_duration,
              // @ts-ignore - video_url, video_duration, video_thumbnail_url not in WsMessage type yet
              video_url: msg.video_url ? normalizeMediaUrl(msg.video_url) : undefined,
              video_duration: msg.video_duration,
              video_thumbnail_url: msg.video_thumbnail_url ? normalizeMediaUrl(msg.video_thumbnail_url) : undefined,
              reply_to: replyToInfo,
              // Preserve is_edited flag from backend - check multiple possible field names
              // Only set to true if explicitly true, otherwise false (to ensure edited indicator persists)
              is_edited: !!(msg.is_edited === true || msg.isEdited === true || msg.edited === true),
            };
          })
          .filter(
            (m): m is WsMessage => m !== undefined
          );

      // Single request 
      // Normalize initial endpoint to prevent mixed content errors
      let currentUrl: string | undefined = normalizeUrlProtocolLocal(endpoint);
      let allMessages: WsMessage[] = [];

      while (currentUrl) {
        // Normalize URL before fetching to prevent mixed content errors
        const normalizedUrl = normalizeUrlProtocolLocal(currentUrl);
        if (!normalizedUrl) break;
        
        const response = await fetch(normalizedUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.warn(
            "[Chat] Failed to fetch messages:",
            normalizedUrl,
            response.status
          );
          break;
        }

        const res: any = await response.json();

        if (res.results && Array.isArray(res.results)) {
          const rawMessages = res.results;

          const pageMessages = parseMessages(rawMessages);
          allMessages = allMessages.concat(pageMessages);

          // Normalize the next URL to use HTTPS if page is HTTPS (fix mixed content error)
          currentUrl = normalizeUrlProtocolLocal(res.next);
        } else if (Array.isArray(res)) {
          // array fallback
          allMessages = parseMessages(res);
          currentUrl = undefined;
        } else {
          break;
        }
      }

      // All pages fetched

      messagesData = allMessages;

      // clearedConversations logic 
      let shouldClearMessages = false;
      try {
        const clearedConversations = JSON.parse(
          localStorage.getItem("clearedConversations") || "[]"
        );
        if (clearedConversations.includes(String(convId))) {
          shouldClearMessages = true;
        }
      } catch {
        /* ignore */
      }

      if (messagesData.length > 0 && !shouldClearMessages) {
        // Sort oldest to newest
        messagesData.sort((a, b) => {
          const timeA = new Date(a.timestamp || 0).getTime();
          const timeB = new Date(b.timestamp || 0).getTime();
          return timeA - timeB;
        });

          // Merge with existing messages to avoid losing messages that arrived via WebSocket
        setMessages(prev => {
          // Create a map of existing messages by message_id for quick lookup
          const existingMap = new Map(prev.map(m => [m.message_id, m]));
          
          // Add/update messages from fetched history
          messagesData.forEach(msg => {
            if (msg.message_id) {
              const existingMsg = existingMap.get(msg.message_id);
              // Preserve is_edited flag from existing message if new message doesn't have it
              if (existingMsg && existingMsg.is_edited && !msg.is_edited) {
                msg.is_edited = true;
              }
              existingMap.set(msg.message_id, msg);
            }
          });
          
          // Convert back to array and sort
          const merged = Array.from(existingMap.values());
          merged.sort((a, b) => {
            const timeA = new Date(a.timestamp || 0).getTime();
            const timeB = new Date(b.timestamp || 0).getTime();
            return timeA - timeB;
          });
          
          return merged;
        });
        fetchedHistoryRef.current.delete(fetchKey);
        fetchedHistoryRef.current.add(`fetched_${convId}`);

        // Fetch read_status for messages sent by current user to populate the read indicator
        // The read indicator shows who has read messages sent by the current user
        const messagesFromCurrentUser = messagesData.filter(msg => {
          const msgSenderId = msg.sender_id;
          return msgSenderId !== undefined && Number(msgSenderId) === Number(currentUserId) && msg.message_id;
        });
        
        
        messagesFromCurrentUser.forEach((msg, index) => {
          setTimeout(() => {
            const fetchFn = fetchReadStatusRef.current;
            if (typeof fetchFn === 'function' && msg.message_id) {
              fetchFn(msg.message_id);
            }
          }, index * 50); // Stagger requests to avoid overwhelming the backend
        });

        // Mark messages as read when user opens/views the chat
        // This updates the backend to mark messages as read for the current user (the receiver)
        // Only mark messages received from others (not messages sent by current user)
        const messagesFromOthers = messagesData.filter(msg => {
          const msgSenderId = msg.sender_id;
          return msgSenderId !== undefined && Number(msgSenderId) !== Number(currentUserId);
        });
        
        if (messagesFromOthers.length > 0) {
          const latestFromOthers = messagesFromOthers[messagesFromOthers.length - 1];
          if (latestFromOthers?.message_id) {
            // Mark messages as read (backend also does this automatically on GET /messages/)
            markMessagesAsRead(convId, latestFromOthers.message_id);
            // Don't proactively refetch read status - backend sends WebSocket notification
        } else {
          markMessagesAsRead(convId);
            // Don't proactively refetch read status - backend sends WebSocket notification
          }
        }

        setTimeout(() => {
          messageEndRef.current?.scrollIntoView({
            behavior: "smooth",
          });
        }, 100);
      } else if (shouldClearMessages) {
        setMessages([]);
        fetchedHistoryRef.current.delete(fetchKey);
        fetchedHistoryRef.current.add(`fetched_${convId}`);

        try {
          const clearedConversations = JSON.parse(
            localStorage.getItem("clearedConversations") || "[]"
          );
          const updated = clearedConversations.filter(
            (id: string) => id !== String(convId)
          );
          localStorage.setItem(
            "clearedConversations",
            JSON.stringify(updated)
          );
        } catch {
          /* ignore */
        }
      } else {
        fetchedHistoryRef.current.delete(fetchKey);
        setMessages((prev) => (prev.length === 0 ? [] : prev));
      }
    } catch (err) {
      console.error("[Chat] Error fetching message history:", err);
      fetchedHistoryRef.current.delete(fetchKey);
    }
  },
  [token, BACKEND_URL, currentUserId]
);


  useEffect(() => {
    // Wait for currentUserId to be set before validating
    // This prevents false "用户ID无效" errors during initial load
    if (currentUserId === 0) {
      return;
    }
    
    const validConvId = getValidConvId();
    
    // Basic validation - we need target and login status
    if (typeof target !== 'string' || !isLogin) {
      let errMsg = '';
      if (typeof target !== 'string') {
        errMsg = 'Missing target user';
      } else if (!isLogin) {
        errMsg = 'Not logged in';
      }
      message.error(`Cannot start chat: ${errMsg}, redirecting to friend list`);
      setTimeout(() => {
        router.push('/friend_list');
      }, 1500);
      return;
    }
    
    // If we have a valid conv_id, use it directly and fetch message history
    if (validConvId) {
      setConversationId(validConvId);
      // Always fetch message history for existing conversation on initial load
      // The fetchedHistoryRef will prevent duplicate fetches within the same session
      setTimeout(() => {
        fetchMessageHistory(validConvId);
        // Messages will be marked as read in fetchMessageHistory after they load
      }, 100);
      return;
    }
    
    // If no conv_id but we have friend_id, we can still proceed
    // The conversation will be created when the first message is sent
    if (friend_id && typeof friend_id === 'string') {
      setConversationId(undefined); // Will be created on first message
      return;
    }
    
    // If we have neither conv_id nor friend_id, we can't proceed
    message.error('Cannot start chat: Missing required parameters, redirecting to friend list');
    setTimeout(() => {
      router.push('/friend_list');
    }, 1500);
  }, [conv_id, target, friend_id, isLogin, currentUserId, router, fetchMessageHistory, markMessagesAsRead]);

  // Function to clear messages for a conversation
  const clearMessagesForConversation = useCallback((convId: string | number) => {
    const convIdStr = String(convId);
    const currentConvId = conversationId || getValidConvId();
    const currentConvIdStr = currentConvId ? String(currentConvId) : undefined;
    
    // Only clear if this is the current conversation
    if (currentConvIdStr && convIdStr === currentConvIdStr) {
      // Clear the fetched history cache to force a fresh fetch
      const fetchKey = `fetching_${currentConvIdStr}`;
      const fetchedKey = `fetched_${currentConvIdStr}`;
      fetchedHistoryRef.current.delete(fetchKey);
      fetchedHistoryRef.current.delete(fetchedKey);
      
      // Clear current messages immediately
      setMessages([]);
    }
  }, [conversationId, getValidConvId, messages.length]);

  // Listen for chat messages cleared event and refresh messages
  useEffect(() => {
    const handleChatMessagesCleared = (event: Event) => {
      const customEvent = event as CustomEvent;
      const clearedConvId = customEvent.detail?.conversationId;
      clearMessagesForConversation(clearedConvId);
    };

    window.addEventListener('chatMessagesCleared', handleChatMessagesCleared as EventListener);
    
    // Check localStorage for cleared conversations (fallback if event wasn't received)
    try {
      const clearedConversations = JSON.parse(
        localStorage.getItem('clearedConversations') || '[]'
      );
      const currentConvId = conversationId || getValidConvId();
      const currentConvIdStr = currentConvId ? String(currentConvId) : undefined;
      
      if (currentConvIdStr && clearedConversations.includes(currentConvIdStr)) {
        clearMessagesForConversation(currentConvIdStr);
      }
    } catch {
      // Silently handle localStorage errors
    }
    
    // Also listen for page visibility changes to refresh if messages were cleared
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        try {
          const clearedConversations = JSON.parse(
            localStorage.getItem('clearedConversations') || '[]'
          );
          const currentConvId = conversationId || getValidConvId();
          const currentConvIdStr = currentConvId ? String(currentConvId) : undefined;
          
          if (currentConvIdStr && clearedConversations.includes(currentConvIdStr)) {
            clearMessagesForConversation(currentConvIdStr);
          }
        } catch {
          // Silently handle localStorage errors
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('chatMessagesCleared', handleChatMessagesCleared as EventListener);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationId, getValidConvId, clearMessagesForConversation]);

  // When opened with only friend_id (no conv_id), try to resolve an existing
  // private conversation from the friends endpoint, so history can load immediately.
  useEffect(() => {
    if (!token) return;
    if (!friend_id || typeof friend_id !== 'string') return;

    const validConvId = getValidConvId();
    // If conv_id is already present or we've already resolved conversationId, skip
    if (validConvId || conversationId) return;

    const friendIdNum = parseInt(friend_id, 10);
    if (Number.isNaN(friendIdNum)) return;

    (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/user/friends/`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          console.warn('[Chat] Failed to resolve conversation from friends API:', response.status);
          return;
        }

        const res = await response.json();
        const friends = res.friends || res.friendList || [];
        const friend = friends.find((f: any) => Number(f.id) === friendIdNum);

        if (!friend) {
          return;
        }

        const rawConvId = friend.conversation_id ?? friend.conversationId;
        if (rawConvId === undefined || rawConvId === undefined) {
          return;
        }

        const resolvedConvId = String(rawConvId);
        setConversationId(resolvedConvId);

        // Only update URL if we're on the chat page (prevent navigation from other pages)
        // Use both router and window.location for maximum reliability
        const resolveRouterPath = router.pathname;
        const resolveWindowPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const resolveIsOnChatPage = resolveRouterPath === '/chat' && resolveWindowPath.startsWith('/chat');
        
        if (resolveIsOnChatPage) {
          // Final check before navigation
          if (router.pathname !== '/chat' || (typeof window !== 'undefined' && !window.location.pathname.startsWith('/chat'))) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Chat] Aborting router.replace in friend_id resolution - not on chat page');
            }
            return;
          }
          
          // Update URL to include conv_id so other effects treat this as an existing conversation
          router.replace({
            pathname: '/chat',
            query: { ...router.query, conv_id: resolvedConvId },
          }, undefined, { shallow: true });
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('[Chat] Skipping URL update in friend_id resolution - not on chat page:', {
              routerPath: resolveRouterPath,
              windowPath: resolveWindowPath
            });
          }
        }

        // Fetch history and mark messages as read
        fetchMessageHistory(resolvedConvId);
        markMessagesAsRead(resolvedConvId);
      } catch (err) {
        console.error('[Chat] Error resolving conversation from friends API:', err);
      }
    })();
  }, [friend_id, token, conversationId, router, fetchMessageHistory, markMessagesAsRead]);

  // Main chat effect - set up WebSocket handlers
  // Use useRef to track if handlers are already set up to avoid re-setting on every render
  const handlersSetupRef = useRef<string | undefined>(undefined);
  
  useEffect(() => {
    // CRITICAL: Only set up WebSocket handlers if we're actually on the chat page
    // This prevents the component from processing messages and causing navigation when on other pages
    // Use both router.pathname and window.location for maximum reliability
    const routerPath = router.pathname;
    const windowPath = typeof window !== 'undefined' ? window.location.pathname : '';
    const isOnChatPage = routerPath === '/chat' && windowPath.startsWith('/chat');
    
    if (!isOnChatPage) {
      // Clear any existing handlers when not on chat page to prevent message processing
      if (wsClient) {
        wsClient.onMessage = undefined;
      }
      handlersSetupRef.current = undefined;
      setIsLoading(false);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[Chat] Skipping WebSocket setup - not on chat page:', {
          routerPath,
          windowPath,
          isOnChatPage
        });
      }
      return;
    }
    
    const validConvId = conversationId || getValidConvId();
    
    // Basic validation
    if (typeof target !== 'string' || !isLogin || currentUserId === 0) {
      setIsLoading(false);
      return;
    }

    // If we have friend_id but no conversationId, we still need to set up WebSocket
    // to receive the conversation_id when the first message is sent
    if (!validConvId && !(friend_id && typeof friend_id === 'string')) {
      handlersSetupRef.current = undefined;
      setIsLoading(false);
      return;
    }

    // Only set up handlers once, or when conversationId changes
    // Use a key that includes both validConvId and friend_id to handle the case where
    // we start without a conversation ID but get one later
    const handlerKey = validConvId || `friend_${friend_id}`;
    if (handlersSetupRef.current === handlerKey && wsClient?.onMessage) {
      setIsLoading(false);
      return;
    }

    handlersSetupRef.current = handlerKey;

    const loadingTimer = setTimeout(() => {
      setIsLoading(false);
    }, 600);

    onWsConnect(() => {
      // Only show connection message if we're on chat page
      const isOnChatPage = router.pathname === '/chat';
      setIsLoading(false);
      if (isOnChatPage) {
        message.success(`已连接到与${target}的聊天`);
      }
    });

    onWsMessage((msg) => {
      // CRITICAL: Early return if not on chat page - don't process messages at all
      // This prevents any state updates or navigation when user is on other pages
      // Use both router.pathname and window.location for maximum reliability
      const msgRouterPath = router.pathname;
      const msgWindowPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const msgIsOnChatPage = msgRouterPath === '/chat' && msgWindowPath.startsWith('/chat');
      
      // Debug logging in development
      if (process.env.NODE_ENV === 'development' && !msgIsOnChatPage && msg.type === 'new_message') {
        console.log('[Chat] Message ignored - not on chat page:', {
          routerPath: msgRouterPath,
          windowPath: msgWindowPath,
          messageType: msg.type,
          conversationId: msg.conversation_id
        });
      }
      
      if (!msgIsOnChatPage) {
        // Silently ignore messages when not on chat page
        // This is the most important guard - prevents ALL processing when not on chat page
        return;
      }
      
      // Handle error messages first (before other handlers)
      // Use type assertion since 'error' is a valid backend message type
      if ((msg as any).type === 'error') {
        const errorMsg = (msg as any).message || 'Unknown error';
        console.error('[Chat] WebSocket error received:', errorMsg);
        
        // Check if this is an edit message failure
        // Use refs to access current values (state might be cleared before error arrives)
        const currentEditingId = editingMessageIdRef.current;
        const currentOriginalContent = originalEditContentRef.current;
        if (currentEditingId && (errorMsg.includes('编辑') || errorMsg.includes('edit') || errorMsg.includes('消息'))) {
          // Revert the optimistic update by restoring original content
          setMessages(prev => prev.map(m => 
            m.message_id === currentEditingId
              ? { ...m, content: currentOriginalContent, is_edited: false }
              : m
          ));
          // Restore original edit content in the input field and keep in edit mode
          setEditingMessageId(currentEditingId);
          setEditingContent(currentOriginalContent);
          message.error(`编辑失败: ${errorMsg}`);
      } else {
          message.error(`服务器错误: ${errorMsg}`);
        }
        return;
      }

      // Handle message_sent response from backend (confirmation)
      if (msg.type === 'message_sent' && msg.message_id) {
        // Backend sent confirmation with message_id
        // Check if conversation_id is in the response
        const confirmedConvId = (msg as any).conversation_id;
        
        // Only update URL if we're on the chat page (prevent navigation from other pages)
        const sentRouterPath = router.pathname;
        const sentWindowPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const sentIsOnChatPage = sentRouterPath === '/chat' && sentWindowPath.startsWith('/chat');
        
        if (process.env.NODE_ENV === 'development' && confirmedConvId) {
          console.log('[Chat] message_sent received:', {
            isOnChatPage: sentIsOnChatPage,
            routerPath: sentRouterPath,
            windowPath: sentWindowPath,
            confirmedConvId
          });
        }
        
        if (confirmedConvId && sentIsOnChatPage) {
          const convIdStr = String(confirmedConvId);
          setConversationId(convIdStr);
          
          // Multiple checks to ensure we're still on chat page before any navigation
          // Check 1: window.location (most reliable)
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/chat')) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Chat] Aborting router.replace in message_sent - window.location.pathname is not /chat:', window.location.pathname);
            }
            return;
          }
          
          // Check 2: router.pathname
          if (router.pathname !== '/chat') {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Chat] Aborting router.replace in message_sent - router.pathname changed:', router.pathname);
            }
            return;
          }
          
          // Check 3: router.asPath (actual current path, includes query params)
          // Split by ? to get just the pathname part for comparison
          const sentAsPathWithoutQuery = router.asPath ? router.asPath.split('?')[0] : '';
          if (router.asPath && sentAsPathWithoutQuery !== '/chat') {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Chat] Aborting router.replace in message_sent - router.asPath is not /chat:', router.asPath);
            }
            return;
          }
          
          // All checks passed - safe to update URL
          // Update URL to persist the conversation ID (only if already on chat page)
          router.replace({
            pathname: '/chat',
            query: { ...router.query, conv_id: convIdStr }
          }, undefined, { shallow: true });
          // Don't fetch history here - wait for new_message broadcast which will trigger it
          // This prevents duplicate fetches
        } else if (confirmedConvId) {
          // Still set conversationId state even if not on chat page (for when user navigates later)
          setConversationId(String(confirmedConvId));
        }
        return;
      }

      // Handle connection_established
      if (msg.type === 'connection_established') {
        setIsLoading(false);
        return;
      }

      // Handle conversation creation response
      // Only update URL if we're already on the chat page (don't auto-navigate)
      // Re-check pathname here as it might have changed
      const convRouterPath = router.pathname;
      const convWindowPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const convIsOnChatPage = convRouterPath === '/chat' && convWindowPath.startsWith('/chat');
      
      if (process.env.NODE_ENV === 'development' && msg.type === 'new_message' && msg.conversation_id) {
        console.log('[Chat] new_message received:', {
          isOnChatPage: convIsOnChatPage,
          routerPath: convRouterPath,
          windowPath: convWindowPath,
          conversationId: msg.conversation_id,
          hasConversationId: !!conversationId,
          hasValidConvId: !!validConvId
        });
      }
      
      if (msg.type === 'new_message' && msg.conversation_id && convIsOnChatPage) {
        const msgConvId = String(msg.conversation_id);
        // If we don't have a conversationId yet, this is a new conversation
        if (!conversationId && !validConvId) {
          // Final check before any state updates or navigation
          if (router.pathname !== '/chat' || (typeof window !== 'undefined' && !window.location.pathname.startsWith('/chat'))) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Chat] Aborting conversation creation - not on chat page');
            }
            return;
          }
          
          setConversationId(msgConvId);
          // Update the URL to include the conversation ID (only if already on chat page)
          // Use explicit pathname to prevent any navigation
          router.replace({
            pathname: '/chat',
            query: { ...router.query, conv_id: msgConvId }
          }, undefined, { shallow: true });
          // Fetch message history for the newly created conversation
          fetchMessageHistory(msgConvId);
        }
      }

      // Handle message recalled response (via command_message) - for BOTH sender and receiver
      // Handle this BEFORE conversation_id filter to ensure recall messages are processed
      if (msg.type === 'command_message' && msg.command_type === 'recall') {
        const recalledMsgId = msg.command_data?.recalled_message_id;
        const msgConvId = msg.conversation_id ? String(msg.conversation_id) : undefined;
        const currentConvId = conversationId || validConvId;
        
        // Only process if it's for the current conversation (or if we don't have a conversation yet)
        if (recalledMsgId && (!msgConvId || !currentConvId || String(msgConvId) === String(currentConvId))) {
          // Update message immediately for both sender and receiver
          let shouldShowNotification = false;
          setMessages(prev => {
            const found = prev.find(m => m.message_id === recalledMsgId);
            if (found) {
              // Only show notification for receiver (sender already sees success message from API call)
              const isFromCurrentUser = found.sender_id !== undefined && currentUserId > 0 && Number(found.sender_id) === Number(currentUserId);
              shouldShowNotification = !isFromCurrentUser;
              
              return prev.map(m => 
                m.message_id === recalledMsgId
                  ? { ...m, is_recalled: true, content: '[消息已撤回]' }
                  : m
              );
            } else {
              console.warn('[Chat] Recall notification received but message not found in current messages:', recalledMsgId, {
                availableMessageIds: prev.map(m => m.message_id).slice(0, 10)
              });
            }
            return prev;
          });
          
          // Show notification after state update
          if (shouldShowNotification) {
            message.info('有消息已撤回');
          }
        }
        return;
      }

      // Handle read status updates (via command_message) - real-time updates when messages are marked as read
      // Backend sends this when User B opens chat and marks messages as read, User A receives this instantly
      // Handle this BEFORE conversation_id filter to ensure read status updates are processed
      if (msg.type === 'command_message' && msg.command_type === 'read_status') {
        const msgConvId = msg.conversation_id ? String(msg.conversation_id) : undefined;
        const currentConvId = conversationId || validConvId;
        
        
        // Only process if it's for the current conversation (or if we don't have a conversation yet)
        if (msgConvId && currentConvId && String(msgConvId) === String(currentConvId)) {
          const commandData = msg.command_data;
          // Handle both message_ids (array) and message_id (single) formats
          const messageIds = commandData?.message_ids || (commandData?.message_id ? [commandData.message_id] : []);
          // Check if read_status is in command_data directly or if we need to extract it differently
          const readStatusData = commandData?.read_status || (commandData as any);
          
          
          if (messageIds.length > 0) {
            // Update all messages in a single batch to avoid multiple re-renders
            setReadStatusMap(prev => {
              const newMap = new Map(prev);
              let hasUpdates = false;
              
              messageIds.forEach((messageId: string) => {
                // Check if we have read status data to use
                if (readStatusData && (readStatusData.read_count !== undefined || readStatusData.total_recipients !== undefined)) {
                  newMap.set(messageId, {
                    message_id: messageId,
                    read_count: readStatusData.read_count || 0,
                    total_recipients: readStatusData.total_recipients || 0,
                    unread_count: readStatusData.unread_count || (readStatusData.total_recipients - readStatusData.read_count) || 0,
                    readers: readStatusData.readers || [],
                    unread_users: readStatusData.unread_users || []
                  } as any);
                  hasUpdates = true;
                } else {
                  // No read status data in message - we'll refetch it
                }
              });
              
              // Only return new Map if we made updates
              return hasUpdates ? new Map(newMap) : prev;
            });
            
            // Force component re-render by updating counter (only once after all updates)
            if (messageIds.length > 0) {
              setReadStatusUpdateCounter(prev => prev + 1);
            }
            
            // For messages without read_status data, refetch them
            messageIds.forEach((messageId: string) => {
              if (!readStatusData || (readStatusData.read_count === undefined && readStatusData.total_recipients === undefined)) {
                if (fetchReadStatusRef.current) {
                  setTimeout(() => {
                    fetchReadStatusRef.current?.(messageId, true); // Force refetch
                  }, 100);
                }
              }
              
              // Clear loading state if it exists
              setLoadingReadStatus(prev => {
                if (prev.has(messageId)) {
                  const newSet = new Set(prev);
                  newSet.delete(messageId);
                  return newSet;
                }
                return prev;
              });
            });
          } else if ((commandData as any)?.read_index || (commandData as any)?.read_index_timestamp) {
            // Backend sent read_index format: {read_index: timestamp, user_id: X, updated_count: Y}
            // This indicates that a user has read messages up to a certain timestamp
            // Backend sent read_index format: we don't proactively refetch to avoid race conditions
            // Backend should send proper read_status WebSocket notifications with message_ids and read_status data
          }
        }
        return;
      }

      // Don't proactively refetch read status on every message - this causes incorrect read indicators
      // The backend sends WebSocket notifications (command_message with type 'read_status') when messages are actually marked as read
      // We should only update read status based on those WebSocket notifications, not on every message

      // Filter messages by conversation_id (but allow messages without conversation_id for new conversations)
      const currentConvId = conversationId || validConvId;
      // Only filter if both the message and current conversation have IDs
      // Allow messages without conversation_id to pass through (for new conversations)
      if (msg.conversation_id && currentConvId && String(msg.conversation_id) !== String(currentConvId)) {
        return;
      }

      // Handle message edited response
      if (msg.type === 'message_edited' || (msg.type === 'new_message' && (msg as any).is_edited)) {
        const editedMessageId = msg.message_id;
        const msgConvId = msg.conversation_id ? String(msg.conversation_id) : undefined;
        const currentConvId = conversationId || validConvId;
        
        // Only process if it's for the current conversation
        if (editedMessageId && (!msgConvId || !currentConvId || String(msgConvId) === String(currentConvId))) {
          setMessages(prev => prev.map(m => 
            m.message_id === editedMessageId
              ? { ...m, content: msg.content || m.content, is_edited: true }
              : m
          ));
          
          // Close edit mode on successful confirmation
          if (editingMessageIdRef.current === editedMessageId) {
            setEditingMessageId(undefined);
            setEditingContent('');
            setOriginalEditContent('');
            editingMessageIdRef.current = undefined;
            originalEditContentRef.current = '';
            message.success('Message edited successfully');
          }
        }
        return;
      }

      // Handle new messages (broadcasted from backend)
      if (msg.type === 'new_message') {
        // Filter out command messages - they shouldn't be displayed in chat
        if ((msg as any).message_type === 'command' || (!msg.content && !msg.image_url && msg.message_type === 'text')) {
          return;
        }
        
        // Check if we've already processed this message (prevent duplicate notifications)
        // Do this check early before any state updates
        if (msg.message_id && processedMessageIdsRef.current.has(msg.message_id)) {
          return; // Already processed, skip completely
        }
        
        const msgConvId = msg.conversation_id ? String(msg.conversation_id) : undefined;
        
        // Only update conversation ID and URL if we're already on the chat page
        // Don't automatically navigate users to chat when they receive messages on other pages
        // Re-check pathname here as it might have changed
        const newMsgRouterPath = router.pathname;
        const newMsgWindowPath = typeof window !== 'undefined' ? window.location.pathname : '';
        const newMsgIsOnChatPage = newMsgRouterPath === '/chat' && newMsgWindowPath.startsWith('/chat');
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[Chat] Processing new_message:', {
            isOnChatPage: newMsgIsOnChatPage,
            routerPath: newMsgRouterPath,
            windowPath: newMsgWindowPath,
            msgConvId,
            hasConversationId: !!conversationId,
            conversationId,
            messageId: msg.message_id
          });
        }
        
        // Update conversation ID if we got it from the message (this is the most reliable source)
        // Always set the state if we have a conversation ID, but only update URL if on chat page
        if (msgConvId) {
          const needsUpdate = !conversationId || conversationId !== msgConvId;
          if (needsUpdate) {
            setConversationId(msgConvId);
            
            // Only update URL and fetch history if we're already on the chat page
            // This prevents automatic navigation when user is on other pages
            if (newMsgIsOnChatPage) {
              // Multiple checks to ensure we're still on chat page before any navigation
              // Check 1: window.location (most reliable)
              if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/chat')) {
                if (process.env.NODE_ENV === 'development') {
                  console.warn('[Chat] Aborting router.replace - window.location.pathname is not /chat:', window.location.pathname);
                }
                return; // Not on chat page, don't navigate
              }
              
              // Check 2: router.pathname
              if (router.pathname !== '/chat') {
                if (process.env.NODE_ENV === 'development') {
                  console.warn('[Chat] Aborting router.replace - router.pathname changed:', router.pathname);
                }
                return; // Path changed, don't navigate
              }
              
              // Check 3: router.asPath (actual current path, includes query params)
              // Split by ? to get just the pathname part for comparison
              const asPathWithoutQuery = router.asPath ? router.asPath.split('?')[0] : '';
              if (router.asPath && asPathWithoutQuery !== '/chat') {
                if (process.env.NODE_ENV === 'development') {
                  console.warn('[Chat] Aborting router.replace - router.asPath is not /chat:', router.asPath);
                }
                return; // Not on chat page, don't navigate
              }
              
              // All checks passed - safe to update URL
              // Update URL to persist the conversation ID (only if already on chat page)
              // Use explicit pathname to ensure we're updating the current page, not navigating
              router.replace({
                pathname: '/chat',
                query: { ...router.query, conv_id: msgConvId }
              }, undefined, { shallow: true });
              
              // If this is a new conversation, fetch full message history
              // Only fetch if we haven't already fetched for this conversation
              if (!conversationId && !validConvId && !fetchedHistoryRef.current.has(`fetched_${msgConvId}`)) {
                setTimeout(() => {
                  fetchMessageHistory(msgConvId);
                  markMessagesAsRead(msgConvId);
                }, 500);
              }
            }
            // Note: If not on chat page, we still set conversationId state for when user navigates to chat later
            // but we don't update URL or fetch history to avoid unwanted navigation
          }
        }

        // Check if this message already exists (avoid duplicates)
        // Normalize sender_id for comparison - handle both string and number formats from backend
        let msgSenderId: number | undefined;
        if (msg.sender_id !== undefined) {
          msgSenderId = Number(msg.sender_id);
          // If conversion resulted in NaN, set to undefined
          if (isNaN(msgSenderId)) {
            msgSenderId = undefined;
          }
        }
        const isFromCurrentUser = msgSenderId !== undefined && currentUserId > 0 && Number(currentUserId) === Number(msgSenderId);
        
        let isActuallyNewMessage = false;
        setMessages(prev => {
          // Check if message already exists by message_id (primary check)
          if (msg.message_id) {
          const existingMessageIndex = prev.findIndex(m => m.message_id === msg.message_id);
          
          if (existingMessageIndex >= 0) {
            // Message already exists - this might be an edit update, recall update, or duplicate
            const existingMsg = prev[existingMessageIndex];
            const contentChanged = msg.content && msg.content !== existingMsg.content;
            const isEdited = (msg as any).is_edited || msg.type === 'message_edited';
            const isRecalled = msg.is_recalled === true;
            
            // Handle recalled message update (when backend sends new_message with is_recalled: true)
            if (isRecalled && !existingMsg.is_recalled) {
              const updated = [...prev];
              updated[existingMessageIndex] = { 
                ...existingMsg, 
                is_recalled: true,
                content: '[消息已撤回]'
              };
              message.info('有消息已撤回');
              return updated;
            }
            
            if (contentChanged || isEdited) {
              // Update existing message (this handles edited messages)
              const updated = [...prev];
              // Preserve reply_to content - prefer existing if new one is empty
              const preservedReplyTo = (typeof msg.reply_to === 'object' && msg.reply_to && msg.reply_to.content)
                ? msg.reply_to
                : (existingMsg.reply_to || msg.reply_to);
              updated[existingMessageIndex] = { 
                ...existingMsg, 
                content: msg.content || existingMsg.content,
                is_edited: isEdited || existingMsg.is_edited || false,
                  sender_id: msgSenderId !== undefined ? msgSenderId : existingMsg.sender_id,
                  reply_to: preservedReplyTo
              };
              return updated;
      } else {
                // Same content and not edited, ignore duplicate
                return prev;
              }
            }
          }
          
          // If this is from current user, replace temporary message or recent duplicate
          // Check for temp messages first (most reliable match)
          if (isFromCurrentUser) {
            // First, try to find temp message by ID prefix and content match
            const tempMessageIndex = prev.findIndex(m => 
              m.message_id?.startsWith('temp_') && 
              Number(m.sender_id) === Number(currentUserId) &&
              // Match by content for text, or by media URL for media messages
              (msg.message_type === 'image' && m.image_url && msg.image_url && m.image_url === msg.image_url) ||
              ((msg as any).message_type === 'audio' && (m as any).audio_url && (msg as any).audio_url && (m as any).audio_url === (msg as any).audio_url) ||
              ((msg as any).message_type === 'video' && (m as any).video_url && (msg as any).video_url && (m as any).video_url === (msg as any).video_url) ||
              (msg.message_type !== 'image' && (msg as any).message_type !== 'audio' && (msg as any).message_type !== 'video' && m.content === msg.content)
            );
            
            if (tempMessageIndex >= 0 && msg.message_id) {
              // Replace temp message with real one from WebSocket
              const updated = [...prev];
              const existingMsg = prev[tempMessageIndex];
              // Preserve reply_to content from existing message if new message doesn't have it
              const preservedReplyTo = (typeof msg.reply_to === 'object' && msg.reply_to && msg.reply_to.content)
                ? msg.reply_to
                : existingMsg.reply_to;
              // Ensure the confirmed message has proper sender_id as number
              // Preserve is_edited flag from existing message if new message doesn't have it
              const preservedIsEdited = (msg as any).is_edited !== undefined 
                ? (msg as any).is_edited 
                : existingMsg.is_edited || false;
              updated[tempMessageIndex] = { 
                ...msg, 
                sender_id: msgSenderId, 
                reply_to: preservedReplyTo,
                is_edited: preservedIsEdited
              };
              // Mark as processed to prevent duplicate notifications
              processedMessageIdsRef.current.add(msg.message_id);
              
              // Reset sending flag immediately when message is confirmed
              // This allows sending new messages without waiting for timeout
              if (isSendingRef.current) {
                isSendingRef.current = false;
              }
              
              return updated;
            }
            
            // If no temp message found, check for recent duplicate by content/timestamp (within 5 seconds)
            // This handles cases where temp message was already replaced or timing issues
            const recentDuplicate = prev.find(m => 
              m.message_id !== msg.message_id && // Not the same message
              m.sender_id === msgSenderId &&
              m.message_type === msg.message_type &&
              // Match by media URL or content
              ((msg.message_type === 'image' && m.image_url && msg.image_url && m.image_url === msg.image_url) ||
               ((msg as any).message_type === 'audio' && (m as any).audio_url && (msg as any).audio_url && (m as any).audio_url === (msg as any).audio_url) ||
               ((msg as any).message_type === 'video' && (m as any).video_url && (msg as any).video_url && (m as any).video_url === (msg as any).video_url) ||
               (msg.message_type !== 'image' && (msg as any).message_type !== 'audio' && (msg as any).message_type !== 'video' && m.content === msg.content)) &&
              // Check if timestamp is very close (within 5 seconds for better reliability)
              msg.timestamp && m.timestamp && 
              Math.abs(new Date(msg.timestamp).getTime() - new Date(m.timestamp).getTime()) < 5000
            );
            
            if (recentDuplicate && msg.message_id) {
              // Replace the duplicate with the real message from WebSocket
              const updated = [...prev];
              const duplicateIndex = updated.findIndex(m => m.message_id === recentDuplicate.message_id);
              if (duplicateIndex >= 0) {
                // Preserve reply_to content from existing message if new message doesn't have it
                const preservedReplyTo = (typeof msg.reply_to === 'object' && msg.reply_to && msg.reply_to.content)
                  ? msg.reply_to
                  : recentDuplicate.reply_to;
                // Preserve is_edited flag from existing message if new message doesn't have it
                const preservedIsEdited = (msg as any).is_edited !== undefined 
                  ? (msg as any).is_edited 
                  : recentDuplicate.is_edited || false;
                updated[duplicateIndex] = { 
                  ...msg, 
                  sender_id: msgSenderId, 
                  reply_to: preservedReplyTo,
                  is_edited: preservedIsEdited
                };
                // Mark as processed to prevent duplicate notifications
                processedMessageIdsRef.current.add(msg.message_id);
                return updated;
              }
            }
          }
          
          // Don't add empty messages (but allow audio and video messages even if content is empty)
          if (!msg.content || (typeof msg.content === 'string' && msg.content.trim() === '')) {
            if (!msg.image_url && !(msg as any).audio_url && !(msg as any).video_url && (msg as any).message_type !== 'audio' && (msg as any).message_type !== 'video') {
              return prev;
            }
          }
          
          // Normalize image_url for production compatibility
          const normalizedImageUrl = normalizeImageUrl((msg as any).image_url);
          
          // Normalize reply_to field if present (handle different backend formats)
          let normalizedReplyTo: WsMessage['reply_to'];
          if (msg.reply_to) {
            if (typeof msg.reply_to === 'string') {
              // Backend sent UUID string, try to get full info from message
              normalizedReplyTo = {
                message_id: msg.reply_to,
                content: (msg as any).reply_to_content || (msg as any).quote_text || '',
                sender_name: (msg as any).reply_to_sender_name || '未知用户',
              };
            } else if (typeof msg.reply_to === 'object' && 'message_id' in msg.reply_to) {
              // Backend sent full object with correct structure
              normalizedReplyTo = {
                message_id: msg.reply_to.message_id,
                content: msg.reply_to.content || '',
                sender_name: msg.reply_to.sender_name || '未知用户',
              };
            } else {
              // Backend sent object in different format, try to extract
              const replyToAny = msg.reply_to as any;
              normalizedReplyTo = {
                message_id: replyToAny.message_id || replyToAny.id || String(replyToAny),
                content: replyToAny.content || '',
                sender_name: replyToAny.sender_name || replyToAny.sender?.username || '未知用户',
              };
            }
          } else if ((msg as any).quoted_message) {
            // Backend might use quoted_message field
            const quoted = (msg as any).quoted_message;
            normalizedReplyTo = {
              message_id: quoted.message_id || quoted.id || String(quoted),
              content: quoted.content || '',
              sender_name: quoted.sender_name || quoted.sender?.username || '未知用户',
            };
          }
          
          // Double-check we don't already have this message (race condition protection)
          // Check by message_id first
          const existingById = prev.find(m => m.message_id === msg.message_id);
          if (existingById) {
            // Message already exists - but check if we need to update is_edited flag
            const newIsEdited = (msg as any).is_edited === true || msg.type === 'message_edited';
            if (newIsEdited && !existingById.is_edited) {
              // Update is_edited flag if new message indicates it's edited
              const updated = [...prev];
              const existingIndex = updated.findIndex(m => m.message_id === msg.message_id);
              if (existingIndex >= 0) {
                updated[existingIndex] = { ...existingById, is_edited: true };
                return updated;
              }
            }
            // Message already exists and no updates needed, skip adding
            return prev;
          }
          
          // For messages from current user, also check for duplicates by content/timestamp
          // This handles cases where temp message was added but WebSocket arrives with different ID
          if (isFromCurrentUser && msg.message_id) {
            const duplicateByContent = prev.find(m => 
              m.message_id !== msg.message_id && // Not the same message
              Number(m.sender_id) === Number(currentUserId) &&
              m.message_type === msg.message_type &&
              // Match by content or media URL
              ((msg.message_type === 'image' && m.image_url && msg.image_url && m.image_url === msg.image_url) ||
               ((msg as any).message_type === 'audio' && (m as any).audio_url && (msg as any).audio_url && (m as any).audio_url === (msg as any).audio_url) ||
               ((msg as any).message_type === 'video' && (m as any).video_url && (msg as any).video_url && (m as any).video_url === (msg as any).video_url) ||
               (msg.message_type !== 'image' && (msg as any).message_type !== 'audio' && (msg as any).message_type !== 'video' && m.content === msg.content)) &&
              // Check if timestamp is very close (within 10 seconds)
              msg.timestamp && m.timestamp && 
              Math.abs(new Date(msg.timestamp).getTime() - new Date(m.timestamp).getTime()) < 10000
            );
            
            if (duplicateByContent) {
              // Replace the duplicate with the real message from WebSocket
              const updated = [...prev];
              const duplicateIndex = updated.findIndex(m => m.message_id === duplicateByContent.message_id);
              if (duplicateIndex >= 0) {
                const preservedReplyTo = (typeof msg.reply_to === 'object' && msg.reply_to && msg.reply_to.content)
                  ? msg.reply_to
                  : duplicateByContent.reply_to;
                // Preserve is_edited flag from existing message if new message doesn't have it
                const preservedIsEdited = (msg as any).is_edited !== undefined 
                  ? (msg as any).is_edited 
                  : duplicateByContent.is_edited || false;
                updated[duplicateIndex] = { 
                  ...msg, 
                  sender_id: msgSenderId, 
                  reply_to: preservedReplyTo,
                  is_edited: preservedIsEdited
                };
                processedMessageIdsRef.current.add(msg.message_id);
                
                // Reset sending flag if this was a duplicate of our own message
                if (isSendingRef.current && isFromCurrentUser) {
                  isSendingRef.current = false;
                }
                
                return updated;
              }
            }
          }
          
          // For messages from other users, check for duplicates by content/timestamp (within 2 seconds)
          // This prevents duplicate messages if WebSocket sends the same message twice
          if (!isFromCurrentUser && msg.message_id) {
            const duplicateByContent = prev.find(m => 
              m.message_id !== msg.message_id && // Not the same message
              Number(m.sender_id) === msgSenderId &&
              m.message_type === msg.message_type &&
              // Match by content or media URL
              ((msg.message_type === 'image' && m.image_url && msg.image_url && m.image_url === msg.image_url) ||
               ((msg as any).message_type === 'audio' && (m as any).audio_url && (msg as any).audio_url && (m as any).audio_url === (msg as any).audio_url) ||
               ((msg as any).message_type === 'video' && (m as any).video_url && (msg as any).video_url && (m as any).video_url === (msg as any).video_url) ||
               (msg.message_type !== 'image' && (msg as any).message_type !== 'audio' && (msg as any).message_type !== 'video' && m.content === msg.content)) &&
              // Check if timestamp is very close (within 2 seconds for other users' messages)
              msg.timestamp && m.timestamp && 
              Math.abs(new Date(msg.timestamp).getTime() - new Date(m.timestamp).getTime()) < 2000
            );
            
            if (duplicateByContent) {
              // Message is a duplicate, skip adding
              processedMessageIdsRef.current.add(msg.message_id);
              return prev;
            }
          }
          
          // Add new message and sort by timestamp
          // Ensure sender_id is a number for proper display
          // If message is recalled, override content to show recall message
          const isRecalled = msg.is_recalled || false;
          const messageContent = isRecalled ? '[消息已撤回]' : (msg.content || '');
          
          // Preserve is_edited flag - check if message is edited from backend or existing state
          const isEdited = (msg as any).is_edited === true || 
                          msg.type === 'message_edited' ||
                          (prev.find(m => m.message_id === msg.message_id)?.is_edited || false);
          
          const normalizedMsg = { 
            ...msg, 
            audio_url: (msg as any).audio_url ? normalizeMediaUrl((msg as any).audio_url) : undefined,
            audio_duration: (msg as any).audio_duration,
            video_url: (msg as any).video_url ? normalizeMediaUrl((msg as any).video_url) : undefined,
            video_duration: (msg as any).video_duration,
            video_thumbnail_url: (msg as any).video_thumbnail_url ? normalizeMediaUrl((msg as any).video_thumbnail_url) : undefined,
            sender_id: msgSenderId,
            reply_to: normalizedReplyTo || msg.reply_to,
            image_url: normalizedImageUrl,
            is_recalled: isRecalled,
            content: messageContent,
            is_edited: isEdited,
          };
          
          // Final safety check: ensure we don't add a duplicate right before adding
          const finalDuplicateCheck = prev.find(m => 
            m.message_id === normalizedMsg.message_id ||
            (m.message_id !== normalizedMsg.message_id && 
             Number(m.sender_id) === Number(normalizedMsg.sender_id) &&
             m.message_type === normalizedMsg.message_type &&
             ((normalizedMsg.message_type === 'image' && m.image_url && normalizedMsg.image_url && m.image_url === normalizedMsg.image_url) ||
              ((normalizedMsg as any).message_type === 'audio' && (m as any).audio_url && (normalizedMsg as any).audio_url && (m as any).audio_url === (normalizedMsg as any).audio_url) ||
              ((normalizedMsg as any).message_type === 'video' && (m as any).video_url && (normalizedMsg as any).video_url && (m as any).video_url === (normalizedMsg as any).video_url) ||
              (normalizedMsg.message_type !== 'image' && (normalizedMsg as any).message_type !== 'audio' && (normalizedMsg as any).message_type !== 'video' && m.content === normalizedMsg.content)) &&
             normalizedMsg.timestamp && m.timestamp && 
             Math.abs(new Date(normalizedMsg.timestamp).getTime() - new Date(m.timestamp).getTime()) < 2000)
          );
          
          if (finalDuplicateCheck) {
            // Duplicate found, skip adding
            if (msg.message_id) {
              processedMessageIdsRef.current.add(msg.message_id);
            }
            return prev;
          }
          
          const newMessages = [...prev, normalizedMsg];
          newMessages.sort((a, b) => {
            const timeA = new Date(a.timestamp || 0).getTime();
            const timeB = new Date(b.timestamp || 0).getTime();
            return timeA - timeB;
          });
          isActuallyNewMessage = true;
          
          // Reset sending flag if this is a new message from current user
          // This ensures the flag is reset even if temp message matching failed
          if (isFromCurrentUser && isSendingRef.current) {
            isSendingRef.current = false;
          }
          
          return newMessages;
        });
        
        // Only process notifications and read receipts for actually new messages
        if (isActuallyNewMessage) {
          // Mark as processed to prevent duplicate notifications
          if (msg.message_id) {
            processedMessageIdsRef.current.add(msg.message_id);
          }
        
        // When new messages arrive from friends, do NOT mark as read automatically
        // Messages are only marked as read when the user opens/views the chat
        // Only show notification and send read receipt
        if (!isFromCurrentUser && msgConvId && msg.message_id) {
          // Show notification only once for new messages from other users
          message.info(`Received message from ${msg.sender_name || target}`);
            
          // Send read receipt for messages from other users (only once)
            wsClient?.sendReadReceipt(msgConvId, msg.message_id);
          // NOTE: We do NOT call markMessagesAsRead here - messages are only marked as read
          // when the user opens the chat (in fetchMessageHistory)
          }
        }
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    });

    onWsTyping((status) => {
      const currentConvId = conversationId || validConvId;
      if (!currentConvId || !status.conversation_id || String(status.conversation_id) !== String(currentConvId) || status.user_id === currentUserId) return;
      
      // Prevent duplicate typing status notifications (same user, same status within 500ms)
      const now = Date.now();
      const lastStatus = lastReceivedTypingStatusRef.current;
      if (lastStatus && 
          lastStatus.userId === status.user_id && 
          lastStatus.isTyping === status.is_typing &&
          now - lastStatus.timestamp < 500) {
        return; // Ignore duplicate typing status
      }
      
      // Update last typing status
      lastReceivedTypingStatusRef.current = {
        userId: status.user_id || 0,
        isTyping: status.is_typing || false,
        timestamp: now
      };
      
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      
      if (status.is_typing) {
        // Show typing indicator (we'll use the nickname or target in the UI)
        setTypingStatus('typing');
        // Auto-hide typing indicator after 3 seconds if no update
        typingTimerRef.current = setTimeout(() => {
          setTypingStatus('');
        }, 3000);
      } else {
        setTypingStatus('');
      }
    });

    onWsError((errMsg) => {
      // Only show error message if we have valid chat parameters
      // Otherwise, the error is expected since we're redirecting anyway
      if (validConvId && typeof target === 'string' && isLogin && currentUserId !== 0) {
        // Show a more user-friendly error message
        const isConnectionError = errMsg.includes('无法连接到服务器') || errMsg.includes('WebSocket连接失败') || errMsg.includes('Cannot connect to server') || errMsg.includes('WebSocket connection failed');
        if (isConnectionError) {
          message.error({
            content: 'Cannot connect to chat server. Please verify:\n1. Django backend is running\n2. WebSocket route is configured\n3. Using ASGI server (Daphne/Uvicorn)',
            duration: 8,
          });
        } else {
      message.error(`Chat connection error: ${errMsg}`);
        }
        // Don't attempt automatic reconnect for connection errors - user needs to fix backend first
        if (!isConnectionError && wsClient && !wsClient.isConnected) {
          setTimeout(() => {
      if (wsClient && !wsClient.isConnected) {
              wsClient.connect();
            }
          }, 3000);
        }
      }
    });

    const scrollToBottom = () => {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    scrollToBottom();

    return () => {
      clearTimeout(loadingTimer);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      
      // CRITICAL: Clear WebSocket message handler when component unmounts or navigates away
      // This prevents messages from being processed when not on chat page
      if (wsClient) {
        wsClient.onMessage = undefined;
        if (process.env.NODE_ENV === 'development') {
          console.log('[Chat] Cleared WebSocket message handler on cleanup');
        }
      }
      handlersSetupRef.current = undefined;
      
      // Clear processed messages when conversation changes to prevent memory leaks
      processedMessageIdsRef.current.clear();
      lastReceivedTypingStatusRef.current = undefined;
      // Clear failed read status tracking when conversation changes (to allow retry in new conversation)
      failedReadStatusRef.current.clear();
      // Cleanup: Stop all playing audio when conversation changes
      audioRefs.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      audioRefs.current.clear();
      setPlayingAudioId(null);
      // Don't close WebSocket here - it's managed by useWebSocket hook
      // Handlers are cleared above to prevent processing messages when not on chat page
    };
  }, [conversationId, target, isLogin, currentUserId, wsClient, onWsMessage, onWsTyping, onWsError, onWsConnect, router, friend_id, fetchMessageHistory, markMessagesAsRead]);

  // CRITICAL: Monitor route changes and clear WebSocket handlers when navigating away from chat
  useEffect(() => {
    const handleRouteChange = (url: string) => {
      // If navigating away from chat page, clear WebSocket message handler
      if (!url.startsWith('/chat')) {
        if (wsClient) {
          wsClient.onMessage = undefined;
          if (process.env.NODE_ENV === 'development') {
            console.log('[Chat] Route changed away from chat, cleared WebSocket handler:', url);
          }
        }
        handlersSetupRef.current = undefined;
      }
    };

    // Listen for route change start
    router.events?.on('routeChangeStart', handleRouteChange);
    
    // Also check on mount/update if we're not on chat page
    if (router.pathname !== '/chat') {
      if (wsClient) {
        wsClient.onMessage = undefined;
      }
      handlersSetupRef.current = undefined;
    }

    return () => {
      router.events?.off('routeChangeStart', handleRouteChange);
    };
  }, [router, wsClient]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trimStart();
    setInputContent(value);
    
    const validConvId = conversationId || getValidConvId();
    if (!wsClient || !validConvId || !wsClient.isConnected) return;

    // Debounce typing status sends - only send after user stops typing for 300ms
    // This reduces WebSocket traffic while still providing responsive feedback
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    
    const shouldSendTyping = !!value;
    
    // Only send if the typing status has changed
    if (shouldSendTyping !== lastSentTypingStatusRef.current) {
      if (shouldSendTyping) {
        // Send typing status immediately when user starts typing
        wsClient.sendTypingStatus(validConvId, true);
        lastSentTypingStatusRef.current = true;
      }
    }
    
    // Clear typing status after user stops typing for 1 second
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    
    if (value) {
      // Reset the auto-hide timer while user is typing
      typingTimerRef.current = setTimeout(() => {
        // User stopped typing - send false status
        if (lastSentTypingStatusRef.current) {
        wsClient.sendTypingStatus(validConvId, false);
          lastSentTypingStatusRef.current = false;
        }
        setTypingStatus('');
      }, 1000);
    } else {
      // Input is empty - immediately send false status
      if (lastSentTypingStatusRef.current) {
        wsClient.sendTypingStatus(validConvId, false);
        lastSentTypingStatusRef.current = false;
      }
      setTypingStatus('');
    }
  }, [wsClient, conversationId]);

  // Note: handleSendMessage will be defined after upload functions to avoid hoisting issues
  const handleSendMessage = useCallback(async () => {
    // If there's a selected video file, upload and send it
    // Note: uploadAndSendVideo is defined later, but it's a stable useCallback
    if (selectedVideoFile) {
      await uploadAndSendVideo(selectedVideoFile, inputContent.trim() || undefined);
      return;
    }

    // If there's a selected audio file, upload and send it
    // Note: uploadAndSendAudio is defined later, but it's a stable useCallback
    if (selectedAudioFile) {
      await uploadAndSendAudio(selectedAudioFile, inputContent.trim() || undefined);
      return;
    }


    if (!wsClient) {
      console.error('[Chat] Cannot send message: WebSocket client not initialized');
      message.error('WebSocket client not initialized, please refresh the page');
      return;
    }

    if (!currentUserName) {
      console.error('[Chat] Cannot send message: User name missing');
      message.error('User information missing, please login again');
      return;
    }

    if (currentUserId === 0) {
      console.error('[Chat] Cannot send message: Invalid user ID');
      message.error('Invalid user ID, please login again');
      return;
    }

    if (!wsClient.isConnected) {
      console.error('[Chat] Cannot send message: WebSocket not connected');
      message.error('WebSocket not connected, please try again later');
      return;
    }

    // Calculate validConvId
    const currentConvId = conversationId || getValidConvId();
    const friendIdNum = friend_id && typeof friend_id === 'string' ? parseInt(friend_id, 10) : undefined;
    
    // If replying to a message, use REST API endpoint (recommended by backend)
    if (replyTarget && replyTarget.message_id && currentConvId) {
      // Set sending flag to prevent duplicates
      isSendingRef.current = true;
      
      try {
        const replyUrl = `${BACKEND_URL}/api/chat/conversations/${currentConvId}/messages/send/`;
        const replyResponse = await fetch(replyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: inputContent.trim(),
            reply_to: replyTarget.message_id, // UUID string, not object
          }),
        });

        if (!replyResponse.ok) {
          const errorData = await replyResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `HTTP ${replyResponse.status}`);
        }

        const replyData = await replyResponse.json();
        
        // Add message optimistically, but WebSocket will update/replace it when it arrives
        // The duplicate detection will prevent it from being added twice
        const replyMsg: WsMessage = {
          type: 'new_message',
          message_id: replyData.id,
          content: replyData.content,
          message_type: replyData.message_type || 'text',
          sender_id: replyData.sender,
          sender_name: replyData.sender_name,
          conversation_id: String(currentConvId),
          timestamp: replyData.created_at,
          is_recalled: false,
          reply_to: replyData.quoted_message ? {
            message_id: replyData.quoted_message.message_id,
            content: replyData.quoted_message.content,
            sender_name: replyData.quoted_message.sender_name,
          } : undefined,
        };

        // Use functional update to check for duplicates before adding
        setMessages(prev => {
          // Check if message already exists by message_id
          if (replyMsg.message_id && prev.some(m => m.message_id === replyMsg.message_id)) {
            // Already exists, don't add duplicate
            return prev;
          }
          return [...prev, replyMsg];
        });
        
        setInputContent('');
        setReplyTarget(undefined);
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        
        // Reset sending flag after a delay to allow WebSocket message to arrive
        setTimeout(() => {
          isSendingRef.current = false;
        }, 3000);

        return; // Successfully sent via REST API, exit early
      } catch (error: any) {
        console.error('[Chat] Failed to send reply via REST API:', error);
        message.error(`发送回复失败: ${error.message || 'Unknown error'}`);
        isSendingRef.current = false;
        return;
      }
    }

    // For regular messages (no reply), use WebSocket
    // If we don't have a conversationId but have friend_id, send with receiver_id
    // The backend will create the conversation and return the conversation_id
    const messageData: any = {
      type: 'chat_message',
      content: inputContent.trim(),
      message_type: 'text',
      // Backend doesn't need timestamp, sender_id, sender_name in the message
      // These are extracted from the authenticated user
    };

    // Include conversation_id if we have it, otherwise include receiver_id for new conversations
    // For new conversations, omit conversation_id entirely (don't send empty string)
    if (currentConvId) {
      messageData.conversation_id = String(currentConvId);
    } else if (friendIdNum) {
      // For new conversations, send receiver_id only (conversation_id will be created by backend)
      messageData.receiver_id = friendIdNum;
      // Do NOT include conversation_id field for new conversations
    } else {
      console.error('[Chat] Cannot send message: Missing conversation info');
      message.error('Cannot send message: Missing conversation information');
      return;
    }

    // Ensure content is not empty (backend validation)
    if (!messageData.content || messageData.content.trim() === '') {
      console.warn('[Chat] Attempted to send empty message');
      message.error('Message content cannot be empty');
      return;
    }

    // Check if already sending to prevent duplicate sends
    // Set flag BEFORE sending to prevent race conditions
    if (isSendingRef.current) {
      // Silently ignore duplicate send attempts in production
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Chat] Message send blocked: already sending');
      }
      return;
    }

    // Set sending flag IMMEDIATELY to prevent race conditions
    // This must be set before sending to prevent duplicate sends if user clicks quickly
    isSendingRef.current = true;

    // Send the message via WebSocket
    wsClient.sendMessage(messageData);

    // add message to UI (will be updated when backend confirms)
    // Ensure sender_id is a number for proper comparison
    // Only add if content is not empty
    if (inputContent.trim()) {
      // Use more unique temp message ID to prevent collisions
      // Include timestamp + random to ensure uniqueness even for rapid sends
      const tempMsgId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const tempMsg: WsMessage = {
        type: 'new_message',
        message_id: tempMsgId, // Temporary ID, will be replaced by backend
        content: inputContent.trim(),
        message_type: 'text',
        sender_id: Number(currentUserId), // Ensure it's a number
        sender_name: currentUserName,
        conversation_id: currentConvId || String(friendIdNum) || 'pending', // Use actual convId or friend_id
        timestamp: new Date().toISOString(),
        is_recalled: false,
        reply_to: replyTarget && replyTarget.message_id
          ? {
              message_id: replyTarget.message_id,
              content: replyTarget.content || '',
              sender_name: replyTarget.sender_name || '',
            }
          : undefined,
        image_url: undefined
      };
      // Mark temp message ID as processed to prevent it from triggering read status fetch
      processedMessageIdsRef.current.add(tempMsgId);
      setMessages(prev => {
        // Check if we already have this temp message (shouldn't happen, but safety check)
        const existing = prev.find(m => m.message_id === tempMsgId);
        if (existing) {
          return prev;
        }
        const newMessages = [...prev, tempMsg];
        return newMessages;
      });
    }

    setInputContent('');
    // Clear reply target after sending
    setReplyTarget(undefined);
    if (currentConvId) {
      // Send false typing status when message is sent
      if (lastSentTypingStatusRef.current) {
        wsClient.sendTypingStatus(String(currentConvId), false);
        lastSentTypingStatusRef.current = false;
      }
    }
    setTypingStatus('');

    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    
    // Reset sending flag after a delay to allow WebSocket message to arrive and replace temp message
    // Increased delay to ensure temp message replacement works reliably
    setTimeout(() => {
      isSendingRef.current = false;
    }, 3000);

  }, [inputContent, wsClient, currentUserId, currentUserName, conversationId, friend_id, replyTarget, token, getValidConvId, selectedAudioFile, selectedVideoFile]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleStartEdit = useCallback(async (messageId: string, currentContent: string) => {
    if (!token) {
      message.error('无法编辑: 未登录');
      return;
    }

    // Check if message is editable before starting edit mode
    try {
      const checkUrl = `${BACKEND_URL}/api/chat/messages/${messageId}/editable/`;
      const checkResponse = await fetch(checkUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (checkResponse.ok) {
        const checkData = await checkResponse.json();
        
        if (!checkData.is_editable) {
          // Show error message to user
          message.error(checkData.reason || '此消息无法编辑');
          return;
        }
      }
    } catch (err) {
      // If check fails, still allow editing attempt (backend will reject if invalid)
      console.warn('[Chat] Error checking editability:', err);
    }

    // Start edit mode
    setEditingMessageId(messageId);
    setEditingContent(currentContent);
    setOriginalEditContent(currentContent); // Store original content for potential revert
    // Also store in refs for error handling
    editingMessageIdRef.current = messageId;
    originalEditContentRef.current = currentContent;
  }, [token, messages]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(undefined);
    setEditingContent('');
    setOriginalEditContent('');
    // Clear refs
    editingMessageIdRef.current = undefined;
    originalEditContentRef.current = '';
  }, []);

  // Fetch reply chain for a message
  const fetchReplyChain = useCallback(async (messageId: string) => {
    if (!token || !messageId) {
      message.error('无法获取回复链: 未登录或消息ID无效');
      return;
    }

    setLoadingReplyChain(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/messages/${messageId}/reply_chain/?depth=10`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Filter out invalid messages (backend should filter, but double-check on frontend)
      if (data.reply_chain && Array.isArray(data.reply_chain)) {
        data.reply_chain = data.reply_chain.filter((reply: any) => {
          // Skip recalled messages
          if (reply.is_recalled) {
            return false;
          }
          // Skip command messages
          if (reply.message_type === 'command') {
            return false;
          }
          // Skip messages with no content and no image_url (backend should filter, but safety check)
          // Check if message has image (either image_url exists or message_type is 'image' with image_url)
          const hasImage = !!reply.image_url || reply.message_type === 'image';
          // Check if message has text content (non-empty)
          const hasContent = reply.content && reply.content.trim().length > 0;
          
          // Keep message if it has either content or image
          if (!hasContent && !hasImage) {
            console.warn('[Chat] Filtering out empty message from reply chain (no content and no image):', {
              id: reply.id || reply.message_id,
              content: reply.content,
              image_url: reply.image_url,
              message_type: reply.message_type,
              hasContent,
              hasImage
            });
            return false;
          }
          
          // Also filter out image messages without actual image_url (invalid state)
          if (reply.message_type === 'image' && !reply.image_url) {
            console.warn('[Chat] Filtering out image message without image_url:', {
              id: reply.id || reply.message_id,
              message_type: reply.message_type,
              image_url: reply.image_url
            });
            return false;
          }
          return true;
        });
        // Update total_replies to match filtered array
        data.total_replies = data.reply_chain.length;
      }
      
      // Only show modal if there are actual replies after filtering
      if (data.total_replies > 0 && data.reply_chain && data.reply_chain.length > 0) {
        setReplyChainData(data);
        setReplyChainModalVisible(true);
        setSelectedMessageForChain(messageId);
      } else {
        message.info('该消息暂无回复');
      }
    } catch (error: any) {
      console.error('[Chat] Failed to fetch reply chain:', error);
      message.error(`获取回复链失败: ${error.message || 'Unknown error'}`);
    } finally {
      setLoadingReplyChain(false);
    }
  }, [token]);

  // Fetch read status for a message
  const fetchReadStatus = useCallback(async (messageId: string, forceRefetch: boolean = false) => {
    if (!token || !messageId) {
      return;
    }

    // Skip fetching read status for temporary message IDs (optimistic updates)
    if (messageId.startsWith('temp_')) {
      return;
    }

    // Check if we're already loading (unless forcing refetch)
    if (!forceRefetch) {
      let isAlreadyLoading = false;
      setLoadingReadStatus(prev => {
        if (prev.has(messageId)) {
          isAlreadyLoading = true;
          return prev;
        }
        return prev;
      });

      if (isAlreadyLoading) {
        return;
      }

      // Check if we've already tried and failed for this message (to avoid retrying 404s)
      if (failedReadStatusRef.current.has(messageId)) {
        return;
      }
    } else {
      // Force refetch - clear from failed list and loading state
      failedReadStatusRef.current.delete(messageId);
      // Clear loading state to allow refetch
      setLoadingReadStatus(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
    }

    // Set loading state
    setLoadingReadStatus(prev => {
      const newSet = new Set(prev);
      newSet.add(messageId);
      return newSet;
    });

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/messages/${messageId}/read_status/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 403) {
          // Message not found or no permission - this is expected for some messages
          // (e.g., old messages, messages from different conversation types, or messages user doesn't have access to)
          // Track failed message IDs to avoid retrying
          failedReadStatusRef.current.add(messageId);
          // Make sure to clear loading state even on 404
          setLoadingReadStatus(prev => {
            const newSet = new Set(prev);
            newSet.delete(messageId);
            return newSet;
          });
          return;
        }
        console.error('[Chat] Read status fetch failed with unexpected error:', messageId, response.status);
        // Clear loading state on error
        setLoadingReadStatus(prev => {
          const newSet = new Set(prev);
          newSet.delete(messageId);
          return newSet;
        });
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Force React to recognize the Map update by creating a completely new Map instance
      setReadStatusMap(prev => {
        const newMap = new Map(prev);
        newMap.set(messageId, data);
        // Return new Map instance to ensure React detects the change
        return new Map(newMap);
      });
      
      // Clear loading state after successful fetch
      setLoadingReadStatus(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
      
      // Force component re-render by updating counter
      setReadStatusUpdateCounter(prev => prev + 1);
      
      // Update unread message tracking based on read_status
      // Check if current user is in the unread_users list (user hasn't read this message)
      const currentUserIsUnread = data.unread_users?.some((user: { user_id: string | number }) => {
        const userIdStr = String(user.user_id);
        const currentUserIdStr = String(currentUserId);
        return userIdStr === currentUserIdStr;
      }) || false;
      
      setUnreadMessageIds(prev => {
        const newSet = new Set(prev);
        if (currentUserIsUnread) {
          newSet.add(messageId);
        } else {
          newSet.delete(messageId);
        }
        return newSet;
      });
    } catch (error: any) {
      console.error('[Chat] Failed to fetch read status for message:', messageId, error);
      // Clear loading state on error
      setLoadingReadStatus(prev => {
        const newSet = new Set(prev);
        newSet.delete(messageId);
        return newSet;
      });
      // Don't show error to user - read status is optional
    } finally {
      // Ensure loading state is always cleared
      setLoadingReadStatus(prev => {
        if (prev.has(messageId)) {
          const newSet = new Set(prev);
          newSet.delete(messageId);
          return newSet;
        }
        return prev;
      });
    }
  }, [token, currentUserId]);
  
  // Update the ref whenever fetchReadStatus changes
  useEffect(() => {
    fetchReadStatusRef.current = fetchReadStatus;
  }, [fetchReadStatus]);

  // Check if a message is a reply (has reply_to indicator)
  const isReplyMessage = useCallback((msg: WsMessage): boolean => {
    // Check if message has reply_to field (indicating it's a reply)
    return !!(msg.reply_to && (
      typeof msg.reply_to === 'string' || 
      (typeof msg.reply_to === 'object' && msg.reply_to.message_id)
    ));
  }, []);

  // Handle message click to show reply chain (entire message including reply preview is clickable)
  const handleMessageClick = useCallback((msg: WsMessage, event: React.MouseEvent) => {
    // Don't open reply chain if clicking on buttons or images (but allow reply preview area)
    const target = event.target as HTMLElement;
    if (target.closest('button') || 
        target.closest('[role="button"]') ||
        (target.closest('img') && !target.closest('[data-reply-preview]'))) {
      return;
    }

    // Only open reply chain if message is a reply (has reply_to indicator)
    if (msg.message_id && isReplyMessage(msg)) {
      // Fetch the reply chain for the message this reply is responding to
      const replyToId = typeof msg.reply_to === 'string' 
        ? msg.reply_to 
        : (typeof msg.reply_to === 'object' && msg.reply_to.message_id 
          ? msg.reply_to.message_id 
          : undefined);
      if (replyToId) {
        fetchReplyChain(replyToId);
      }
    }
  }, [fetchReplyChain, isReplyMessage]);

  const handleRecallMessage = useCallback(async (messageId: string) => {
    if (!token || !messageId) {
      console.error('[Chat] Cannot recall: missing token or messageId', { token: !!token, messageId });
      message.error('无法撤回: 未登录或消息ID无效');
      return;
    }

    // Store original message state for potential revert and do optimistic update
    let originalMessage: WsMessage | undefined;
    setMessages(prev => {
      const msg = prev.find(m => m.message_id === messageId);
      if (msg) {
        originalMessage = { ...msg };
      }
      // Optimistic update: immediately show as recalled in UI
      return prev.map(m => 
        m.message_id === messageId
          ? { ...m, is_recalled: true, content: '[消息已撤回]' }
          : m
      );
    });

    try {
      const recallUrl = `${BACKEND_URL}/api/chat/messages/${messageId}/recall/`;
      
      const recallResponse = await fetch(recallUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!recallResponse.ok) {
        const errorData = await recallResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Chat] Recall failed:', errorData);
        
        // Revert optimistic update on error
        if (originalMessage) {
          setMessages(prev => prev.map(m => 
            m.message_id === messageId ? originalMessage! : m
          ));
        }
        
        throw new Error(errorData.error || `HTTP ${recallResponse.status}`);
      }

      const recallData = await recallResponse.json();
      
      // UI already updated optimistically, just show success message
      message.success(recallData.message || '消息已撤回');
    } catch (error: any) {
      console.error('[Chat] Failed to recall message:', error);
      message.error(`撤回失败: ${error.message || 'Unknown error'}`);
    }
  }, [token]);


  // Fetch member settings (nickname) when conversation loads
  useEffect(() => {
    const fetchNickname = async () => {
    const currentConvId = conversationId || getValidConvId();
      if (!token || !currentConvId) {
        setNickname(''); // Clear nickname if no conversation
      return;
    }

      try {
        const response = await fetch(`${BACKEND_URL}/api/chat/conversations/${currentConvId}/member_settings/`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setNickname(data.nickname || ''); // Set nickname or empty string if not set
        } else {
          setNickname(''); // Clear nickname on error
        }
      } catch (error) {
        // Log error for debugging but don't crash the UI
        // This can happen if conversation was cleared or network issues occur
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Chat] Failed to fetch nickname:', error);
        }
        setNickname(''); // Clear nickname on error
      }
    };

    fetchNickname();
  }, [token, conversationId, getValidConvId]);

  // Fetch mute status when conversation loads
  useEffect(() => {
    const fetchMuteStatus = async () => {
      const currentConvId = conversationId || getValidConvId();
      if (!token || !currentConvId) return;

      try {
        const statusUrl = `${BACKEND_URL}/api/chat/conversations/${currentConvId}/mute_status/`;
        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          setIsMuted(statusData.is_muted || false);
        }
      } catch (error) {
        // Log error for debugging but don't crash the UI
        // This can happen if conversation was cleared or network issues occur
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Chat] Failed to fetch mute status:', error);
        }
        setIsMuted(false);
      }
    };

    fetchMuteStatus();
  }, [token, conversationId, getValidConvId]);

  const handleSaveEdit = useCallback(async () => {
    if (!editingMessageId || !editingContent.trim()) {
      return;
    }

    if (!token) {
      message.error('Cannot edit message: Not authenticated');
      return;
    }

    // Store original content for potential revert
    const originalContent = originalEditContent;
    const messageIdToEdit = editingMessageId;

    // Update refs for error handling
    editingMessageIdRef.current = messageIdToEdit;
    originalEditContentRef.current = originalContent;

    // Optimistically update the message in UI
    setMessages(prev => prev.map(msg => 
      msg.message_id === messageIdToEdit
        ? { ...msg, content: editingContent.trim(), is_edited: true }
        : msg
    ));

    try {
      // Use REST API endpoint: PUT /api/chat/messages/<message_id>/edit/
      const editUrl = `${BACKEND_URL}/api/chat/messages/${messageIdToEdit}/edit/`;
      const response = await fetch(editUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: editingContent.trim(),
        }),
      });

      // Try to parse JSON response
      let res: any = {};
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          res = await response.json();
        } catch {
          const text = await response.text();
          res = { message: '服务器响应格式错误', rawResponse: text };
        }
      } else {
        // If not JSON, try to read as text
        const text = await response.text();
        res = { message: text || '编辑失败' };
      }

      if (response.ok && res.success) {
        // Edit successful - update message with the response from backend
        if (res.edited_message) {
          setMessages(prev => prev.map(msg => 
            msg.message_id === messageIdToEdit
              ? {
                  ...msg,
                  content: res.edited_message.content || editingContent.trim(),
                  is_edited: true,
                }
              : msg
          ));
        }

        // Close edit mode
    setEditingMessageId(undefined);
    setEditingContent('');
        setOriginalEditContent('');
        editingMessageIdRef.current = undefined;
        originalEditContentRef.current = '';
        message.success(res.message || '消息编辑成功');
      } else {
        // Handle different error cases
        let errorMsg = '编辑失败';
        
        // Try to get error message from different possible response formats
        if (res.message) {
          errorMsg = res.message;
        } else if (res.error) {
          errorMsg = res.error;
        } else if (res.detail) {
          errorMsg = res.detail;
        } else if (typeof res === 'string') {
          errorMsg = res;
        }
        
        // Map common error messages based on status code
        if (response.status === 404) {
          errorMsg = res.message || '消息不存在';
        } else if (response.status === 403) {
          errorMsg = res.message || '只能编辑自己发送的消息';
        } else if (response.status === 400) {
          // Backend returns specific error messages for 400
          // Common messages: "只能编辑文本消息", "消息已被撤回", "超过可编辑时间限制（2分钟）", "消息内容不能为空"
          errorMsg = res.message || res.error || res.detail || '编辑失败';
        }

        // Revert optimistic update
        setMessages(prev => prev.map(msg => 
          msg.message_id === messageIdToEdit
            ? { ...msg, content: originalContent, is_edited: false }
            : msg
        ));
        setEditingContent(originalContent);
        message.error(errorMsg);
      }
    } catch (err) {
      console.error('[Chat] Error editing message:', err);
      // Revert optimistic update
      setMessages(prev => prev.map(msg => 
        msg.message_id === messageIdToEdit
          ? { ...msg, content: originalContent, is_edited: false }
          : msg
      ));
      setEditingContent(originalContent);
      message.error('编辑失败: 网络错误，请重试');
    }
  }, [editingMessageId, editingContent, token, originalEditContent]);

  // Upload image to backend and send message
  const uploadAndSendFile = useCallback(async (file: File, isImage: boolean) => {
    if (!token) {
      message.error('Cannot upload file: Not authenticated');
      return;
    }

    const currentConvId = conversationId || getValidConvId();
    const friendIdNum = friend_id && typeof friend_id === 'string' ? parseInt(friend_id, 10) : undefined;

    // Only handle images (isImage should always be true now)
    if (isImage) {
      setUploadingFile(true);

      try {
        // Step 1: Upload image to backend
        const formData = new FormData();
        formData.append('image', file); // Backend expects 'image' field name
        
        // Track if we're including conversation_id (backend will auto-create message if provided)
        const includedConversationId = !!currentConvId;
        if (currentConvId) {
          formData.append('conversation_id', currentConvId);
        }

        const uploadResponse = await fetch(`${BACKEND_URL}/api/chat/upload/image/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            // Don't set Content-Type - browser will set it with boundary for FormData
          },
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('[Chat] Image upload failed:', errorText);
          message.error(`Failed to upload image: ${uploadResponse.status} ${uploadResponse.statusText}`);
          setUploadingFile(false);
          return;
        }

        const uploadResult = await uploadResponse.json();

        // Backend returns: { url, width, height, size }
        const imageUrl = uploadResult.url;
        const imageWidth = uploadResult.width;
        const imageHeight = uploadResult.height;
        
        // Normalize image URL for production compatibility
        const fullImageUrl = normalizeImageUrl(imageUrl) || imageUrl;

        // If conversation_id was included in upload, backend already created the message
        // Otherwise, we need to send it via the image_message endpoint or WebSocket
        if (includedConversationId) {
          // Backend already created the message (conversation_id was in form data)
          // The backend will send the message via WebSocket, so we don't add an optimistic message
          message.success('Image sent successfully');
        } else if (currentConvId) {
          // We have conversation_id but didn't include it - use image_message endpoint (supports caption)
          // The backend will create the message and send it via WebSocket, so we don't add an optimistic message
          const messageResponse = await fetch(
            `${BACKEND_URL}/api/chat/conversations/${currentConvId}/image_message/`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
              body: JSON.stringify({
                image_url: fullImageUrl,
                caption: inputContent.trim() || undefined, // Use input content as caption if available
                image_width: imageWidth,
                image_height: imageHeight,
              }),
            }
          );

          if (!messageResponse.ok) {
            const errorText = await messageResponse.text();
            console.error('[Chat] Failed to send image message:', errorText);
            message.error('Image uploaded but failed to send message');
            setUploadingFile(false);
            return;
          } else {
            await messageResponse.json();
            message.success('Image sent successfully');
          }
        } else if (friendIdNum) {
          // New conversation - upload without conversation_id, then send via WebSocket
          // The backend will send the message back via WebSocket, so we don't add an optimistic message
          const messageData: any = {
            type: 'chat_message',
            message_type: 'image',
            content: inputContent.trim() || '',
            receiver_id: friendIdNum,
            // Do not include conversation_id field for new conversations
            image_url: fullImageUrl,
          };
          
          if (wsClient && wsClient.isConnected) {
            wsClient.sendMessage(messageData);
            message.success('Image sent successfully');
          } else {
            message.error('WebSocket not connected. Please try again.');
            setUploadingFile(false);
            return;
          }
        } else {
          // No conversation info - just uploaded, but can't send message
          message.warning('Image uploaded but cannot send message: Missing conversation information');
          setUploadingFile(false);
          return;
        }

        // Clear input after sending
        setInputContent(''); // Clear input after sending

        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        console.error('[Chat] Image upload error:', err);
        message.error(`Failed to upload image: ${(err as Error).message}`);
      } finally {
        setUploadingFile(false);
      }
    }
  }, [token, wsClient, conversationId, friend_id, currentUserId, currentUserName, inputContent]);

  // Handle audio file selection
  const handleAudioFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('audio/')) {
      message.error('请选择音频文件');
      e.target.value = '';
      return;
    }

    // Validate file size (max 50MB for audio)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      message.error('音频文件大小超过50MB限制');
      e.target.value = '';
      return;
    }

    setSelectedAudioFile(file);
    e.target.value = ''; // Reset input
  }, []);

  // Handle video file selection
  const handleVideoFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      message.error('请选择视频文件');
      e.target.value = '';
      return;
    }

    // Validate file size (max 100MB for video)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      message.error('视频文件大小超过100MB限制');
      e.target.value = '';
      return;
    }

    setSelectedVideoFile(file);
    e.target.value = ''; // Reset input
  }, []);

  // Upload and send audio message using the audio_message endpoint
  const uploadAndSendAudio = useCallback(async (file: File, caption?: string) => {
    if (!token) {
      message.error('无法上传音频: 未登录');
      return;
    }

    const currentConvId = conversationId || getValidConvId();
    if (!currentConvId) {
      message.error('无法发送音频: 未选择会话');
      return;
    }

    setUploadingFile(true);

    try {
      // Step 1: Upload audio file to backend to get URL
      const formData = new FormData();
      formData.append('file', file);
      formData.append('media_type', 'audio'); // Explicitly specify audio type
      
      // Use /upload/media/ endpoint (supports both audio and video files)
      const uploadResponse = await fetch(`${BACKEND_URL}/api/chat/upload/media/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Chat] Audio upload failed:', errorData);
        message.error(errorData.error || errorData.detail || `上传音频失败: ${uploadResponse.status}`);
        setUploadingFile(false);
        return;
      }

      const uploadResult = await uploadResponse.json();
      const audioUrl = uploadResult.url || uploadResult.audio_url || uploadResult.file_url;
      
      if (!audioUrl) {
        console.error('[Chat] Audio upload response:', uploadResult);
        message.error('音频上传成功但未返回URL');
        setUploadingFile(false);
        return;
      }

      // Step 2: Get audio duration (optional but recommended)
      let audioDuration: number | undefined;
      let audioElement: HTMLAudioElement | null = null;
      try {
        // Create audio element to get duration
        audioElement = new Audio();
        audioElement.src = audioUrl.startsWith('http') ? audioUrl : `${BACKEND_URL}${audioUrl}`;
        
        await new Promise<void>((resolve, reject) => {
          if (!audioElement) {
            reject(new Error('Audio element not initialized'));
            return;
          }
          
          const element = audioElement; // Store reference for callbacks
          const timeout = setTimeout(() => {
            if (element) {
              element.src = '';
            }
            audioElement = null;
            reject(new Error('Timeout loading audio metadata'));
          }, 5000);
          
          element.onloadedmetadata = () => {
            clearTimeout(timeout);
            audioDuration = Math.round(element.duration);
            // Clean up audio element
            element.src = '';
            audioElement = null;
            resolve();
          };
          element.onerror = () => {
            clearTimeout(timeout);
            element.src = '';
            audioElement = null;
            reject(new Error('Failed to load audio metadata'));
          };
          
          element.load();
        });
      } catch {
        // Clean up on error
        if (audioElement) {
          audioElement.src = '';
          audioElement = null;
        }
        // Continue without duration - it's optional
      }

      // Step 3: Send audio message using audio_message endpoint
      const requestBody: { audio_url: string; audio_duration?: number; caption?: string } = {
        audio_url: audioUrl,
      };
      
      if (audioDuration !== undefined) {
        requestBody.audio_duration = audioDuration;
      }
      
      if (caption && caption.trim()) {
        requestBody.caption = caption.trim();
      }

      const messageResponse = await fetch(
        `${BACKEND_URL}/api/chat/conversations/${currentConvId}/audio_message/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!messageResponse.ok) {
        const errorData = await messageResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Chat] Failed to send audio message:', errorData);
        message.error(errorData.error || errorData.detail || '音频上传成功但发送消息失败');
        setUploadingFile(false);
        return;
      }

      await messageResponse.json();
      
      // The backend will send the message via WebSocket, so we don't need to add it manually
      // Clear selections
      setSelectedAudioFile(undefined);
      setInputContent('');
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error('[Chat] Audio upload/send error:', err);
      message.error(`上传音频失败: ${(err as Error).message}`);
    } finally {
      setUploadingFile(false);
    }
  }, [token, conversationId, getValidConvId]);

  // Upload and send video message using the video_message endpoint
  const uploadAndSendVideo = useCallback(async (file: File, caption?: string) => {
    if (!token) {
      message.error('无法上传视频: 未登录');
      return;
    }

    const currentConvId = conversationId || getValidConvId();
    if (!currentConvId) {
      message.error('无法发送视频: 未选择会话');
      return;
    }

    setUploadingFile(true);

    try {
      // Step 1: Upload video file to backend to get URL
      const formData = new FormData();
      formData.append('file', file);
      formData.append('media_type', 'video'); // Explicitly specify video type
      
      // Use /upload/media/ endpoint (supports both audio and video files)
      const uploadResponse = await fetch(`${BACKEND_URL}/api/chat/upload/media/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Chat] Video upload failed:', errorData);
        
        // Check if the error is about unsupported file type
        const errorMessage = errorData.error || errorData.detail || '';
        if (errorMessage.includes('不支持的文件类型') || errorMessage.includes('不支持') || errorMessage.includes('file type')) {
          message.error(`不支持的视频格式。支持格式: .mp4, .mov, .avi, .webm, .mkv, .flv, .wmv, .m4v, .3gp`);
        } else {
          message.error(errorMessage || `上传视频失败: ${uploadResponse.status}`);
        }
        setUploadingFile(false);
        return;
      }

      const uploadResult = await uploadResponse.json();
      const videoUrl = uploadResult.url || uploadResult.video_url || uploadResult.file_url;
      const thumbnailUrl = uploadResult.thumbnail_url || uploadResult.thumbnail;
      
      if (!videoUrl) {
        console.error('[Chat] Video upload response:', uploadResult);
        message.error('视频上传成功但未返回URL');
        setUploadingFile(false);
        return;
      }

      // Step 2: Get video duration (optional but recommended)
      let videoDuration: number | undefined;
      let videoElement: HTMLVideoElement | null = null;
      try {
        // Create video element to get duration
        videoElement = document.createElement('video');
        videoElement.preload = 'metadata';
        videoElement.src = videoUrl.startsWith('http') ? videoUrl : `${BACKEND_URL}${videoUrl}`;
        
        await new Promise<void>((resolve, reject) => {
          if (!videoElement) {
            reject(new Error('Video element not initialized'));
            return;
          }
          
          const element = videoElement; // Store reference for callbacks
          const timeout = setTimeout(() => {
            if (element) {
              element.src = '';
              element.remove();
            }
            videoElement = null;
            reject(new Error('Timeout loading video metadata'));
          }, 10000); // 10 second timeout for video metadata
          
          element.onloadedmetadata = () => {
            clearTimeout(timeout);
            videoDuration = Math.round(element.duration);
            // Clean up video element
            element.src = '';
            element.remove();
            videoElement = null;
            resolve();
          };
          element.onerror = () => {
            clearTimeout(timeout);
            element.src = '';
            element.remove();
            videoElement = null;
            reject(new Error('Failed to load video metadata'));
          };
          
          element.load();
        });
      } catch {
        // Clean up on error
        if (videoElement) {
          videoElement.src = '';
          videoElement.remove();
          videoElement = null;
        }
        // Continue without duration - it's optional
      }

      // Step 3: Send video message using video_message endpoint
      const requestBody: { 
        video_url: string; 
        video_duration?: number; 
        video_thumbnail_url?: string;
        caption?: string;
      } = {
        video_url: videoUrl,
      };
      
      if (videoDuration !== undefined) {
        requestBody.video_duration = videoDuration;
      }
      
      if (thumbnailUrl) {
        requestBody.video_thumbnail_url = thumbnailUrl;
      }
      
      if (caption && caption.trim()) {
        requestBody.caption = caption.trim();
      }

      const messageResponse = await fetch(
        `${BACKEND_URL}/api/chat/conversations/${currentConvId}/video_message/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!messageResponse.ok) {
        const errorData = await messageResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Chat] Failed to send video message:', errorData);
        message.error(errorData.error || errorData.detail || '视频上传成功但发送消息失败');
        setUploadingFile(false);
        return;
      }

      await messageResponse.json();
      
      // The backend will send the message via WebSocket, so we don't need to add it manually
      // Clear selections
      setSelectedVideoFile(undefined);
      setInputContent('');
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error('[Chat] Video upload/send error:', err);
      message.error(`上传视频失败: ${(err as Error).message}`);
    } finally {
      setUploadingFile(false);
    }
  }, [token, conversationId, getValidConvId]);

  // Emoji code to character mapping
  const emojiMap: Record<string, string> = {
    ':smile:': '😊',
    ':heart:': '❤️',
    ':laughing:': '😂',
    ':thumbsup:': '👍',
    ':thumbsdown:': '👎',
    ':fire:': '🔥',
    ':star:': '⭐',
    ':clap:': '👏',
    ':wave:': '👋',
    ':ok_hand:': '👌',
    ':pray:': '🙏',
    ':eyes:': '👀',
    ':thinking:': '🤔',
    ':sunglasses:': '😎',
    ':kiss:': '😘',
    ':angry:': '😠',
    ':cry:': '😢',
    ':joy:': '😂',
    ':heart_eyes:': '😍',
    ':sleeping:': '😴',
    ':worried:': '😟',
    ':blush:': '😊',
    ':relieved:': '😌',
    ':tada:': '🎉',
    ':confetti_ball:': '🎊',
    ':balloon:': '🎈',
    ':cake:': '🎂',
    ':gift:': '🎁',
    ':party:': '🎉',
    ':rocket:': '🚀',
  };

  // Convert emoji codes to characters in text
  const renderEmojiText = (text: string): string => {
    if (!text) return text;
    let result = text;
    // Replace all emoji codes with their character equivalents
    Object.entries(emojiMap).forEach(([code, emoji]) => {
      result = result.replace(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), emoji);
    });
    return result;
  };

  // Send emoji message using the emoji_message endpoint
  const _sendEmojiMessage = useCallback(async (emojiCode: string, caption?: string) => {
    if (!token) {
      message.error('无法发送表情: 未登录');
      return;
    }

    const currentConvId = conversationId || getValidConvId();
    if (!currentConvId) {
      message.error('无法发送表情: 未选择会话');
      return;
    }

    // Validate emoji_code format
    if (!emojiCode || !emojiCode.startsWith(':') || !emojiCode.endsWith(':')) {
      message.error('无效的表情代码格式');
      return;
    }

    try {
      const requestBody: { emoji_code: string; caption?: string } = {
        emoji_code: emojiCode,
      };
      
      // Only include caption if provided
      if (caption && caption.trim()) {
        requestBody.caption = caption.trim();
      }

      const response = await fetch(
        `${BACKEND_URL}/api/chat/conversations/${currentConvId}/emoji_message/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[Chat] Failed to send emoji message:', errorData);
        message.error(errorData.error || errorData.detail || '发送表情失败');
        return;
      }

      await response.json();
      
      // The backend will send the message via WebSocket, so we don't need to add it manually
      // Just clear the input and close the picker
      setInputContent('');
      setIsEmojiPickerVisible(false);
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error('[Chat] Emoji send error:', err);
      message.error(`发送表情失败: ${(err as Error).message}`);
    }
  }, [token, conversationId, getValidConvId]);

  // Handle image file selection
  const handleImageSelect = useCallback(() => {
    imageInputRef.current?.click();
  }, []);

  // Handle audio file selection
  const handleAudioSelect = useCallback(() => {
    audioInputRef.current?.click();
  }, []);

  // Handle video file selection
  const handleVideoSelect = useCallback(() => {
    videoInputRef.current?.click();
  }, []);

  // Handle emoji picker toggle
  const _handleEmojiPickerToggle = useCallback(() => {
    setIsEmojiPickerVisible(prev => !prev);
  }, []);

  // Handle image file selection
  const handleImageFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      e.target.value = '';
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      message.error('图片文件大小超过10MB限制');
      e.target.value = '';
      return;
    }

    // Upload and send image immediately
    await uploadAndSendFile(file, true);

    // Reset input to allow selecting the same file again if needed
    e.target.value = '';
  }, []);

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
          正在连接聊天服务器...
        </div>
      </div>
    );
  }

  // Allow rendering if we have friend_id (conversation will be created on first message)
  const validConvId = conversationId || getValidConvId();
  const canRenderChat = (validConvId || (friend_id && typeof friend_id === 'string')) && typeof target === 'string';
  
  if (!canRenderChat) {
    return (
      <div style={{ textAlign: 'center', marginTop: '100px', color: '#ff4444' }}>
        <p>聊天参数无效，即将跳转好友列表</p>
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
      {/* 顶部会话栏 */}
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
        {/* 修复4：删除 hoverable 属性（Ant Design Button 无此属性） */}
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
          {target.charAt(0).toUpperCase()}
        </Avatar>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h4 style={{ 
            margin: '0 0 4px 0', 
            fontSize: '16px',
            fontWeight: 500,
            color: '#333'
          }}>
              {nickname || target}
          </h4>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setNicknameInput(nickname || '');
                setIsEditingNickname(true);
              }}
              style={{
                padding: '2px 4px',
                minWidth: 'auto',
                height: 'auto',
                color: '#666',
                opacity: 0.7,
              }}
              title="编辑昵称"
            />
          </div>
        </div>

        {/* Search button */}
        <Button
          type="text"
          size="small"
          icon={<SearchOutlined />}
          onClick={() => {
            // When opening search modal, show all messages by default (newest first)
            const allMessages = messages
              .filter(msg => !msg.is_recalled)
              .sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeB - timeA; // Descending order (newest first)
              });
            setSearchResults(allMessages);
            setIsSearchModalVisible(true);
          }}
          style={{
            padding: '4px 8px',
            minWidth: 'auto',
            height: 'auto',
            color: '#666',
            opacity: 0.8,
          }}
          title="搜索消息"
        />

      </div>

      {/* 消息列表区域 */}
      <div style={{
        height: 'calc(100% - 120px)',
        overflowY: 'auto',
        padding: '16px',
        backgroundColor: '#f9f9f9',
        scrollbarWidth: 'thin',
        scrollbarColor: '#ccc #f9f9f9'
      }}>
        {(() => {

          const filteredMessages = messages.filter(msg => {
            // Only filter out explicit command messages; keep everything else
            // so we don't accidentally hide valid history due to empty content fields.
            if ((msg as any).message_type === 'command') {
              return false;
            }
            return true;
          });

          
          if (filteredMessages.length === 0 && typingStatus === '') {
            return (
          <div style={{ 
            textAlign: 'center', 
            padding: '80px 0', 
            color: '#999', 
            fontSize: '14px'
          }}>
            <p>还没有消息，开始与 {target} 聊天吧～</p>
          </div>
            );
          }
          return (
            <>
              {filteredMessages.map((msg) => {
                // Handle undefined sender_id - normalize to number for comparison
                // Backend may return sender_id as string in some endpoints, so always convert to number
                let isSelf = false;
                if (msg.sender_id !== undefined && msg.sender_id !== null) {
                  const normalizedMsgSenderId = Number(msg.sender_id);
                  const normalizedCurrentUserId = Number(currentUserId);
                  // Only compare if both are valid numbers (not NaN) and currentUserId is set
                  if (!isNaN(normalizedMsgSenderId) && !isNaN(normalizedCurrentUserId) && normalizedCurrentUserId > 0 && normalizedMsgSenderId > 0) {
                    isSelf = normalizedMsgSenderId === normalizedCurrentUserId;
                  } else {
                    // Fallback: if sender_id is invalid number, check by sender_name
                    // Only use name fallback if currentUserName is available
                    if (currentUserName && msg.sender_name) {
                      isSelf = msg.sender_name === currentUserName;
                    }
                  }
                } else {
                  // Fallback: if sender_id is undefined/null, check by sender_name
                  // Only use name fallback if currentUserName is available
                  if (currentUserName && msg.sender_name) {
                    isSelf = msg.sender_name === currentUserName;
                  }
                }
              const senderName = msg.sender_name || target;
              const isRecalled = msg.is_recalled || false;
              const messageTime = msg.timestamp 
                ? new Date(msg.timestamp).toLocaleTimeString() 
                : new Date().toLocaleTimeString();

              // Check if message is within 2-minute edit window
              const isMessageEditable = (() => {
                if (!msg.timestamp) return false;
                const msgDate = new Date(msg.timestamp);
                const now = new Date();
                const timeDiffSeconds = (now.getTime() - msgDate.getTime()) / 1000;
                return timeDiffSeconds <= 120; // 2 minutes = 120 seconds
              })();

              const messageId = msg.message_id || Date.now().toString();
              const isHighlighted = highlightedMessageId === messageId;

              return (
                <div
                  key={messageId}
                  ref={(el) => {
                    if (el && messageId) {
                      messageRefs.current.set(messageId, el);
                    }
                  }}
                  style={{ 
                    display: 'flex', 
                    marginBottom: '12px', 
                    justifyContent: isSelf ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-start',
                    animation: 'fadeIn 0.3s ease',
                    position: 'relative',
                    gap: '8px',
                    backgroundColor: isHighlighted ? '#fff3cd' : 'transparent',
                    borderRadius: isHighlighted ? '8px' : '0',
                    padding: isHighlighted ? '8px' : '0',
                    transition: 'background-color 0.3s ease',
                    scrollMarginTop: '80px'
                  }}
                  onMouseEnter={() => {
                    if (!isRecalled && editingMessageId !== msg.message_id) {
                      setHoveredMessageId(msg.message_id || undefined);
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredMessageId(undefined);
                  }}
                >
                  {/* Avatar for received messages - appears on the left */}
                  {!isSelf && (
                  <Avatar
                    style={{ 
                        marginRight: '8px', 
                        marginLeft: 0, 
                      alignSelf: 'flex-start',
                      width: '36px',
                      height: '36px',
                        fontSize: '14px',
                        flexShrink: 0
                    }}
                  >
                      {senderName.charAt(0).toUpperCase()}
                  </Avatar>
                  )}

                  <div
                    onClick={(e) => handleMessageClick(msg, e)}
                    style={{
                      maxWidth: '65%',
                      padding: '10px 14px',
                      borderRadius: isSelf 
                        ? '18px 18px 4px 18px' 
                        : '18px 18px 18px 4px',
                      backgroundColor: isSelf ? '#2196F3' : 'white',
                      color: isSelf ? 'white' : '#333',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      position: 'relative',
                      transition: 'all 0.2s ease',
                      cursor: isReplyMessage(msg) ? 'pointer' : 'default'
                    }}
                  >
                      {isRecalled ? (
                        <p style={{ margin: 0, lineHeight: '1.5', color: '#999', fontSize: '14px' }}>
                          [消息已撤回]
                        </p>
                    ) : editingMessageId === msg.message_id && isSelf ? (
                      // Edit mode
                      <div 
                        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Input
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveEdit();
                            } else if (e.key === 'Escape') {
                              handleCancelEdit();
                            }
                          }}
                          autoFocus
                          style={{
                            backgroundColor: isSelf ? 'rgba(255,255,255,0.2)' : 'white',
                            color: isSelf ? 'white' : '#333',
                            border: `1px solid ${isSelf ? 'rgba(255,255,255,0.3)' : '#ddd'}`,
                            borderRadius: '8px'
                          }}
                          maxLength={500}
                        />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <Button
                            type="text"
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={handleSaveEdit}
                            style={{
                              color: isSelf ? 'rgba(255,255,255,0.9)' : '#52c41a',
                              padding: '4px 8px'
                            }}
                          >
                            保存
                          </Button>
                          <Button
                            type="text"
                            size="small"
                            icon={<CloseOutlined />}
                            onClick={handleCancelEdit}
                            style={{
                              color: isSelf ? 'rgba(255,255,255,0.9)' : '#ff4d4f',
                              padding: '4px 8px'
                            }}
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                      ) : (
                        <>
                        {/* Reply, Edit, and Delete buttons for self messages - appears on hover, positioned outside bubble */}
                        {!isRecalled && hoveredMessageId === msg.message_id && isSelf && (
                          <>
                          <Button
                            type="text"
                            size="small"
                              onClick={() => setReplyTarget(msg)}
                            style={{
                              position: 'absolute',
                                left: '-32px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                padding: '4px',
                                minWidth: '24px',
                                height: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#666',
                              opacity: 0.7,
                              transition: 'opacity 0.2s'
                            }}
                              title="回复"
                              icon={<UndoOutlined style={{ transform: 'scaleX(-1)' }} />}
                            />
                            {/* Edit button - only for editable text messages */}
                            {msg.message_type !== 'image' && isMessageEditable && (
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => handleStartEdit(msg.message_id || '', msg.content || '')}
                                style={{
                                  position: 'absolute',
                                  left: '-56px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  padding: '4px',
                                  minWidth: '24px',
                                  height: '24px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#666',
                                  opacity: 0.7,
                                  transition: 'opacity 0.2s'
                                }}
                                title="编辑"
                              />
                            )}
                            <Button
                              type="text"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (!msg.message_id) {
                                  message.error('消息ID无效');
                                  return;
                                }
                                
                                // Use native confirm as fallback, then try Modal.confirm
                                const confirmed = window.confirm('确定要撤回这条消息吗？');
                                
                                if (confirmed) {
                                  if (msg.message_id) {
                                    handleRecallMessage(msg.message_id);
                                  } else {
                                    message.error('消息ID无效');
                                  }
                                }
                              
                              }}
                              style={{
                                position: 'absolute',
                                left: '-80px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                padding: '4px',
                                minWidth: '24px',
                                height: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ff4d4f',
                                opacity: 0.7,
                                transition: 'opacity 0.2s'
                              }}
                              title="撤回"
                              icon={<DeleteOutlined />}
                            />
                          </>
                        )}
                          {msg.reply_to && (
                            <div 
                              data-reply-preview
                              style={{ 
                              marginBottom: '6px', 
                              padding: '6px 10px', 
                              borderRadius: '8px', 
                              backgroundColor: isSelf 
                                ? 'rgba(255,255,255,0.2)' 
                                : 'rgba(0,0,0,0.05)', 
                              fontSize: '12px' 
                              }}
                            >
                              <p style={{ 
                                margin: 0, 
                                color: isSelf 
                                  ? 'rgba(255,255,255,0.9)' 
                                  : '#666' 
                              }}>
                                {(() => {
                                  // Extract username and content from reply_to
                                  let replySenderName = '';
                                  let replyContent = '';
                                  let replyMessageId = '';
                                  
                                  if (typeof msg.reply_to === 'object' && msg.reply_to) {
                                    replyMessageId = msg.reply_to.message_id || '';
                                    replySenderName = msg.reply_to.sender_name || (msg as any).reply_to_sender_name || '用户';
                                    // Try multiple sources for content
                                    replyContent = msg.reply_to.content 
                                      || (msg as any).reply_to_content 
                                      || (msg as any).quote_text 
                                      || ((msg.reply_to as any).content) 
                                      || '';
                                  } else {
                                    replySenderName = (msg as any).reply_to_sender_name || '用户';
                                    replyContent = (msg as any).reply_to_content || (msg as any).quote_text || '';
                                  }
                                  
                                  // If content is empty but we have message_id, try to find the original message
                                  if (!replyContent && replyMessageId) {
                                    const originalMessage = messages.find(m => m.message_id === replyMessageId);
                                    if (originalMessage) {
                                      // Use content from original message
                                      if (originalMessage.message_type === 'image' && originalMessage.image_url) {
                                        replyContent = '[图片]';
                                      } else {
                                        replyContent = originalMessage.content || '';
                                      }
                                      // Also update sender name if we found the message
                                      if (originalMessage.sender_name) {
                                        replySenderName = originalMessage.sender_name;
                                      }
                                    }
                                  }
                                  
                                  // If content is still empty, check if it's an image in reply_to
                                  const replyToAny = msg.reply_to as any;
                                  if (!replyContent && replyToAny?.image_url) {
                                    replyContent = '[图片]';
                                  } else if (!replyContent) {
                                    replyContent = '[消息]';
                                  }
                                  
                                  // Format: "username: content"
                                  return `${replySenderName}: ${replyContent}`;
                                })()}
                              </p>
                            </div>
                          )}

                          {msg.message_type === 'image' && msg.image_url ? (
                            <>
                            <img
                                src={normalizeImageUrl(msg.image_url) || msg.image_url || ''}
                              alt="聊天图片"
                              style={{ 
                                maxWidth: '100%', 
                                borderRadius: '8px', 
                                cursor: 'pointer',
                                display: 'block'
                              }}
                                onError={(e) => {
                                  console.error('[Chat] Failed to load image:', {
                                    originalUrl: msg.image_url,
                                    normalizedUrl: normalizeImageUrl(msg.image_url),
                                    backendUrl: BACKEND_URL
                                  });
                                  // Fallback: try to reload with original URL if normalized failed
                                  const normalized = normalizeImageUrl(msg.image_url);
                                  if (normalized && (e.target as HTMLImageElement).src !== msg.image_url) {
                                    (e.target as HTMLImageElement).src = msg.image_url || '';
                                  }
                              }}
                              onClick={() => {
                                  const url = normalizeImageUrl(msg.image_url) || msg.image_url || '';
                                  if (url) {
                                window.open(url, '_blank');
                                  }
                                }}
                              />
                              {msg.content && (
                                <div style={{ 
                                  fontSize: '14px',
                                  lineHeight: '1.5',
                                  paddingTop: '8px',
                                  paddingBottom: '8px',
                                  color: isSelf ? 'rgba(255,255,255,0.9)' : '#333',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word'
                                }}>
                                  {msg.content}
                                </div>
                              )}
                            </>
                          ) : (msg as any).file_url || (msg as any).file_name ? (
                            // File attachment (non-image)
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 12px',
                              backgroundColor: isSelf ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              maxWidth: '100%'
                            }}
                            onClick={() => {
                              const fileUrl = (msg as any).file_url || msg.image_url;
                              if (fileUrl) {
                                const url = normalizeImageUrl(fileUrl) || fileUrl;
                                window.open(url, '_blank');
                              }
                            }}
                            >
                              <PictureOutlined style={{ fontSize: '16px', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ 
                                  margin: 0, 
                                  fontSize: '14px', 
                                  fontWeight: 500,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {(msg as any).file_name || msg.content || 'File'}
                                </p>
                                {(msg as any).file_size && (
                                  <p style={{ 
                                    margin: '2px 0 0 0', 
                                    fontSize: '11px', 
                                    opacity: 0.7 
                                  }}>
                                    {((msg as any).file_size / 1024).toFixed(1)} KB
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (msg as any).message_type === 'audio' || (msg as any).audio_url ? (
                            // Audio message - display play button
                            (() => {
                              const audioUrl = (msg as any).audio_url || msg.content;
                              const normalizedAudioUrl = normalizeMediaUrl(audioUrl);
                              const isPlaying = playingAudioId === (msg.message_id || '');
                              
                              const handlePlayPause = () => {
                                const audioId = msg.message_id;
                                if (!audioId) return;
                                
                                // Stop any currently playing audio
                                if (playingAudioId && playingAudioId !== audioId) {
                                  const currentAudio = audioRefs.current.get(playingAudioId);
                                  if (currentAudio) {
                                    currentAudio.pause();
                                    currentAudio.currentTime = 0;
                                  }
                                  setPlayingAudioId(null);
                                }
                                
                                if (!normalizedAudioUrl) {
                                  message.error('音频URL无效');
                                  return;
                                }
                                
                                let audio = audioRefs.current.get(audioId);
                                
                                if (!audio) {
                                  audio = new Audio(normalizedAudioUrl);
                                  audioRefs.current.set(audioId, audio);
                                  
                                  audio.onended = () => {
                                    setPlayingAudioId(null);
                                  };
                                  
                                  audio.onerror = () => {
                                    message.error('音频播放失败');
                                    setPlayingAudioId(null);
                                  };
                                }
                                
                                if (isPlaying) {
                                  audio.pause();
                                  setPlayingAudioId(null);
                                } else {
                                  audio.play().catch(() => {
                                    message.error('无法播放音频，请检查网络连接或文件格式');
                                    setPlayingAudioId(null);
                                    // Clean up failed audio element
                                    audioRefs.current.delete(audioId);
                                  });
                                  setPlayingAudioId(audioId);
                                }
                              };
                              
                              return (
                                <div style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '12px',
                                  padding: '8px 12px',
                                  backgroundColor: isSelf ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
                                  borderRadius: '8px',
                                  minWidth: '120px'
                                }}>
                                  <Button
                                    type="text"
                                    icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                    onClick={handlePlayPause}
                                    style={{
                                      fontSize: '24px',
                                      color: isSelf ? '#fff' : '#2196F3',
                                      padding: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      minWidth: '32px',
                                      height: '32px'
                                    }}
                                  />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ 
                                      fontSize: '14px', 
                                      fontWeight: 500,
                                      color: isSelf ? 'rgba(255,255,255,0.9)' : '#333',
                                      marginBottom: '2px'
                                    }}>
                                      音频消息
                                    </div>
                                    {(msg as any).audio_duration && (
                                      <div style={{ 
                                        fontSize: '11px', 
                                        opacity: 0.7,
                                        color: isSelf ? 'rgba(255,255,255,0.7)' : '#666'
                                      }}>
                                        {Math.floor((msg as any).audio_duration / 60)}:{(String(Math.floor((msg as any).audio_duration % 60)).padStart(2, '0'))}
                                      </div>
                                    )}
                                    {msg.content && (
                                      <div style={{ 
                                        fontSize: '14px',
                                        lineHeight: '1.5',
                                        paddingTop: '8px',
                                        paddingBottom: '8px',
                                        color: isSelf ? 'rgba(255,255,255,0.9)' : '#333',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                      }}>
                                        {msg.content}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()
                          ) : (msg as any).message_type === 'video' || (msg as any).video_url ? (
                            // Video message - display video player
                            (() => {
                              const videoUrl = (msg as any).video_url;
                              const thumbnailUrl = (msg as any).video_thumbnail_url;
                              const normalizedVideoUrl = normalizeMediaUrl(videoUrl);
                              const normalizedThumbnailUrl = thumbnailUrl ? normalizeMediaUrl(thumbnailUrl) : undefined;
                              
                              if (!normalizedVideoUrl) {
                                return (
                                  <div style={{ 
                                    padding: '8px 12px',
                                    backgroundColor: isSelf ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.05)',
                                    borderRadius: '8px',
                                    color: isSelf ? 'rgba(255,255,255,0.7)' : '#666',
                                    fontSize: '14px'
                                  }}>
                                    视频URL无效
                                  </div>
                                );
                              }
                              
                              return (
                                <div style={{ 
                                  maxWidth: '100%',
                                  borderRadius: '8px',
                                  overflow: 'hidden'
                                }}>
                                  <video
                                    controls
                                    style={{
                                      width: '100%',
                                      maxWidth: '400px',
                                      height: 'auto',
                                      display: 'block',
                                      borderRadius: '8px'
                                    }}
                                    poster={normalizedThumbnailUrl}
                                    src={normalizedVideoUrl}
                                  >
                                    您的浏览器不支持视频播放
                                  </video>
                                  {(msg as any).video_duration && (
                                    <div style={{ 
                                      fontSize: '11px', 
                                      opacity: 0.7,
                                      marginTop: '4px',
                                      color: isSelf ? 'rgba(255,255,255,0.7)' : '#666'
                                    }}>
                                      时长: {Math.floor((msg as any).video_duration / 60)}:{(String(Math.floor((msg as any).video_duration % 60)).padStart(2, '0'))}
                                    </div>
                                  )}
                                  {msg.content && (
                                    <div style={{ 
                                      fontSize: '14px',
                                      lineHeight: '1.5',
                                      paddingTop: '8px',
                                      paddingBottom: '8px',
                                      color: isSelf ? 'rgba(255,255,255,0.9)' : '#333',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word'
                                    }}>
                                      {msg.content}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : (msg as any).message_type === 'emoji' ? (
                            // Emoji message - display emoji prominently
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              fontSize: '24px',
                              lineHeight: '1.2'
                            }}>
                              {(msg as any).emoji_code ? (
                                emojiMap[(msg as any).emoji_code] || (msg as any).emoji_code || '😊'
                              ) : msg.content ? (
                                renderEmojiText(msg.content)
                              ) : '😊'}
                              {msg.content && (msg as any).emoji_code && (
                                <span style={{ 
                                  fontSize: '14px', 
                                  opacity: 0.8,
                                  lineHeight: '1.5'
                                }}>
                                  {msg.content}
                                </span>
                              )}
                            </div>
                          ) : (
                          <p style={{ 
                            margin: 0, 
                            lineHeight: '1.5', 
                            fontSize: '14px', 
                            paddingBottom: '2px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>
                              {renderEmojiText(msg.content || '')}
                            {(msg as any).is_edited && (
                              <span style={{ 
                                fontSize: '11px', 
                                opacity: 0.7, 
                                marginLeft: '6px',
                                fontStyle: 'italic'
                              }}>
                                (已编辑)
                              </span>
                            )}
                            </p>
                          )}

                          <div style={{ 
                          margin: '2px 0 0 0', 
                            fontSize: '10px', 
                            textAlign: 'right', 
                            opacity: 0.7,
                          color: isSelf ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)',
                            lineHeight: '1.2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '4px'
                          }}>
                            <span>{messageTime}</span>
                            {/* Read indicator - only show for messages sent by current user */}
                            {isSelf && msg.message_id && (() => {
                              // Reference readStatusUpdateCounter to force re-render when status updates
                              const _updateCounter = readStatusUpdateCounter;
                              const readStatus = readStatusMap.get(msg.message_id);
                              const isLoading = loadingReadStatus.has(msg.message_id);
                              
                              // Fetch read status immediately if not already loaded or loading
                              if (!readStatus && !isLoading && fetchReadStatusRef.current) {
                                // Use a small delay to avoid fetching during render
                                setTimeout(() => {
                                  fetchReadStatusRef.current?.(msg.message_id!);
                                }, 0);
                              }

                              // Determine status: "读" if all recipients have read, "发送" otherwise
                              // Always show something - default to "发送" if no status yet
                              let displayText = '发送';
                              const textColor = 'rgba(255,255,255,0.5)';
                              
                              if (readStatus) {
                                const { read_count, total_recipients } = readStatus;
                                
                                // Only show "读" when ALL recipients have read the message
                                // total_recipients excludes the sender, so this correctly shows when the recipient(s) have read it
                                if (total_recipients > 0 && read_count === total_recipients) {
                                  displayText = '读';
                                }
                                // Otherwise, show "发送" (sent) - meaning not all recipients have read it yet
                              }

                              return (
                                <span
                                  key={`read-indicator-${msg.message_id}-${_updateCounter}`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    fontSize: '10px',
                                    marginLeft: '4px',
                                    color: textColor
                                  }}
                                >
                                  {displayText}
                                </span>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                    {/* Reply button for received messages - appears on hover, positioned to the right */}
                    {!isRecalled && hoveredMessageId === msg.message_id && !isSelf && (
                      <Button
                        type="text"
                        size="small"
                        onClick={() => setReplyTarget(msg)}
                        style={{
                          padding: '4px',
                          minWidth: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#666',
                          opacity: 0.7,
                          transition: 'opacity 0.2s',
                          alignSelf: 'center',
                          marginLeft: '8px'
                        }}
                        title="回复"
                        icon={<UndoOutlined />}
                      />
                    )}
                    {/* Avatar for sent messages - appears on the right */}
                    {isSelf && (
                      <Avatar
                        style={{ 
                          marginLeft: '8px', 
                          marginRight: 0, 
                          alignSelf: 'flex-start',
                          width: '36px',
                          height: '36px',
                          fontSize: '14px',
                          flexShrink: 0
                        }}
                      >
                        我
                      </Avatar>
                    )}
                  </div>
                );
              })
            }

            {typingStatus && (
              <div style={{ 
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                gap: '8px',
                marginBottom: '12px',
                animation: 'fadeIn 0.3s ease'
              }}>
                <Avatar style={{ 
                  backgroundColor: '#2196F3',
                  width: '36px',
                  height: '36px',
                  fontSize: '14px',
                  flexShrink: 0,
                  alignSelf: 'flex-start'
                }}>
                  {(nickname || target).charAt(0).toUpperCase()}
                </Avatar>
                <div style={{
                  backgroundColor: 'white',
                  padding: '10px 14px',
                  borderRadius: '18px 18px 18px 4px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  maxWidth: '65%'
                }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#999',
                      animation: 'typingDot 1.4s infinite',
                      animationDelay: '0s'
                    }} />
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#999',
                      animation: 'typingDot 1.4s infinite',
                      animationDelay: '0.2s'
                    }} />
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#999',
                      animation: 'typingDot 1.4s infinite',
                      animationDelay: '0.4s'
                    }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messageEndRef as React.RefObject<HTMLDivElement>} />
          </>
          );
        })()}
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
        {/* Hidden file inputs */}
        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleImageFileChange(e)}
        />
        <input
          type="file"
          ref={audioInputRef}
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={(e) => handleAudioFileChange(e)}
        />
        <input
          type="file"
          ref={videoInputRef}
          accept="video/*"
          style={{ display: 'none' }}
          onChange={(e) => handleVideoFileChange(e)}
        />

        {/* Image upload button */}
        <Button 
          icon={<PictureOutlined />} 
          size="middle" 
          style={{ 
            padding: '8px', 
            borderRadius: '50%', 
            width: '40px', 
            height: '40px',
            color: '#666'
          }}
          onClick={handleImageSelect}
          type="text"
          disabled={uploadingFile}
          title="Upload image"
        />

        {/* Video upload button */}
        <Button
          icon={<VideoCameraOutlined />}
          size="middle"
          style={{ 
            padding: '8px', 
            borderRadius: '50%', 
            width: '40px', 
            height: '40px',
            color: '#666'
          }}
          onClick={handleVideoSelect}
          type="text"
          disabled={uploadingFile}
          title="Upload video"
        />

        {/* Audio upload button */}
        <Button
          icon={<SoundOutlined />}
          size="middle"
          style={{ 
            padding: '8px', 
            borderRadius: '50%', 
            width: '40px', 
            height: '40px',
            color: '#666'
          }}
          onClick={handleAudioSelect}
          type="text"
          disabled={uploadingFile}
          title="Upload audio"
        />

        {/* Emoji button */}
        <Popover
          content={
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(6, 1fr)', 
              gap: '6px',
              maxHeight: '240px',
              overflowY: 'auto',
              padding: '12px',
              width: '260px',
              backgroundColor: '#fff'
            }}>
              {[
                { code: ':smile:', emoji: '😊', label: '微笑' },
                { code: ':heart:', emoji: '❤️', label: '心' },
                { code: ':laughing:', emoji: '😂', label: '大笑' },
                { code: ':thumbsup:', emoji: '👍', label: '赞' },
                { code: ':thumbsdown:', emoji: '👎', label: '踩' },
                { code: ':fire:', emoji: '🔥', label: '火' },
                { code: ':star:', emoji: '⭐', label: '星' },
                { code: ':clap:', emoji: '👏', label: '鼓掌' },
                { code: ':wave:', emoji: '👋', label: '挥手' },
                { code: ':ok_hand:', emoji: '👌', label: 'OK' },
                { code: ':pray:', emoji: '🙏', label: '祈祷' },
                { code: ':eyes:', emoji: '👀', label: '眼睛' },
                { code: ':thinking:', emoji: '🤔', label: '思考' },
                { code: ':sunglasses:', emoji: '😎', label: '墨镜' },
                { code: ':kiss:', emoji: '😘', label: '飞吻' },
                { code: ':angry:', emoji: '😠', label: '生气' },
                { code: ':cry:', emoji: '😢', label: '哭' },
                { code: ':joy:', emoji: '😂', label: '开心' },
                { code: ':heart_eyes:', emoji: '😍', label: '花痴' },
                { code: ':sleeping:', emoji: '😴', label: '睡觉' },
                { code: ':worried:', emoji: '😟', label: '担心' },
                { code: ':blush:', emoji: '😊', label: '害羞' },
                { code: ':relieved:', emoji: '😌', label: '安心' },
                { code: ':tada:', emoji: '🎉', label: '庆祝' },
                { code: ':confetti_ball:', emoji: '🎊', label: '彩纸' },
                { code: ':balloon:', emoji: '🎈', label: '气球' },
                { code: ':cake:', emoji: '🎂', label: '蛋糕' },
                { code: ':gift:', emoji: '🎁', label: '礼物' },
                { code: ':party:', emoji: '🎉', label: '派对' },
                { code: ':rocket:', emoji: '🚀', label: '火箭' },
              ].map((item) => (
                <Tooltip title={item.label} key={item.code}>
                  <Button
                    type="text"
                    style={{ 
                      fontSize: '24px', 
                      width: '36px', 
                      height: '36px',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0f0f0';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onClick={() => {
                      // Insert actual emoji character into input instead of sending
                      setInputContent(prev => prev + item.emoji);
                      setIsEmojiPickerVisible(false);
                    }}
                  >
                    {item.emoji}
                  </Button>
                </Tooltip>
              ))}
            </div>
          }
          title={null}
          trigger="click"
          open={isEmojiPickerVisible}
          onOpenChange={setIsEmojiPickerVisible}
          placement="top"
          overlayStyle={{ padding: 0 }}
        >
          <Button 
            icon={<SmileOutlined />} 
            size="middle" 
            style={{ 
              padding: '8px', 
              borderRadius: '50%', 
              width: '40px', 
              height: '40px',
              color: '#666'
            }}
            type="text"
            disabled={uploadingFile}
            title="选择表情"
          />
        </Popover>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* Reply preview */}
          {replyTarget && (
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#f0f7ff',
              border: '1px solid #2196F3',
              borderRadius: '8px',
              marginBottom: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  color: '#2196F3', 
                  fontWeight: 500, 
                  marginBottom: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <UndoOutlined style={{ fontSize: '14px', marginRight: '4px', color: '#2196F3' }} />
                  {replyTarget.sender_name || '用户'}: {replyTarget.content || (replyTarget.image_url ? '[图片]' : '[消息]')}
                </div>
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setReplyTarget(undefined)}
                style={{
                  padding: '2px',
                  minWidth: 'auto',
                  color: '#666',
                  marginLeft: '8px'
                }}
              />
            </div>
          )}
          {selectedAudioFile && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              padding: '4px 8px',
              backgroundColor: '#f0f0f0',
                  borderRadius: '8px',
              fontSize: '12px'
            }}>
              <SoundOutlined />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedAudioFile.name}
              </span>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => {
                  setSelectedAudioFile(undefined);
                }}
                style={{ padding: '0', minWidth: 'auto' }}
              />
            </div>
          )}
          {selectedVideoFile && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              padding: '4px 8px',
              backgroundColor: '#f0f0f0',
              borderRadius: '8px',
              fontSize: '12px'
            }}>
              <VideoCameraOutlined />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedVideoFile.name}
              </span>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => {
                  setSelectedVideoFile(undefined);
                }}
                style={{ padding: '0', minWidth: 'auto' }}
              />
            </div>
          )}
        <Input
          value={inputContent}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="输入消息..."
          style={{ 
            borderRadius: '20px', 
            padding: '8px 16px', 
            height: '40px',
            borderColor: '#ddd',
            fontSize: '14px'
          }}
          bordered
          maxLength={500}
        />
        </div>

        {/* 修复6：删除 hoverable 属性 */}
        <Button
          icon={<SendOutlined />}
          type="primary"
          size="middle"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSendMessage();
          }}
          disabled={(!inputContent.trim() && !selectedAudioFile && !selectedVideoFile) || !wsClient || !wsClient.isConnected || uploadingFile}
          style={{ 
            borderRadius: '50%', 
            width: '40px', 
            height: '40px', 
            padding: 0,
            backgroundColor: '#2196F3',
            borderColor: '#2196F3',
            cursor: ((!inputContent.trim() && !selectedAudioFile && !selectedVideoFile) || !wsClient || !wsClient.isConnected || uploadingFile) ? 'not-allowed' : 'pointer'
          }}
        />
      </div>

      {/* Nickname Edit Modal */}
      <Modal
        title="编辑昵称"
        open={isEditingNickname}
        onOk={() => {
          if (nicknameInput.trim()) {
            updateNickname(nicknameInput.trim());
          } else {
            // If empty, clear the nickname
            updateNickname('');
          }
        }}
        onCancel={() => {
          setIsEditingNickname(false);
          setNicknameInput('');
        }}
        okText="保存"
        cancelText="取消"
      >
        <Input
          placeholder="输入昵称（留空以清除昵称）"
          value={nicknameInput}
          onChange={(e) => setNicknameInput(e.target.value)}
          onPressEnter={() => {
            if (nicknameInput.trim()) {
              updateNickname(nicknameInput.trim());
            } else {
              updateNickname('');
            }
          }}
          maxLength={50}
        />
      </Modal>

      {/* Search Modal */}
      <Modal
        title="搜索消息"
        open={isSearchModalVisible}
        onCancel={() => {
          setIsSearchModalVisible(false);
          setSearchQuery('');
          setSearchMessageType('all');
          setSearchDateRange(undefined);
          setSearchResults([]);
        }}
        footer={undefined}
        width={600}
      >
        <div style={{ marginBottom: '16px' }}>
          <Input
            placeholder="输入关键词搜索消息内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            prefix={<SearchOutlined />}
            allowClear
            style={{ marginBottom: '16px' }}
          />
          
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <Select
              value={searchMessageType}
              onChange={setSearchMessageType}
              style={{ minWidth: '120px' }}
            >
              <Select.Option value="all">所有类型</Select.Option>
              <Select.Option value="text">文本消息</Select.Option>
              <Select.Option value="image">图片消息</Select.Option>
            </Select>
            
            <DatePicker.RangePicker
              value={searchDateRange}
              onChange={(dates) => {
                if (dates === null) {
                  setSearchDateRange(undefined);
                } else {
                  setSearchDateRange([dates[0] ?? undefined, dates[1] ?? undefined]);
                }
              }}
              format="YYYY-MM-DD"
              placeholder={['开始日期', '结束日期']}
              style={{ flex: 1, minWidth: '200px' }}
            />
          </div>

          <Button
            type="primary"
            onClick={() => {
              // Perform search
              const filtered = messages.filter((msg) => {
                // Filter by message type
                if (searchMessageType !== 'all') {
                  const msgType = (msg as any).message_type || msg.message_type || 'text';
                  if (searchMessageType === 'text' && msgType !== 'text') return false;
                  if (searchMessageType === 'image' && msgType !== 'image') return false;
                }

                // Filter by date range
                if (searchDateRange && searchDateRange[0] && searchDateRange[1]) {
                  if (!msg.timestamp) return false;
                  const msgDate = dayjs(msg.timestamp);
                  const startDate = searchDateRange[0].startOf('day');
                  const endDate = searchDateRange[1].endOf('day');
                  if (msgDate.isBefore(startDate) || msgDate.isAfter(endDate)) {
                    return false;
                  }
                }

                // Filter by search query (text content)
                if (searchQuery.trim()) {
                  const query = searchQuery.toLowerCase();
                  const content = (msg.content || '').toLowerCase();
                  if (!content.includes(query)) {
                    return false;
                  }
                }

                // Exclude recalled messages
                if (msg.is_recalled) return false;

                return true;
              });

              // Sort filtered results by timestamp (newest first)
              const sortedFiltered = filtered.sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeB - timeA; // Descending order (newest first)
              });
              
              setSearchResults(sortedFiltered);
            }}
            style={{ width: '100%', marginBottom: '16px' }}
          >
            搜索
          </Button>
        </div>

        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {searchResults.length > 0 ? (
            <>
              <div style={{ marginBottom: '12px', color: '#666', fontSize: '12px' }}>
                找到 {searchResults.length} 条消息
              </div>
              <List
                dataSource={searchResults}
                renderItem={(msg: WsMessage) => {
                // Normalize comparison - ensure both are numbers (backend may return string sender_id)
                const normalizedSenderId = msg.sender_id !== undefined ? Number(msg.sender_id) : undefined;
                const isSelf = normalizedSenderId !== undefined && Number(currentUserId) === normalizedSenderId;
                const senderName = msg.sender_name || target;
                const messageTime = msg.timestamp 
                  ? dayjs(msg.timestamp).format('YYYY-MM-DD HH:mm:ss')
                  : '未知时间';
                const isImage = (msg as any).message_type === 'image' || msg.image_url;

                const handleJumpToMessage = () => {
                  const messageId = msg.message_id;
                  if (!messageId) return;
                  
                  // Close the search modal
                  setIsSearchModalVisible(false);
                  
                  // Set highlighted message ID
                  setHighlightedMessageId(messageId);
                  
                  // Scroll to the message after a short delay to ensure DOM is ready
                  setTimeout(() => {
                    const messageElement = messageRefs.current.get(messageId);
                    if (messageElement) {
                      messageElement.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center' 
                      });
                    }
                  }, 100);
                  
                  // Remove highlight after 3 seconds
                  setTimeout(() => {
                    setHighlightedMessageId(undefined);
                  }, 3000);
                };

                return (
                  <List.Item
                    onClick={handleJumpToMessage}
                    style={{
                      padding: '12px',
                      borderBottom: '1px solid #f0f0f0',
                      backgroundColor: isSelf ? '#e3f2fd' : '#fafafa',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease',
                    }}
                    onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                      e.currentTarget.style.backgroundColor = isSelf ? '#bbdefb' : '#f0f0f0';
                    }}
                    onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
                      e.currentTarget.style.backgroundColor = isSelf ? '#e3f2fd' : '#fafafa';
                    }}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <Typography.Text strong>{isSelf ? '我' : senderName}</Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                          {messageTime}
                        </Typography.Text>
                      </div>
                      {isImage ? (
                        <div>
                          <PictureOutlined style={{ marginRight: '4px' }} />
                          <Typography.Text type="secondary">图片消息</Typography.Text>
                          {msg.content && (
                            <Typography.Text style={{ marginLeft: '8px' }}>
                              {msg.content}
                            </Typography.Text>
                          )}
                        </div>
                      ) : (
                        <Typography.Text>{msg.content || '(空消息)'}</Typography.Text>
                      )}
                    </div>
                  </List.Item>
                );
              }}
            />
            </>
          ) : searchQuery || searchMessageType !== 'all' || searchDateRange ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              没有找到匹配的消息
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              加载中...
            </div>
          )}
        </div>
      </Modal>

      {/* 全局样式 */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingDot {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.7;
          }
          30% {
            transform: translateY(-8px);
            opacity: 1;
          }
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f9f9f9; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #bbb; }
      `}</style>

      {/* Reply Chain Modal */}
      <Modal
        title={`回复链 (共 ${replyChainData?.total_replies || 0} 条回复)`}
        open={replyChainModalVisible}
        onCancel={() => {
          setReplyChainModalVisible(false);
          setReplyChainData(null);
          setSelectedMessageForChain(undefined);
        }}
        footer={[
          <Button key="close" onClick={() => {
            setReplyChainModalVisible(false);
            setReplyChainData(null);
            setSelectedMessageForChain(undefined);
          }}>
            关闭
          </Button>
        ]}
        width={600}
      >
        <Spin spinning={loadingReplyChain}>
          {replyChainData && (
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Root Message */}
              <div 
                onClick={() => {
                  const rootMessageId = replyChainData.root_message.id || replyChainData.root_message.message_id;
                  if (!rootMessageId) return;
                  
                  // Close the reply chain modal
                  setReplyChainModalVisible(false);
                  
                  // Set highlighted message ID
                  setHighlightedMessageId(rootMessageId);
                  
                  // Scroll to the message after a short delay to ensure DOM is ready
                  setTimeout(() => {
                    const messageElement = messageRefs.current.get(rootMessageId);
                    if (messageElement) {
                      messageElement.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center' 
                      });
                    }
                  }, 100);
                  
                  // Remove highlight after 3 seconds
                  setTimeout(() => {
                    setHighlightedMessageId(undefined);
                  }, 3000);
                }}
                style={{
                  padding: '16px',
                  marginBottom: '16px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '8px',
                  border: '2px solid #2196F3',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#e3f2fd';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <Avatar style={{ marginRight: '8px', backgroundColor: '#2196F3' }}>
                    {(replyChainData.root_message.sender_name || '用户').charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography.Text strong>{replyChainData.root_message.sender_name || '未知用户'}</Typography.Text>
                  <Typography.Text style={{ marginLeft: 'auto', color: '#999', fontSize: '12px' }}>
                    {replyChainData.root_message.created_at 
                      ? new Date(replyChainData.root_message.created_at).toLocaleString('zh-CN')
                      : ''}
                  </Typography.Text>
                </div>
                <div style={{ marginLeft: '44px' }}>
                  {replyChainData.root_message.is_recalled ? (
                    <Typography.Paragraph style={{ margin: 0 }}>[消息已撤回]</Typography.Paragraph>
                  ) : replyChainData.root_message.message_type === 'image' && replyChainData.root_message.image_url ? (
                    <img
                      src={normalizeImageUrl(replyChainData.root_message.image_url) || replyChainData.root_message.image_url}
                      alt="回复图片"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '200px',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                      onClick={() => {
                        const url = normalizeImageUrl(replyChainData.root_message.image_url) || replyChainData.root_message.image_url;
                        if (url) window.open(url, '_blank');
                      }}
                    />
                  ) : (
                    <Typography.Paragraph style={{ margin: 0 }}>
                      {replyChainData.root_message.content || ''}
                    </Typography.Paragraph>
                  )}
                </div>
              </div>

              {/* Reply Chain */}
              {replyChainData.reply_chain && replyChainData.reply_chain.length > 0 ? (
                <div>
                  <Typography.Title level={5} style={{ marginBottom: '12px' }}>
                    回复 ({replyChainData.reply_chain.length}):
                  </Typography.Title>
                  <List
                    dataSource={replyChainData.reply_chain}
                    renderItem={(reply: any, index: number) => {
                      const isReplySelf = reply.sender_id && Number(reply.sender_id) === Number(currentUserId);
                      const replyMessageId = reply.id || reply.message_id;
                      return (
                        <List.Item
                          key={replyMessageId || index}
                          onClick={() => {
                            if (!replyMessageId) return;
                            
                            // Close the reply chain modal
                            setReplyChainModalVisible(false);
                            
                            // Set highlighted message ID
                            setHighlightedMessageId(replyMessageId);
                            
                            // Scroll to the message after a short delay to ensure DOM is ready
                            setTimeout(() => {
                              const messageElement = messageRefs.current.get(replyMessageId);
                              if (messageElement) {
                                messageElement.scrollIntoView({ 
                                  behavior: 'smooth', 
                                  block: 'center' 
                                });
                              }
                            }, 100);
                            
                            // Remove highlight after 3 seconds
                            setTimeout(() => {
                              setHighlightedMessageId(undefined);
                            }, 3000);
                          }}
                          style={{
                            padding: '12px',
                            marginBottom: '8px',
                            backgroundColor: isReplySelf ? '#e3f2fd' : '#ffffff',
                            borderRadius: '8px',
                            border: '1px solid #e0e0e0',
                            cursor: 'pointer',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                            e.currentTarget.style.backgroundColor = isReplySelf ? '#bbdefb' : '#f0f0f0';
                          }}
                          onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
                            e.currentTarget.style.backgroundColor = isReplySelf ? '#e3f2fd' : '#ffffff';
                          }}
                        >
                          <div style={{ width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                              <Avatar style={{ marginRight: '8px', backgroundColor: isReplySelf ? '#2196F3' : '#ff9800' }}>
                                {(reply.sender_name || '用户').charAt(0).toUpperCase()}
                              </Avatar>
                              <Typography.Text strong>{reply.sender_name || '未知用户'}</Typography.Text>
                              {reply.depth && (
                                <Typography.Text style={{ marginLeft: '8px', color: '#999', fontSize: '11px' }}>
                                  (回复层级: {reply.depth})
                                </Typography.Text>
                              )}
                              <Typography.Text style={{ marginLeft: 'auto', color: '#999', fontSize: '12px' }}>
                                {reply.created_at 
                                  ? new Date(reply.created_at).toLocaleString('zh-CN')
                                  : ''}
                              </Typography.Text>
                            </div>
                            <div style={{ marginLeft: '44px' }}>
                              {reply.is_recalled ? (
                                <Typography.Paragraph style={{ margin: 0, color: '#333' }}>[消息已撤回]</Typography.Paragraph>
                              ) : reply.message_type === 'image' && reply.image_url ? (
                                <img
                                  src={normalizeImageUrl(reply.image_url) || reply.image_url}
                                  alt="回复图片"
                                  style={{
                                    maxWidth: '100%',
                                    maxHeight: '200px',
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => {
                                    const url = normalizeImageUrl(reply.image_url) || reply.image_url;
                                    if (url) window.open(url, '_blank');
                                  }}
                                />
                              ) : (
                                <Typography.Paragraph style={{ margin: 0, color: '#333' }}>
                                  {reply.content || ''}
                                </Typography.Paragraph>
                              )}
                            </div>
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px', color: '#999' }}>
                  暂无回复
                </div>
              )}
            </div>
          )}
        </Spin>
      </Modal>

    </div>
  );
};

export default ChatScreen;