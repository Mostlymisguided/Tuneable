import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { useAuth } from '../contexts/AuthContext';
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack, Maximize } from 'lucide-react';
import type { YTPlayer } from '../types/youtube';
import { partyAPI } from '../lib/api';
import { useSocketIOParty } from '../hooks/useSocketIOParty';
import { type YouTubePlayerRef } from './YouTubePlayer';
import ClickableArtistDisplay from './ClickableArtistDisplay';

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
  const { user } = useAuth();
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
    setVolume,
    setCurrentTime,
    setDuration,
    setQueue,
    setCurrentMedia,
    setGlobalPlayerActive,
  } = useWebPlayerStore();

  const handleGlobalKeydown = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const isTypingTarget = target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      (target as HTMLInputElement).type === 'text' ||
      (target as HTMLInputElement).type === 'password' ||
      (target as HTMLInputElement).type === 'email' ||
      (target as HTMLInputElement).type === 'number'
    );

    if (isTypingTarget) {
      return;
    }

    // Only handle keyboard shortcuts if there's current media
    if (!currentMedia) {
      return;
    }

    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      togglePlayPause();
    } else if (event.code === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault();
      previous();
    }
  }, [togglePlayPause, next, previous, currentMedia]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
    };
  }, [handleGlobalKeydown]);

  // Simple approach - PersistentWebPlayer only handles YouTube media

  // Socket.IO connection for real-time updates - only when authenticated and party exists
  useSocketIOParty({
    partyId: currentPartyId || '',
    enabled: !!(user && currentPartyId),
    onMessage: (message) => {
      console.log('PersistentWebPlayer received party update:', message);
      
      switch (message.type) {
        case 'MEDIA_COMPLETED':
          console.log('Media completed via Socket.IO, refreshing queue');
          if (currentPartyId) {
            partyAPI.getPartyDetails(currentPartyId)
              .then(response => {
                const mediaItems = response.party?.media || [];
                const queuedMedia = mediaItems.filter((item: any) => item.status === 'active');
                
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
            const queuedMedia = message.queue.filter((item: any) => item.status === 'active');
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
          // Check if methods are available before calling
          if (typeof youtubePlayerRef.current.getCurrentTime === 'function' && 
              typeof youtubePlayerRef.current.getDuration === 'function') {
            const current = youtubePlayerRef.current.getCurrentTime();
            const dur = youtubePlayerRef.current.getDuration();
            setCurrentTime(current);
            if (dur && dur !== duration) {
              setDuration(dur);
            }
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
                
                // Check if playback should start (user clicked play or autotransition)
                const currentIsPlaying = useWebPlayerStore.getState().isPlaying;
                if (currentIsPlaying) {
                  console.log('YouTube player ready - starting playback (isPlaying is true)');
                  try {
                    // Small delay to ensure player is fully initialized
                    setTimeout(() => {
                      if (event.target && typeof event.target.playVideo === 'function') {
                        event.target.playVideo();
                        // Check if play actually started (important for iOS autoplay restrictions)
                        // Wait longer to allow buffering to complete
                        setTimeout(() => {
                          try {
                            if (typeof event.target.getPlayerState === 'function') {
                              const playerState = event.target.getPlayerState();
                              const stillShouldBePlaying = useWebPlayerStore.getState().isPlaying;
                              // YT.PlayerState.PLAYING = 1, YT.PlayerState.PAUSED = 2, YT.PlayerState.CUED = 5, YT.PlayerState.BUFFERING = 3
                              // Accept PLAYING or BUFFERING as valid states (player is trying to play)
                              // Only reset if PAUSED or CUED (player is not trying to play)
                              if (stillShouldBePlaying && 
                                  playerState !== window.YT.PlayerState.PLAYING && 
                                  playerState !== window.YT.PlayerState.BUFFERING) {
                                console.warn('Play failed (likely iOS autoplay restriction or embedding error), resetting isPlaying state. Player state:', playerState);
                                useWebPlayerStore.getState().pause();
                              } else if (playerState === window.YT.PlayerState.BUFFERING) {
                                // Still buffering, check again in a bit
                                setTimeout(() => {
                                  const finalState = event.target.getPlayerState();
                                  const stillShouldBePlaying = useWebPlayerStore.getState().isPlaying;
                                  if (stillShouldBePlaying && 
                                      finalState !== window.YT.PlayerState.PLAYING && 
                                      finalState !== window.YT.PlayerState.BUFFERING) {
                                    console.warn('Play failed after buffering, resetting isPlaying state. Final state:', finalState);
                                    useWebPlayerStore.getState().pause();
                                  }
                                }, 1000);
                              }
                            }
                          } catch (checkError) {
                            console.error('Error checking player state:', checkError);
                            // If we can't check state, assume play failed and reset
                            const stillShouldBePlaying = useWebPlayerStore.getState().isPlaying;
                            if (stillShouldBePlaying) {
                              useWebPlayerStore.getState().pause();
                            }
                          }
                        }, 1500); // Increased delay to allow buffering
                      }
                    }, 100);
                  } catch (error) {
                    console.error('Error playing video:', error);
                    useWebPlayerStore.getState().pause();
                  }
                } else {
                  console.log('YouTube player ready - waiting for user to start playback');
                }
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
                // Error 150/101: Video cannot be played in embedded players (embedding disabled)
                if (event.data === 150 || event.data === 101) {
                  console.error('Video cannot be played in embedded player - embedding may be disabled');
                  // Don't reset playing state here - let the user see the error
                  // The video will need to be played directly on YouTube
                } else {
                  // For other errors, reset playing state
                  const currentIsPlaying = useWebPlayerStore.getState().isPlaying;
                  if (currentIsPlaying) {
                    useWebPlayerStore.getState().pause();
                  }
                }
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
    if (isPlayerReady && playerType === 'youtube' && youtubePlayerRef.current) {
      console.log('Updating YouTube player state, isPlaying:', isPlaying);
      try {
        // Check if player methods are available before calling
        if (isPlaying) {
          if (typeof youtubePlayerRef.current.playVideo === 'function') {
            youtubePlayerRef.current.playVideo();
            // Verify play actually started (important for iOS autoplay restrictions)
            // Wait longer to allow buffering to complete
            setTimeout(() => {
              if (youtubePlayerRef.current && typeof youtubePlayerRef.current.getPlayerState === 'function') {
                try {
                  const playerState = youtubePlayerRef.current.getPlayerState();
                  const stillShouldBePlaying = useWebPlayerStore.getState().isPlaying;
                  // YT.PlayerState.PLAYING = 1, YT.PlayerState.BUFFERING = 3
                  // Accept PLAYING or BUFFERING as valid states (player is trying to play)
                  // Only reset if PAUSED or CUED (player is not trying to play)
                  if (stillShouldBePlaying && 
                      playerState !== window.YT.PlayerState.PLAYING && 
                      playerState !== window.YT.PlayerState.BUFFERING) {
                    console.warn('Play failed (likely iOS autoplay restriction or embedding error), resetting isPlaying state. Player state:', playerState);
                    useWebPlayerStore.getState().pause();
                  } else if (playerState === window.YT.PlayerState.BUFFERING) {
                    // Still buffering, check again in a bit
                    setTimeout(() => {
                      if (youtubePlayerRef.current) {
                        const finalState = youtubePlayerRef.current.getPlayerState();
                        const stillShouldBePlaying = useWebPlayerStore.getState().isPlaying;
                        if (stillShouldBePlaying && 
                            finalState !== window.YT.PlayerState.PLAYING && 
                            finalState !== window.YT.PlayerState.BUFFERING) {
                          console.warn('Play failed after buffering, resetting isPlaying state. Final state:', finalState);
                          useWebPlayerStore.getState().pause();
                        }
                      }
                    }, 1000);
                  }
                } catch (error) {
                  console.error('Error checking player state:', error);
                  // If we can't check state, assume play failed and reset
                  const stillShouldBePlaying = useWebPlayerStore.getState().isPlaying;
                  if (stillShouldBePlaying) {
                    useWebPlayerStore.getState().pause();
                  }
                }
              }
            }, 1500); // Increased delay to allow buffering
          }
        } else {
          if (typeof youtubePlayerRef.current.pauseVideo === 'function') {
            youtubePlayerRef.current.pauseVideo();
          }
        }
      } catch (error) {
        console.error('Error controlling YouTube player:', error);
        // Reset playing state if there's an error
        const currentIsPlaying = useWebPlayerStore.getState().isPlaying;
        if (currentIsPlaying) {
          useWebPlayerStore.getState().pause();
        }
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

  // Keyboard controls are handled by handleGlobalKeydown above
  // Removed duplicate handler to prevent double-toggling

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
                  <ClickableArtistDisplay media={currentMedia} />
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
                  src={currentMedia.coverArt || 'https://uploads.tuneable.stream/cover-art/default-cover.png'}
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
            <div className="hidden flex-1 md:flex items-center space-x-3">
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
                className="w-12 h-8 sm:w-32 sm:h-20 bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 shadow-lg border border-gray-600"
              />
            )}

            {/* Right: Controls and Volume */}
            <div className="flex items-center space-x-3">
            {/* Playback Controls */}
            <div className="flex items-center space-x-2">
              <button
                  onClick={() => previous()}
                disabled={currentMediaIndex === 0 || !currentMedia}
                  className="w-6 h-6 md:w-12 md:h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous Song"
              >
                <SkipBack className="h-3 w-3 md:h-4 md:w-4" />
              </button>

              <button
                  onClick={() => togglePlayPause()}
              disabled={!currentMedia}
                  className="w-6 h-6 md:w-12 md:h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title={currentMedia ? (isPlaying ? 'Pause' : 'Play') : 'No media playing'}
              >
                {isPlaying ? (
                  <Pause className="h-3 w-3 md:h-4 md:w-4 ml-0.5" />
                ) : (
                  <Play className="h-3 w-3 md:h-4 md:w-4 ml-1" />
                )}
              </button>

              <button
                  onClick={next}
                disabled={currentMediaIndex >= queue.length - 1 || !currentMedia}
                  className="w-6 h-6 md:w-12 md:h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next Song"
              >
                <SkipForward className="h-3 w-3 md:h-4 md:w-4" />
              </button>
            </div>

              {/* Volume Control */}
            <div className="flex items-center space-x-2 group">
              {/* Mute Toggle */}
              <button
                onClick={toggleMute}
                className="w-6 h-6 md:w-12 md:h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? (
                  <VolumeX className="h-3 w-3 md:h-4 md:w-4" />
                ) : (
                  <Volume2 className="h-3 w-3 md:h-4 md:w-4" />
                )}
              </button>
              
              {/* Volume Slider */}
              <div className="hidden md:flex items-center w-24 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const newVolume = parseInt(e.target.value);
                    setVolume(newVolume);
                    if (newVolume > 0 && isMuted) {
                      toggleMute(); // Unmute if volume is increased
                    }
                  }}
                  onClick={() => {
                    // Unmute if clicking on slider
                    if (isMuted) {
                      toggleMute();
                    }
                  }}
                  className="w-full h-2 bg-gray-600/50 rounded-full appearance-none cursor-pointer slider-thumb"
                  style={{
                    background: `linear-gradient(to right, #9333ea 0%, #9333ea ${isMuted ? 0 : volume}%, rgba(75, 85, 99, 0.5) ${isMuted ? 0 : volume}%, rgba(75, 85, 99, 0.5) 100%)`
                  }}
                  title={`Volume: ${volume}%`}
                />
              </div>
            </div>

              {/* YouTube Fullscreen Button */}
              {playerType === 'youtube' && (
                <button 
                  onClick={openYouTubeFullscreen}
                  className="w-6 h-6 md:w-12 md:h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 bg-white text-gray-900 hover:bg-purple-50"
                  title="Open YouTube Fullscreen"
                >
                  <Maximize className="h-3 w-3 md:h-4 md:w-4" />
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
