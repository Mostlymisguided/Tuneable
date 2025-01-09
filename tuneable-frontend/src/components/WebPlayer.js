import React, { useState } from 'react';
import ReactPlayer from 'react-player';

const WebPlayer = ({ url, onEnd, onProgress, onError }) => {
  const [playing, setPlaying] = useState(false);

  const togglePlayPause = () => setPlaying(!playing);

  return (
    <div className="web-player">
      <ReactPlayer
        url={url}
        playing={playing}
        controls={true}
        onEnded={onEnd}
        onProgress={onProgress}
        onError={onError}
        width="100%"
        height="50px"
      />
      <button onClick={togglePlayPause}>
        {playing ? 'Pause' : 'Play'}
      </button>
    </div>
  );
};

export default WebPlayer;
