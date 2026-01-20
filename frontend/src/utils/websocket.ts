import { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { BACKEND_URL } from '../constants/string';

// 1. 解决 "Use an `interface` instead of a `type`" 报错：type 改 interface
// 2. 解决 "Avoid using null" 报错：移除 reply_to 中的 | null
export interface WsMessage {
  type: 'chat_message' | 'typing' | 'typing_status' | 'system_notice' | 'new_message' | 'pong' | 'ping' | 'read_receipt' | 'message_sent' | 'connection_established' | 'error' | 'read_receipt_sent' | 'edit_message' | 'message_edited' | 'command_message';
  message_id?: string;
  content?: string;
  sender_id?: number;
  sender_name?: string;
  receiver_id?: number;
  conversation_id?: string;
  group_id?: string;
  timestamp?: string | number;
  is_recalled?: boolean;
  is_edited?: boolean;
  reply_to?: {
    message_id: string;
    content: string;
    sender_name: string;
  } | undefined; // 移除 | null，改用 undefined
  message_type?: 'text' | 'image'; // 保持可选，适配发送消息场景
  image_url?: string;
  is_typing?: boolean;
  user_id?: number;
  message?: string; // For error messages
  command_type?: 'recall' | 'edit' | 'read_status';
  command_data?: {
    recalled_message_id?: string;
    edited_message_id?: string;
    new_content?: string;
    message_id?: string;
    message_ids?: string[];
    read_status?: {
      read_count: number;
      total_recipients: number;
      unread_count: number;
    };
    read_index?: string;
    read_index_timestamp?: string;
    updated_count?: number;
    user_id?: number;
  };
}

export interface TypingStatusMessage extends WsMessage {
  type: 'typing_status';
  user_id: number;
  conversation_id: string;
  is_typing: boolean;
  message_type?: never; // 输入状态消息不需要 message_type
}

class WsClient {
  // 3. 解决 "Avoid using null" 报错：null 改 undefined，类型同步调整
  private ws: WebSocket | undefined = undefined;
  private baseUrl: string;
  private token: string;
  public isConnected = false;
  // 4. 解决 "Avoid using null" 报错：null 改 undefined，类型同步调整
  private heartbeatTimer: NodeJS.Timeout | undefined = undefined;
  private heartbeatInterval = 30000;

  // 5. 解决 "Avoid using null" 报错：用可选属性（?）替代 "| null = null"，更简洁
  onConnect?: () => void;
  onMessage?: (msg: WsMessage) => void;
  onTyping?: (status: TypingStatusMessage) => void;
  onError?: (errMsg: string) => void;
  onClose?: (code: number, reason: string) => void;

  constructor(baseUrl: string, token: string) {
    // Determine correct WS protocol from page protocol
    const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    const wsScheme = isHttps ? "wss" : "ws";

    // Strip protocol from backend URL
    const backendHost = baseUrl.replace(/^https?:\/\//, "");

    // Rebuild clean WS base URL
    this.baseUrl = `${wsScheme}://${backendHost}`;
    this.token = token;
  }

  connect() {
    // 类型判断同步调整：null 改 undefined
    if (this.isConnected || this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket 已在连接中');
      return;
    }

    try {
      // 处理 baseUrl 可能带路径的情况，避免重复拼接
      const connectUrl = new URL(`${this.baseUrl}/ws/chat/`);
      connectUrl.searchParams.append('token', this.token);
      const wsUrl = connectUrl.toString();
      // Better token masking for logging
      const maskedUrl = wsUrl.replace(new RegExp(this.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '***');
      console.log('正在连接WebSocket:', maskedUrl);
      console.log('WebSocket连接详情:', {
        baseUrl: this.baseUrl,
        fullUrl: maskedUrl,
        hasToken: !!this.token
      });
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.onConnect?.();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          this.onMessage?.(msg);
          // Backend sends typing_status (not typing) for typing indicators
          if (msg.type === 'typing_status' && msg.user_id !== undefined && msg.is_typing !== undefined) {
            this.onTyping?.({ ...msg, message_type: undefined } as TypingStatusMessage);
          }
        } catch (err) {
          console.error('[WebSocket] Message parsing failed:', err, 'Raw data:', event.data);
          this.onError?.(`Message parsing failed: ${(err as Error).message}`);
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.stopHeartbeat();
        // WebSocket error events don't provide detailed error info in browsers
        // The actual error will be in onclose event
        console.warn('WebSocket connection error occurred');
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        this.stopHeartbeat();
        // Only report errors for unexpected closes (not normal closure code 1000)
        if (event.code !== 1000) {
          let errorMsg = '';
          if (event.code === 1006) {
            // 1006 = Abnormal Closure - connection closed without close frame
            errorMsg = 'WebSocket connection failed: Cannot connect to server. Possible reasons:\n' +
              '1. Backend WebSocket service is not running or not configured\n' +
              '2. WebSocket route /ws/chat/ is not configured in Django\n' +
              '3. Django is not using an ASGI server that supports WebSocket (e.g., Daphne/Uvicorn)\n' +
              'Please check Django backend WebSocket configuration';
          } else {
            errorMsg = `WebSocket connection closed (code: ${event.code}${event.reason ? `, reason: ${event.reason}` : ''})`;
          }
          this.onError?.(errorMsg);
          console.error('[WebSocket] Closed unexpectedly:', {
            code: event.code,
            reason: event.reason || 'No reason',
            wasClean: event.wasClean,
            codeMeaning: event.code === 1006 ? 'Abnormal Closure - Server may not support WebSocket or endpoint does not exist' : 
                        event.code === 1001 ? 'Going Away' :
                        event.code === 1002 ? 'Protocol Error' :
                        event.code === 1003 ? 'Unsupported Data' :
                        event.code === 1004 ? 'Reserved' :
                        event.code === 1005 ? 'No Status Received' :
                        event.code === 1007 ? 'Invalid Frame Payload Data' :
                        event.code === 1008 ? 'Policy Violation' :
                        event.code === 1009 ? 'Message Too Big' :
                        event.code === 1010 ? 'Mandatory Extension' :
                        event.code === 1011 ? 'Internal Server Error' :
                        event.code === 1012 ? 'Service Restart' :
                        event.code === 1013 ? 'Try Again Later' :
                        event.code === 1014 ? 'Bad Gateway' :
                        event.code === 1015 ? 'TLS Handshake' :
                        'Unknown'
          });
        }
        this.onClose?.(event.code, event.reason || 'No reason');
        // 6. 解决 "Avoid using null" 报错：null 改 undefined
        this.ws = undefined;
      };
    } catch (err) {
      this.onError?.(`初始化失败: ${(err as Error).message}`);
    }
  }

  // 明确参数类型，补充发送时的默认字段
  sendMessage(data: Partial<WsMessage>) {
    // 类型判断同步调整：null 改 undefined
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.onError?.('WebSocket 未连接');
      return;
    }
    try {
      // 补充默认 timestamp，避免后端接收不到时间
      const sendData = { timestamp: Date.now(), ...data };
      const jsonString = JSON.stringify(sendData);
      console.log('[WebSocket] Sending message:', {
        type: sendData.type,
        message_id: sendData.message_id,
        content: sendData.content?.substring(0, 50),
        fullPayload: sendData
      });
      this.ws.send(jsonString);
    } catch (err) {
      this.onError?.(`发送失败: ${(err as Error).message}`);
    }
  }

  sendTypingStatus(conversationId: string, isTyping: boolean) {
    this.sendMessage({ 
      type: 'typing', 
      conversation_id: conversationId, 
      is_typing: isTyping
    });
  }

  sendReadReceipt(conversationId: string, messageId?: string) {
    const data: Partial<WsMessage> = { 
      type: 'read_receipt', 
      conversation_id: conversationId, 
      timestamp: Date.now() 
    };
    if (messageId) data.message_id = messageId;
    console.log('[WebSocket] Sending read receipt:', {
      conversation_id: conversationId,
      message_id: messageId,
      fullData: data
    });
    this.sendMessage(data);
  }

  sendEditCommand(groupId: string, messageId: string, newContent: string) {
    this.sendMessage({
      type: 'command_message',
      group_id: groupId,
      conversation_id: groupId,
      command_type: 'edit',
      command_data: {
        edited_message_id: messageId,
        new_content: newContent
      },
      timestamp: Date.now()
    });
  }

  sendRecallCommand(groupId: string, messageId: string) {
    this.sendMessage({
      type: 'command_message',
      group_id: groupId,
      conversation_id: groupId,
      command_type: 'recall',
      command_data: {
        recalled_message_id: messageId
      },
      timestamp: Date.now()
    });
  }

  close() {
    // 类型判断同步调整：null 改 undefined
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close(1000, '主动关闭');
    }
    this.isConnected = false;
    this.stopHeartbeat();
    // 7. 解决 "Avoid using null" 报错：null 改 undefined
    this.ws = undefined;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // 8. 解决 "Avoid using null" 报错：赋值时用 undefined 替代 null
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({ type: 'ping', timestamp: Date.now() });
    }, this.heartbeatInterval);
  }

  private stopHeartbeat() {
    // 类型判断同步调整：null 改 undefined
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      // 9. 解决 "Avoid using null" 报错：null 改 undefined
      this.heartbeatTimer = undefined;
    }
  }
}

