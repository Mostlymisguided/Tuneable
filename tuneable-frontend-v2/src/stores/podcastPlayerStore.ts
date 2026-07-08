import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Minimal episode shape for podcast player (from profile, chart, or search). */
export interface PodcastPlayerEpisode {
  _id?: string;
  id?: string;
  title: string;
  duration?: number;
  coverArt?: string;
  podcastSeries?: { _id: string; title?: string; coverArt?: string };
  podcastTitle?: string;
  /** sources.audio_direct or sources.audio; object or Map-like. */
  sources?: Record<string, string> | { get?(k: string): string | undefined };
  /** Fallbacks for search/external results */
  audioUrl?: string;
  enclosure?: { url?: string };
  sourceType?: 'user_queue' | 'library' | 'party' | 'search' | 'profile' | 'direct' | 'unknown';
}

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;

interface PodcastPlayerState {
  currentEpisode: PodcastPlayerEpisode | null;
  currentEpisodeIndex: number;
  queue: PodcastPlayerEpisode[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;

  setCurrentEpisode: (episode: PodcastPlayerEpisode | null, index?: number) => void;
  setQueue: (queue: PodcastPlayerEpisode[]) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  next: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  cyclePlaybackRate: () => void;
  clear: () => void;
}

export { PLAYBACK_SPEEDS };

export const usePodcastPlayerStore = create<PodcastPlayerState>()(
  persist(
    (set, get) => ({
      currentEpisode: null,
      currentEpisodeIndex: 0,
      queue: [],
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 50,
      isMuted: false,
      playbackRate: 1,

      setQueue: (queue) => set({ queue }),

      setCurrentEpisode: (episode, index = 0) => {
        set({
          currentEpisode: episode,
          currentEpisodeIndex: index,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        });
      },

      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      togglePlayPause: () => set((s) => ({ isPlaying: !s.isPlaying })),

      next: () => {
        const { queue, currentEpisodeIndex } = get();
        if (queue.length === 0) {
          set({ isPlaying: false });
          return;
        }

        const nextIndex = currentEpisodeIndex + 1;
        if (nextIndex >= queue.length) {
          set({
            currentEpisode: null,
            currentEpisodeIndex: 0,
            queue: [],
            isPlaying: false,
            currentTime: 0,
            duration: 0,
          });
          return;
        }

        set({
          currentEpisode: queue[nextIndex],
          currentEpisodeIndex: nextIndex,
          isPlaying: true,
          currentTime: 0,
          duration: 0,
        });
      },

      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      seekTo: (time) => set({ currentTime: Math.max(0, time) }),

      setVolume: (volume) => set({ volume: Math.max(0, Math.min(100, volume)) }),
      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

      setPlaybackRate: (rate) =>
        set({ playbackRate: Math.max(0.5, Math.min(2, rate)) }),
      cyclePlaybackRate: () =>
        set((s) => {
          const idx = PLAYBACK_SPEEDS.indexOf(s.playbackRate as 1 | 1.25 | 1.5 | 1.75 | 2);
          const next = idx < 0 || idx >= PLAYBACK_SPEEDS.length - 1 ? PLAYBACK_SPEEDS[0] : PLAYBACK_SPEEDS[idx + 1];
          return { playbackRate: next };
        }),

      clear: () => {
        set({
          currentEpisode: null,
          currentEpisodeIndex: 0,
          queue: [],
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        });
      },
    }),
    {
      name: 'podcast-player-storage',
      partialize: (s) => ({
        volume: s.volume,
        isMuted: s.isMuted,
        playbackRate: s.playbackRate,
      }),
    }
  )
);

/** Resolve audio URL from episode sources (audio_direct, audio) or fallbacks. */
export function getEpisodeAudioUrl(episode: PodcastPlayerEpisode | null): string | null {
  if (!episode) return null;
  const e = episode as PodcastPlayerEpisode & { audioUrl?: string; enclosure?: { url?: string } };
  if (e.audioUrl) return e.audioUrl;
  if (e.enclosure?.url) return e.enclosure.url;
  const s = episode.sources;
  if (!s) return null;
  if (typeof s === 'object' && s !== null && 'get' in s && typeof (s as { get: (k: string) => string }).get === 'function') {
    const m = s as { get: (k: string) => string };
    return m.get('audio_direct') || m.get('audio') || null;
  }
  const o = s as Record<string, string>;
  return o.audio_direct || o.audio || null;
}
