import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import type { YTPlayer } from '../types/youtube';

// Helper function to extract YouTube video ID from URL
const getYouTubeVideoId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

interface YouTubePlayerProps {
  videoUrl?: string;
  className?: string;
  isPlaying?: boolean;
  volume?: number;
  isMuted?: boolean;
  onStateChange?: (state: any) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export interface YouTubePlayerRef {
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  seekTo: (seconds: number) => void;
}

const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(({ 
  videoUrl, 
  className = "", 
  isPlaying = false,
  volume = 50,
  isMuted = false,
  onStateChange,
  onTimeUpdate 
}, ref) => {
  const playerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YTPlayer | null>(null);
  const timePollingRef = useRef<NodeJS.Timeout | null>(null);

  // Expose control methods to parent component
  useImperativeHandle(ref, () => ({
    playVideo: () => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.playVideo();
      }
    },
    pauseVideo: () => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.pauseVideo();
      }
    },
    setVolume: (vol: number) => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.setVolume(vol);
      }
    },
    mute: () => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.mute();
      }
    },
    unMute: () => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.unMute();
      }
    },
    seekTo: (seconds: number) => {
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.seekTo(seconds);
      }
    }
  }), []);

  useEffect(() => {
    if (!videoUrl) return;

    const videoId = getYouTubeVideoId(videoUrl);
    if (!videoId) {
      console.log('No valid YouTube video ID found for:', videoUrl);
      return;
    }

    initializeYouTubePlayer(videoId);
  }, [videoUrl]);

  // Handle external control changes
  useEffect(() => {
    if (!youtubePlayerRef.current) return;
    
    if (isPlaying) {
      youtubePlayerRef.current.playVideo();
    } else {
      youtubePlayerRef.current.pauseVideo();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!youtubePlayerRef.current) return;
    youtubePlayerRef.current.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!youtubePlayerRef.current) return;
    if (isMuted) {
      youtubePlayerRef.current.mute();
    } else {
      youtubePlayerRef.current.unMute();
    }
  }, [isMuted]);

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

    // Wait for API to load
    const checkYT = () => {
      if (window.YT && window.YT.Player) {
        if (playerRef.current) {
          youtubePlayerRef.current = new window.YT.Player(playerRef.current, {
            height: '270',
            width: '100%',
            videoId: videoId,
            playerVars: {
              autoplay: 0,
              controls: 1,
              disablekb: 0,
              enablejsapi: 1,
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
                
                // Start time polling
                startTimePolling();
              },
              onStateChange: (event: any) => {
                console.log('YouTube player state changed:', event.data);
                onStateChange?.(event.data);
              },
              onError: (event: any) => {
                console.error('YouTube player error:', event.data);
              }
            }
          });
        }
      } else {
        setTimeout(checkYT, 100);
      }
    };

    if (window.YT && window.YT.Player) {
      checkYT();
    } else {
      window.onYouTubeIframeAPIReady = checkYT;
    }
  };

  const startTimePolling = () => {
    if (timePollingRef.current) {
      clearInterval(timePollingRef.current);
    }
    
    timePollingRef.current = setInterval(() => {
      if (youtubePlayerRef.current) {
        try {
          const currentTime = youtubePlayerRef.current.getCurrentTime();
          const duration = youtubePlayerRef.current.getDuration();
          onTimeUpdate?.(currentTime, duration);
        } catch (error) {
          console.log('Error getting YouTube player time:', error);
        }
      }
    }, 1000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timePollingRef.current) {
        clearInterval(timePollingRef.current);
      }
      if (youtubePlayerRef.current) {
        youtubePlayerRef.current.destroy();
      }
    };
  }, []);

  if (!videoUrl) {
    return null;
  }

  return (
    <div className={`bg-gray-900 border-t border-gray-700 ${className}`}>
      <div className="max-w-4xl mx-auto p-4">
        <div ref={playerRef} className="w-full h-[270px] bg-gray-800 rounded-lg overflow-hidden" />
      </div>
    </div>
  );
});

YouTubePlayer.displayName = 'YouTubePlayer';

export default YouTubePlayer;
