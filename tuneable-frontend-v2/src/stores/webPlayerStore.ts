import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isMediaPlayable } from '../utils/mediaPlayability';

// Lightweight Media interface for webplayer (subset of full Media)
interface PlayerMedia {
  id: string;
  _id?: string;
  title: string;
  artist: string;
  duration: number;
  coverArt: string;
  sources: any;
  globalMediaAggregate: number;
  bids: any[];
  addedBy: any;
  totalBidValue: number;
  featuring?: any[];
  sourceType?: 'user_queue' | 'library' | 'party' | 'search' | 'profile' | 'direct' | 'unknown';
  minimumBid?: number;
  isPlayable?: boolean;
  rightsCleared?: boolean;
  rightsStatus?: 'cleared' | 'pending' | 'disputed';
}

function mediaKey(media: PlayerMedia | null | undefined): string {
  if (!media) return '';
  return String(media._id || media.id || '');
}

/** Find next/previous playable index. `fromIndex` is exclusive (skips that slot). */
function findPlayableIndex(
  queue: PlayerMedia[],
  fromIndex: number,
  direction: 1 | -1
): number {
  let i = fromIndex + direction;
  while (i >= 0 && i < queue.length) {
    if (isMediaPlayable(queue[i])) return i;
    i += direction;
  }
  return -1;
}

interface TopBidder {
  userId: string;
  username: string;
  avatar?: string;
  amount: number;
}

interface WebPlayerState {
  // Player state
  isPlaying: boolean;
  currentMedia: PlayerMedia | null;
  currentMediaIndex: number;
  volume: number;
  isMuted: boolean;
  isHost: boolean;
  
  // Time tracking
  currentTime: number;
  duration: number;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  seekTo: (time: number) => void;
  
  // Video display
  showVideo: boolean;
  toggleVideo: () => void;
  setShowVideo: (show: boolean) => void;
  
  // Bid information
  topBidder: TopBidder | null;
  setTopBidder: (bidder: TopBidder | null) => void;
  
