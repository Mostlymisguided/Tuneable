import { Audio, type AVPlaybackStatus } from 'expo-av';
import { create } from 'zustand';
import type { ChartMediaItem } from '@/src/types/media';
import {
  MUSIC_NO_PLAYABLE,
  MUSIC_UNPLAYABLE_SKIP,
} from '@/src/lib/playbackMessages';
import { getUploadUrl, isUploadPlayable, mediaId } from '@/src/lib/media';
import { showToast } from '@/src/stores/toastStore';

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

let sound: Audio.Sound | null = null;
let audioModeReady = false;
/** Guard against skip loops when many consecutive tracks fail to load. */
let consecutiveLoadFailures = 0;
let skipAfterFailureInFlight = false;
/** Only toast once per unbroken skip streak (user-selected or load failure). */
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
}

function getStore(): MusicPlayerState {
  return useMusicPlayerStore.getState();
}

function noticeSkipOnce(message: string) {
  if (skipNoticeShown) return;
  skipNoticeShown = true;
  showToast(message);
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

function onStatus(status: AVPlaybackStatus) {
  if (!status.isLoaded) {
    if (status.error) {
      void skipAfterFailure(status.error);
    }
    return;
  }

  consecutiveLoadFailures = 0;
  skipNoticeShown = false;
  useMusicPlayerStore.setState({
    isPlaying: status.isPlaying,
    isLoading: status.isBuffering,
    positionMs: status.positionMillis ?? 0,
    durationMs: status.durationMillis ?? 0,
    error: null,
  });

  if (status.didJustFinish && !status.isLooping) {
    void getStore().next();
  }
}

async function unloadSound() {
  if (!sound) return;
  try {
    sound.setOnPlaybackStatusUpdate(null);
    await sound.unloadAsync();
  } catch {
    // ignore unload races
  }
  sound = null;
}

async function loadAndPlay(item: ChartMediaItem) {
  const uri = getUploadUrl(item);
  if (!uri) {
    await skipAfterFailure('No upload audio for this track');
    return;
  }

  await ensureAudioMode();
  await unloadSound();

  useMusicPlayerStore.setState({
    isLoading: true,
    positionMs: 0,
    durationMs: (item.duration ?? 0) * 1000,
    error: null,
  });

  try {
    const created = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, progressUpdateIntervalMillis: 500 },
      onStatus
    );
    sound = created.sound;
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
    if (!sound) {
      const { queue, currentIndex } = get();
      const item = queue[currentIndex];
      if (item) await loadAndPlay(item);
      return;
    }
    await sound.playAsync();
  },

  pause: async () => {
    if (!sound) return;
    await sound.pauseAsync();
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
    if (!sound) return;
    await sound.setPositionAsync(Math.max(0, positionMs));
  },

  clear: async () => {
    await unloadSound();
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

export function useCurrentTrack(): ChartMediaItem | null {
  return useMusicPlayerStore((s) => s.queue[s.currentIndex] ?? null);
}
