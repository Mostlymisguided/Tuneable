import React, { useState } from 'react';
import ReactPlayer from 'react-player';

const WebPlayer = ({ url, onEnd, onProgress, onError }) => {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8); // Default volume
  const [muted, setMuted] = useState(false);

  const togglePlayPause = () => setPlaying(!playing);

  const toggleMute = () => setMuted(!muted);

  return (
    <div className="web-player">
      <ReactPlayer
        url={url}
        playing={playing}
        controls={true}
        onEnded={onEnd}
        onProgress={onProgress}
        onError={onError}
        volume={volume}
        muted={muted}
        width="100%"
        height="50px"
      />
      <div className="player-controls">
        <button onClick={togglePlayPause}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button onClick={toggleMute}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <label>
          Volume:
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
};

export default WebPlayer;
