import type { AudioStatus } from 'expo-audio';
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
  isPlaybackFailed,
  lockScreenArtworkUrl,
  ManagedAudioPlayer,
  statusMillis,
} from '@/src/lib/managedAudioPlayer';
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

const audio = new ManagedAudioPlayer();
let consecutiveLoadFailures = 0;
let skipAfterFailureInFlight = false;
let skipNoticeShown = false;
let finishingEpisode = false;

function getStore(): PodcastPlayerState {
  return usePodcastPlayerStore.getState();
}

function applyPlaybackRate() {
  audio.setPlaybackRate(getStore().playbackRate);
}

function noticeSkipOnce(message: string) {
  if (skipNoticeShown) return;
  skipNoticeShown = true;
  showToast(message);
}

function lockScreenMeta(item: PodcastEpisode) {
  return {
    title: item.title?.trim() || 'Episode',
    artist: seriesTitle(item),
    albumTitle: 'Tuneable',
    artworkUrl: lockScreenArtworkUrl(episodeCoverArt(item)),
  };
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

function onStatus(status: AudioStatus) {
  if (isPlaybackFailed(status)) {
    void skipAfterFailure(status.playbackState || 'Failed to load audio');
    return;
  }

  consecutiveLoadFailures = 0;
  skipNoticeShown = false;
  const { positionMs, durationMs } = statusMillis(status);
  usePodcastPlayerStore.setState({
    isPlaying: status.playing,
    isLoading: status.isBuffering || !status.isLoaded,
    positionMs,
    durationMs: durationMs || getStore().durationMs,
    error: null,
  });

  const item = getStore().queue[getStore().currentIndex];
  if (item) {
    syncListeningHistory({
      mediaId: episodeId(item),
      title: item.title,
      artist: seriesTitle(item),
      coverArt:
        item.coverArt ||
        (typeof item.podcastSeries === 'object' ? item.podcastSeries?.coverArt : undefined),
      currentTime: positionMs / 1000,
      duration: (durationMs || (item.duration ?? 0) * 1000) / 1000,
      sourceType: 'direct',
      isPlaying: status.playing,
    });
  }

  if (status.didJustFinish) {
    if (finishingEpisode) return;
    finishingEpisode = true;
    completeListeningHistory();
    void getStore()
      .next()
      .finally(() => {
        finishingEpisode = false;
      });
  }
}

async function loadAndPlay(item: PodcastEpisode) {
  const uri = getEpisodeAudioUrl(item);
  if (!uri) {
    await skipAfterFailure('No audio URL for this episode');
    return;
  }

  await endListeningHistorySession();
  finishingEpisode = false;

  usePodcastPlayerStore.setState({
    isLoading: true,
    positionMs: 0,
    durationMs: (item.duration ?? 0) * 1000,
    error: null,
  });

  try {
    await audio.loadAndPlay({
      uri,
      metadata: lockScreenMeta(item),
      lockScreen: { showSeekBackward: true, showSeekForward: true },
      onStatus,
      playbackRate: getStore().playbackRate,
    });
    applyPlaybackRate();
  } catch (err) {
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
    const { useMusicPlayerStore } = await import('./musicPlayerStore');
    await useMusicPlayerStore.getState().clear();

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
    await loadAndPlay(playable[playIndex]);
  },

  play: async () => {
    if (!audio.isReady) {
      const item = get().queue[get().currentIndex];
      if (item) await loadAndPlay(item);
      return;
    }
    audio.play();
  },

  pause: async () => {
    audio.pause();
  },

  togglePlayPause: async () => {
    if (get().isPlaying) await get().pause();
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
    set({ currentIndex: nextIndex });
    await loadAndPlay(queue[nextIndex]);
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
    set({ currentIndex: prevIndex });
    await loadAndPlay(queue[prevIndex]);
  },

  seek: async (positionMs) => {
    await audio.seekToSeconds(Math.max(0, positionMs) / 1000);
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
    applyPlaybackRate();
  },

  clear: async () => {
    endListeningHistorySession();
    audio.release();
    consecutiveLoadFailures = 0;
    skipNoticeShown = false;
    finishingEpisode = false;
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
