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
}

const COMPLETION_THRESHOLD = 0.9;

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
  });
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const flushedSessionIdsRef = useRef<Set<string>>(new Set());

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
    };
  }, [artist, coverArt, currentTime, duration, enabled, mediaId, sourceType, title]);

  const flush = useCallback((forceCompleted = false) => {
    const snapshot = snapshotRef.current;
    const sessionId = sessionIdRef.current;
    const startedAt = startedAtRef.current;

    if (!snapshot.enabled || !snapshot.mediaId || !sessionId || !startedAt) {
      return;
    }

    if (flushedSessionIdsRef.current.has(sessionId)) {
      return;
    }

    const completionRatio = snapshot.duration > 0 ? snapshot.currentTime / snapshot.duration : 0;
    const completed = forceCompleted || completionRatio >= COMPLETION_THRESHOLD;

    flushedSessionIdsRef.current.add(sessionId);

    userAPI.trackListeningHistory({
      mediaId: snapshot.mediaId,
      sessionId,
      sourceType: snapshot.sourceType,
      startedAt,
      currentTime: snapshot.currentTime,
      duration: snapshot.duration,
      completed,
      mediaTitle: snapshot.title,
      mediaArtist: snapshot.artist,
      mediaCoverArt: snapshot.coverArt,
    }).catch((error) => {
      console.error('Failed to track listening history:', error);
    });
  }, []);

  useEffect(() => {
    if (!enabled || !mediaId) {
      sessionIdRef.current = null;
      startedAtRef.current = null;
      return undefined;
    }

    sessionIdRef.current = createSessionId(mediaId);
    startedAtRef.current = new Date().toISOString();

    return () => {
      flush(false);
    };
  }, [enabled, flush, mediaId]);

  return {
    markCompleted: () => flush(true),
  };
}
