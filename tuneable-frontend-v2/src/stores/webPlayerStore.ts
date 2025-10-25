import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  setCurrentMedia: (media: PlayerMedia | null, index?: number, autoPlay?: boolean) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  next: () => void;
  previous: () => void;
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
      
      setCurrentMedia: (media, index = 0, autoPlay = false) => {
        set({ 
          currentMedia: media, 
          currentMediaIndex: index,
          isPlaying: autoPlay, // Auto-play if requested (for jukebox experience)
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
        if (queue.length > 0) {
          const nextIndex = currentMediaIndex + 1;
          
          // If we've reached the end of the queue, stop the player
          if (nextIndex >= queue.length) {
            set({ 
              currentMedia: null, 
              currentMediaIndex: 0,
              isPlaying: false
            });
            return;
          }
          
          // Move to next media and auto-play for jukebox experience
          set({ 
            currentMedia: queue[nextIndex], 
            currentMediaIndex: nextIndex,
            isPlaying: true // Auto-play next media for smooth jukebox experience
          });
          
          if (isHost && sendWebSocketMessage) {
            sendWebSocketMessage({ type: 'NEXT' });
          }
        } else {
          // No media in queue, stop the player
          set({ 
            currentMedia: null, 
            currentMediaIndex: 0,
            isPlaying: false
          });
        }
      },
      
      previous: () => {
        const { queue, currentMediaIndex, isPlaying, sendWebSocketMessage, isHost } = get();
        if (queue.length > 0) {
          const prevIndex = currentMediaIndex - 1;
          
          // If we're at the beginning, don't go back
          if (prevIndex < 0) {
            return;
          }
          
          // Move to previous media
          set({ 
            currentMedia: queue[prevIndex], 
            currentMediaIndex: prevIndex,
            isPlaying: isPlaying // Keep the current playing state
          });
          
          if (isHost && sendWebSocketMessage) {
            sendWebSocketMessage({ type: 'PREVIOUS' });
          }
        }
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
        set({ queue });
      },
      
      addToQueue: (media) => {
        set((state) => ({ 
          queue: [...state.queue, media] 
        }));
      },
      
      removeFromQueue: (mediaId) => {
        set((state) => ({
          queue: state.queue.filter(media => (media._id || media.id) !== mediaId)
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