export const useWebSocket = () => {
  const { token } = useSelector((state: RootState) => state.auth);
  // 10. 解决 "Avoid using null" 报错：null 改 undefined，类型同步调整
  const clientRef = useRef<WsClient | undefined>(undefined);
  // 11. 解决 "Avoid using null" 报错：null 改 undefined，类型同步调整
  const [wsClient, setWsClient] = useState<WsClient | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // 类型判断同步调整：null 改 undefined
    if (clientRef.current) {
      clientRef.current.close();
      // 12. 解决 "Avoid using null" 报错：null 改 undefined
      clientRef.current = undefined;
      setWsClient(undefined);
      setIsConnected(false);
    }

    if (!token || !BACKEND_URL) {
      console.warn('Token 或后端地址缺失');
      setErrorMsg('连接失败：Token 或后端地址缺失');
      return;
    }

    const backendUrl = BACKEND_URL;
    console.log('[WebSocket] Backend URL:', backendUrl);
    
    const newWsClient = new WsClient(backendUrl, token);
    clientRef.current = newWsClient;
    setWsClient(newWsClient);
    setErrorMsg('');

    newWsClient.onConnect = () => {
      setIsConnected(true);
    };
    newWsClient.onError = (msg) => {
      setErrorMsg(msg);
    };
    newWsClient.onClose = (code) => {
      setIsConnected(false);
      if (code !== 1000) setErrorMsg(`Connection closed (code: ${code})`);
    };

    newWsClient.connect();

      return () => {
        // 修复：仅在 wsClient 存在且已连接时关闭
        if (wsClient && wsClient.isConnected) {
          wsClient.close();
        }
        clientRef.current = undefined;
      };
  }, [token]);

  const onWsConnect = (callback: () => void) => {
    // 类型判断同步调整：null 改 undefined
    if (wsClient) wsClient.onConnect = callback;
  };

  const onWsMessage = (callback: (msg: WsMessage) => void) => {
    // 类型判断同步调整：null 改 undefined
    if (wsClient) {
      wsClient.onMessage = callback;
    } else {
      console.warn('尝试设置WebSocket消息回调，但wsClient不存在');
    }
  };

  const onWsTyping = (callback: (status: TypingStatusMessage) => void) => {
    // 类型判断同步调整：null 改 undefined
    if (wsClient) wsClient.onTyping = callback;
  };

  const onWsError = (callback: (errMsg: string) => void) => {
    // 类型判断同步调整：null 改 undefined
    if (wsClient) wsClient.onError = (msg) => {
      setErrorMsg(msg);
      callback(msg);
    };
  };

  return {
    wsClient,
    isConnected, // 返回连接状态，供 chat.tsx 判断
    errorMsg,
    onWsConnect,
    onWsMessage,
    onWsTyping,
    onWsError,
    sendMessage: (data: Partial<WsMessage>) => wsClient?.sendMessage(data),
    sendTypingStatus: (convId: string, isTyping: boolean) => wsClient?.sendTypingStatus(convId, isTyping),
    sendReadReceipt: (convId: string, msgId?: string) => wsClient?.sendReadReceipt(convId, msgId),
    closeWs: () => wsClient?.close()
  };
};