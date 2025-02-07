import React, { useState, useEffect } from "react";
import ReactPlayer from "react-player";

const WebPlayer = ({ url, songQueue = [], onQueueUpdate, playing = true }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    console.log("🎵 WebPlayer received url:", url);
  }, [url]);

  const handleEnd = () => {
    if (songQueue.length > 0) {
      if (currentIndex + 1 < songQueue.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setCurrentIndex(0);
      }
    }
  };

  return (
    <div className="web-player-container" style={{ width: "100%", maxWidth: "600px", margin: "auto" }}>
      <ReactPlayer
        url={url || songQueue[currentIndex]?.url}
        playing={playing}
        controls={true} // ✅ Ensure player controls are enabled
        volume={volume}
        muted={muted}
        width="100%"
        height="80px" // ✅ Increased height for better UI
        onEnded={handleEnd}
        onError={() => console.error("Error playing track")}
      />
      <div className="player-controls">
        <button onClick={() => console.log("Play/Pause clicked!")}>▶/⏸</button>
        <button onClick={() => setMuted(!muted)}>
          {muted ? "🔊 Unmute" : "🔇 Mute"}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
};

export default WebPlayer;
