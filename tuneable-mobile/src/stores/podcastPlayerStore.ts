import { Audio, type AVPlaybackStatus } from 'expo-av';
import { create } from 'zustand';
import type { PodcastEpisode } from '@/src/types/podcast';
import {
  PODCAST_NO_PLAYABLE,
  PODCAST_UNPLAYABLE_SKIP,
} from '@/src/lib/playbackMessages';
import {
  nextPlaybackSpeed,
  PODCAST_SKIP_BACK_MS,
  PODCAST_SKIP_FORWARD_MS,
} from '@/src/lib/playbackAudio';
import {
  episodeCoverArt,
  episodeId,
  getEpisodeAudioUrl,
  isEpisodePlayable,
  seriesTitle,
} from '@/src/lib/podcast';
import {
  clearNowPlaying,
  ensureNowPlayingRemoteHandlers,
  bumpPlaybackSession,
  claimPlaybackMode,
  getActivePlaybackMode,
  isPlaybackSession,
  releasePlaybackOwner,
  setNowPlaying,
  startPlaybackSession,
  suppressRemoteCommands,
  updateNowPlayingElapsed,
} from '@/src/lib/nowPlaying';
import { showToast } from '@/src/stores/toastStore';
import {
  completeListeningHistory,
  endListeningHistorySession,
  syncListeningHistory,
} from '@/src/lib/listeningHistoryTracker';

