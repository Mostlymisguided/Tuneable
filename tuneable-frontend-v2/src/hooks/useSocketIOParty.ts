import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

interface PartyUpdateMessage {
  type: 'PARTY_CREATED' | 'MEDIA_STARTED' | 'MEDIA_COMPLETED' | 'MEDIA_VETOED' | 'PARTY_ENDED' | 'UPDATE_QUEUE' | 'PLAY' | 'PAUSE' | 'SKIP' | 'PLAY_NEXT';
  partyId?: string;
  mediaId?: string;
  playedAt?: string;
  completedAt?: string;
  vetoedAt?: string;
  vetoedBy?: string;
  vetoedBy_uuid?: string;
  reason?: string;
  queue?: any[];
  media?: any;
  party?: any;
}

interface UseSocketIOPartyOptions {
  partyId: string;
  enabled?: boolean;
  onMessage?: (message: PartyUpdateMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export const useSocketIOParty = ({
  partyId,
  enabled = true,
  onMessage,
  onConnect,
  onDisconnect,
}: UseSocketIOPartyOptions) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Get API base URL for Socket.IO connection
  const getSocketIOUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000';
    return apiUrl;
  };

  useEffect(() => {
    if (!partyId || !enabled) {
      return;
    }

    const socketUrl = getSocketIOUrl();
    const token = localStorage.getItem('token');

    // Connect to Socket.IO server
    try {
      socketRef.current = io(socketUrl, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 5000
      });

      socketRef.current.on('connect', () => {
        console.log('Socket.IO connected for party updates');
        setIsConnected(true);
        setConnectionError(null);

        // Authenticate with JWT token if available
        if (token) {
          socketRef.current?.emit('authenticate', { token });
        }

        // Join party room
        socketRef.current?.emit('join-party', { partyId });
        onConnect?.();
      });

      socketRef.current.on('party-joined', (data) => {
        console.log('Joined party room:', data);
      });

      socketRef.current.on('authenticated', (data) => {
        console.log('Socket.IO authenticated for party updates:', data);
      });

      // Listen for party updates
      socketRef.current.on('party-update', (message: PartyUpdateMessage) => {
        console.log('Party update received:', message);
        if (message.partyId === partyId) {
          onMessage?.(message);
        }
      });

      socketRef.current.on('connect_error', (error) => {
        console.warn('Socket.IO connection error:', error.message);
        setConnectionError(error.message);
        setIsConnected(false);
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected:', reason);
        setIsConnected(false);
        onDisconnect?.();
      });

      socketRef.current.on('error', (error: any) => {
        console.error('Socket.IO error:', error);
        setConnectionError(error.message || 'Socket.IO error');
      });

    } catch (error) {
      console.error('Error setting up Socket.IO connection:', error);
      setConnectionError('Failed to connect to Socket.IO server');
    }

    return () => {
      // Leave party room and disconnect
      if (socketRef.current) {
        socketRef.current.emit('leave-party', { partyId });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
    };
  }, [partyId, enabled]);

  const sendMessage = (message: Omit<PartyUpdateMessage, 'partyId'>) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('party-action', { ...message, partyId });
    } else {
      console.warn('Socket.IO is not connected');
    }
  };

  return {
    isConnected,
    connectionError,
    sendMessage,
  };
};

