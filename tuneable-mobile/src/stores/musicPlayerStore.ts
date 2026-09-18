import type { AudioStatus } from 'expo-audio';
import { create } from 'zustand';
import type { ChartMediaItem } from '@/src/types/media';
import {
  MUSIC_NO_PLAYABLE,
  MUSIC_UNPLAYABLE_SKIP,
} from '@/src/lib/playbackMessages';
import { getUploadUrl, isUploadPlayable, mediaId, getCreatorDisplay } from '@/src/lib/media';
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

type MusicPlayerState = {
  queue: ChartMediaItem[];
  currentIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
  setQueueAndPlay: (items: ChartMediaItem[], startIndex?: number) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  clear: () => Promise<void>;
};

const audio = new ManagedAudioPlayer();
/** Guard against skip loops when many consecutive tracks fail to load. */
let consecutiveLoadFailures = 0;
let skipAfterFailureInFlight = false;
/** Only toast once per unbroken skip streak (user-selected or load failure). */
let skipNoticeShown = false;
let finishingTrack = false;

function getStore(): MusicPlayerState {
  return useMusicPlayerStore.getState();
}

function noticeSkipOnce(message: string) {
  if (skipNoticeShown) return;
  skipNoticeShown = true;
  showToast(message);
}

function lockScreenMeta(item: ChartMediaItem) {
  return {
    title: item.title?.trim() || 'Tuneable',
    artist: getCreatorDisplay(item),
    albumTitle: 'Tuneable',
    artworkUrl: lockScreenArtworkUrl(item.coverArt),
  };
}

/** Next playable item after `fromIndex` in list order (wraps). */
function findNextPlayableInList(
  items: ChartMediaItem[],
  fromIndex: number
): ChartMediaItem | null {
  if (!items.length) return null;
  for (let step = 1; step <= items.length; step++) {
    const candidate = items[(fromIndex + step) % items.length];
    if (isUploadPlayable(candidate)) return candidate;
  }
  return null;
}

async function skipAfterFailure(reason: string) {
  if (skipAfterFailureInFlight) return;
  skipAfterFailureInFlight = true;
  try {
    const { queue, currentIndex } = getStore();
    consecutiveLoadFailures += 1;
    useMusicPlayerStore.setState({
      error: reason,
      isPlaying: false,
      isLoading: false,
    });

    const noAudio = reason === 'No upload audio for this track';
    const hasNext = findPlayableIndex(queue, currentIndex, 1) >= 0;
    const exhausted =
      queue.length === 0 || consecutiveLoadFailures > queue.length || !hasNext;

    if (exhausted) {
      consecutiveLoadFailures = 0;
      if (noAudio || queue.length === 0) {
        showToast(MUSIC_NO_PLAYABLE);
      }
      return;
    }

    if (noAudio) {
      noticeSkipOnce(MUSIC_UNPLAYABLE_SKIP);
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
  useMusicPlayerStore.setState({
    isPlaying: status.playing,
    isLoading: status.isBuffering || !status.isLoaded,
    positionMs,
    durationMs: durationMs || getStore().durationMs,
    error: null,
  });

  const item = getStore().queue[getStore().currentIndex];
  if (item) {
    syncListeningHistory({
      mediaId: mediaId(item),
      title: item.title,
      artist: getCreatorDisplay(item),
      coverArt: item.coverArt,
      currentTime: positionMs / 1000,
      duration: (durationMs || (item.duration ?? 0) * 1000) / 1000,
      sourceType: 'direct',
      isPlaying: status.playing,
    });
  }

  if (status.didJustFinish) {
    if (finishingTrack) return;
    finishingTrack = true;
    completeListeningHistory();
    void getStore()
      .next()
      .finally(() => {
        finishingTrack = false;
      });
  }
}

async function loadAndPlay(item: ChartMediaItem) {
  const uri = getUploadUrl(item);
  if (!uri) {
    await skipAfterFailure('No upload audio for this track');
    return;
  }

  endListeningHistorySession();
  finishingTrack = false;

  useMusicPlayerStore.setState({
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load audio';
    await skipAfterFailure(message);
  }
}

function findPlayableIndex(
  queue: ChartMediaItem[],
  fromIndex: number,
  direction: 1 | -1
): number {
  let i = fromIndex + direction;
  while (i >= 0 && i < queue.length) {
    if (isUploadPlayable(queue[i])) return i;
    i += direction;
  }
  return -1;
}

export const useMusicPlayerStore = create<MusicPlayerState>((set, get) => ({
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  isLoading: false,
  positionMs: 0,
  durationMs: 0,
  error: null,

  setQueueAndPlay: async (items, startIndex = 0) => {
    const { usePodcastPlayerStore } = await import('./podcastPlayerStore');
    await usePodcastPlayerStore.getState().clear();

    if (!items.length) {
      set({ error: MUSIC_NO_PLAYABLE, queue: [], isPlaying: false });
      showToast(MUSIC_NO_PLAYABLE);
      return;
    }

    const clampedStart = Math.max(
      0,
      Math.min(startIndex, items.length - 1)
    );
    const playable = items.filter(isUploadPlayable);
    if (!playable.length) {
      set({ error: MUSIC_NO_PLAYABLE, queue: [], isPlaying: false });
      showToast(MUSIC_NO_PLAYABLE);
      return;
    }

    const requested = items[clampedStart];
    const requestedPlayable = isUploadPlayable(requested);
    let target = requestedPlayable ? requested : null;

    if (!target) {
      target = findNextPlayableInList(items, clampedStart);
      if (target) {
        noticeSkipOnce(MUSIC_UNPLAYABLE_SKIP);
      }
    }

    if (!target) {
      set({ error: MUSIC_NO_PLAYABLE, queue: [], isPlaying: false });
      showToast(MUSIC_NO_PLAYABLE);
      return;
    }

    const index = playable.findIndex((m) => mediaId(m) === mediaId(target));
    const playIndex = index >= 0 ? index : 0;

    consecutiveLoadFailures = 0;
    if (requestedPlayable) skipNoticeShown = false;
    set({ queue: playable, currentIndex: playIndex, error: null });
    await loadAndPlay(playable[playIndex]);
  },

  play: async () => {
    if (!audio.isReady) {
      const { queue, currentIndex } = get();
      const item = queue[currentIndex];
      if (item) await loadAndPlay(item);
      return;
    }
    audio.play();
  },

  pause: async () => {
    audio.pause();
  },

  togglePlayPause: async () => {
    if (get().isPlaying) {
      await get().pause();
    } else {
      await get().play();
    }
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

  clear: async () => {
    endListeningHistorySession();
    audio.release();
    consecutiveLoadFailures = 0;
    skipNoticeShown = false;
    finishingTrack = false;
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

export function useCurrentTrack(): ChartMediaItem | null {
  return useMusicPlayerStore((s) => s.queue[s.currentIndex] ?? null);
}
