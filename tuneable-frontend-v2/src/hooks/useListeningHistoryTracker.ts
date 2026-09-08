import { useCallback, useEffect, useRef } from 'react';
import { userAPI } from '../lib/api';

type SourceType = 'user_queue' | 'library' | 'party' | 'search' | 'profile' | 'direct' | 'unknown';

interface ListeningHistoryTrackerOptions {
  mediaId?: string | null;
  title?: string;
  artist?: string;
  coverArt?: string;
  currentTime: number;
  duration: number;
  sourceType?: SourceType;
  enabled?: boolean;
  isPlaying?: boolean;
}

interface Snapshot {
  mediaId: string | null;
  title: string;
  artist: string;
  coverArt: string;
  currentTime: number;
  duration: number;
  sourceType: SourceType;
  enabled: boolean;
  isPlaying: boolean;
}

interface Session {
  sessionId: string;
  startedAt: string;
  mediaId: string;
  title: string;
  artist: string;
  coverArt: string;
  sourceType: SourceType;
  lastPosition: number;
  lastDuration: number;
}

const HEARTBEAT_MS = 15_000;

function createSessionId(mediaId: string) {
  return `${mediaId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export function useListeningHistoryTracker({
  mediaId,
  title = '',
  artist = '',
  coverArt = '',
  currentTime,
  duration,
  sourceType = 'unknown',
  enabled = true,
  isPlaying = false,
}: ListeningHistoryTrackerOptions) {
  const snapshotRef = useRef<Snapshot>({
    mediaId: mediaId || null,
    title,
    artist,
    coverArt,
    currentTime,
    duration,
    sourceType,
    enabled,
    isPlaying,
  });
  const sessionRef = useRef<Session | null>(null);
  const lastMediaIdRef = useRef<string | null>(mediaId || null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    snapshotRef.current = {
      mediaId: mediaId || null,
      title,
      artist,
      coverArt,
      currentTime,
      duration,
      sourceType,
      enabled,
      isPlaying,
    };
    if (sessionRef.current && sessionRef.current.mediaId === (mediaId || null)) {
      sessionRef.current.lastPosition = currentTime;
      sessionRef.current.lastDuration = duration;
      sessionRef.current.title = title;
      sessionRef.current.artist = artist;
      sessionRef.current.coverArt = coverArt;
      sessionRef.current.sourceType = sourceType;
    }
  }, [artist, coverArt, currentTime, duration, enabled, isPlaying, mediaId, sourceType, title]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const flush = useCallback((forceCompleted = false, { keepalive = false } = {}) => {
    const session = sessionRef.current;
    if (!session) return;

    const payload = {
      mediaId: session.mediaId,
      sessionId: session.sessionId,
      sourceType: session.sourceType,
      startedAt: session.startedAt,
      currentTime: session.lastPosition,
      duration: session.lastDuration,
      completed: forceCompleted,
      mediaTitle: session.title,
      mediaArtist: session.artist,
      mediaCoverArt: session.coverArt,
      client: 'web' as const,
    };

    if (keepalive) {
      userAPI.trackListeningHistoryKeepalive(payload);
      return;
    }

    userAPI.trackListeningHistory(payload).catch((error) => {
      console.error('Failed to track listening history:', error);
    });
  }, []);

  const ensureSession = useCallback(() => {
    const snapshot = snapshotRef.current;
    if (!snapshot.enabled || !snapshot.mediaId) return false;
    if (!sessionRef.current || sessionRef.current.mediaId !== snapshot.mediaId) {
      sessionRef.current = {
        sessionId: createSessionId(snapshot.mediaId),
        startedAt: new Date().toISOString(),
        mediaId: snapshot.mediaId,
        title: snapshot.title,
        artist: snapshot.artist,
        coverArt: snapshot.coverArt,
        sourceType: snapshot.sourceType,
        lastPosition: snapshot.currentTime,
        lastDuration: snapshot.duration,
      };
    }
    return true;
  }, []);

  const endSession = useCallback((forceCompleted = false, keepalive = false) => {
    flush(forceCompleted, { keepalive });
    sessionRef.current = null;
    stopHeartbeat();
  }, [flush, stopHeartbeat]);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    heartbeatRef.current = setInterval(() => {
      if (snapshotRef.current.isPlaying) {
        flush(false);
      }
    }, HEARTBEAT_MS);
  }, [flush, stopHeartbeat]);

  useEffect(() => {
    const previousMediaId = lastMediaIdRef.current;
    const nextMediaId = mediaId || null;
    if (previousMediaId && previousMediaId !== nextMediaId) {
      endSession(false);
    }
    lastMediaIdRef.current = nextMediaId;
  }, [endSession, mediaId]);

  useEffect(() => {
    if (!enabled || !mediaId) {
      endSession(false);
      return undefined;
    }

    if (isPlaying) {
      const isNew = !sessionRef.current || sessionRef.current.mediaId !== mediaId;
      ensureSession();
      if (isNew) flush(false);
      startHeartbeat();
    } else {
      flush(false);
      stopHeartbeat();
    }

    return undefined;
  }, [enabled, ensureSession, endSession, flush, isPlaying, mediaId, startHeartbeat, stopHeartbeat]);

  useEffect(() => {
    const onHide = () => flush(false, { keepalive: true });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };

    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      stopHeartbeat();
      flush(false, { keepalive: true });
    };
  }, [flush, stopHeartbeat]);

  return {
    markCompleted: () => {
      ensureSession();
      endSession(true);
    },
  };
}
