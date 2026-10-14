import { Platform } from 'react-native';
import { EventEmitter, requireNativeModule } from 'expo-modules-core';
import { create } from 'zustand';
import { DEFAULT_COVER_ART } from '@/src/types/media';

export type NowPlayingMode = 'music' | 'podcast';

export type NowPlayingMeta = {
  title?: string | null;
  artist?: string | null;
  artworkUrl?: string | null;
  durationMs?: number | null;
  positionMs?: number | null;
  playbackRate?: number | null;
  isPlaying: boolean;
  mode: NowPlayingMode;
};

type NativeModule = {
  setNowPlaying: (params: {
    title: string;
    artist: string;
    albumTitle: string;
    artworkUrl?: string | null;
    duration: number;
    elapsed: number;
    playbackRate: number;
    isPlaying: boolean;
    mode: NowPlayingMode;
  }) => void;
  updateElapsed: (elapsed: number, duration: number, playbackRate: number) => void;
  clear: () => void;
  addListener?: (
    event: 'onCommand',
    listener: (event: {
      command: string;
      positionMs?: number;
      intervalMs?: number;
    }) => void
  ) => { remove: () => void };
};

function artworkUrl(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

let native: NativeModule | null | undefined;
let remoteWired = false;
let sessionId = 0;
let suppressRemoteUntil = 0;

type OwnerState = { mode: NowPlayingMode | null };

/** Which engine last took playback. UI and lock-screen commands follow this, not whichever queue still has items. */
export const usePlaybackOwner = create<OwnerState>(() => ({ mode: null }));

type ElapsedSnapshot = {
  mode: NowPlayingMode | null;
  isPlaying: boolean | null;
  elapsed: number;
  rate: number;
  at: number;
};

let elapsedSnapshot: ElapsedSnapshot = {
  mode: null,
  isPlaying: null,
  elapsed: 0,
  rate: 1,
  at: 0,
};

function resetElapsedSnapshot(mode: NowPlayingMode | null) {
  elapsedSnapshot = { mode, isPlaying: null, elapsed: 0, rate: 1, at: 0 };
}

/** Drop in-flight loads without changing which player the UI shows. */
export function bumpPlaybackSession(): number {
  sessionId += 1;
  resetElapsedSnapshot(getActivePlaybackMode());
  return sessionId;
}

export function claimPlaybackMode(mode: NowPlayingMode) {
  usePlaybackOwner.setState({ mode });
  resetElapsedSnapshot(mode);
}

export function startPlaybackSession(mode: NowPlayingMode): number {
  const id = bumpPlaybackSession();
  claimPlaybackMode(mode);
  return id;
}

export function isPlaybackSession(id: number): boolean {
  return id === sessionId;
}

export function getActivePlaybackMode(): NowPlayingMode | null {
  return usePlaybackOwner.getState().mode;
}

export function releasePlaybackOwner(mode: NowPlayingMode) {
  if (usePlaybackOwner.getState().mode === mode) {
    usePlaybackOwner.setState({ mode: null });
  }
}

/** Ignore lock-screen play echoes that iOS sends immediately after a pause. */
export function suppressRemoteCommands(ms = 800) {
  suppressRemoteUntil = Date.now() + ms;
}

export function remoteCommandsSuppressed(): boolean {
  return Date.now() < suppressRemoteUntil;
}

export function shownPlayback(
  mode: NowPlayingMode | null,
  hasEpisode: boolean,
  hasTrack: boolean
): 'podcast' | 'music' | null {
  if (mode === 'podcast') {
    if (hasEpisode) return 'podcast';
    if (hasTrack) return 'music';
    return null;
  }
  if (mode === 'music') {
    if (hasTrack) return 'music';
    if (hasEpisode) return 'podcast';
    return null;
  }
  if (hasEpisode) return 'podcast';
  if (hasTrack) return 'music';
  return null;
}

function getNative(): NativeModule | null {
  if (native !== undefined) return native;
  if (Platform.OS === 'web') {
    native = null;
    return native;
  }
  try {
    native = requireNativeModule('NowPlaying') as NativeModule;
  } catch {
    native = null;
  }
  return native;
}

export function ensureNowPlayingRemoteHandlers() {
  if (remoteWired) return;
  const module = getNative();
  if (!module?.addListener) return;
  remoteWired = true;
  try {
    const emitter = new EventEmitter(module);
    emitter.addListener('onCommand', (event) => {
      if (event.command === 'pause') suppressRemoteCommands();
      if (
        (event.command === 'play' || event.command === 'toggle') &&
        remoteCommandsSuppressed()
      ) {
        return;
      }
      void handleRemoteCommand(event);
    });
  } catch {
    remoteWired = false;
  }
}

async function handleRemoteCommand(event: {
  command: string;
  positionMs?: number;
  intervalMs?: number;
}) {
  if (
    (event.command === 'play' || event.command === 'toggle') &&
    remoteCommandsSuppressed()
  ) {
    return;
  }

  const { useMusicPlayerStore } = await import('@/src/stores/musicPlayerStore');
  const { usePodcastPlayerStore } = await import('@/src/stores/podcastPlayerStore');
  const podcast = usePodcastPlayerStore.getState();
  const music = useMusicPlayerStore.getState();
  const mode = getActivePlaybackMode();
  const usePodcast =
    mode === 'podcast'
      ? podcast.queue.length > 0
      : mode === 'music'
        ? false
        : podcast.queue.length > 0;
  const target = usePodcast ? podcast : music;
  if (!target.queue.length) return;

  switch (event.command) {
    case 'play':
      await target.play();
      return;
    case 'pause':
      suppressRemoteCommands();
      await target.pause();
      return;
    case 'toggle':
      if (target.isPlaying) {
        suppressRemoteCommands();
        await target.pause();
      } else {
        await target.play();
      }
      return;
    case 'next':
      await target.next();
      return;
    case 'previous':
      await target.previous();
      return;
    case 'seek':
      if (typeof event.positionMs === 'number') await target.seek(event.positionMs);
      return;
    case 'skipForward':
      if (usePodcast) await podcast.skipBy(event.intervalMs ?? 30_000);
      else await music.seek((music.positionMs || 0) + (event.intervalMs ?? 30_000));
      return;
    case 'skipBack':
      if (usePodcast) await podcast.skipBy(-(event.intervalMs ?? 15_000));
      else await music.seek(Math.max(0, (music.positionMs || 0) - (event.intervalMs ?? 15_000)));
      return;
    default:
      return;
  }
}

export function setNowPlaying(meta: NowPlayingMeta) {
  if (getActivePlaybackMode() !== meta.mode) return;
  const module = getNative();
  if (!module) return;
  ensureNowPlayingRemoteHandlers();
  const duration = Math.max(0, (meta.durationMs ?? 0) / 1000);
  const elapsed = Math.max(0, (meta.positionMs ?? 0) / 1000);
  const rate = meta.isPlaying ? meta.playbackRate || 1 : 0;
  elapsedSnapshot = {
    mode: meta.mode,
    isPlaying: meta.isPlaying,
    elapsed,
    rate,
    at: Date.now(),
  };
  module.setNowPlaying({
    title: meta.title?.trim() || 'Tuneable',
    artist: meta.artist?.trim() || '',
    albumTitle: 'Tuneable',
    artworkUrl: artworkUrl(meta.artworkUrl) || DEFAULT_COVER_ART,
    duration,
    elapsed,
    playbackRate: meta.isPlaying ? rate || 1 : 0,
    isPlaying: meta.isPlaying,
    mode: meta.mode,
  });
}

export function updateNowPlayingElapsed(meta: {
  positionMs?: number | null;
  durationMs?: number | null;
  playbackRate?: number | null;
  isPlaying: boolean;
  mode: NowPlayingMode;
}) {
  if (getActivePlaybackMode() !== meta.mode) return;
  const module = getNative();
  if (!module) return;
  const duration = Math.max(0, (meta.durationMs ?? 0) / 1000);
  const elapsed = Math.max(0, (meta.positionMs ?? 0) / 1000);
  const rate = meta.isPlaying ? meta.playbackRate || 1 : 0;
  const now = Date.now();
  const playingChanged = elapsedSnapshot.isPlaying !== meta.isPlaying;
  const rateChanged = Math.abs(elapsedSnapshot.rate - rate) > 0.01;
  const jumped = Math.abs(elapsed - elapsedSnapshot.elapsed) > 2;
  const stale = now - elapsedSnapshot.at > 5000;
  if (!playingChanged && !rateChanged && !jumped && !(meta.isPlaying && stale)) return;
  elapsedSnapshot = { mode: meta.mode, isPlaying: meta.isPlaying, elapsed, rate, at: now };
  module.updateElapsed(elapsed, duration, rate);
}

export function clearNowPlaying() {
  getNative()?.clear();
}
