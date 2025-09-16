import { useEffect, useRef, useState } from 'react';

// Define types directly to avoid import issues
interface WebSocketMessage {
  type: 'JOIN' | 'UPDATE_QUEUE' | 'PLAY' | 'PAUSE' | 'SKIP' | 'TRANSITION_SONG' | 'SET_HOST' | 'PLAY_NEXT';
  partyId?: string;
  userId?: string;
  queue?: any[];
  song?: any;
}

interface UseWebSocketOptions {
  partyId: string;
  userId?: string;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export const useWebSocket = ({
  partyId,
  userId,
  onMessage,
  onConnect,
  onDisconnect,
}: UseWebSocketOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8000';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setConnectionError(null);
      
      // Join the party room
      ws.send(JSON.stringify({ type: 'JOIN', partyId }));
      
      // Set host if userId is provided
      if (userId) {
        ws.send(JSON.stringify({ type: 'SET_HOST', partyId, userId }));
      }
      
      onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        if (message.partyId === partyId) {
          onMessage?.(message);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      onDisconnect?.();
      
      // Attempt to reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionError('WebSocket connection failed');
    };
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  };

  const sendMessage = (message: Omit<WebSocketMessage, 'partyId'>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ ...message, partyId }));
    } else {
      console.warn('WebSocket is not connected');
    }
  };

  useEffect(() => {
    if (partyId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [partyId]);

  return {
    isConnected,
    connectionError,
    sendMessage,
    connect,
    disconnect,
  };
};
