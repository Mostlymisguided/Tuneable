import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack, Maximize } from 'lucide-react';
import type { YTPlayer } from '../types/youtube';
import { partyAPI } from '../lib/api';
import { useSocketIOParty } from '../hooks/useSocketIOParty';
import { type YouTubePlayerRef } from './YouTubePlayer';

// Helper function to format time (seconds to MM:SS)
const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Helper function to detect player type
const detectPlayerType = (media: any): 'youtube' | 'audio' | null => {
  if (!media || !media.sources) return null;
  
  // Check if sources is an array
  if (Array.isArray(media.sources)) {
    for (const source of media.sources) {
      if (source?.platform === 'youtube' && source.url) return 'youtube';
      if (source?.platform === 'upload' && source.url) return 'audio';
      // Handle direct properties
      if (source?.youtube) return 'youtube';
    }
  } else if (typeof media.sources === 'object') {
    if (media.sources.youtube) return 'youtube';
    if (media.sources.upload) return 'audio';
  }
  
  return null;
};

// Helper function to extract source URL
const extractSourceUrl = (media: any, playerType: string): string | null => {
  if (!media || !media.sources) return null;
  
  if (Array.isArray(media.sources)) {
    for (const source of media.sources) {
      if (source?.platform === playerType && source.url) return source.url;
      if (playerType === 'youtube' && source?.youtube) return source.youtube;
    }
  } else if (typeof media.sources === 'object') {
    if (playerType === 'youtube' && media.sources.youtube) return media.sources.youtube;
  }
  
  return null;
};

// Extract YouTube video ID from URL
const getYouTubeVideoId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

// Global flag to prevent multiple instances in StrictMode
let activePlayerInstance: string | null = null;

// Global ref for external YouTube player
export let globalYouTubePlayerRef: YouTubePlayerRef | null = null;

// Function to set the global ref
export const setGlobalYouTubePlayerRef = (ref: YouTubePlayerRef | null) => {
  globalYouTubePlayerRef = ref;
};

