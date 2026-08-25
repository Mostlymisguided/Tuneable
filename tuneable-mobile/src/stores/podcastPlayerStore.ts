import { type AudioPlayer, type AudioStatus } from 'expo-audio';
import { create } from 'zustand';
import {
  DEFAULT_PODCAST_COVER,
  type PodcastEpisode,
} from '@/src/types/podcast';
import {
  PODCAST_NO_PLAYABLE,
  PODCAST_UNPLAYABLE_SKIP,
} from '@/src/lib/playbackMessages';
import {
  createPersistentAudioPlayer,
  destroyAudioPlayer,
  ensurePlaybackAudioMode,
  nextPlaybackSpeed,
  PODCAST_SKIP_BACK_MS,
  PODCAST_SKIP_FORWARD_MS,
  publishLockScreen,
} from '@/src/lib/playbackAudio';
import {
  episodeId,
  getEpisodeAudioUrl,
  isEpisodePlayable,
  seriesTitle,
} from '@/src/lib/podcast';
import { showToast } from '@/src/stores/toastStore';

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

let player: AudioPlayer | null = null;
let statusSub: { remove: () => void } | null = null;
let consecutiveLoadFailures = 0;
let skipAfterFailureInFlight = false;
let skipNoticeShown = false;
let finishHandled = false;

function getStore(): PodcastPlayerState {
  return usePodcastPlayerStore.getState();
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

function applyPlaybackRate() {
  if (!player) return;
  const rate = getStore().playbackRate;
  try {
    player.shouldCorrectPitch = true;
    player.setPlaybackRate(rate);
  } catch {
    // ignore
  }
}

function publishCurrentLockScreen(item: PodcastEpisode) {
  if (!player) return;
  publishLockScreen(player, {
    title: item.title || 'Episode',
    artist: seriesTitle(item),
    albumTitle: 'Tuneable',
    artworkUrl:
      item.coverArt || item.podcastSeries?.coverArt || DEFAULT_PODCAST_COVER,
  });
}

function onStatus(status: AudioStatus) {
  if (!status.isLoaded) {
    if (status.playbackState?.toLowerCase().includes('error')) {
      void skipAfterFailure(status.reasonForWaitingToPlay || 'Failed to load audio');
    }
    return;
  }

  consecutiveLoadFailures = 0;
  skipNoticeShown = false;
  const desiredRate = getStore().playbackRate;
  if (Math.abs((status.playbackRate || 1) - desiredRate) > 0.01) {
    applyPlaybackRate();
  }
  usePodcastPlayerStore.setState({
    isPlaying: status.playing,
    isLoading: status.isBuffering,
    positionMs: (status.currentTime ?? 0) * 1000,
    durationMs: (status.duration ?? 0) * 1000,
    error: null,
  });

  if (status.didJustFinish && !status.loop && !finishHandled) {
    finishHandled = true;
    void getStore().next();
  }
}

function ensurePlayer(): AudioPlayer {
  if (player) return player;
  player = createPersistentAudioPlayer();
  statusSub = player.addListener('playbackStatusUpdate', onStatus);
  return player;
}

function unloadPlayer() {
  statusSub?.remove();
  statusSub = null;
  destroyAudioPlayer(player);
  player = null;
}

async function loadAndPlay(item: PodcastEpisode) {
  const uri = getEpisodeAudioUrl(item);
  if (!uri) {
    await skipAfterFailure('No audio URL for this episode');
    return;
  }

  await ensurePlaybackAudioMode();
  const active = ensurePlayer();
  finishHandled = false;

  usePodcastPlayerStore.setState({
    isLoading: true,
    positionMs: 0,
    durationMs: (item.duration ?? 0) * 1000,
    error: null,
  });

  try {
    active.replace({ uri });
    applyPlaybackRate();
    active.play();
    publishCurrentLockScreen(item);
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
    if (!player) {
      const item = get().queue[get().currentIndex];
      if (item) await loadAndPlay(item);
      return;
    }
    player.play();
    const item = get().queue[get().currentIndex];
    if (item) publishCurrentLockScreen(item);
  },

  pause: async () => {
    player?.pause();
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
    if (!player) return;
    await player.seekTo(Math.max(0, positionMs) / 1000);
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
    unloadPlayer();
    consecutiveLoadFailures = 0;
    skipNoticeShown = false;
    finishHandled = false;
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
