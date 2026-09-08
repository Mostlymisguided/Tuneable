import { AppState, type AppStateStatus } from 'react-native';
import { getAuthToken } from '@/src/api/client';
import { userAPI } from '@/src/api/user';

export type ListeningSourceType =
  | 'user_queue'
  | 'library'
  | 'party'
  | 'search'
  | 'profile'
  | 'direct'
  | 'unknown';

export type ListeningHistorySyncInput = {
  mediaId?: string | null;
  title?: string;
  artist?: string;
  coverArt?: string;
  currentTime: number;
  duration: number;
  sourceType?: ListeningSourceType;
  isPlaying: boolean;
};

type Session = {
  sessionId: string;
  startedAt: string;
  mediaId: string;
  title: string;
  artist: string;
  coverArt: string;
  sourceType: ListeningSourceType;
  lastPosition: number;
  lastDuration: number;
};

const HEARTBEAT_MS = 15_000;

let session: Session | null = null;
let lastIsPlaying = false;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;

function createSessionId(mediaId: string) {
  return `${mediaId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function stopHeartbeat() {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeat = setInterval(() => {
    if (lastIsPlaying) flush(false);
  }, HEARTBEAT_MS);
}

function flush(completed: boolean) {
  if (!session || !getAuthToken()) return;
  const payload = {
    mediaId: session.mediaId,
    sessionId: session.sessionId,
    sourceType: session.sourceType,
    startedAt: session.startedAt,
    currentTime: session.lastPosition,
    duration: session.lastDuration,
    completed,
    mediaTitle: session.title,
    mediaArtist: session.artist,
    mediaCoverArt: session.coverArt,
    client: 'mobile' as const,
  };
  userAPI.trackListeningHistory(payload).catch(() => {});
}

function applyProgress(input: ListeningHistorySyncInput) {
  if (!session || session.mediaId !== input.mediaId) return;
  session.lastPosition = input.currentTime;
  session.lastDuration = input.duration;
  session.title = input.title || session.title;
  session.artist = input.artist || session.artist;
  session.coverArt = input.coverArt || session.coverArt;
}

function ensureSession(input: ListeningHistorySyncInput) {
  if (!input.mediaId) return;
  if (!session || session.mediaId !== input.mediaId) {
    session = {
      sessionId: createSessionId(input.mediaId),
      startedAt: new Date().toISOString(),
      mediaId: input.mediaId,
      title: input.title || '',
      artist: input.artist || '',
      coverArt: input.coverArt || '',
      sourceType: input.sourceType || 'direct',
      lastPosition: input.currentTime,
      lastDuration: input.duration,
    };
  }
}

export function syncListeningHistory(input: ListeningHistorySyncInput) {
  if (!getAuthToken() || !input.mediaId) {
    if (session) {
      flush(false);
      session = null;
      stopHeartbeat();
    }
    lastIsPlaying = false;
    return;
  }

  if (session && session.mediaId !== input.mediaId) {
    flush(false);
    session = null;
    stopHeartbeat();
    lastIsPlaying = false;
  }

  const playingBecameTrue = input.isPlaying && !lastIsPlaying;
  const playingBecameFalse = !input.isPlaying && lastIsPlaying;
  lastIsPlaying = input.isPlaying;

  if (input.isPlaying) {
    const startedNew = !session || session.mediaId !== input.mediaId;
    ensureSession(input);
    applyProgress(input);
    if (startedNew || playingBecameTrue) {
      flush(false);
      startHeartbeat();
    }
  } else if (playingBecameFalse) {
    applyProgress(input);
    flush(false);
    stopHeartbeat();
  } else {
    applyProgress(input);
  }
}

export function completeListeningHistory() {
  if (!session) return;
  flush(true);
  session = null;
  lastIsPlaying = false;
  stopHeartbeat();
}

export function endListeningHistorySession() {
  if (!session) return;
  flush(false);
  session = null;
  lastIsPlaying = false;
  stopHeartbeat();
}

function onAppStateChange(next: AppStateStatus) {
  if (next !== 'active' && session) {
    flush(false);
  }
}

if (!appStateSubscription) {
  appStateSubscription = AppState.addEventListener('change', onAppStateChange);
}
