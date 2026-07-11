import { Audio, type AVPlaybackStatus } from 'expo-av';
import { create } from 'zustand';
import type { PodcastEpisode } from '@/src/types/podcast';
import {
  episodeId,
  getEpisodeAudioUrl,
  isEpisodePlayable,
} from '@/src/lib/podcast';

type PodcastPlayerState = {
  queue: PodcastEpisode[];
  currentIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  error: string | null;
  setQueueAndPlay: (items: PodcastEpisode[], startIndex?: number) => Promise<void>;
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

async function unloadSound() {
  if (!sound) return;
  try {
    sound.setOnPlaybackStatusUpdate(null);
    await sound.unloadAsync();
  } catch {
    // ignore
  }
  sound = null;
}

function onStatus(status: AVPlaybackStatus) {
  if (!status.isLoaded) {
    if (status.error) {
      usePodcastPlayerStore.setState({
        error: status.error,
        isPlaying: false,
        isLoading: false,
      });
    }
    return;
  }

  usePodcastPlayerStore.setState({
    isPlaying: status.isPlaying,
    isLoading: status.isBuffering,
    positionMs: status.positionMillis ?? 0,
    durationMs: status.durationMillis ?? 0,
    error: null,
  });

  if (status.didJustFinish && !status.isLooping) {
    void usePodcastPlayerStore.getState().next();
  }
}

async function loadAndPlay(item: PodcastEpisode) {
  const uri = getEpisodeAudioUrl(item);
  if (!uri) {
    usePodcastPlayerStore.setState({
      error: 'No audio URL for this episode',
      isPlaying: false,
      isLoading: false,
    });
    return;
  }

  await ensureAudioMode();
  await unloadSound();

  usePodcastPlayerStore.setState({
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

export const usePodcastPlayerStore = create<PodcastPlayerState>((set, get) => ({
  queue: [],
  currentIndex: 0,
  isPlaying: false,
  isLoading: false,
  positionMs: 0,
  durationMs: 0,
  error: null,

  setQueueAndPlay: async (items, startIndex = 0) => {
    // Stop music if playing
    const { useMusicPlayerStore } = await import('./musicPlayerStore');
    await useMusicPlayerStore.getState().clear();

    const playable = items.filter(isEpisodePlayable);
    if (!playable.length) {
      set({ error: 'No playable episodes in this queue', queue: [], isPlaying: false });
      return;
    }

    const requested = items[startIndex];
    const requestedId = requested ? episodeId(requested) : '';
    let index = playable.findIndex((e) => episodeId(e) === requestedId);
    if (index < 0) index = 0;

    set({ queue: playable, currentIndex: index, error: null });
    await loadAndPlay(playable[index]);
  },

  play: async () => {
    if (!sound) {
      const item = get().queue[get().currentIndex];
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
    if (get().isPlaying) await get().pause();
    else await get().play();
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

export function useCurrentEpisode(): PodcastEpisode | null {
  return usePodcastPlayerStore((s) => s.queue[s.currentIndex] ?? null);
}
