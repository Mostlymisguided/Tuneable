import React, { useRef, useEffect } from 'react';
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
}

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ videoUrl, className = "" }) => {
  const playerRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YTPlayer | null>(null);
  // const [isPlayerReady, setIsPlayerReady] = useState(false);

  useEffect(() => {
    if (!videoUrl) return;

    const videoId = getYouTubeVideoId(videoUrl);
    if (!videoId) {
      console.log('No valid YouTube video ID found for:', videoUrl);
      return;
    }

    initializeYouTubePlayer(videoId);
  }, [videoUrl]);

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
              onReady: (_event: any) => {
                console.log('YouTube player ready!');
              },
              onStateChange: (event: any) => {
                console.log('YouTube player state changed:', event.data);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
};

export default YouTubePlayer;
