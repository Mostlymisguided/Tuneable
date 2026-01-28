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
}

interface PodcastPlayerState {
  currentEpisode: PodcastPlayerEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;

  setCurrentEpisode: (episode: PodcastPlayerEpisode | null) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  clear: () => void;
}

export const usePodcastPlayerStore = create<PodcastPlayerState>()(
  persist(
    (set) => ({
      currentEpisode: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 50,
      isMuted: false,

      setCurrentEpisode: (episode) => {
        set({
          currentEpisode: episode,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        });
      },

      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      togglePlayPause: () => set((s) => ({ isPlaying: !s.isPlaying })),

      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      seekTo: (time) => set({ currentTime: Math.max(0, time) }),

      setVolume: (volume) => set({ volume: Math.max(0, Math.min(100, volume)) }),
      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

      clear: () => {
        set({
          currentEpisode: null,
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
