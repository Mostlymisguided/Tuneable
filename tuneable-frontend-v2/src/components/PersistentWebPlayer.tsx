import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { Play, Pause, Volume2, VolumeX, SkipForward, SkipBack, Youtube } from 'lucide-react';
import type { YTPlayer } from '../types/youtube';
import { partyAPI } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { type YouTubePlayerRef } from './YouTubePlayer';

// Helper function to format time (seconds to MM:SS)
const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Helper function to detect player type
const detectPlayerType = (song: any): 'youtube' | 'audio' | 'spotify' | null => {
  if (!song || !song.sources) return null;
  
  // Check if sources is an array
  if (Array.isArray(song.sources)) {
    for (const source of song.sources) {
      if (source?.platform === 'youtube' && source.url) return 'youtube';
      if (source?.platform === 'upload' && source.url) return 'audio';
      if (source?.platform === 'spotify' && source.url) return 'spotify';
      // Handle direct properties
      if (source?.youtube) return 'youtube';
      if (source?.spotify) return 'spotify';
    }
  } else if (typeof song.sources === 'object') {
    if (song.sources.youtube) return 'youtube';
    if (song.sources.upload) return 'audio';
    if (song.sources.spotify) return 'spotify';
  }
  
  return null;
};

// Helper function to extract source URL
const extractSourceUrl = (song: any, playerType: string): string | null => {
  if (!song || !song.sources) return null;
  
  if (Array.isArray(song.sources)) {
    for (const source of song.sources) {
      if (source?.platform === playerType && source.url) return source.url;
      if (playerType === 'youtube' && source?.youtube) return source.youtube;
      if (playerType === 'audio' && source?.upload) return source.upload;
      if (playerType === 'spotify' && source?.spotify) return source.spotify;
    }
  } else if (typeof song.sources === 'object') {
    if (playerType === 'youtube' && song.sources.youtube) return song.sources.youtube;
    if (playerType === 'audio' && song.sources.upload) return song.sources.upload;
    if (playerType === 'spotify' && song.sources.spotify) return song.sources.spotify;
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
  const [playerType, setPlayerType] = useState<'youtube' | 'audio' | null>(null);
  // Function to scroll to YouTube player (now in main content)
  const scrollToYouTubePlayer = () => {
    if (playerType === 'youtube' && currentSong?.sources?.youtube) {
      // Scroll to bottom of page where YouTube player will be rendered
      window.scrollTo({ 
        top: document.documentElement.scrollHeight, 
        behavior: 'smooth' 
      });
    }
  };
  const timePollingRef = useRef<NodeJS.Timeout | null>(null);
  const isSeeking = useRef(false);
  
  
  // Prevent duplicate rendering in StrictMode
  const [componentId] = useState(() => Math.random().toString(36).substr(2, 9));

  const {
    isPlaying,
    currentSong,
    currentSongIndex,
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

  // WebSocket connection for real-time updates
  useWebSocket({
    partyId: currentPartyId || '',
    onMessage: (message) => {
      console.log('PersistentWebPlayer received WebSocket message:', message);
      
      switch (message.type) {
        case 'SONG_COMPLETED':
          console.log('Song completed via WebSocket, refreshing queue');
          if (currentPartyId) {
            partyAPI.getPartyDetails(currentPartyId)
              .then(response => {
                const songs = response.party?.songs || [];
                const queuedSongs = songs.filter((song: any) => song.status === 'queued');
                
                const mappedSongs = queuedSongs.map((song: any) => {
                  const actualSong = song.songId || song;
                  return {
                    id: actualSong.id,
                    title: actualSong.title,
                    artist: actualSong.artist,
                    duration: actualSong.duration,
                    coverArt: actualSong.coverArt,
                    sources: actualSong.sources,
                    globalMediaAggregate: actualSong.globalMediaAggregate || 0,
                    bids: actualSong.bids || [],
                    addedBy: actualSong.addedBy,
                    totalBidValue: actualSong.totalBidValue || 0
                  };
                });
                
                setQueue(mappedSongs);
                
                if (queuedSongs.length === 0) {
                  useWebPlayerStore.getState().setCurrentSong(null);
                }
              })
              .catch(error => {
                console.error('Error refreshing queue after song completion:', error);
              });
          }
          break;
          
        case 'UPDATE_QUEUE':
          console.log('Queue updated via WebSocket');
          if (message.queue) {
            const queuedSongs = message.queue.filter((song: any) => song.status === 'queued');
            setQueue(queuedSongs);
            
            if (queuedSongs.length === 0) {
              useWebPlayerStore.getState().setCurrentSong(null);
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
        } else if (playerType === 'audio' && audioRef.current) {
          const current = audioRef.current.currentTime;
          const dur = audioRef.current.duration;
          setCurrentTime(current);
          if (dur && !isNaN(dur) && dur !== duration) {
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


  // Initialize player when song changes
  useEffect(() => {
    console.log('PersistentWebPlayer useEffect - currentSong:', currentSong);
    console.log('PersistentWebPlayer useEffect - isPlaying:', isPlaying);
    
    if (!currentSong) {
      console.log('No current song, clearing player');
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

    const detectedPlayerType = detectPlayerType(currentSong);
    console.log('Detected player type:', detectedPlayerType);
    
    if (!detectedPlayerType) {
      console.log('No valid player type detected');
      return;
    }

    // Skip Spotify for MVP
    if (detectedPlayerType === 'spotify') {
      console.log('Spotify not supported in MVP');
      return;
    }

    const sourceUrl = extractSourceUrl(currentSong, detectedPlayerType);
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
    } else if (detectedPlayerType === 'audio') {
      initializeAudioPlayer(sourceUrl);
    }
  }, [currentSong, isGlobalPlayerActive]);

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
                event.target.setVolume(volume);
                if (isMuted) {
                  event.target.mute();
                }
                const dur = event.target.getDuration();
                setDuration(dur);
                setIsPlayerReady(true);
                
                // YouTube player is always rendered when active
                
                if (isPlaying) {
                  console.log('Auto-playing video...');
                  event.target.playVideo();
                }
              },
              onStateChange: (event: any) => {
                console.log('YouTube player state changed:', event.data);
                if (event.data === window.YT.PlayerState.ENDED) {
                  if (currentPartyId && currentSong?.id && isHost) {
                    console.log('Notifying backend that song completed');
                    partyAPI.completeSong(currentPartyId, currentSong.id)
                      .then(() => {
                        console.log('Song completion confirmed, advancing to next song');
                        next();
                      })
                      .catch(error => {
                        console.error('Error notifying song completion:', error);
                        next();
                      });
                  } else {
                    console.log('Not host or no party/song, just advancing to next song');
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
      }
    };

    if (window.YT && window.YT.Player) {
      console.log('YouTube API already loaded, initializing immediately');
      initializePlayer();
    } else {
      console.log('Waiting for YouTube API to load...');
      window.onYouTubeIframeAPIReady = initializePlayer;
    }
  };

  const initializeAudioPlayer = (audioUrl: string) => {
    console.log('Initializing HTML5 audio player with URL:', audioUrl);
    
    if (!audioRef.current) {
      console.error('Audio ref not available');
      return;
    }

    try {
      // Set up audio element
      audioRef.current.src = audioUrl;
      audioRef.current.volume = volume / 100;
      audioRef.current.muted = isMuted;

      // Set up event listeners
      audioRef.current.onloadedmetadata = () => {
        console.log('Audio metadata loaded');
        if (audioRef.current) {
          const dur = audioRef.current.duration;
          setDuration(dur);
          setIsPlayerReady(true);
          
          if (isPlaying) {
            console.log('Auto-playing audio...');
            audioRef.current.play();
          }
        }
      };

      audioRef.current.onended = () => {
        console.log('Audio ended');
        if (currentPartyId && currentSong?.id && isHost) {
          partyAPI.completeSong(currentPartyId, currentSong.id)
            .then(() => {
              console.log('Song completion confirmed, advancing to next song');
              next();
            })
            .catch(error => {
              console.error('Error notifying song completion:', error);
              next();
            });
    } else {
          next();
        }
      };

      audioRef.current.onerror = (error) => {
        console.error('Audio playback error:', error);
      };

      // Load the audio
      audioRef.current.load();
      
      console.log('Audio player initialized successfully');
        } catch (error) {
      console.error('Error initializing audio player:', error);
    }
  };

  // Update player state when isPlaying changes
  useEffect(() => {
    if (isPlayerReady) {
      console.log('Updating player state, isPlaying:', isPlaying, 'playerType:', playerType);
      try {
        if (playerType === 'youtube' && youtubePlayerRef.current) {
          if (isPlaying && typeof youtubePlayerRef.current.playVideo === 'function') {
            youtubePlayerRef.current.playVideo();
          } else if (!isPlaying && typeof youtubePlayerRef.current.pauseVideo === 'function') {
            youtubePlayerRef.current.pauseVideo();
          }
        } else if (playerType === 'audio' && audioRef.current) {
          if (isPlaying) {
            audioRef.current.play();
          } else {
            audioRef.current.pause();
          }
        }
      } catch (error) {
        console.error('Error controlling player:', error);
      }
    }
  }, [isPlaying, isPlayerReady, playerType]);

  // Update volume when it changes
  useEffect(() => {
    if (isPlayerReady) {
      try {
        if (playerType === 'youtube' && youtubePlayerRef.current) {
          youtubePlayerRef.current.setVolume(volume);
          if (isMuted) {
            youtubePlayerRef.current.mute();
          } else {
            youtubePlayerRef.current.unMute();
          }
        } else if (playerType === 'audio' && audioRef.current) {
          audioRef.current.volume = volume / 100;
          audioRef.current.muted = isMuted;
        }
      } catch (error) {
        console.error('Error updating volume:', error);
      }
    }
  }, [volume, isMuted, isPlayerReady, playerType]);

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
      } else if (playerType === 'audio' && audioRef.current) {
        audioRef.current.currentTime = newTime;
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
      {playerType === 'audio' && (
        <audio ref={audioRef} className="hidden" />
      )}

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
          if (duration && currentSong) {
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
            {currentSong ? (
              <div className="text-center">
                <Link 
                  to={`/tune/${(currentSong as any)._id || currentSong.id}`}
                  className="hover:opacity-80 transition-opacity no-underline"
                >
                  <h4 className="text-base font-semibold text-white leading-tight">
                    {currentSong.title}
                  </h4>
                </Link>
                <p className="text-sm text-gray-300 leading-tight mt-1">
                  {Array.isArray(currentSong.artist) ? currentSong.artist.join(', ') : currentSong.artist}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <h4 className="text-base font-semibold text-gray-400">
                  No song playing
                </h4>
                <p className="text-sm text-gray-500 mt-1">
                  Select a song to start
                </p>
              </div>
            )}
          </div>

          {/* Row 2: Artwork, Scrubber, Playback Controls, and Volume */}
          <div className="flex items-center space-x-4 mb-2">
            {/* Left: Artwork */}
            {currentSong ? (
              <Link 
                to={`/tune/${(currentSong as any)._id || currentSong.id}`}
                className="flex w-12 h-12 bg-gray-800/50 rounded-lg overflow-hidden flex-shrink-0 shadow-lg hover:opacity-80 transition-opacity"
              >
                <img
                  src={currentSong.coverArt || '/default-cover.jpg'}
                  alt={currentSong.title}
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
                  disabled={!currentSong}
                  className="w-full h-2 bg-gray-600/50 rounded-full appearance-none cursor-pointer slider-thumb disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: currentSong && duration 
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
                disabled={currentSongIndex === 0 || !currentSong}
                  className="w-12 h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous Song"
              >
                <SkipBack className="h-4 w-4" />
              </button>

              <button
                  onClick={() => togglePlayPause()}
              disabled={!currentSong}
                  className="w-12 h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title={currentSong ? (isPlaying ? 'Pause' : 'Play') : 'No song playing'}
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6 ml-0.5" />
                ) : (
                  <Play className="h-6 w-6 ml-1" />
                )}
              </button>

              <button
                  onClick={() => next()}
                disabled={currentSongIndex >= queue.length - 1 || !currentSong}
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

              {/* YouTube Player Toggle Button */}
              {playerType === 'youtube' && (
                <button 
                  onClick={scrollToYouTubePlayer}
                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-white text-gray-900 hover:bg-red-50"
                  title="Scroll to YouTube Player"
                >
                  <Youtube className="h-5 w-5" />
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
