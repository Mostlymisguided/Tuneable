import React, { useEffect, useRef, useState } from 'react';

// Extend Window interface to include Spotify
declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface SpotifyPlayerProps {
  token: string;
  trackUri?: string;
  onPlayerReady?: () => void;
  onPlayerStateChanged?: (state: any) => void;
  onError?: (error: any) => void;
}

const SpotifyPlayer: React.FC<SpotifyPlayerProps> = ({
  token,
  trackUri,
  onPlayerReady,
  onPlayerStateChanged,
  onError
}) => {
  const playerRef = useRef<any>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!token) return;

    // Check if Spotify SDK is already loaded
    if (window.Spotify) {
      initializePlayer();
    } else {
      // Set up callback for when SDK loads
      window.onSpotifyWebPlaybackSDKReady = initializePlayer;
    }

    function initializePlayer() {
      const player = new window.Spotify.Player({
        name: 'Tuneable Web Player',
        getOAuthToken: (cb: (token: string) => void) => {
          cb(token);
        },
        volume: 0.5
      });

      // Error handling
      player.addListener('initialization_error', ({ message }: { message: string }) => {
        console.error('Failed to initialize Spotify player:', message);
        onError?.(message);
      });

      player.addListener('authentication_error', ({ message }: { message: string }) => {
        console.error('Failed to authenticate with Spotify:', message);
        onError?.(message);
      });

      player.addListener('account_error', ({ message }: { message: string }) => {
        console.error('Failed to validate Spotify account:', message);
        onError?.(message);
      });

      player.addListener('playback_error', ({ message }: { message: string }) => {
        console.error('Failed to perform playback:', message);
        onError?.(message);
      });

      // Playback status updates
      player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        onPlayerStateChanged?.(state);
      });

      // Ready
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('Spotify player is ready with Device ID:', device_id);
        setDeviceId(device_id);
        setIsReady(true);
        onPlayerReady?.();
      });

      // Not Ready
      player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
        console.log('Spotify player has gone offline with Device ID:', device_id);
        setIsReady(false);
      });

      // Connect to the player
      player.connect();

      playerRef.current = player;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
      }
    };
  }, [token, onPlayerReady, onPlayerStateChanged, onError]);

  useEffect(() => {
    if (trackUri && deviceId && isReady) {
      playTrack(trackUri);
    }
  }, [trackUri, deviceId, isReady]);

  const playTrack = async (uri: string) => {
    if (!deviceId) return;

    try {
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ uris: [uri] }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to play track');
      }
    } catch (error) {
      console.error('Error playing track:', error);
      onError?.(error);
    }
  };

  const pause = () => {
    if (playerRef.current) {
      playerRef.current.pause();
    }
  };

  const resume = () => {
    if (playerRef.current) {
      playerRef.current.resume();
    }
  };

  const next = () => {
    if (playerRef.current) {
      playerRef.current.nextTrack();
    }
  };

  const previous = () => {
    if (playerRef.current) {
      playerRef.current.previousTrack();
    }
  };

  const setVolume = (volume: number) => {
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
    }
  };

  // Expose methods to parent component
  React.useImperativeHandle(playerRef, () => ({
    playTrack,
    pause,
    resume,
    next,
    previous,
    setVolume,
    isReady,
    deviceId
  }));

  return (
    <div className="spotify-player">
      {!isReady && (
        <div className="text-center p-4">
          <p className="text-gray-600">Connecting to Spotify...</p>
        </div>
      )}
      {isReady && (
        <div className="text-center p-4">
          <p className="text-green-600">Spotify player ready!</p>
        </div>
      )}
    </div>
  );
};

export default SpotifyPlayer;