const PersistentWebPlayer: React.FC = () => {
  const playerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YTPlayer | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [playerType, setPlayerType] = useState<'youtube' | null>(null);
  // Function to open YouTube player in fullscreen
  const openYouTubeFullscreen = () => {
    if (playerType === 'youtube') {
      // First try to use the YouTube Player API's native fullscreen
      if (youtubePlayerRef.current && typeof (youtubePlayerRef.current as any).getIframe === 'function') {
        const iframe = (youtubePlayerRef.current as any).getIframe();
        if (iframe) {
          try {
            if (iframe.requestFullscreen) {
              iframe.requestFullscreen();
            } else if (iframe.webkitRequestFullscreen) {
              iframe.webkitRequestFullscreen();
            } else if (iframe.mozRequestFullScreen) {
              iframe.mozRequestFullScreen();
            } else if (iframe.msRequestFullscreen) {
              iframe.msRequestFullscreen();
            }
          } catch (error) {
            console.error('Error requesting fullscreen:', error);
          }
        }
      } 
      // Fallback: try to find iframe in playerRef
      else if (playerRef.current) {
        const iframe = playerRef.current.querySelector('iframe');
        if (iframe) {
          try {
            if (iframe.requestFullscreen) {
              iframe.requestFullscreen();
            } else if ((iframe as any).webkitRequestFullscreen) {
              (iframe as any).webkitRequestFullscreen();
            } else if ((iframe as any).mozRequestFullScreen) {
              (iframe as any).mozRequestFullScreen();
            } else if ((iframe as any).msRequestFullscreen) {
              (iframe as any).msRequestFullscreen();
            }
          } catch (error) {
            console.error('Error requesting fullscreen:', error);
          }
        } else {
          console.log('No iframe found in playerRef');
        }
      }
    }
  };
  const timePollingRef = useRef<NodeJS.Timeout | null>(null);
  const isSeeking = useRef(false);
  
  
  // Prevent duplicate rendering in StrictMode
  const [componentId] = useState(() => Math.random().toString(36).substr(2, 9));

  const {
    isPlaying,
    currentMedia,
    currentMediaIndex,
    queue,
    volume,
    isMuted,
    isHost,
    isGlobalPlayerActive,
    currentPartyId,
    currentTime,
    duration,
    togglePlayPause,
    next,
    previous,
    toggleMute,
    setCurrentTime,
    setDuration,
    setQueue,
  } = useWebPlayerStore();

  // Simple approach - PersistentWebPlayer only handles YouTube media

  // Socket.IO connection for real-time updates
  useSocketIOParty({
    partyId: currentPartyId || '',
    enabled: !!currentPartyId,
    onMessage: (message) => {
      console.log('PersistentWebPlayer received party update:', message);
      
      switch (message.type) {
        case 'MEDIA_COMPLETED':
          console.log('Media completed via Socket.IO, refreshing queue');
          if (currentPartyId) {
            partyAPI.getPartyDetails(currentPartyId)
              .then(response => {
                const mediaItems = response.party?.media || [];
                const queuedMedia = mediaItems.filter((item: any) => item.status === 'queued');
                
                const mappedMedia = queuedMedia.map((item: any) => {
                  const actualMedia = item.mediaId || item;
                  return {
                    id: actualMedia.id,
                    title: actualMedia.title,
                    artist: actualMedia.artist,
                    duration: actualMedia.duration,
                    coverArt: actualMedia.coverArt,
                    sources: actualMedia.sources,
                    globalMediaAggregate: actualMedia.globalMediaAggregate || 0,
                    bids: actualMedia.bids || [],
                    addedBy: actualMedia.addedBy,
                    totalBidValue: actualMedia.totalBidValue || 0
                  };
                });
                
                setQueue(mappedMedia);
                
                if (queuedMedia.length === 0) {
                  useWebPlayerStore.getState().setCurrentMedia(null);
                }
              })
              .catch(error => {
                console.error('Error refreshing queue after media completion:', error);
              });
          }
          break;
          
        case 'UPDATE_QUEUE':
          console.log('Queue updated via Socket.IO');
          if (message.queue) {
            const queuedMedia = message.queue.filter((item: any) => item.status === 'queued');
            setQueue(queuedMedia);
            
            if (queuedMedia.length === 0) {
              useWebPlayerStore.getState().setCurrentMedia(null);
            }
          }
          break;
      }
    }
  });

  // Time polling effect - polls player every 500ms to update currentTime
  useEffect(() => {
    if (!isPlayerReady || !isPlaying || isSeeking.current) {
      if (timePollingRef.current) {
        clearInterval(timePollingRef.current);
        timePollingRef.current = null;
      }
      return;
    }

    // Start polling
    timePollingRef.current = setInterval(() => {
      try {
        if (playerType === 'youtube' && youtubePlayerRef.current) {
          const current = youtubePlayerRef.current.getCurrentTime();
          const dur = youtubePlayerRef.current.getDuration();
          setCurrentTime(current);
          if (dur && dur !== duration) {
            setDuration(dur);
          }
        }
      } catch (error) {
        console.error('Error polling player time:', error);
      }
    }, 500);

    return () => {
      if (timePollingRef.current) {
        clearInterval(timePollingRef.current);
        timePollingRef.current = null;
      }
    };
  }, [isPlayerReady, isPlaying, playerType, duration, setCurrentTime, setDuration]);


  // Initialize player when media changes - ONLY for YouTube media
  useEffect(() => {
    console.log('PersistentWebPlayer useEffect - currentMedia:', currentMedia);
    console.log('PersistentWebPlayer useEffect - isPlaying:', isPlaying);
    
    if (!currentMedia) {
      console.log('No current media, clearing player');
      // Don't destroy globalYouTubePlayerRef - it's managed by the external component
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setIsPlayerReady(false);
      setPlayerType(null);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const detectedPlayerType = detectPlayerType(currentMedia);
    console.log('Detected player type:', detectedPlayerType);
    
    if (!detectedPlayerType) {
      console.log('No valid player type detected');
      return;
    }

    // Only handle YouTube media - if it's audio, reset the player
    if (detectedPlayerType === 'audio') {
      console.log('Audio media detected - resetting player (MP3Player will handle)');
      setPlayerType(null);
      setIsPlayerReady(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    const sourceUrl = extractSourceUrl(currentMedia, detectedPlayerType);
    console.log('Source URL:', sourceUrl);
    
    if (!sourceUrl) {
      console.log('No valid source URL found');
      return;
    }

    setPlayerType(detectedPlayerType);

    if (detectedPlayerType === 'youtube') {
      const videoId = getYouTubeVideoId(sourceUrl);
      if (!videoId) {
        console.log('No valid YouTube video ID found for:', sourceUrl);
        return;
      }
      initializeYouTubePlayer(videoId);
    }
  }, [currentMedia, isGlobalPlayerActive]);

  const initializeYouTubePlayer = (videoId: string) => {
    console.log('Initializing YouTube player with video ID:', videoId);

    // Load YouTube API if not already loaded
    if (!window.YT) {
      console.log('Loading YouTube API...');
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initializePlayer = () => {
      console.log('Initializing YouTube player...');
      
      // Add a small delay to ensure DOM is stable after transition
      setTimeout(() => {
        if (window.YT && window.YT.Player && playerRef.current) {
        try {
          // Clear any existing player
          if (youtubePlayerRef.current) {
            youtubePlayerRef.current.destroy();
          }
          
          youtubePlayerRef.current = new window.YT.Player(playerRef.current, {
            height: '270',
            width: '480',
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
                console.log('YouTube player ready - isPlaying:', isPlaying);
                event.target.setVolume(volume);
                if (isMuted) {
                  event.target.mute();
                }
                const dur = event.target.getDuration();
                setDuration(dur);
                setIsPlayerReady(true);
                
                // YouTube player is always rendered when active
                
                // Small delay to ensure state is synchronized
                setTimeout(() => {
                  if (isPlaying) {
                    console.log('Auto-playing video...');
                    event.target.playVideo();
                  } else {
                    console.log('YouTube player ready but not playing - isPlaying is false');
                    // Force play if we're in a transition from MP3
                    console.log('Forcing play for transition...');
                    event.target.playVideo();
                  }
                }, 100);
              },
              onStateChange: (event: any) => {
                console.log('YouTube player state changed:', event.data);
                if (event.data === window.YT.PlayerState.ENDED) {
                  if (currentPartyId && currentMedia?.id && isHost) {
                    console.log('Notifying backend that media completed');
                    partyAPI.completeMedia(currentPartyId, currentMedia.id)
                      .then(() => {
                        console.log('Media completion confirmed, advancing to next media');
                        next();
                      })
                      .catch(error => {
                        console.error('Error notifying media completion:', error);
                        next();
                      });
                  } else {
                    console.log('Not host or no party/media, just advancing to next media');
                    next();
                  }
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
        console.log('YouTube API or player ref not available after delay');
      }
      }, 200); // 200ms delay to ensure DOM stability
    };

    if (window.YT && window.YT.Player) {
      console.log('YouTube API already loaded, initializing immediately');
      initializePlayer();
    } else {
      console.log('Waiting for YouTube API to load...');
      window.onYouTubeIframeAPIReady = initializePlayer;
    }
  };


  // Update player state when isPlaying changes - only for YouTube media
  useEffect(() => {
    if (isPlayerReady && playerType === 'youtube') {
      console.log('Updating YouTube player state, isPlaying:', isPlaying);
      try {
        if (youtubePlayerRef.current) {
          if (isPlaying && typeof youtubePlayerRef.current.playVideo === 'function') {
            youtubePlayerRef.current.playVideo();
          } else if (!isPlaying && typeof youtubePlayerRef.current.pauseVideo === 'function') {
            youtubePlayerRef.current.pauseVideo();
          }
        }
      } catch (error) {
        console.error('Error controlling YouTube player:', error);
      }
    }
  }, [isPlaying, isPlayerReady, playerType]);

  // Update volume when it changes - only for YouTube media
  useEffect(() => {
    if (isPlayerReady && playerType === 'youtube') {
      try {
        if (youtubePlayerRef.current) {
          youtubePlayerRef.current.setVolume(volume);
          if (isMuted) {
            youtubePlayerRef.current.mute();
          } else {
            youtubePlayerRef.current.unMute();
          }
        }
      } catch (error) {
        console.error('Error updating YouTube volume:', error);
      }
    }
  }, [volume, isMuted, isPlayerReady, playerType]);

  // Keyboard controls - spacebar for play/pause
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle spacebar
      if (e.code !== 'Space' && e.key !== ' ') return;
      
      // Don't interfere with typing in input fields, textareas, or contenteditable elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      
      // Prevent default spacebar behavior (page scroll)
      e.preventDefault();
      
      // Toggle play/pause if there's current media
      if (currentMedia) {
        togglePlayPause();
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [currentMedia, togglePlayPause]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
      if (timePollingRef.current) {
        clearInterval(timePollingRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      // Clear active instance if this is the active one
      if (activePlayerInstance === componentId) {
        activePlayerInstance = null;
        console.log('Clearing active player instance:', componentId);
      }
    };
  }, [componentId]);

  // Handle seeking
  const handleSeek = (newTime: number) => {
    isSeeking.current = true;
    setCurrentTime(newTime);
    
    try {
      if (playerType === 'youtube' && youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(newTime);
      }
    } catch (error) {
      console.error('Error seeking:', error);
    }
    
    // Re-enable polling after a short delay
    setTimeout(() => {
      isSeeking.current = false;
    }, 100);
  };


  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    handleSeek(newTime);
  };


  // Don't render if player is not globally active
  if (!isGlobalPlayerActive) {
    return null;
  }

  // Prevent duplicate rendering in React.StrictMode
  if (activePlayerInstance && activePlayerInstance !== componentId) {
    console.log('Preventing duplicate player instance:', componentId);
    return null;
  }
  
  if (!activePlayerInstance) {
    activePlayerInstance = componentId;
    console.log('Setting active player instance:', componentId);
  }

  return (
    <>
      {/* HTML5 Audio Player (always hidden, no visual) */}
      {/* Audio element removed - MP3Player handles audio now */}

      {/* Main Player Bar - Fixed to bottom of viewport */}
      <div 
        className="backdrop-blur-xl border-t border-gray-700/50 shadow-2xl"
        style={{ 
          position: 'fixed', 
          bottom: 0, 
          left: 0, 
          right: 0, 
          width: '100%',
          zIndex: 9999,
          background: 'linear-gradient(to top, rgba(17, 24, 39, 0.2), rgba(31, 41, 55, 0.2), rgba(55, 65, 81, 0.2))'
        }}
      >
        {/* Progress Bar Row */}
        <div className="w-full bg-gray-800/50 h-1 group cursor-pointer" onClick={(e) => {
          if (duration && currentMedia) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            const newTime = percentage * duration;
            handleSeek(newTime);
          }
        }}>
          <div 
            className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-100 relative"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
          </div>
        </div>

        {/* 3-Row Layout */}
        <div className="px-4 py-3 space-y-0">
          
          {/* Row 1: Title and Artist */}
          <div className="flex items-center justify-center">
            {currentMedia ? (
              <div className="text-center">
                <Link 
                  to={`/tune/${(currentMedia as any)._id || currentMedia.id}`}
                  className="hover:opacity-80 transition-opacity no-underline"
                >
                  <h4 className="text-base font-semibold text-white leading-tight">
                    {currentMedia.title}
                  </h4>
                </Link>
                <p className="text-sm text-gray-300 leading-tight mt-1">
                  {currentMedia.creatorDisplay || 
                   (Array.isArray(currentMedia.artist) 
                     ? currentMedia.artist.map((a: any) => a.name || a).join(' & ') + 
                       (currentMedia.featuring && currentMedia.featuring.length > 0 
                         ? ' ft. ' + currentMedia.featuring.map((f: any) => f.name || f).join(', ') 
                         : '')
                     : currentMedia.artist || 'Unknown Artist')}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <h4 className="text-base font-semibold text-gray-400">
                  No media playing
                </h4>
                <p className="text-sm text-gray-500 mt-1">
                  Select media to start
                </p>
              </div>
            )}
          </div>

          {/* Row 2: Artwork, Scrubber, Playback Controls, and Volume */}
          <div className="flex items-center space-x-4 mb-2">
            {/* Left: Artwork */}
            {currentMedia ? (
              <Link 
                to={`/tune/${(currentMedia as any)._id || currentMedia.id}`}
                className="flex w-12 h-12 bg-gray-800/50 rounded-lg overflow-hidden flex-shrink-0 shadow-lg hover:opacity-80 transition-opacity"
              >
                <img
                  src={currentMedia.coverArt || '/default-cover.jpg'}
                  alt={currentMedia.title}
                  className="w-full h-full object-cover"
                />
              </Link>
            ) : (
              <div className="w-12 h-12 bg-gray-800/50 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center shadow-lg">
                <Play className="h-6 w-6 text-gray-400" />
              </div>
            )}

            {/* Time Display */}
            <div className="text-xs text-gray-400 font-mono w-12 text-right">
              {formatTime(currentTime)}
            </div>

            {/* Center: Scrubber and Duration */}
            <div className="flex-1 flex items-center space-x-3">
              <div className="flex-1 max-w-md">
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleScrubberChange}
                  disabled={!currentMedia}
                  className="w-full h-2 bg-gray-600/50 rounded-full appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: currentMedia && duration 
                      ? `linear-gradient(to right, #9333ea 0%, #9333ea ${(currentTime / duration) * 100}%, rgba(75, 85, 99, 0.5) ${(currentTime / duration) * 100}%, rgba(75, 85, 99, 0.5) 100%)`
                      : 'rgba(75, 85, 99, 0.5)'
                  }}
                />
              </div>
              <div className="text-xs text-gray-400 font-mono w-12">
                {formatTime(duration)}
              </div>
            </div>

            {/* YouTube Player - Compact inline version */}
            {playerType === 'youtube' && (
              <div 
                ref={playerRef} 
                className="w-24 h-16 sm:w-32 sm:h-20 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 shadow-lg border border-gray-600"
              />
            )}

            {/* Right: Controls and Volume */}
            <div className="flex items-center space-x-3">
            {/* Playback Controls */}
            <div className="flex items-center space-x-2">
              <button
                  onClick={() => previous()}
                disabled={currentMediaIndex === 0 || !currentMedia}
                  className="w-12 h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous Song"
              >
                <SkipBack className="h-4 w-4" />
              </button>

              <button
                  onClick={() => togglePlayPause()}
              disabled={!currentMedia}
                  className="w-12 h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title={currentMedia ? (isPlaying ? 'Pause' : 'Play') : 'No media playing'}
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6 ml-0.5" />
                ) : (
                  <Play className="h-6 w-6 ml-1" />
                )}
              </button>

              <button
                  onClick={next}
                disabled={currentMediaIndex >= queue.length - 1 || !currentMedia}
                  className="w-12 h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next Song"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>

              {/* Mute Toggle */}
            <button
                onClick={toggleMute}
              className="w-12 h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
            </button>

              {/* YouTube Fullscreen Button */}
              {playerType === 'youtube' && (
                <button 
                  onClick={openYouTubeFullscreen}
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 bg-white text-gray-900 hover:bg-purple-50"
                  title="Open YouTube Fullscreen"
                >
                  <Maximize className="h-5 w-5" />
                </button>
              )}
          </div>
        </div>

        </div>
      </div>


      {/* Custom slider styles */}
      <style>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
          border: 2px solid #9333ea;
        }
        
        .slider-thumb::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 2px solid #9333ea;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
        }

        .slider-thumb:disabled::-webkit-slider-thumb {
          cursor: not-allowed;
          border-color: #6b7280;
        }
        
        .slider-thumb:disabled::-moz-range-thumb {
          cursor: not-allowed;
          border-color: #6b7280;
        }
      `}</style>
    </>
  );
};

export default PersistentWebPlayer;
