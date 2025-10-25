import React, { useEffect, useRef, useState } from 'react';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from 'lucide-react';
import { partyAPI } from '../lib/api';

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

interface MP3PlayerProps {
  media: PlayerMedia;
}

const MP3Player: React.FC<MP3PlayerProps> = ({ media }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  // Get state from store
  const { 
    isPlaying, 
    volume, 
    isMuted, 
    togglePlayPause, 
    setVolume, 
    toggleMute,
    currentPartyId,
    isHost,
    next,
    previous,
    queue,
    currentMediaIndex
  } = useWebPlayerStore();


  // Simple approach - MP3Player handles audio, PersistentWebPlayer handles YouTube

  // Extract audio URL from media sources (same logic as PersistentWebPlayer)
  const getAudioUrl = (media: PlayerMedia): string | null => {
    if (!media?.sources) return null;
    
    if (Array.isArray(media.sources)) {
      for (const source of media.sources) {
        if (source?.platform === 'upload' && source.url) {
          return source.url;
        }
        if (source?.upload) {
          return source.upload;
        }
      }
    } else if (typeof media.sources === 'object') {
      if (media.sources.upload) {
        return media.sources.upload;
      }
    }
    
    return null;
  };

  // Initialize audio player - only when media changes
  useEffect(() => {
    if (!media) return;

    const audioUrl = getAudioUrl(media);
    if (!audioUrl || !audioRef.current) return;

    console.log('MP3Player: Initializing audio player with URL:', audioUrl);
    console.log('MP3Player: Media sources:', media.sources);

    try {
      // Construct the correct URL for uploaded media
      let fullUrl;
      if (audioUrl.startsWith('http')) {
        // Already a full URL (from R2 or other sources)
        fullUrl = audioUrl;
      } else if (audioUrl.startsWith('/uploads/media-uploads/')) {
        // R2 upload - remove the leading /uploads/ and construct R2 URL
        const r2Key = audioUrl.replace('/uploads/', '');
        fullUrl = `https://uploads.tuneable.stream/${r2Key}`;
      } else if (audioUrl.startsWith('/uploads/')) {
        // Other uploads - construct full R2 URL
        fullUrl = `https://uploads.tuneable.stream${audioUrl}`;
      } else {
        // Fallback to local development
        fullUrl = `${window.location.origin}${audioUrl}`;
      }
      
      console.log('MP3Player: Setting audio source to:', fullUrl);
      console.log('MP3Player: Original URL was:', audioUrl);
      
      // Reset state
      setIsPlayerReady(false);
      setIsLoading(true);
      setCurrentTime(0);
      setDuration(0);
      
      // Set up audio element
      audioRef.current.src = fullUrl;
      audioRef.current.volume = volume / 100;
      audioRef.current.muted = isMuted;

      // Set up event listeners
      audioRef.current.onloadedmetadata = () => {
        console.log('MP3Player: Audio metadata loaded');
        if (audioRef.current && audioRef.current.duration) {
          const dur = audioRef.current.duration;
          setDuration(dur);
          setIsPlayerReady(true);
          setIsLoading(false);
        }
      };

        audioRef.current.onended = () => {
          console.log('MP3Player: Audio ended');
          
          if (currentPartyId && media?._id && isHost) {
            partyAPI.completeMedia(currentPartyId, media._id)
              .then(() => {
                console.log('MP3Player: Media completion confirmed');
                next(); // Simple next - let App.tsx handle which player to show
              })
              .catch(error => {
                console.error('MP3Player: Error notifying media completion:', error);
                next();
              });
          } else {
            next(); // Simple next for non-host users
          }
        };

      audioRef.current.onerror = (error) => {
        console.error('MP3Player: Audio playback error:', error);
        console.error('MP3Player: Audio element error details:', {
          error: audioRef.current?.error,
          networkState: audioRef.current?.networkState,
          readyState: audioRef.current?.readyState,
          src: audioRef.current?.src
        });
        
        // Try to fetch the file to check if it's accessible
        fetch(fullUrl, { method: 'HEAD' })
          .then(response => {
            console.log('MP3Player: File accessibility check:', {
              status: response.status,
              statusText: response.statusText,
              url: fullUrl
            });
          })
          .catch(fetchError => {
            console.error('MP3Player: File not accessible:', fetchError);
          });
        
        setIsLoading(false);
      };

      audioRef.current.onloadstart = () => {
        console.log('MP3Player: Audio loading started');
        setIsLoading(true);
      };

      // Load the audio
      audioRef.current.load();
      
      console.log('MP3Player: Audio player initialized successfully');
    } catch (error) {
      console.error('MP3Player: Error initializing audio player:', error);
      setIsLoading(false);
    }
  }, [media?.id]); // Only re-initialize when media ID changes

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
    };
  }, []);

  // Handle play/pause
  useEffect(() => {
    if (!audioRef.current || !isPlayerReady) return;

    try {
      if (isPlaying) {
        console.log('MP3Player: Playing audio');
        audioRef.current.play().catch(error => {
          console.error('MP3Player: Error playing audio:', error);
        });
      } else {
        console.log('MP3Player: Pausing audio');
        audioRef.current.pause();
      }
    } catch (error) {
      console.error('MP3Player: Error controlling audio:', error);
    }
  }, [isPlaying, isPlayerReady]);

  // Handle volume changes
  useEffect(() => {
    if (!audioRef.current) return;

    try {
      audioRef.current.volume = volume / 100;
      audioRef.current.muted = isMuted;
    } catch (error) {
      console.error('MP3Player: Error updating volume:', error);
    }
  }, [volume, isMuted]);

  // Time tracking
  useEffect(() => {
    if (!audioRef.current || !isPlayerReady) return;

    const updateTime = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    };

    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [isPlayerReady]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!media) {
    return null;
  }

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50">
      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />
      
      {/* MP3 Player UI - positioned above PersistentWebPlayer */}
      <div className="bg-gray-800/95 backdrop-blur-xl border border-gray-600/50 shadow-2xl rounded-t-lg">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center space-x-4">
            {/* Album Art */}
            <div className="flex-shrink-0">
              <img
                src={media.coverArt}
                alt={`${media.artist} - ${media.title}`}
                className="w-12 h-12 rounded-lg object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/placeholder-album.png';
                }}
              />
            </div>

            {/* Track Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-white truncate">
                {media.title}
              </h3>
              <p className="text-xs text-gray-400 truncate">
                {media.artist}
              </p>
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-3">
              {/* Previous Button */}
              <button
                onClick={previous}
                disabled={currentMediaIndex <= 0}
                className="p-2 rounded-full bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Previous Song"
              >
                <SkipBack className="w-4 h-4 text-white" />
              </button>

              {/* Play/Pause Button */}
              <button
                onClick={togglePlayPause}
                disabled={!isPlayerReady || isLoading}
                className="p-2 rounded-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4 text-white" />
                ) : (
                  <Play className="w-4 h-4 text-white" />
                )}
              </button>

              {/* Next Button */}
              <button
                onClick={next}
                disabled={currentMediaIndex >= queue.length - 1}
                className="p-2 rounded-full bg-gray-600 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Next Song"
              >
                <SkipForward className="w-4 h-4 text-white" />
              </button>

              {/* Volume Control */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={toggleMute}
                  className="p-1 rounded hover:bg-gray-700 transition-colors"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-gray-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(parseInt(e.target.value))}
                  className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                />
              </div>

              {/* Time Display */}
              <div className="text-xs text-gray-400 font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MP3Player;
