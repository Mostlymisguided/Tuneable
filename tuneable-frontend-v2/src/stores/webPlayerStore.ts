import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Song {
  _id: string;
  title: string;
  artist: string;
  duration: number;
  coverArt: string;
  sources: any;
  globalBidValue: number;
  bids: any[];
  addedBy: any;
  totalBidValue: number;
}

interface WebPlayerState {
  // Player state
  isPlaying: boolean;
  currentSong: Song | null;
  currentSongIndex: number;
  volume: number;
  isMuted: boolean;
  isHost: boolean;
  
  // Player actions
  setCurrentSong: (song: Song | null, index?: number, autoPlay?: boolean) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  next: () => void;
  previous: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIsHost: (isHost: boolean) => void;
  
  // Queue management
  queue: Song[];
  setQueue: (queue: Song[]) => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (songId: string) => void;
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
      currentSong: null,
      currentSongIndex: 0,
      volume: 50,
      isMuted: false,
      isHost: false,
      queue: [],
      currentPartyId: null,
      isGlobalPlayerActive: false,
      sendWebSocketMessage: () => {},
      
      // Actions
      setCurrentSong: (song, index = 0, autoPlay = false) => {
        set({ 
          currentSong: song, 
          currentSongIndex: index,
          isPlaying: autoPlay // Auto-play if requested (for jukebox experience)
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
        const { queue, currentSongIndex, isPlaying, sendWebSocketMessage, isHost } = get();
        if (queue.length > 0) {
          const nextIndex = currentSongIndex + 1;
          
          // If we've reached the end of the queue, stop the player
          if (nextIndex >= queue.length) {
            set({ 
              currentSong: null, 
              currentSongIndex: 0,
              isPlaying: false
            });
            return;
          }
          
          // Move to next song and auto-play for jukebox experience
          set({ 
            currentSong: queue[nextIndex], 
            currentSongIndex: nextIndex,
            isPlaying: true // Auto-play next song for smooth jukebox experience
          });
          
          if (isHost && sendWebSocketMessage) {
            sendWebSocketMessage({ type: 'NEXT' });
          }
        } else {
          // No songs in queue, stop the player
          set({ 
            currentSong: null, 
            currentSongIndex: 0,
            isPlaying: false
          });
        }
      },
      
      previous: () => {
        const { queue, currentSongIndex, isPlaying, sendWebSocketMessage, isHost } = get();
        if (queue.length > 0) {
          const prevIndex = currentSongIndex - 1;
          
          // If we're at the beginning, don't go back
          if (prevIndex < 0) {
            return;
          }
          
          // Move to previous song
          set({ 
            currentSong: queue[prevIndex], 
            currentSongIndex: prevIndex,
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
      
      addToQueue: (song) => {
        set((state) => ({ 
          queue: [...state.queue, song] 
        }));
      },
      
      removeFromQueue: (songId) => {
        set((state) => ({
          queue: state.queue.filter(song => song._id !== songId)
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
        currentSong: state.currentSong,
        currentSongIndex: state.currentSongIndex,
        queue: state.queue,
        currentPartyId: state.currentPartyId,
        isGlobalPlayerActive: state.isGlobalPlayerActive,
      }),
    }
  )
);