type PodcastPlayerState = {
  queue: PodcastEpisode[];
  currentIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  playbackRate: number;
  error: string | null;
  setQueueAndPlay: (items: PodcastEpisode[], startIndex?: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  skipBy: (deltaMs: number) => Promise<void>;
  skipBack: () => Promise<void>;
  skipForward: () => Promise<void>;
  cyclePlaybackRate: () => Promise<void>;
  clear: () => Promise<void>;
};

let sound: Audio.Sound | null = null;
let audioModeReady = false;
let wantsPlay = false;
let loadedItem: PodcastEpisode | null = null;
let consecutiveLoadFailures = 0;
let skipAfterFailureInFlight = false;
let skipNoticeShown = false;

async function ensureAudioMode() {
  if (audioModeReady) return;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
  audioModeReady = true;
  ensureNowPlayingRemoteHandlers();
}

async function unloadSound() {
  const current = sound;
  sound = null;
  if (!current) return;
  try {
    current.setOnPlaybackStatusUpdate(null);
  } catch {
    // ignore
  }
  try {
    await current.stopAsync();
  } catch {
    // ignore
  }
  try {
    await current.unloadAsync();
  } catch {
    // ignore
  }
}

function publishTransport(isPlaying: boolean, positionMs = 0) {
  const item = loadedItem;
  if (!item || getActivePlaybackMode() !== 'podcast') return;
  updateNowPlayingElapsed({
    positionMs,
    durationMs: getStore().durationMs || (item.duration ?? 0) * 1000,
    playbackRate: getStore().playbackRate,
    isPlaying,
    mode: 'podcast',
  });
}

function getStore(): PodcastPlayerState {
  return usePodcastPlayerStore.getState();
}

async function applyPlaybackRate() {
  if (!sound) return;
  const rate = getStore().playbackRate;
  try {
    await sound.setRateAsync(rate, true);
  } catch {
    // ignore
  }
}

function noticeSkipOnce(message: string) {
  if (skipNoticeShown) return;
  skipNoticeShown = true;
  showToast(message);
}

function findNextPlayableInList(
  items: PodcastEpisode[],
  fromIndex: number
): PodcastEpisode | null {
  if (!items.length) return null;
  for (let step = 1; step <= items.length; step++) {
    const candidate = items[(fromIndex + step) % items.length];
    if (isEpisodePlayable(candidate)) return candidate;
  }
  return null;
}

async function skipAfterFailure(reason: string) {
  if (skipAfterFailureInFlight) return;
  skipAfterFailureInFlight = true;
  try {
    const { queue, currentIndex } = getStore();
    consecutiveLoadFailures += 1;
    usePodcastPlayerStore.setState({
      error: reason,
      isPlaying: false,
      isLoading: false,
    });

    const noAudio = reason === 'No audio URL for this episode';
    const hasNext = findPlayableIndex(queue, currentIndex, 1) >= 0;
    const exhausted =
      queue.length === 0 || consecutiveLoadFailures > queue.length || !hasNext;

    if (exhausted) {
      consecutiveLoadFailures = 0;
      wantsPlay = false;
      if (noAudio || queue.length === 0) {
        showToast(PODCAST_NO_PLAYABLE);
      }
      return;
    }

    if (noAudio) {
      noticeSkipOnce(PODCAST_UNPLAYABLE_SKIP);
    }

    await getStore().next();
  } finally {
    skipAfterFailureInFlight = false;
  }
}

function onStatus(session: number, status: AVPlaybackStatus) {
  if (!isPlaybackSession(session)) return;
  if (!status.isLoaded) {
    if (status.error && wantsPlay) {
      void skipAfterFailure(status.error);
    }
    return;
  }

  if (status.isPlaying && !wantsPlay) {
    void sound?.pauseAsync().catch(() => {});
    usePodcastPlayerStore.setState({
      isPlaying: false,
      isLoading: false,
      positionMs: status.positionMillis ?? 0,
      durationMs: status.durationMillis ?? getStore().durationMs,
    });
    publishTransport(false, status.positionMillis ?? 0);
    return;
  }

  const playing = wantsPlay && status.isPlaying;
  consecutiveLoadFailures = 0;
  skipNoticeShown = false;
  usePodcastPlayerStore.setState({
    isPlaying: playing,
    isLoading: wantsPlay ? status.isBuffering : false,
    positionMs: status.positionMillis ?? 0,
    durationMs: status.durationMillis ?? 0,
    error: null,
  });

  const item = loadedItem;
  if (item) {
    syncListeningHistory({
      mediaId: episodeId(item),
      title: item.title,
      artist: seriesTitle(item),
      coverArt: item.coverArt || (typeof item.podcastSeries === 'object' ? item.podcastSeries?.coverArt : undefined),
      currentTime: (status.positionMillis ?? 0) / 1000,
      duration: (status.durationMillis || (item.duration ?? 0) * 1000) / 1000,
      sourceType: 'direct',
      isPlaying: playing,
    });
    updateNowPlayingElapsed({
      positionMs: status.positionMillis ?? 0,
      durationMs: status.durationMillis ?? (item.duration ?? 0) * 1000,
      playbackRate: getStore().playbackRate,
      isPlaying: playing,
      mode: 'podcast',
    });
  }

  if (status.didJustFinish && !status.isLooping && wantsPlay) {
    completeListeningHistory();
    void getStore().next();
  }
}

async function loadAndPlay(item: PodcastEpisode, session = startPlaybackSession('podcast')) {
  if (!isPlaybackSession(session)) return;
  wantsPlay = true;
  loadedItem = item;
  const uri = getEpisodeAudioUrl(item);
  if (!uri) {
    await skipAfterFailure('No audio URL for this episode');
    return;
  }

  endListeningHistorySession();
  await ensureAudioMode();
  await unloadSound();
  if (!isPlaybackSession(session) || !wantsPlay) return;

  usePodcastPlayerStore.setState({
    isLoading: true,
    isPlaying: false,
    positionMs: 0,
    durationMs: (item.duration ?? 0) * 1000,
    error: null,
  });

  try {
    const created = await Audio.Sound.createAsync(
      { uri },
      {
        shouldPlay: false,
        progressUpdateIntervalMillis: 500,
        rate: getStore().playbackRate,
        shouldCorrectPitch: true,
      },
      (status) => onStatus(session, status)
    );
    if (!isPlaybackSession(session) || !wantsPlay) {
      try {
        created.sound.setOnPlaybackStatusUpdate(null);
        await created.sound.unloadAsync();
      } catch {
        // stale load
      }
      return;
    }
    const player = created.sound;
    sound = player;
    loadedItem = item;
    await applyPlaybackRate();
    if (!isPlaybackSession(session) || !wantsPlay) {
      await unloadSound();
      return;
    }
    setNowPlaying({
      title: item.title,
      artist: seriesTitle(item),
      artworkUrl: episodeCoverArt(item),
      durationMs: getStore().durationMs,
      positionMs: 0,
      playbackRate: getStore().playbackRate,
      isPlaying: true,
      mode: 'podcast',
    });
    await player.playAsync();
    if (!isPlaybackSession(session) || !wantsPlay) {
      await player.pauseAsync().catch(() => {});
    }
  } catch (err) {
    if (!isPlaybackSession(session) || !wantsPlay) return;
    const message = err instanceof Error ? err.message : 'Failed to load audio';
    await skipAfterFailure(message);
  }
}

function findPlayableIndex(
  queue: PodcastEpisode[],
  fromIndex: number,
  direction: 1 | -1
): number {
  let i = fromIndex + direction;
  while (i >= 0 && i < queue.length) {
    if (isEpisodePlayable(queue[i])) return i;
    i += direction;
  }
  return -1;
}

export const usePodcastPlayerStore = create<PodcastPlayerState>((set, get) => ({
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  isLoading: false,
  positionMs: 0,
  durationMs: 0,
  playbackRate: 1,
  error: null,

  setQueueAndPlay: async (items, startIndex = 0) => {
    const session = bumpPlaybackSession();
    const { useMusicPlayerStore } = await import('./musicPlayerStore');
    await useMusicPlayerStore.getState().clear();
    if (!isPlaybackSession(session)) return;
    claimPlaybackMode('podcast');

    if (!items.length) {
      set({ error: PODCAST_NO_PLAYABLE, queue: [], isPlaying: false });
      showToast(PODCAST_NO_PLAYABLE);
      return;
    }

    const clampedStart = Math.max(
      0,
      Math.min(startIndex, items.length - 1)
    );
    const playable = items.filter(isEpisodePlayable);
    if (!playable.length) {
      set({ error: PODCAST_NO_PLAYABLE, queue: [], isPlaying: false });
      showToast(PODCAST_NO_PLAYABLE);
      return;
    }

    const requested = items[clampedStart];
    const requestedPlayable = isEpisodePlayable(requested);
    let target = requestedPlayable ? requested : null;

    if (!target) {
      target = findNextPlayableInList(items, clampedStart);
      if (target) {
        noticeSkipOnce(PODCAST_UNPLAYABLE_SKIP);
      }
    }

    if (!target) {
      set({ error: PODCAST_NO_PLAYABLE, queue: [], isPlaying: false });
      showToast(PODCAST_NO_PLAYABLE);
      return;
    }

    const index = playable.findIndex((e) => episodeId(e) === episodeId(target));
    const playIndex = index >= 0 ? index : 0;

    consecutiveLoadFailures = 0;
    if (requestedPlayable) skipNoticeShown = false;
    set({ queue: playable, currentIndex: playIndex, error: null });
    await loadAndPlay(playable[playIndex], session);
  },

  play: async () => {
    wantsPlay = true;
    set({ isPlaying: true });
    const player = sound;
    if (!player) {
      const item = get().queue[get().currentIndex];
      if (item) await loadAndPlay(item);
      else set({ isPlaying: false });
      return;
    }
    await player.playAsync();
    if (!wantsPlay) {
      await player.pauseAsync().catch(() => {});
      set({ isPlaying: false, isLoading: false });
    }
  },

  pause: async () => {
    wantsPlay = false;
    suppressRemoteCommands();
    set({ isPlaying: false, isLoading: false });
    if (sound) {
      try {
        await sound.pauseAsync();
      } catch {
        // already stopped
      }
    }
    publishTransport(false, get().positionMs);
  },

  togglePlayPause: async () => {
    if (wantsPlay) await get().pause();
    else await get().play();
  },

  next: async () => {
    const { queue, currentIndex } = get();
    const nextIndex = findPlayableIndex(queue, currentIndex, 1);
    if (nextIndex < 0) {
      await get().pause();
      set({ isPlaying: false });
      consecutiveLoadFailures = 0;
      return;
    }
    const session = startPlaybackSession('podcast');
    set({ currentIndex: nextIndex });
    await loadAndPlay(queue[nextIndex], session);
  },

  previous: async () => {
    const { queue, currentIndex, positionMs } = get();
    if (positionMs > 3000) {
      await get().seek(0);
      return;
    }
    const prevIndex = findPlayableIndex(queue, currentIndex, -1);
    if (prevIndex < 0) {
      await get().seek(0);
      return;
    }
    const session = startPlaybackSession('podcast');
    set({ currentIndex: prevIndex });
    await loadAndPlay(queue[prevIndex], session);
  },

  seek: async (positionMs) => {
    if (!sound) return;
    await sound.setPositionAsync(Math.max(0, positionMs));
  },

  skipBy: async (deltaMs) => {
    const { positionMs, durationMs } = get();
    const next = Math.max(0, Math.min(durationMs || Infinity, positionMs + deltaMs));
    await get().seek(next);
  },

  skipBack: async () => {
    await get().skipBy(-PODCAST_SKIP_BACK_MS);
  },

  skipForward: async () => {
    await get().skipBy(PODCAST_SKIP_FORWARD_MS);
  },

  cyclePlaybackRate: async () => {
    const next = nextPlaybackSpeed(get().playbackRate);
    set({ playbackRate: next });
    await applyPlaybackRate();
    const { positionMs, durationMs, isPlaying } = get();
    updateNowPlayingElapsed({
      positionMs,
      durationMs,
      playbackRate: next,
      isPlaying,
      mode: 'podcast',
    });
  },

  clear: async () => {
    wantsPlay = false;
    loadedItem = null;
    endListeningHistorySession();
    await unloadSound();
    if (getActivePlaybackMode() === 'podcast') {
      clearNowPlaying();
      releasePlaybackOwner('podcast');
    }
    consecutiveLoadFailures = 0;
    skipNoticeShown = false;
    set({
      queue: [],
      currentIndex: 0,
      isPlaying: false,
      isLoading: false,
      positionMs: 0,
      durationMs: 0,
      error: null,
    });
  },
}));

export function useCurrentEpisode(): PodcastEpisode | null {
  return usePodcastPlayerStore((s) => s.queue[s.currentIndex] ?? null);
}
