import { Audio, type AVPlaybackStatus } from 'expo-av';
import { create } from 'zustand';
import type { ChartMediaItem } from '@/src/types/media';
import { getUploadUrl, isUploadPlayable, mediaId } from '@/src/lib/media';

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

function onStatus(status: AVPlaybackStatus) {
  if (!status.isLoaded) {
    if (status.error) {
      useMusicPlayerStore.setState({
        error: status.error,
        isPlaying: false,
        isLoading: false,
      });
    }
    return;
  }

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
    useMusicPlayerStore.setState({
      error: 'No upload audio for this track',
      isPlaying: false,
      isLoading: false,
    });
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

  const created = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true, progressUpdateIntervalMillis: 500 },
    onStatus
  );
  sound = created.sound;
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

    const playable = items.filter(isUploadPlayable);
    if (!playable.length) {
      set({ error: 'No playable uploads in this queue', queue: [], isPlaying: false });
      return;
    }

    const requested = items[startIndex];
    const requestedId = requested ? mediaId(requested) : '';
    let index = playable.findIndex((m) => mediaId(m) === requestedId);
    if (index < 0) index = 0;

    set({ queue: playable, currentIndex: index, error: null });
    await loadAndPlay(playable[index]);
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
    if (currentIndex + 1 >= queue.length) {
      await get().pause();
      set({ isPlaying: false });
      return;
    }
    const nextIndex = currentIndex + 1;
    set({ currentIndex: nextIndex });
    await loadAndPlay(queue[nextIndex]);
  },

  previous: async () => {
    const { queue, currentIndex, positionMs } = get();
    if (positionMs > 3000) {
      await get().seek(0);
      return;
    }
    if (currentIndex <= 0) {
      await get().seek(0);
      return;
    }
    const prevIndex = currentIndex - 1;
    set({ currentIndex: prevIndex });
    await loadAndPlay(queue[prevIndex]);
  },

  seek: async (positionMs) => {
    if (!sound) return;
    await sound.setPositionAsync(Math.max(0, positionMs));
  },

  clear: async () => {
    await unloadSound();
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
