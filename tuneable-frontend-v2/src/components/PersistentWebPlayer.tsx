import React, { useEffect, useRef, useState } from 'react';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { Play, Pause, Volume2, VolumeX, Maximize, Music, X, SkipForward, SkipBack } from 'lucide-react';
import type { YTPlayer } from '../types/youtube';
import { partyAPI } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { spotifyService } from '../services/spotifyService';

// Extend Window interface to include Spotify
declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

const PersistentWebPlayer: React.FC = () => {
  const playerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YTPlayer | null>(null);
  const spotifyPlayerRef = useRef<any>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [musicSource, setMusicSource] = useState<'youtube' | 'spotify' | null>(null);
  const [isManualControl, setIsManualControl] = useState(false);

  const {
    isPlaying,
    currentSong,
    volume,
    isMuted,
    isHost,
    isGlobalPlayerActive,
    currentPartyId,
    play,
    pause,
    togglePlayPause,
    next,
    setVolume,
    toggleMute,
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
          // Refresh the queue to get updated song statuses
          if (currentPartyId) {
            partyAPI.getPartyDetails(currentPartyId)
              .then(response => {
                // Handle both response.songs and response.party.songs structures
                const songs = response.party?.songs || [];
                const queuedSongs = songs.filter((song: any) => song.status === 'queued');
                
                // Map to the expected Song format
                const mappedSongs = queuedSongs.map((song: any) => {
                  const actualSong = song.songId || song;
                  return {
                    id: actualSong.id,
                    title: actualSong.title,
                    artist: actualSong.artist,
                    duration: actualSong.duration,
                    coverArt: actualSong.coverArt,
                    sources: actualSong.sources,
                    globalBidValue: actualSong.globalBidValue || 0,
                    bids: actualSong.bids || [],
                    addedBy: actualSong.addedBy,
                    totalBidValue: actualSong.totalBidValue || 0
                  };
                });
                
                setQueue(mappedSongs);
                
                // If no queued songs, stop the player
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
            
            // If no queued songs, stop the player
            if (queuedSongs.length === 0) {
              useWebPlayerStore.getState().setCurrentSong(null);
            }
          }
          break;
      }
    }
  });

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

    // Determine music source and extract appropriate URL
    let musicSource: 'youtube' | 'spotify' | null = null;
    let sourceUrl: string | null = null;
    
    if (currentSong.sources) {
      if (Array.isArray(currentSong.sources)) {
        console.log('Searching through sources array...');
        for (let i = 0; i < currentSong.sources.length; i++) {
          const source = currentSong.sources[i];
          
          // Check if this is Mongoose metadata corruption
          if (source && source.platform === '$__parent' && source.url && source.url.sources) {
            console.log('Found Mongoose metadata corruption, extracting from nested structure');
            if (source.url.sources.youtube) {
              musicSource = 'youtube';
              sourceUrl = source.url.sources.youtube;
              console.log('Found YouTube URL in nested structure:', sourceUrl);
              break;
            } else if (source.url.sources.spotify) {
              musicSource = 'spotify';
              sourceUrl = source.url.sources.spotify;
              console.log('Found Spotify URI in nested structure:', sourceUrl);
              break;
            }
          } else if (source && source.platform === 'youtube' && source.url) {
            musicSource = 'youtube';
            sourceUrl = source.url;
            console.log('Found YouTube URL in sources array:', sourceUrl);
            break;
          } else if (source && source.platform === 'spotify' && source.url) {
            musicSource = 'spotify';
            sourceUrl = source.url;
            console.log('Found Spotify URI in sources array:', sourceUrl);
            break;
          } else if (source?.youtube) {
            musicSource = 'youtube';
            sourceUrl = source.youtube;
            console.log('Found YouTube URL in direct property:', sourceUrl);
            break;
          } else if (source?.spotify) {
            musicSource = 'spotify';
            sourceUrl = source.spotify;
            console.log('Found Spotify URI in direct property:', sourceUrl);
            break;
          }
        }
      } else if (typeof currentSong.sources === 'object') {
        if (currentSong.sources.youtube) {
          musicSource = 'youtube';
          sourceUrl = currentSong.sources.youtube;
          console.log('Found YouTube URL in sources.youtube:', sourceUrl);
        } else if (currentSong.sources.spotify) {
          musicSource = 'spotify';
          sourceUrl = currentSong.sources.spotify;
          console.log('Found Spotify URI in sources.spotify:', sourceUrl);
        }
      }
    }
    
    console.log('Music source detected:', musicSource);
    console.log('Source URL found:', sourceUrl);
    
    if (!musicSource || !sourceUrl) {
      console.log('No valid music source available');
      return;
    }

    setMusicSource(musicSource);

    if (musicSource === 'youtube') {
      const videoId = getYouTubeVideoId(sourceUrl);
      if (!videoId) {
        console.log('No valid YouTube video ID found for:', sourceUrl);
        return;
      }
      initializeYouTubePlayer(videoId);
    } else if (musicSource === 'spotify') {
      // If we already have a Spotify player, just change the track
      if (spotifyPlayerRef.current && isPlayerReady) {
        console.log('Changing Spotify track to:', sourceUrl);
        // Use Web API to change track (SDK doesn't have play method)
        playSpotifyTrack(sourceUrl);
      } else {
        initializeSpotifyPlayer(sourceUrl);
      }
    }
  }, [currentSong, isPlaying, isGlobalPlayerActive]);

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
                if (event.data === window.YT.PlayerState.PLAYING) {
                  // Note: We don't call /play endpoint here because the WebPlayer
                  // automatically starts playing songs that are already in the queue.
                  // The /complete endpoint can handle both "queued" and "playing" songs.
                  console.log('Song started playing in WebPlayer');
                } else if (event.data === window.YT.PlayerState.ENDED) {
                  // Notify backend that song completed
                  if (currentPartyId && currentSong?.id && isHost) {
                    console.log('Notifying backend that song completed');
                    partyAPI.completeSong(currentPartyId, currentSong.id)
                      .then(() => {
                        console.log('Song completion confirmed, advancing to next song');
                        next();
                      })
                      .catch(error => {
                        console.error('Error notifying song completion:', error);
                        // Still advance to next song even if completion fails
                        next();
                      });
                  } else {
                    // If not host or no party/song, just advance
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

  };

  const initializeSpotifyPlayer = async (spotifyUri: string) => {
    console.log('Initializing Spotify player with URI:', spotifyUri);
    
    try {
      // Get valid access token (refresh if needed)
      const accessToken = await spotifyService.getValidAccessToken();
      
      // Check if user has Spotify Premium (required for Web Playback SDK)
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to check Spotify profile');
      }
      
      const profile = await response.json();
      if (profile.product !== 'premium') {
        alert('Spotify Premium is required to play music. Please upgrade your account.');
        return;
      }
      
      createSpotifyPlayer(spotifyUri, accessToken);
    } catch (error: any) {
      console.error('Error initializing Spotify player:', error);
      if (error.message === 'REFRESH_TOKEN_EXPIRED') {
        alert('Spotify session expired. Please reconnect your account.');
        // Clear tokens and redirect to search page
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expires');
      } else {
        alert('Error connecting to Spotify. Please try reconnecting your account.');
      }
    }
  };

  const createSpotifyPlayer = (spotifyUri: string, accessToken: string) => {
    // Check if Spotify SDK is already loaded
    if (window.Spotify) {
      initializeSpotifyPlayerInstance(spotifyUri, accessToken);
    } else {
      // Set up callback for when SDK loads
      window.onSpotifyWebPlaybackSDKReady = () => {
        initializeSpotifyPlayerInstance(spotifyUri, accessToken);
      };
    }
  };

  const initializeSpotifyPlayerInstance = (spotifyUri: string, accessToken: string) => {
    try {
      // Clear any existing player
      if (spotifyPlayerRef.current) {
        spotifyPlayerRef.current.disconnect();
      }

      const player = new window.Spotify.Player({
        name: 'Tuneable Web Player',
        getOAuthToken: (cb: (token: string) => void) => {
          cb(accessToken);
        },
        volume: volume / 100
      });

      // Error handling
      player.addListener('initialization_error', ({ message }: { message: string }) => {
        console.error('Failed to initialize Spotify player:', message);
        alert('Failed to initialize Spotify player. Please make sure you have Spotify Premium and try again.');
      });

      player.addListener('authentication_error', ({ message }: { message: string }) => {
        console.error('Failed to authenticate with Spotify:', message);
        alert('Spotify authentication failed. Please reconnect your Spotify account.');
      });

      player.addListener('account_error', ({ message }: { message: string }) => {
        console.error('Failed to validate Spotify account:', message);
        alert('Spotify account validation failed. Please make sure you have Spotify Premium.');
      });

      player.addListener('playback_error', ({ message }: { message: string }) => {
        console.error('Failed to perform playback:', message);
        if (message.includes('Premium')) {
          alert('Spotify Premium is required to play music. Please upgrade your account.');
        }
      });

      // Playback status updates
      player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        console.log('Spotify player state changed:', {
          paused: state.paused,
          position: state.position,
          duration: state.duration,
          track: state.track_window?.current_track?.name,
          context: state.context?.uri,
          restrictions: state.restrictions,
          disallows: state.disallows,
          loading: state.loading
        });
        
        // Only sync state if we're not in manual control mode and there's a significant change
        if (state.paused !== undefined && !isManualControl) {
          const spotifyIsPaused = state.paused;
          const ourStateIsPlaying = isPlaying;
          
          // Add a delay to prevent rapid state changes from causing issues
          setTimeout(() => {
            // Check again after delay to make sure state is stable
            // Also check if the track is actually progressing (position > 0)
            const isActuallyPlaying = !spotifyIsPaused && state.position > 0;
            
            if (spotifyIsPaused && ourStateIsPlaying) {
              console.log('Spotify is paused, updating our state to match (delayed)');
              pause();
            } else if (isActuallyPlaying && !ourStateIsPlaying) {
              console.log('Spotify is actually playing (position > 0), updating our state to match (delayed)');
              play();
            } else if (!spotifyIsPaused && !ourStateIsPlaying && state.position === 0) {
              console.log('Spotify says playing but position is 0, waiting to see if it starts...');
              // Don't update state yet, wait to see if position increases
            }
          }, 1000); // Increased delay to 1 second
        }
      });

      // Ready
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Spotify player is ready with Device ID:', device_id);
        spotifyPlayerRef.current = player;
        setIsPlayerReady(true);
        
        // Try to use the SDK's built-in methods first
        console.log('Attempting to use SDK methods...');
        try {
          // The SDK doesn't have a direct play method, but we can try to set the volume and then use Web API
          player.setVolume(volume / 100);
          
          // Wait a moment for the device to be fully ready, then try Web API
          setTimeout(() => {
            waitForDeviceAndPlay(device_id, spotifyUri);
          }, 2000);
        } catch (error) {
          console.error('Error with SDK methods:', error);
          // Fallback to Web API approach
          waitForDeviceAndPlay(device_id, spotifyUri);
        }
      });

      // Not Ready
      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('Spotify player has gone offline with Device ID:', device_id);
        setIsPlayerReady(false);
      });

      // Connect to the player
      player.connect();
    } catch (error) {
      console.error('Error creating Spotify player:', error);
    }
  };

  // Update player state when isPlaying changes
  useEffect(() => {
    if (isPlayerReady) {
      console.log('Updating player state, isPlaying:', isPlaying, 'musicSource:', musicSource);
      try {
        if (musicSource === 'youtube' && youtubePlayerRef.current) {
          if (isPlaying && typeof youtubePlayerRef.current.playVideo === 'function') {
            youtubePlayerRef.current.playVideo();
          } else if (!isPlaying && typeof youtubePlayerRef.current.pauseVideo === 'function') {
            youtubePlayerRef.current.pauseVideo();
          }
        } else if (musicSource === 'spotify' && spotifyPlayerRef.current) {
          if (isPlaying) {
            // Use the SDK's resume method
            spotifyPlayerRef.current.resume().then(() => {
              console.log('Spotify playback resumed via SDK');
            }).catch((error: any) => {
              console.error('Error resuming Spotify playback:', error);
              // If SDK fails, try Web API as fallback
              resumeSpotifyPlayback();
            });
          } else {
            // Use the SDK's pause method
            spotifyPlayerRef.current.pause().then(() => {
              console.log('Spotify playback paused via SDK');
            }).catch((error: any) => {
              console.error('Error pausing Spotify playback:', error);
              // If SDK fails, try Web API as fallback
              pauseSpotifyPlayback();
            });
          }
        }
      } catch (error) {
        console.error('Error controlling player:', error);
      }
    }
  }, [isPlaying, isPlayerReady, musicSource]);

  // Update volume when it changes
  useEffect(() => {
    if (isPlayerReady) {
      try {
        if (musicSource === 'youtube' && youtubePlayerRef.current) {
          youtubePlayerRef.current.setVolume(volume);
          if (isMuted) {
            youtubePlayerRef.current.mute();
          } else {
            youtubePlayerRef.current.unMute();
          }
        } else if (musicSource === 'spotify' && spotifyPlayerRef.current) {
          spotifyPlayerRef.current.setVolume(volume / 100);
        }
      } catch (error) {
        console.error('Error updating volume:', error);
      }
    }
  }, [volume, isMuted, isPlayerReady, musicSource]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
        youtubePlayerRef.current = null;
      }
      if (spotifyPlayerRef.current) {
        spotifyPlayerRef.current.disconnect();
        spotifyPlayerRef.current = null;
      }
    };
  }, []);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseInt(e.target.value));
  };

  const handleFullscreen = () => {
    if (isPlayerReady) {
      try {
        if (musicSource === 'youtube' && youtubePlayerRef.current) {
          youtubePlayerRef.current.getIframe().requestFullscreen();
        } else if (musicSource === 'spotify' && spotifyPlayerRef.current) {
          // Spotify Web Playback SDK doesn't support fullscreen
          console.log('Fullscreen not supported for Spotify player');
        }
      } catch (error) {
        console.error('Error entering fullscreen:', error);
      }
    }
  };

  const playSpotifyTrack = async (spotifyUri: string) => {
    try {
      const accessToken = await spotifyService.getValidAccessToken();
      
      // Try without device_id first (this often works better)
      console.log('Playing track without device_id...');
      const response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          uris: [spotifyUri]
        })
      });
      
      if (response.ok) {
        console.log('Spotify track started playing');
      } else {
        const errorText = await response.text();
        console.error('Error playing Spotify track:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error playing Spotify track:', error);
    }
  };

  const resumeSpotifyPlayback = async () => {
    try {
      const accessToken = await spotifyService.getValidAccessToken();
      const response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (response.ok) {
        console.log('Spotify playback resumed via Web API');
      } else {
        console.error('Error resuming Spotify playback via Web API:', response.status);
      }
    } catch (error) {
      console.error('Error resuming Spotify playback via Web API:', error);
    }
  };

  const pauseSpotifyPlayback = async () => {
    try {
      const accessToken = await spotifyService.getValidAccessToken();
      const response = await fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (response.ok) {
        console.log('Spotify playback paused via Web API');
      } else {
        console.error('Error pausing Spotify playback via Web API:', response.status);
      }
    } catch (error) {
      console.error('Error pausing Spotify playback via Web API:', error);
    }
  };

  const waitForDeviceAndPlay = async (deviceId: string, spotifyUri: string, maxRetries = 5) => {
    console.log('Attempting to play track with device ID:', deviceId);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const accessToken = await spotifyService.getValidAccessToken();
        
        console.log(`Attempt ${attempt}: Trying to play track...`);
        
        // First, try to transfer playback to our device
        console.log('Attempting to transfer playback to our device...');
        const transferResponse = await fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            device_ids: [deviceId],
            play: false
          })
        });
        
        if (transferResponse.ok) {
          console.log('Playback transferred to our device');
        } else {
          console.log('Transfer failed, continuing with play attempt...');
        }
        
        // Wait a moment for transfer to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to play the track directly with device_id
        const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            uris: [spotifyUri]
          })
        });
        
        if (playResponse.ok) {
          console.log('Spotify track started playing successfully!');
          return;
        } else {
          const errorText = await playResponse.text();
          console.error(`Play attempt ${attempt} failed:`, playResponse.status, errorText);
          
          // If device not found, try without device_id as fallback
          if (playResponse.status === 404) {
            console.log('Device not found, trying without device_id...');
            const fallbackResponse = await fetch('https://api.spotify.com/v1/me/player/play', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify({
                uris: [spotifyUri]
              })
            });
            
            if (fallbackResponse.ok) {
              console.log('Spotify track started playing via fallback method!');
              return;
            } else {
              const fallbackError = await fallbackResponse.text();
              console.error('Fallback also failed:', fallbackResponse.status, fallbackError);
            }
          }
        }
        
        // Wait before next attempt
        if (attempt < maxRetries) {
          console.log(`Waiting 3 seconds before attempt ${attempt + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (error) {
        console.error(`Error in attempt ${attempt}:`, error);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    console.error('Failed to play track after all attempts');
  };


  // Veto function for host to remove current song
  const handleVetoCurrentSong = async () => {
    if (!currentSong || !currentPartyId || !isHost) return;
    
    try {
      await partyAPI.removeSong(currentPartyId, currentSong.id);
      console.log('Song vetoed successfully');
      // The song will be removed from the queue and next song will start automatically
    } catch (error) {
      console.error('Error vetoing song:', error);
    }
  };

  // Don't render if player is not globally active
  if (!isGlobalPlayerActive) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-xl border-t border-gray-700/50 shadow-2xl z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Song Info */}
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            {currentSong ? (
              <>
                <div className="w-14 h-14 bg-gray-800/50 rounded-xl overflow-hidden flex-shrink-0 shadow-lg">
                  <img
                    src={currentSong.coverArt || '/default-cover.jpg'}
                    alt={currentSong.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-semibold text-white truncate mb-1">
                    {currentSong.title}
                  </h4>
                  <p className="text-sm text-gray-300 truncate">
                    {currentSong.artist}
                  </p>
                  {musicSource && (
                    <div className="mt-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        musicSource === 'youtube' 
                          ? 'bg-red-500/20 text-red-300' 
                          : 'bg-green-500/20 text-green-300'
                      }`}>
                        {musicSource === 'youtube' ? 'YouTube' : 'Spotify'}
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 bg-gray-800/50 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center shadow-lg">
                  <Music className="h-7 w-7 text-gray-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-semibold text-gray-300 truncate mb-1">
                    No songs in queue
                  </h4>
                  <p className="text-sm text-gray-500 truncate">
                    Add songs to start playing
                  </p>
                </div>
              </>
            )}
          </div>

          {/* iOS-Style Player Controls */}
          <div className="flex items-center justify-center space-x-6">
            {/* Volume Control */}
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleMute}
                className="p-2 text-gray-300 hover:text-white transition-colors rounded-full hover:bg-white/10"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-24 h-1 bg-gray-600/50 rounded-full appearance-none cursor-pointer slider-thumb"
                  style={{
                    background: `linear-gradient(to right, #9333ea 0%, #9333ea ${volume}%, rgba(75, 85, 99, 0.5) ${volume}%, rgba(75, 85, 99, 0.5) 100%)`
                  }}
                />
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center space-x-2">
              {/* Previous/Skip Back Button */}
              <button
                onClick={previous}
                disabled={currentSongIndex === 0 || !currentSong}
                className="w-8 h-8 bg-gray-700/50 text-white rounded-full flex items-center justify-center hover:bg-gray-600/50 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-700/50"
                title="Previous Song"
              >
                <SkipBack className="h-4 w-4" />
              </button>

              {/* Main Play/Pause Button */}
              <button
                onClick={() => {
                  console.log('Play/pause button clicked, current state:', isPlaying);
                  setIsManualControl(true);
                  togglePlayPause();
                  
                  // For Spotify, also trigger Web API calls to ensure playback
                  if (musicSource === 'spotify') {
                    setTimeout(() => {
                      const newState = !isPlaying; // This will be the new state after togglePlayPause
                      console.log('Triggering Spotify Web API for state:', newState);
                      
                      if (newState) {
                        resumeSpotifyPlayback();
                      } else {
                        pauseSpotifyPlayback();
                      }
                      
                      // Re-enable automatic state sync after a delay
                      setTimeout(() => {
                        setIsManualControl(false);
                      }, 1000);
                    }, 200);
                  } else {
                    // For non-Spotify, just re-enable after a short delay
                    setTimeout(() => {
                      setIsManualControl(false);
                    }, 500);
                  }
                }}
              className="w-12 h-12 bg-white text-gray-900 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              disabled={!currentSong}
              title={currentSong ? (isPlaying ? 'Pause' : 'Play') : 'No song playing'}
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6 ml-0.5" />
                ) : (
                  <Play className="h-6 w-6 ml-1" />
                )}
              </button>

              {/* Next/Skip Forward Button */}
              <button
                onClick={next}
                disabled={currentSongIndex >= queue.length - 1 || !currentSong}
                className="w-8 h-8 bg-gray-700/50 text-white rounded-full flex items-center justify-center hover:bg-gray-600/50 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-gray-700/50"
                title="Next Song"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={handleFullscreen}
              className="p-2 text-gray-300 hover:text-white transition-colors rounded-full hover:bg-white/10"
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* YouTube Player (Hidden) */}
        <div ref={playerRef} className="hidden" />
      </div>
    </div>
  );
};

export default PersistentWebPlayer;
