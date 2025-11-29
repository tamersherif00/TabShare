import { useEffect, useRef, useState, useCallback } from 'react';

export interface WebSocketMessage {
  type: 'CLAIM_CREATED' | 'CLAIM_UPDATED' | 'CLAIM_DELETED' | 'BILL_UPDATED' | 'PARTICIPANT_JOINED';
  payload: any;
  timestamp: string;
}

interface UseWebSocketOptions {
  billId: string;
  userId: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  sendMessage: (message: any) => void;
  reconnect: () => void;
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3002';
const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_MULTIPLIER = 2;
const MAX_RECONNECT_ATTEMPTS = 5;

// Global connection pool - one connection per bill
const connectionPool = new Map<string, WebSocket>();
const connectionRefCounts = new Map<string, number>();
const lastConnectionAttempt = new Map<string, number>();
const MIN_CONNECTION_INTERVAL = 1000;

// Message subscribers - multiple components can subscribe to same bill's messages
type MessageHandler = (message: WebSocketMessage) => void;
const messageSubscribers = new Map<string, Set<MessageHandler>>();

export function useWebSocket({
  billId,
  userId,
  onMessage,
  onConnect,
  onDisconnect,
  onError
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  
  // Use refs for callbacks to avoid dependency changes
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  
  // Update refs when callbacks change
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  });

  // Subscribe this component's message handler
  useEffect(() => {
    if (!onMessage) return;
    
    // Get or create subscriber set for this bill
    if (!messageSubscribers.has(billId)) {
      messageSubscribers.set(billId, new Set());
    }
    
    const subscribers = messageSubscribers.get(billId)!;
    subscribers.add(onMessage);
    
    return () => {
      subscribers.delete(onMessage);
      if (subscribers.size === 0) {
        messageSubscribers.delete(billId);
      }
    };
  }, [billId, onMessage]);

  const connect = useCallback(() => {
    const now = Date.now();
    const lastAttempt = lastConnectionAttempt.get(billId) || 0;
    
    // Throttle connection attempts
    if (now - lastAttempt < MIN_CONNECTION_INTERVAL) {
      return;
    }
    
    // Check if connection already exists in pool
    const existingWs = connectionPool.get(billId);
    if (existingWs && (existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING)) {
      wsRef.current = existingWs;
      setIsConnected(existingWs.readyState === WebSocket.OPEN);
      connectionRefCounts.set(billId, (connectionRefCounts.get(billId) || 0) + 1);
      return;
    }
    
    // Don't create new connection if one already exists
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      lastConnectionAttempt.set(billId, now);
      console.log(`Connecting to WebSocket: ${WS_URL}?billId=${billId}&userId=${userId}`);
      const ws = new WebSocket(`${WS_URL}?billId=${billId}&userId=${userId}`);
      wsRef.current = ws;
      connectionPool.set(billId, ws);
      connectionRefCounts.set(billId, 1);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // Subscribe to bill updates
        ws.send(JSON.stringify({
          action: 'subscribe',
          billId
        }));

        onConnectRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          // Notify ALL subscribers for this bill
          const subscribers = messageSubscribers.get(billId);
          if (subscribers) {
            subscribers.forEach(handler => {
              try {
                handler(message);
              } catch (err) {
                console.error('Error in message handler:', err);
              }
            });
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onErrorRef.current?.(error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        wsRef.current = null;
        
        // Clean up pool
        const refCount = connectionRefCounts.get(billId) || 0;
        if (refCount <= 1) {
          connectionPool.delete(billId);
          connectionRefCounts.delete(billId);
        }
        onDisconnectRef.current?.();

        // Attempt to reconnect with exponential backoff
        if (shouldReconnectRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          
          const delay = Math.min(
            INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF_MULTIPLIER, reconnectAttemptsRef.current - 1),
            MAX_RECONNECT_DELAY
          );
          
          console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error('Max reconnection attempts reached. Please refresh the page.');
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
    }
  }, [billId, userId]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      const refCount = connectionRefCounts.get(billId) || 1;
      
      // Only close if this is the last reference
      if (refCount <= 1) {
        connectionPool.delete(billId);
        connectionRefCounts.delete(billId);
        wsRef.current.close();
      } else {
        connectionRefCounts.set(billId, refCount - 1);
      }
      
      wsRef.current = null;
    }
    
    setIsConnected(false);
  }, [billId]);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected. Message not sent:', message);
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect, disconnect]);

  useEffect(() => {
    let isMounted = true;
    shouldReconnectRef.current = true;
    
    // Small delay to prevent React Strict Mode double-mount issues
    const connectTimer = setTimeout(() => {
      if (isMounted) {
        connect();
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(connectTimer);
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    sendMessage,
    reconnect
  };
}
