import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX, Maximize } from 'lucide-react';

interface WebPlayerProps {
  currentSong: any;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  isHost: boolean;
}

const WebPlayer: React.FC<WebPlayerProps> = ({
  currentSong,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  isHost
}) => {
  const playerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<any>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(50);

  // Extract YouTube video ID from URL
  const getYouTubeVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Initialize YouTube Player
  useEffect(() => {
    console.log('WebPlayer useEffect - currentSong:', currentSong);
    console.log('currentSong keys:', currentSong ? Object.keys(currentSong) : 'no currentSong');
    console.log('currentSong.sources:', currentSong?.sources);
    console.log('sources is array:', Array.isArray(currentSong?.sources));
    
    // Handle sources as array - find YouTube URL in the array
    let youtubeUrl = null;
    if (Array.isArray(currentSong?.sources)) {
      console.log('Searching through sources array...');
      for (let i = 0; i < currentSong.sources.length; i++) {
        const source = currentSong.sources[i];
        console.log(`sources[${i}]:`, source);
        console.log(`sources[${i}] keys:`, Object.keys(source || {}));
        console.log(`sources[${i}].youtube:`, source?.youtube);
        
        // Check if this is Mongoose metadata corruption
        if (source && source.platform === '$__parent' && source.url && source.url.sources) {
          // This is Mongoose metadata corruption - extract from nested structure
          console.log('Found Mongoose metadata corruption in WebPlayer, extracting from nested structure');
          if (source.url.sources.youtube) {
            youtubeUrl = source.url.sources.youtube;
            console.log('Found YouTube URL in nested structure:', youtubeUrl);
            break;
          }
        } else if (source && source.platform === 'youtube' && source.url) {
          // Normal array format: [{platform: "youtube", url: "..."}]
          youtubeUrl = source.url;
          console.log('Found YouTube URL in sources array:', youtubeUrl);
          break;
        } else if (source?.youtube) {
          // Fallback: direct youtube property
          youtubeUrl = source.youtube;
          console.log('Found YouTube URL in direct property:', youtubeUrl);
          break;
        }
      }
    } else {
      // Fallback to object structure
      youtubeUrl = currentSong?.sources?.youtube || 
                  currentSong?.songId?.sources?.youtube ||
                  currentSong?.youtube ||
                  currentSong?.url;
    }
    
    console.log('YouTube URL found:', youtubeUrl);
    
    if (!youtubeUrl) {
      console.log('No current song or YouTube source available');
      console.log('currentSong structure:', currentSong);
      console.log('Available properties:', currentSong ? Object.keys(currentSong) : 'none');
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
      console.log('window.YT:', !!window.YT);
      console.log('window.YT.Player:', !!window.YT?.Player);
      console.log('playerRef.current:', !!playerRef.current);
      
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
              autoplay: 0, // Don't autoplay initially
              controls: 1, // Show controls for debugging
              modestbranding: 1,
              rel: 0,
              showinfo: 1,
              iv_load_policy: 3,
              fs: 1, // Enable fullscreen
              cc_load_policy: 0,
              playsinline: 1
            },
            events: {
              onReady: (event: any) => {
                console.log('YouTube player ready!');
                event.target.setVolume(volume);
                if (isMuted) {
                  event.target.mute();
                }
                // Set initial play state
                if (isPlaying) {
                  console.log('Auto-playing video...');
                  event.target.playVideo();
                }
              },
              onStateChange: (event: any) => {
                console.log('YouTube player state changed:', event.data);
                // Handle player state changes
                if (event.data === window.YT.PlayerState.ENDED) {
                  onNext();
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
        console.log('window.YT:', window.YT);
        console.log('playerRef.current:', playerRef.current);
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
      }
    };
  }, [currentSong, volume, isMuted, onNext]);

  // Update player state when isPlaying changes
  useEffect(() => {
    if (youtubePlayerRef.current) {
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
  }, [isPlaying]);

  // Update volume
  useEffect(() => {
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.setVolume(volume);
    }
  }, [volume]);

  // Toggle mute
  const toggleMute = () => {
    if (youtubePlayerRef.current) {
      if (isMuted) {
        youtubePlayerRef.current.unMute();
      } else {
        youtubePlayerRef.current.mute();
      }
      setIsMuted(!isMuted);
    }
  };

  // Enter fullscreen
  const enterFullscreen = () => {
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.requestFullscreen();
    }
  };

  if (!currentSong) {
    return (
      <div className="card p-6 text-center">
        <div className="text-gray-500 mb-4">
          <Play className="w-16 h-16 mx-auto mb-2" />
          <p className="text-lg">No song selected</p>
          <p className="text-sm">Add songs to the queue to start playing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center space-x-4 mb-4">
        <img
          src={currentSong?.songId?.coverArt || currentSong?.coverArt || '/default-cover.jpg'}
          alt={currentSong?.songId?.title || currentSong?.title}
          className="w-16 h-16 rounded-lg object-cover"
        />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            {currentSong?.songId?.title || currentSong?.title}
          </h3>
          <p className="text-gray-600">{currentSong?.songId?.artist || currentSong?.artist}</p>
          <p className="text-sm text-gray-500">
            Duration: {Math.floor((currentSong?.songId?.duration || currentSong?.duration) / 60)}:
            {String((currentSong?.songId?.duration || currentSong?.duration) % 60).padStart(2, '0')}
          </p>
        </div>
      </div>

      {/* YouTube Player */}
      <div className="mb-4">
        <div className="text-sm text-gray-600 mb-2">YouTube Player:</div>
        <div ref={playerRef} className="w-full rounded-lg overflow-hidden bg-gray-200 border-2 border-dashed border-gray-300 min-h-[200px] flex items-center justify-center">
          <div className="text-gray-500">Loading YouTube player...</div>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Video URL: <a href={(() => {
            // Handle sources as array
            if (Array.isArray(currentSong?.sources)) {
              for (let i = 0; i < currentSong.sources.length; i++) {
                if (currentSong.sources[i]?.youtube) {
                  return currentSong.sources[i].youtube;
                }
              }
            }
            // Fallback to object structure
            return currentSong?.sources?.youtube || currentSong?.songId?.sources?.youtube || currentSong?.youtube || currentSong?.url;
          })()} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
            {(() => {
              // Handle sources as array
              if (Array.isArray(currentSong?.sources)) {
                for (let i = 0; i < currentSong.sources.length; i++) {
                  if (currentSong.sources[i]?.youtube) {
                    return currentSong.sources[i].youtube;
                  }
                }
              }
              // Fallback to object structure
              return currentSong?.sources?.youtube || currentSong?.songId?.sources?.youtube || currentSong?.youtube || currentSong?.url;
            })()}
          </a>
        </div>
      </div>

      {/* Custom Controls */}
      {isHost && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={onPrevious}
              className="p-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
              title="Previous"
            >
              <SkipForward className="w-5 h-5 rotate-180" />
            </button>
            
            <button
              onClick={() => {
                console.log('Play/Pause button clicked, current state:', isPlaying);
                onPlayPause();
              }}
              className="p-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            
            <button
              onClick={onNext}
              className="p-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
              title="Next"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center space-x-4">
            {/* Volume Control */}
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleMute}
                className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-20"
                disabled={isMuted}
              />
            </div>

            {/* Fullscreen */}
            <button
              onClick={enterFullscreen}
              className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
              title="Fullscreen"
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Non-host message */}
      {!isHost && (
        <div className="text-center text-gray-500 text-sm">
          Only the host can control playback
        </div>
      )}
    </div>
  );
};

export default WebPlayer;