  // Player actions
  setCurrentMedia: (media: PlayerMedia | null, index?: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  next: () => void;
  previous: () => void;
  /** If current track isn't playable, advance to the next playable one (preserves play state). */
  ensureCurrentPlayable: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIsHost: (isHost: boolean) => void;
  
  // Queue management
  queue: PlayerMedia[];
  setQueue: (queue: PlayerMedia[]) => void;
  addToQueue: (media: PlayerMedia) => void;
  removeFromQueue: (mediaId: string) => void;
  moveToNext: () => void;
  
  // Party management
  currentPartyId: string | null;
  setCurrentPartyId: (partyId: string | null) => void;
  
  // WebSocket actions
  sendWebSocketMessage: (message: any) => void;
  setWebSocketSender: (sender: (message: any) => void) => void;
  
  // Global player control
  isGlobalPlayerActive: boolean;
  setGlobalPlayerActive: (active: boolean) => void;
}

export const useWebPlayerStore = create<WebPlayerState>()(
  persist(
    (set, get) => ({
      // Initial state
      isPlaying: false,
      currentMedia: null,
      currentMediaIndex: 0,
      volume: 50,
      isMuted: false,
      isHost: false,
      queue: [],
      currentPartyId: null,
      isGlobalPlayerActive: false,
      sendWebSocketMessage: () => {},
      
      // Time tracking state
      currentTime: 0,
      duration: 0,
      
      // Video display state
      showVideo: false,
      
      // Bid information state
      topBidder: null,
      
      // Actions
      
      // Time tracking actions
      setCurrentTime: (time) => {
        set({ currentTime: time });
      },
      
      setDuration: (duration) => {
        set({ duration });
      },
      
      seekTo: (time) => {
        set({ currentTime: time });
        // The actual seeking will be handled by the player component
      },
      
      // Video display actions
      toggleVideo: () => {
        set((state) => ({ showVideo: !state.showVideo }));
      },
      
      setShowVideo: (show) => {
        set({ showVideo: show });
      },
      
      // Bid information actions
      setTopBidder: (bidder) => {
        set({ topBidder: bidder });
      },
      
      setCurrentMedia: (media, index = 0) => {
        set({ 
          currentMedia: media, 
          currentMediaIndex: index,
          isPlaying: false, // Always start paused - user must manually play (autotransition handled in next())
          currentTime: 0, // Reset time when changing media
          duration: 0,
          topBidder: null // Clear top bidder when changing media
        });
      },
      
      play: () => {
        set({ isPlaying: true });
        const { sendWebSocketMessage, isHost } = get();
        if (isHost && sendWebSocketMessage) {
          sendWebSocketMessage({ type: 'PLAY' });
        }
      },
      
      pause: () => {
        set({ isPlaying: false });
        const { sendWebSocketMessage, isHost } = get();
        if (isHost && sendWebSocketMessage) {
          sendWebSocketMessage({ type: 'PAUSE' });
        }
      },
      
      togglePlayPause: () => {
        const { isPlaying, play, pause } = get();
        if (isPlaying) {
          pause();
        } else {
          play();
        }
      },
      
      next: () => {
        const { queue, currentMediaIndex, sendWebSocketMessage, isHost } = get();
        if (queue.length === 0) {
          set({
            currentMedia: null,
            currentMediaIndex: 0,
            isPlaying: false,
          });
          return;
        }

        const nextIndex = findPlayableIndex(queue, currentMediaIndex, 1);
        if (nextIndex < 0) {
          set({
            currentMedia: null,
            currentMediaIndex: 0,
            isPlaying: false,
          });
          return;
        }

        set({
          currentMedia: queue[nextIndex],
          currentMediaIndex: nextIndex,
          isPlaying: true,
          currentTime: 0,
          duration: 0,
          topBidder: null,
        });

        if (isHost && sendWebSocketMessage) {
          sendWebSocketMessage({ type: 'NEXT' });
        }
      },

      previous: () => {
        const { queue, currentMediaIndex, isPlaying, sendWebSocketMessage, isHost } = get();
        if (queue.length === 0) return;

        const prevIndex = findPlayableIndex(queue, currentMediaIndex, -1);
        if (prevIndex < 0) return;

        set({
          currentMedia: queue[prevIndex],
          currentMediaIndex: prevIndex,
          isPlaying,
          currentTime: 0,
          duration: 0,
          topBidder: null,
        });

        if (isHost && sendWebSocketMessage) {
          sendWebSocketMessage({ type: 'PREVIOUS' });
        }
      },

      ensureCurrentPlayable: () => {
        const { queue, currentMedia, currentMediaIndex, isPlaying } = get();
        if (!currentMedia || isMediaPlayable(currentMedia)) return;

        const nextIndex = findPlayableIndex(queue, currentMediaIndex, 1);
        if (nextIndex < 0) {
          set({
            currentMedia: null,
            currentMediaIndex: 0,
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            topBidder: null,
          });
          return;
        }

        set({
          currentMedia: queue[nextIndex],
          currentMediaIndex: nextIndex,
          isPlaying,
          currentTime: 0,
          duration: 0,
          topBidder: null,
        });
      },
      
      setVolume: (volume) => {
        set({ volume: Math.max(0, Math.min(100, volume)) });
      },
      
      toggleMute: () => {
        set((state) => ({ isMuted: !state.isMuted }));
      },
      
      setIsHost: (isHost) => {
        set({ isHost });
      },
      
      setQueue: (queue) => {
        const { currentMedia, currentMediaIndex } = get();
        let nextIndex = currentMediaIndex;
        const key = mediaKey(currentMedia);
        if (key && queue.length > 0) {
          const found = queue.findIndex((m) => mediaKey(m) === key);
          if (found >= 0) nextIndex = found;
        }
        set({ queue, currentMediaIndex: nextIndex });
      },

      addToQueue: (media) => {
        set((state) => ({
          queue: [...state.queue, media],
        }));
      },

      removeFromQueue: (mediaId) => {
        set((state) => ({
          queue: state.queue.filter((media) => (media._id || media.id) !== mediaId),
        }));
      },
      
      moveToNext: () => {
        const { next } = get();
        next();
      },
      
      setWebSocketSender: (sender) => {
        set({ sendWebSocketMessage: sender });
      },
      
      // Party management
      setCurrentPartyId: (partyId) => {
        set({ currentPartyId: partyId });
      },
      
      // Global player control
      setGlobalPlayerActive: (active) => {
        set({ isGlobalPlayerActive: active });
      },
    }),
    {
      name: 'webplayer-storage',
      // Only persist essential state, not functions
      partialize: (state) => ({
        volume: state.volume,
        isMuted: state.isMuted,
        currentMedia: state.currentMedia,
        currentMediaIndex: state.currentMediaIndex,
        queue: state.queue,
        currentPartyId: state.currentPartyId,
        isGlobalPlayerActive: state.isGlobalPlayerActive,
        showVideo: state.showVideo,
        currentTime: state.currentTime,
        duration: state.duration,
      }),
    }
  )
);
