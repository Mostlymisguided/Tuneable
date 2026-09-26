import { Platform } from 'react-native';
import { EventEmitter, requireNativeModule } from 'expo-modules-core';
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
  const { useMusicPlayerStore } = await import('@/src/stores/musicPlayerStore');
  const { usePodcastPlayerStore } = await import('@/src/stores/podcastPlayerStore');
  const podcast = usePodcastPlayerStore.getState();
  const music = useMusicPlayerStore.getState();
  if (podcast.queue.length) {
    switch (event.command) {
      case 'play':
        await podcast.play();
        return;
      case 'pause':
        await podcast.pause();
        return;
      case 'toggle':
        await podcast.togglePlayPause();
        return;
      case 'next':
        await podcast.next();
        return;
      case 'previous':
        await podcast.previous();
        return;
      case 'seek':
        if (typeof event.positionMs === 'number') await podcast.seek(event.positionMs);
        return;
      case 'skipForward':
        await podcast.skipBy(event.intervalMs ?? 30_000);
        return;
      case 'skipBack':
        await podcast.skipBy(-(event.intervalMs ?? 15_000));
        return;
      default:
        return;
    }
  }

  if (!music.queue.length) return;
  switch (event.command) {
    case 'play':
      await music.play();
      break;
    case 'pause':
      await music.pause();
      break;
    case 'toggle':
      await music.togglePlayPause();
      break;
    case 'next':
      await music.next();
      break;
    case 'previous':
      await music.previous();
      break;
    case 'seek':
      if (typeof event.positionMs === 'number') await music.seek(event.positionMs);
      break;
    case 'skipForward':
      await music.seek((music.positionMs || 0) + (event.intervalMs ?? 30_000));
      break;
    case 'skipBack':
      await music.seek(Math.max(0, (music.positionMs || 0) - (event.intervalMs ?? 15_000)));
      break;
    default:
      break;
  }
}

export function setNowPlaying(meta: NowPlayingMeta) {
  const module = getNative();
  if (!module) return;
  ensureNowPlayingRemoteHandlers();
  const duration = Math.max(0, (meta.durationMs ?? 0) / 1000);
  const elapsed = Math.max(0, (meta.positionMs ?? 0) / 1000);
  const rate = meta.isPlaying ? meta.playbackRate || 1 : 0;
  module.setNowPlaying({
    title: meta.title?.trim() || 'Tuneable',
    artist: meta.artist?.trim() || '',
    albumTitle: 'Tuneable',
    artworkUrl: artworkUrl(meta.artworkUrl) || DEFAULT_COVER_ART,
    duration,
    elapsed,
    playbackRate: rate || 1,
    isPlaying: meta.isPlaying,
    mode: meta.mode,
  });
}

export function updateNowPlayingElapsed(meta: {
  positionMs?: number | null;
  durationMs?: number | null;
  playbackRate?: number | null;
  isPlaying: boolean;
}) {
  const module = getNative();
  if (!module) return;
  const duration = Math.max(0, (meta.durationMs ?? 0) / 1000);
  const elapsed = Math.max(0, (meta.positionMs ?? 0) / 1000);
  const rate = meta.isPlaying ? meta.playbackRate || 1 : 0;
  module.updateElapsed(elapsed, duration, rate);
}

export function clearNowPlaying() {
  getNative()?.clear();
}
