import React, { useEffect, useRef, useState } from 'react';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Maximize } from 'lucide-react';

// YouTube API types
interface YT {
  Player: new (
    element: HTMLElement | string,
    options: YT.PlayerOptions
  ) => YT.Player;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT: YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

const PersistentWebPlayer: React.FC = () => {
  const playerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YT.Player | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  const {
    isPlaying,
    currentSong,
    volume,
    isMuted,
    isHost,
    togglePlayPause,
    next,
    previous,
    setVolume,
    toggleMute,
  } = useWebPlayerStore();

  // Extract YouTube video ID from URL
  const getYouTubeVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  // Initialize YouTube Player
  useEffect(() => {
    console.log('PersistentWebPlayer useEffect - currentSong:', currentSong);
    console.log('PersistentWebPlayer useEffect - isPlaying:', isPlaying);
    
    if (!currentSong) {
      console.log('No current song, clearing player');
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
        setIsPlayerReady(false);
      }
      return;
    }

    // Extract YouTube URL from the song data
    let youtubeUrl = null;
    if (currentSong.sources) {
      if (Array.isArray(currentSong.sources)) {
        console.log('Searching through sources array...');
        for (let i = 0; i < currentSong.sources.length; i++) {
          const source = currentSong.sources[i];
          
          // Check if this is Mongoose metadata corruption
          if (source && source.platform === '$__parent' && source.url && source.url.sources) {
            console.log('Found Mongoose metadata corruption, extracting from nested structure');
            if (source.url.sources.youtube) {
              youtubeUrl = source.url.sources.youtube;
              console.log('Found YouTube URL in nested structure:', youtubeUrl);
              break;
            }
          } else if (source && source.platform === 'youtube' && source.url) {
            youtubeUrl = source.url;
            console.log('Found YouTube URL in sources array:', youtubeUrl);
            break;
          } else if (source?.youtube) {
            youtubeUrl = source.youtube;
            console.log('Found YouTube URL in direct property:', youtubeUrl);
            break;
          }
        }
      } else if (typeof currentSong.sources === 'object' && currentSong.sources.youtube) {
        youtubeUrl = currentSong.sources.youtube;
        console.log('Found YouTube URL in sources.youtube:', youtubeUrl);
      }
    }
    
    console.log('YouTube URL found:', youtubeUrl);
    
    if (!youtubeUrl) {
      console.log('No YouTube source available');
      return;
    }

    const videoId = getYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      console.log('No valid YouTube video ID found for:', youtubeUrl);
      return;
    }

    console.log('Initializing YouTube player with video ID:', videoId);

    // Load YouTube API if not already loaded
    if (!window.YT) {
      console.log('Loading YouTube API...');
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Wait for YouTube API to load
    const initializePlayer = () => {
      console.log('Initializing YouTube player...');
      
      if (window.YT && window.YT.Player && playerRef.current) {
        try {
          // Clear any existing player
          if (youtubePlayerRef.current) {
            youtubePlayerRef.current.destroy();
          }
          
          youtubePlayerRef.current = new window.YT.Player(playerRef.current, {
            height: '200',
            width: '100%',
            videoId: videoId,
            playerVars: {
              autoplay: 0,
              controls: 1,
              modestbranding: 1,
              rel: 0,
              showinfo: 1,
              iv_load_policy: 3,
              fs: 1,
              cc_load_policy: 0,
              playsinline: 1
            },
            events: {
              onReady: (event: any) => {
                console.log('YouTube player ready!');
                console.log('onReady - isPlaying:', isPlaying);
                event.target.setVolume(volume);
                if (isMuted) {
                  event.target.mute();
                }
                setIsPlayerReady(true);
                
                // Auto-play if isPlaying is true
                if (isPlaying) {
                  console.log('Auto-playing video...');
                  event.target.playVideo();
                } else {
                  console.log('Not auto-playing - isPlaying is false');
                }
              },
              onStateChange: (event: any) => {
                console.log('YouTube player state changed:', event.data);
                if (event.data === window.YT.PlayerState.ENDED) {
                  next();
                }
              },
              onError: (event: any) => {
                console.error('YouTube player error:', event.data);
              }
            }
          });
          console.log('YouTube player created successfully');
        } catch (error) {
          console.error('Error initializing YouTube player:', error);
        }
      } else {
        console.log('YouTube API not ready or player ref not available');
      }
    };

    if (window.YT && window.YT.Player) {
      console.log('YouTube API already loaded, initializing immediately');
      initializePlayer();
    } else {
      console.log('Waiting for YouTube API to load...');
      window.onYouTubeIframeAPIReady = initializePlayer;
    }

    return () => {
      if (youtubePlayerRef.current) {
        console.log('Destroying YouTube player');
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
        setIsPlayerReady(false);
      }
    };
  }, [currentSong, volume, isMuted, next]);

  // Update player state when isPlaying changes
  useEffect(() => {
    if (youtubePlayerRef.current && isPlayerReady) {
      console.log('Updating player state, isPlaying:', isPlaying);
      try {
        if (isPlaying) {
          youtubePlayerRef.current.playVideo();
        } else {
          youtubePlayerRef.current.pauseVideo();
        }
      } catch (error) {
        console.error('Error controlling YouTube player:', error);
      }
    }
  }, [isPlaying, isPlayerReady]);

  // Update volume when it changes
  useEffect(() => {
    if (youtubePlayerRef.current && isPlayerReady) {
      try {
        youtubePlayerRef.current.setVolume(volume);
        if (isMuted) {
          youtubePlayerRef.current.mute();
        } else {
          youtubePlayerRef.current.unMute();
        }
      } catch (error) {
        console.error('Error updating volume:', error);
      }
    }
  }, [volume, isMuted, isPlayerReady]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseInt(e.target.value));
  };

  const handleFullscreen = () => {
    if (youtubePlayerRef.current && isPlayerReady) {
      try {
        youtubePlayerRef.current.getIframe().requestFullscreen();
      } catch (error) {
        console.error('Error entering fullscreen:', error);
      }
    }
  };

  // Don't render if no current song
  if (!currentSong) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center space-x-4">
          {/* Song Info */}
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="w-12 h-12 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
              <img
                src={currentSong.coverArt || '/default-cover.jpg'}
                alt={currentSong.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-gray-900 truncate">
                {currentSong.title}
              </h4>
              <p className="text-xs text-gray-500 truncate">
                {currentSong.artist}
              </p>
            </div>
          </div>

          {/* Player Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={previous}
              className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
              disabled={!isHost}
            >
              <SkipBack className="h-5 w-5" />
            </button>
            
            <button
              onClick={togglePlayPause}
              className="p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!isHost}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </button>
            
            <button
              onClick={next}
              className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
              disabled={!isHost}
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </div>

          {/* Volume Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleMute}
              className="p-1 text-gray-600 hover:text-gray-900 transition-colors"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Fullscreen */}
          <button
            onClick={handleFullscreen}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <Maximize className="h-4 w-4" />
          </button>
        </div>

        {/* YouTube Player (Hidden) */}
        <div ref={playerRef} className="hidden" />
      </div>
    </div>
  );
};

export default PersistentWebPlayer;
