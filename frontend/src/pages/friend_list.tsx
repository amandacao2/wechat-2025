import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { BACKEND_URL, FAILURE_PREFIX } from "../constants/string";
import { RootState } from "../redux/store";
import { PushpinOutlined, PushpinFilled, BellOutlined, BellFilled } from "@ant-design/icons";
import { message, Tag } from "antd";

const FriendListScreen = () => {
  const router = useRouter();
  const token = useSelector((state: RootState) => state.auth.token);

  // Friend type with pin information
  interface Friend {
    id: number;
    avatar: string;
    userName: string;
    email: string;
    note: string;
    note_new: string;
    conversationId?: number;
    isPinned?: boolean;
    pinOrder?: number;
    pinnedAt?: string;
    unreadCount?: number; 
  }

  const [friends, setFriends] = useState<Friend[]>([]);
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [mutedConversations, setMutedConversations] = useState<Set<string>>(new Set()); // Track muted conversation IDs
  const [nicknames, setNicknames] = useState<Map<number, string>>(new Map()); // Map conversationId to nickname

  // Fetch unread message counts
  // Use string keys to handle both numeric IDs and UUID strings
  const fetchUnreadStats = async (): Promise<Map<string, number>> => {
    const unreadMap = new Map<string, number>();
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/unread_stats/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const res = await response.json();
        
        if (res.conversations && Array.isArray(res.conversations)) {
          res.conversations.forEach((conv: any) => {
            // Handle both 'conversation_id' and 'conversationId' field names
            // Backend may return UUID string or number, so we need to handle both
            const rawConvId = conv.conversation_id || conv.conversationId;
            let unreadCountValue = Number(conv.unread_count || 0);
            
            // Validate unread count: ensure it's a non-negative integer
            // Cap at 99 for display purposes (99+ will be shown for larger numbers)
            if (isNaN(unreadCountValue) || unreadCountValue < 0) {
              unreadCountValue = 0;
            }
            
            // Convert to string for consistent key handling (handles both numbers and UUIDs)
            const convId = String(rawConvId);
            
            // Store conversation with unread count (including 0 unread count)
            // Backend calculates this from UserMessage records where:
            // - is_read=False, is_deleted=False, is_recalled=False, message__sender !== current_user
            unreadMap.set(convId, unreadCountValue);
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch unread stats:", err);   
    }
    return unreadMap;
  };

  // Fetch pinned conversations
  const fetchPinnedConversations = async (): Promise<Map<number, { isPinned: boolean; pinOrder: number; pinnedAt: string }>> => {
    const pinMap = new Map<number, { isPinned: boolean; pinOrder: number; pinnedAt: string }>();
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/conversations/pinned/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      
      const res = await response.json();
      

      if (res.pinned_conversations && Array.isArray(res.pinned_conversations)) {
        res.pinned_conversations.forEach((conv: any) => {
          const convId = Number(conv.conversation_id);
          if (!isNaN(convId)) {
            pinMap.set(convId, {
              isPinned: true,
              pinOrder: conv.pin_order || 0,
              pinnedAt: conv.pinned_at || "",
            });
          }
        });
      }
    } catch (err) {
      console.error("[FriendList] Failed to fetch pinned conversations:", err);
      // Don't show error to user - just continue without pin info
    }
    
    return pinMap;
  };

  // Fetch nickname for a conversation
  const fetchNickname = async (conversationId: number): Promise<string | undefined> => {
    if (!token) return undefined;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/conversations/${conversationId}/member_settings/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.nickname || undefined;
      }
    } catch (error) {
      console.error('[FriendList] Failed to fetch nickname for conversation', conversationId, error);
    }
    return undefined;
  };

  // Fetch nicknames for all friends with conversations
  const fetchAllNicknames = async (friends: Friend[]) => {
    if (!token) return;
    
    const nicknamePromises = friends
      .filter(f => f.conversationId !== undefined)
      .map(async (friend) => {
        const nickname = await fetchNickname(friend.conversationId!);
        return { conversationId: friend.conversationId!, nickname };
      });
    
    const nicknameResults = await Promise.all(nicknamePromises);
    const nicknameMap = new Map<number, string>();
    nicknameResults.forEach(({ conversationId, nickname }) => {
      if (nickname) {
        nicknameMap.set(conversationId, nickname);
      }
    });
    setNicknames(nicknameMap);
  };

  const fetchFriends = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      // Fetch friends, pinned conversations, and unread stats in parallel
      const [friendsResponse, pinMap, unreadMap] = await Promise.all([
        fetch(`${BACKEND_URL}/api/user/friends/`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        fetchPinnedConversations(),
        fetchUnreadStats(),
      ]);
      
      const res = await friendsResponse.json();

      if (Number(res.code) === 0) {
        // Handle both 'friends' and 'friendList' field names from API
        const rawFriendList = res.friends || res.friendList || [];
        const formattedFriends: Friend[] = rawFriendList.map((friend: any) => {
          // Normalize conversationId to a number or undefined (never null / string)
          const conversationIdRaw = friend.conversation_id ?? friend.conversationId;
          const conversationId =
            conversationIdRaw === undefined
              ? undefined
              : Number(conversationIdRaw);

          // Handle both 'username' and 'userName' field names
          const userName = friend.userName || friend.username || friend.user_name || '';
          
          const pinInfo = conversationId !== undefined ? pinMap.get(conversationId) : undefined;
          // Map unreadCount by conversationId (convert to string for lookup)
          // Backend returns integer unread_count (0 or positive) from UserMessage records
          // Counts: is_read=False, is_deleted=False, is_recalled=False, message__sender !== current_user
          const mappedUnread =
            conversationId !== undefined ? unreadMap.get(String(conversationId)) : undefined;
          
          return {
            id: friend.id,
            avatar: friend.avatar === null ? "" : `${BACKEND_URL}${friend.avatar}`,
            userName,
            email: friend.email || "未设置邮箱",
            note: friend.note || "",
            conversationId,
            isPinned: pinInfo?.isPinned || false,
            pinOrder: pinInfo?.pinOrder || 0,
            pinnedAt: pinInfo?.pinnedAt,
            // Leave unreadCount undefined when we don't know it, so we don't render a stray 0
            unreadCount: mappedUnread,
          };
        });
        
        // Sort friends: pinned first (by pin_order), then by unread count, then alphabetically
        formattedFriends.sort((a, b) => {
          // Pinned conversations first
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          if (a.isPinned && b.isPinned) {
            return (a.pinOrder || 0) - (b.pinOrder || 0);
          }
          // Both unpinned - prioritize unread messages
          const aUnread = a.unreadCount || 0;
          const bUnread = b.unreadCount || 0;
          if (aUnread > 0 && bUnread === 0) return -1;
          if (aUnread === 0 && bUnread > 0) return 1;
          if (aUnread > 0 && bUnread > 0) {
            return bUnread - aUnread; // More unread first
          }
          // Both have no unread - sort by username maybe update in the future to sort by last message time
          return a.userName.localeCompare(b.userName);
        });
        
        console.log("[FriendList] Formatted friends count:", formattedFriends.length);
        console.log("[FriendList] All formatted friends:", formattedFriends);
        setFriends(formattedFriends.map((friend) => friend = {...friend, note_new: friend.note}));
        
        // Fetch nicknames for all friends with conversations
        fetchAllNicknames(formattedFriends);
      } else {
        setErrorMsg(res.info || "Failed to retrieve friend list");
      }
    } catch (err) {
      setErrorMsg("Failed to fetch data: " + String(err));
    }

    setLoading(false);
  };

  // Create or get conversation ID for a friend
  const getOrCreateConversationId = async (friend: Friend): Promise<number | undefined> => {
    // If conversation already exists, return it
    if (friend.conversationId) {
      return friend.conversationId;
    }

    // Try to create a conversation by sending an empty/system message
    // The backend will create the conversation when the first message is sent
    try {
      // First, try to get existing conversation from friends API
      const friendsResponse = await fetch(`${BACKEND_URL}/api/user/friends/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (friendsResponse.ok) {
        const res = await friendsResponse.json();
        const rawFriendList = res.friends || res.friendList || [];
        const foundFriend = rawFriendList.find((f: any) => Number(f.id) === friend.id);
        if (foundFriend) {
          const conversationIdRaw = foundFriend.conversation_id ?? foundFriend.conversationId;
          if (conversationIdRaw !== undefined) {
            const conversationId = Number(conversationIdRaw);
            // Update friend in state with the conversation ID
            setFriends(prevFriends => prevFriends.map(f => 
              f.id === friend.id ? { ...f, conversationId } : f
            ));
            return conversationId;
          }
        }
      }

      // If no conversation exists, we can't pin/mute without creating one first
      // For now, return undefined and let the user know they need to start a chat
      return undefined;
    } catch (error) {
      console.error("[FriendList] Failed to get conversation ID:", error);
      return undefined;
    }
  };

  // Pin or unpin a conversation - Optimistic UI update
  const togglePinConversation = async (friend: Friend) => {

    // Try to get or create conversation ID
    let conversationId = friend.conversationId;
    if (!conversationId) {
      conversationId = await getOrCreateConversationId(friend);
      if (!conversationId) {
        message.warning("Please start a chat with this friend first to pin the conversation");
        return;
      }
    }

    const isCurrentlyPinned = friend.isPinned || false;
    const newPinStatus = !isCurrentlyPinned;

    // Calculate pin order before updating (use current state)
    let pinOrder = 0;
    if (newPinStatus) {
      const currentPinnedCount = friends.filter(f => f.isPinned && f.id !== friend.id).length;
      pinOrder = currentPinnedCount + 1;
    }

    // Optimistically update UI immediately
    setFriends(prevFriends => {
      const updatedFriends = prevFriends.map(f => {
        if (f.id === friend.id) {
          return {
            ...f,
            isPinned: newPinStatus,
            pinOrder: newPinStatus ? pinOrder : 0,
            pinnedAt: newPinStatus ? new Date().toISOString() : undefined,
          };
        }
        return f;
      });
      
      // Re-sort: pinned first (by pin_order), then unpinned
      updatedFriends.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        if (a.isPinned && b.isPinned) {
          return (a.pinOrder || 0) - (b.pinOrder || 0);
        }
        return a.userName.localeCompare(b.userName);
      });
      
      return updatedFriends;
    });

    // Call backend API to persist the change
    try {
      const requestBody: any = {
        pinned: newPinStatus,
      };
      
      // Only include pin_order when pinning (not when unpinning)
      if (newPinStatus) {
        requestBody.pin_order = pinOrder;
      }

      const response = await fetch(
        `${BACKEND_URL}/api/chat/conversations/${conversationId}/pin/`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Update with backend response data to ensure consistency
      setFriends(prevFriends => {
        const updatedFriends = prevFriends.map(f => {
          if (f.id === friend.id) {
            return {
              ...f,
              conversationId: conversationId || f.conversationId, // Update conversation ID if we got it
              isPinned: data.pinned || newPinStatus,
              pinOrder: data.pin_order || (newPinStatus ? pinOrder : 0),
              pinnedAt: data.pinned_at || (newPinStatus ? new Date().toISOString() : undefined),
            };
          }
          return f;
        });
        
        // Re-sort after backend confirmation
        updatedFriends.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          if (a.isPinned && b.isPinned) {
            return (a.pinOrder || 0) - (b.pinOrder || 0);
          }
          return a.userName.localeCompare(b.userName);
        });
        
        return updatedFriends;
      });

      message.success(newPinStatus ? "Conversation pinned" : "Conversation unpinned");
    } catch (error: any) {
      console.error("[FriendList] Failed to pin/unpin conversation:", error);
      
      // Revert optimistic update on error
      setFriends(prevFriends => {
        const updatedFriends = prevFriends.map(f => {
          if (f.id === friend.id) {
            return {
              ...f,
              isPinned: isCurrentlyPinned,
              pinOrder: friend.pinOrder || 0,
              pinnedAt: friend.pinnedAt,
            };
          }
          return f;
        });
        
        // Re-sort after revert
        updatedFriends.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          if (a.isPinned && b.isPinned) {
            return (a.pinOrder || 0) - (b.pinOrder || 0);
          }
          return a.userName.localeCompare(b.userName);
        });
        
        return updatedFriends;
      });
      
      message.error(`Failed to ${newPinStatus ? 'pin' : 'unpin'} conversation: ${error.message || 'Unknown error'}`);
    }
  };

  const _removeFriend = async (_friendId: number, _userName: string) => {
    if (!confirm(`Are you sure you want to remove ${_userName}?`)) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/user/friend-remove/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ friend_id: _friendId }),
      });

      const res = await response.json();

      if (Number(res.code) === 0) {
        message.success("Friend removed successfully");
        fetchFriends();
      } else {
        setErrorMsg(res.info || "Failed to remove friend");
      }
    } catch (err) {
      setErrorMsg(FAILURE_PREFIX + String(err));
    }
  };

  // Clear conversation messages
  const handleClearChat = async (friend: Friend) => {
    // Check token availability
    if (!token) {
      message.error('请先登录');
      return;
    }

    // Get or create conversation ID
    let conversationId = friend.conversationId;
    
    if (!conversationId) {
      conversationId = await getOrCreateConversationId(friend);
      
      if (!conversationId) {
        message.warning("Please start a chat with this friend first to clear messages");
        return;
      }
    }

    // Show confirmation dialog using window.confirm
    const confirmMessage = `确定要清空与 ${friend.userName || '此好友'} 的所有聊天记录吗？\n\n这将删除您在此会话中的所有消息记录（仅影响您的视图，对方仍能看到消息）。`;
    
    const confirmed = window.confirm(confirmMessage);
    
    if (!confirmed) {
      return;
    }

    // Show loading message
    const hideLoading = message.loading('正在清空聊天记录...', 0);

    try {
      const url = `${BACKEND_URL}/api/chat/conversations/${conversationId}/clear/`;
      const requestBody = {
        delete_type: 'soft', // Soft delete: marks messages as deleted (recoverable)
        // Note: To permanently delete, use 'permanent' instead
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      hideLoading();

      const responseText = await response.text();

      if (response.ok) {
        let data;
        try {
          data = JSON.parse(responseText);
        } catch {
          message.error('服务器响应格式错误');
          return;
        }
        
        // Check if all messages were deleted
        const deletedCount = data.deleted_count || 0;
        const remainingCount = data.remaining_count || 0;
        
        if (remainingCount === 0) {
          message.success(data.message || `已清空 ${deletedCount} 条消息记录`);
        } else {
          message.warning(`已删除 ${deletedCount} 条消息，但仍有 ${remainingCount} 条消息未删除`);
        }
        
        // Refresh friend list to update unread counts
        fetchFriends();
        
        // Trigger event to refresh chat page if it's open
        if (typeof window !== 'undefined') {
          // Store cleared conversation ID in localStorage as a fallback
          // This allows the chat page to check on load if messages were cleared
          try {
            const clearedConversations = JSON.parse(
              localStorage.getItem('clearedConversations') || '[]'
            );
            
            if (!clearedConversations.includes(String(conversationId))) {
              clearedConversations.push(String(conversationId));
              localStorage.setItem('clearedConversations', JSON.stringify(clearedConversations));
            }
        } catch {
          // Silently handle localStorage errors
        }
          
          const event = new CustomEvent('chatMessagesCleared', {
            detail: { conversationId }
          });
          
          window.dispatchEvent(event);
        }
      } else {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText || 'Unknown error' };
        }
        
        message.error(errorData.error || `清空聊天记录失败: ${response.status}`);
      }
    } catch (error: any) {
      hideLoading();
      message.error(`清空聊天记录失败: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDelete = async (friend: Friend) => {
    if (!token) {
      message.error('请先登录');
      return;
    }
    try {
      const url = `${BACKEND_URL}/api/user/friend-remove/`;
      const requestBody = {
        delete_type: 'soft', // Soft delete: marks messages as deleted (recoverable)
        friend_id: friend.id,
        // Note: To permanently delete, use 'permanent' instead
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();

      console.log(responseText);
      console.log(response.ok);

      if (response.ok) {
        
        // Refresh friend list to update unread counts
        fetchFriends();
      } else {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText || 'Unknown error' };
        }
        
        console.log(errorData);

        message.error(errorData.info || `删除好友失败: ${response.status}`);
      }
    } catch (error: any) {
      message.error(`删除好友失败: ${error.message || 'Unknown error'}`);
    }
  }

  // Fetch muted conversations
  const fetchMutedConversations = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/conversations/muted/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const mutedIds = new Set<string>(
          (data.muted_conversations || []).map((conv: any) => String(conv.conversation_id))
        );
        setMutedConversations(mutedIds);
      }
    } catch (error) {
      console.error('[FriendList] Failed to fetch muted conversations:', error);
    }
  };

  // Toggle mute (do not disturb) for a conversation
  const toggleMuteConversation = async (friend: Friend) => {
    
    if (!token) {
      message.error('无法切换免打扰: 未登录');
      return;
    }

    // Try to get or create conversation ID
    let conversationId = friend.conversationId;
    if (!conversationId) {
      conversationId = await getOrCreateConversationId(friend);
      if (!conversationId) {
        message.warning('请先与此好友开始聊天以开启免打扰');
        return;
      }
    }

    const isCurrentlyMuted = mutedConversations.has(String(conversationId));
    
    // Optimistically update UI
    setMutedConversations(prev => {
      const updated = new Set(prev);
      if (isCurrentlyMuted) {
        updated.delete(String(conversationId));
      } else {
        updated.add(String(conversationId));
      }
      return updated;
    });

    // Update friend's conversationId in state if we got it
    if (conversationId && !friend.conversationId) {
      setFriends(prevFriends => prevFriends.map(f => 
        f.id === friend.id ? { ...f, conversationId } : f
      ));
    }

    try {
      const muteUrl = `${BACKEND_URL}/api/chat/conversations/${conversationId}/mute/`;
      const muteResponse = await fetch(muteUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!muteResponse.ok) {
        const errorData = await muteResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${muteResponse.status}`);
      }

      const muteData = await muteResponse.json();
      message.success(muteData.message || (muteData.is_muted ? '已开启免打扰' : '已关闭免打扰'));
    } catch (error: any) {
      console.error('[FriendList] Failed to toggle mute:', error);
      // Revert optimistic update on error
      setMutedConversations(prev => {
        const updated = new Set(prev);
        if (isCurrentlyMuted) {
          updated.add(String(conversationId));
        } else {
          updated.delete(String(conversationId));
        }
        return updated;
      });
      message.error(`切换免打扰失败: ${error.message || 'Unknown error'}`);
    }
  };

  useEffect(() => {
    if (token) {
      fetchFriends();
      fetchMutedConversations();
    } else {
      setErrorMsg("请先登录");
    }
  }, [token]);

  // Refresh friend list when page becomes visible (e.g., returning from chat)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && token) {
        fetchFriends();
        fetchMutedConversations();
      }
    };

    const handleFriendListRefresh = () => {
      if (token) {
        fetchFriends();
        fetchMutedConversations();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('friendListRefresh', handleFriendListRefresh);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('friendListRefresh', handleFriendListRefresh);
    };
  }, [token]);

  const handleTagUpdate = (id: number, value: string) => {
    setFriends(prev => prev.map((friend) => friend.id === id ? {...friend, note_new: value} : friend));
  };

  const handleTagSend = async (id: number) => {
    let value: string = "";
    friends.forEach((item) => {
      value = item.id === id ? item.note_new : value;
    });

    const response = await fetch(`${BACKEND_URL}/api/user/friend-note/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to_user_id: id, note: value}),
    });

    const res = await response.json();

    if (res.code === 0) {
      setFriends(prev => prev.map((friend) => friend.id === id ? {...friend, note: value} : friend));
    } else {
      setErrorMsg(res.info);
    }
  };

  const switchCurrentTag = (note: string) => {
    setTag(tag => tag === note ? "" : note);
  };

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "40px auto",
        padding: "20px",
        border: "1px solid #eee",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <h2
        style={{
          textAlign: "center",
          color: "#333",
          marginBottom: "25px",
        }}
      >
        Friend List
      </h2>

      {errorMsg && (
        <p style={{ color: "#ff4444", textAlign: "center", marginBottom: "15px" }}>
          {errorMsg}
        </p>
      )}

      {loading ? (
        <p style={{ textAlign: "center", color: "#666" }}>Loading...</p>
      ) : friends.length === 0 ? (
        <p style={{ textAlign: "center", color: "#999" }}>No friends yet</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {friends.map((friend) => {
            return (tag === "" || friend.note === tag) && (
            <div
              key={friend.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid #ddd",
                borderRadius: "6px",
                padding: "10px 12px",
                backgroundColor: friend.isPinned ? "#e3f2fd" : "white",
                position: "relative",
                transition: "all 0.2s ease",
                boxSizing: "border-box",
                // Use outline effect for pinned state instead of changing border width
                boxShadow: friend.isPinned ? "0 0 0 2px #2196F3" : "none",
                pointerEvents: "auto",
              }}
            >
              {/* ========== UNREAD MESSAGES BADGE RENDERING (COMMENTED OUT) ========== */}
              {/* Unread badge - red with number if not muted, red circle with white inner circle if muted */}
              {/*
              {typeof friend.unreadCount === "number" && 
               friend.unreadCount > 0 && 
               friend.conversationId && (
                <span
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-6px",
                    minWidth: "18px",
                    height: "18px",
                    padding: mutedConversations.has(String(friend.conversationId)) ? "0" : "0 4px",
                    borderRadius: "999px",
                    backgroundColor: "#ff4d4f",
                    color: mutedConversations.has(String(friend.conversationId)) ? "transparent" : "#fff",
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 0 2px #fff",
                    border: "none",
                    zIndex: 5,
                  }}
                >
                  {mutedConversations.has(String(friend.conversationId)) ? (
                    // Red circle with white inner circle (muted conversation)
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "#fff",
                        display: "block",
                      }}
                    />
                  ) : (
                    // Red circle with number (not muted - shows unread count)
                    friend.unreadCount > 99 ? "99+" : friend.unreadCount
                  )}
                </span>
              )}
              */}
              {/* ========== END UNREAD MESSAGES BADGE RENDERING (COMMENTED OUT) ========== */}

              {/* Unread badge - shows count when not muted, dot when muted */}
              {typeof friend.unreadCount === "number" && 
               friend.unreadCount > 0 && 
               friend.conversationId && (
                <span
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-6px",
                    minWidth: mutedConversations.has(String(friend.conversationId)) ? "18px" : "18px",
                    height: "18px",
                    padding: mutedConversations.has(String(friend.conversationId)) ? "0" : "0 4px",
                    borderRadius: "999px",
                    backgroundColor: "#ff4d4f",
                    color: mutedConversations.has(String(friend.conversationId)) ? "transparent" : "#fff",
                    fontSize: "11px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 0 0 2px #fff",
                    border: "none",
                    zIndex: 5,
                  }}
                >
                  {mutedConversations.has(String(friend.conversationId)) ? (
                    // Muted = red circle with white inner dot
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: "#fff",
                        display: "block",
                      }}
                    />
                  ) : (
                    // NOT muted = red circle with unread count number
                    friend.unreadCount > 99 ? "99+" : friend.unreadCount
                  )}
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}>
                {friend.isPinned && (
                  <PushpinFilled
                    style={{
                      color: "#1976d2",
                      fontSize: "18px",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ marginBottom: "0px" , marginRight: "0px"}}>
                  <img
                    src={friend.avatar !== "" ? friend.avatar || "https://picsum.photos/100" : "https://picsum.photos/100"}
                    alt="用户头像"
                    onClick={() => router.push(`/profile?user_id=${friend.id}`)}
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "1px solid #eee",
                    }}
                  />
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <p style={{ margin: "0", fontWeight: "500", display: "flex", alignItems: "center", gap: "6px" }}>
                    {friend.conversationId && nicknames.has(friend.conversationId) 
                      ? nicknames.get(friend.conversationId) 
                      : friend.userName}
                    {friend.isPinned && (
                      <span style={{ fontSize: "11px", color: "#2196F3" }}>
                        (Pinned)
                      </span>
                    )}
                    {friend.note !== "" && (
                      <Tag
                        color="blue"
                        onClick={() => switchCurrentTag(friend.note)}
                      >
                        {friend.note}
                      </Tag>
                    )}
                  </p>
                  <p style={{ margin: "0", color: "#777", fontSize: "13px" }}>
                    {friend.email}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {editing ? 
                  (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input
                        type="note"
                        name="note"
                        placeholder="Please enter tag"
                        value={friend.note_new || ""}
                        onChange={(e) => handleTagUpdate(friend.id, e.target.value)}
                        style={{
                          flex: 1,
                          padding: "10px 12px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                          fontSize: "14px",
                          marginRight: "8px",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          handleTagSend(friend.id);
                        }}
                        style={{
                          backgroundColor: "#2196F3",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  )
                : (
                    <>
                      {/* Pin/Unpin button - Always visible */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[FriendList] Pin button clicked for friend:', friend.id, friend.userName);
                          console.log('[FriendList] Pin button - friend object:', friend);
                          console.log('[FriendList] Pin button - togglePinConversation function:', typeof togglePinConversation);
                          try {
                            togglePinConversation(friend).catch(err => {
                              console.error('[FriendList] Error in togglePinConversation:', err);
                            });
                          } catch (err) {
                            console.error('[FriendList] Exception in onClick handler:', err);
                          }
                        }}
                        style={{
                          backgroundColor: friend.isPinned ? "#e3f2fd" : "transparent",
                          color: friend.isPinned ? "#1976d2" : "#999",
                          border: friend.isPinned ? "1px solid #90caf9" : "none",
                          borderRadius: "4px",
                          padding: "6px 8px",
                          cursor: "pointer",
                          fontSize: "16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 1,
                          transition: "all 0.2s ease",
                          zIndex: 10,
                          position: "relative",
                          pointerEvents: "auto",
                        }}
                        title={
                          friend.isPinned
                            ? "Unpin conversation"
                            : "Pin conversation"
                        }
                      >
                        {friend.isPinned ? (
                          <PushpinFilled style={{ color: "#1976d2" }} />
                        ) : (
                          <PushpinOutlined />
                        )}
                      </button>
                      {/* Mute/Unmute (Do Not Disturb) button - Always visible */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[FriendList] Mute button clicked for friend:', friend.id, friend.userName);
                          console.log('[FriendList] Mute button - friend object:', friend);
                          console.log('[FriendList] Mute button - toggleMuteConversation function:', typeof toggleMuteConversation);
                          try {
                            toggleMuteConversation(friend).catch(err => {
                              console.error('[FriendList] Error in toggleMuteConversation:', err);
                            });
                          } catch (err) {
                            console.error('[FriendList] Exception in onClick handler:', err);
                          }
                        }}
                        style={{
                          backgroundColor: friend.conversationId && mutedConversations.has(String(friend.conversationId)) ? "#ffeaea" : "transparent",
                          color: friend.conversationId && mutedConversations.has(String(friend.conversationId)) ? "#ff4d4f" : "#999",
                          border: friend.conversationId && mutedConversations.has(String(friend.conversationId)) ? "1px solid #ffb3b3" : "none",
                          borderRadius: "4px",
                          padding: "6px 8px",
                          cursor: "pointer",
                          fontSize: "16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 1,
                          transition: "all 0.2s ease",
                          zIndex: 10,
                          position: "relative",
                          pointerEvents: "auto",
                        }}
                        title={
                          friend.conversationId
                            ? mutedConversations.has(String(friend.conversationId))
                              ? "关闭免打扰"
                              : "开启免打扰"
                            : "开启免打扰 (需要先开始聊天)"
                        }
                      >
                        {friend.conversationId && mutedConversations.has(String(friend.conversationId)) ? (
                          <BellFilled />
                        ) : (
                          <BellOutlined />
                        )}
                      </button>
                      {/* Chat button */}
                      <button
                        onClick={() => {
                          // Ensure userName is a string and not concatenated incorrectly
                          const targetUserName = String(friend.userName || '').trim();
                          console.log('[FriendList] Chat button clicked:', {
                            friendId: friend.id,
                            userName: friend.userName,
                            targetUserName,
                            conversationId: friend.conversationId,
                            hasConversationId: friend.conversationId !== undefined
                          });
                          
                          if (!targetUserName) {
                            message.error('Invalid friend username');
                            return;
                          }
                          
                          const query: { target: string; friend_id?: string; conv_id?: string } = {
                            target: targetUserName, // Use cleaned username
                            friend_id: friend.id.toString(), // Pass friend ID for creating conversation
                          };
                          if (friend.conversationId !== undefined) {
                            query.conv_id = String(friend.conversationId);
                            console.log('[FriendList] Navigating to chat with conv_id:', query);
                          } else {
                            console.log('[FriendList] Navigating to chat with friend_id (new conversation):', query);
                          }
                          router.push({
                            pathname: "/chat",
                            query,
                          });
                        }}
                        style={{
                          backgroundColor: "#2196F3",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        Chat
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleClearChat(friend);
                        }}
                        style={{
                          backgroundColor: "#ff5252",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        Clear Chat
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(friend);
                        }}
                        style={{
                          backgroundColor: "#ff5252",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          padding: "6px 10px",
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )
                }
              </div>
            </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          marginTop: "25px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={() => (setTag(""), fetchFriends())}
          style={{
            flex: 1,
            padding: "10px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            backgroundColor: "#f5f5f5",
            fontSize: "14px",
            cursor: "pointer",
            marginRight: "8px",
          }}
        >
          Refresh
        </button>
        <button
          onClick={() => router.push("/friend_requests")}
          style={{
            flex: 1,
            padding: "10px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            marginRight: "8px",
            fontSize: "14px",
          }}
        >
          Friend Requests
        </button>
        <button
          onClick={() => router.push("/search")}
          style={{
            flex: 1,
            padding: "10px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            marginRight: "8px",
            fontSize: "14px",
          }}
        >
          Add Friend
        </button>
        {!editing && (
          <button
            onClick={() => {
              setFriends(friends => friends.map((friend) => friend = {...friend, note_new: friend.note}));
              setEditing(true);
              return ;
            }}
            style={{
              flex: 1,
              padding: "10px",
              backgroundColor: "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Edit Tag
          </button>
        )}
        {editing && (
          <button
            onClick={() => setEditing(false)}
            style={{
              flex: 1,
              padding: "10px",
              backgroundColor: "#ff4444",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            End Editing
          </button>
        )}
      </div>
    </div>
  );
};

export default FriendListScreen;