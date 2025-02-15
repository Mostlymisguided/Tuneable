import React, { useParams, useState, useEffect, useRef } from "react";
import ReactPlayer from "react-player";

const WebPlayer = ({ partyId, songQueue = [] }) => {
  console.log("✅ WebPlayer received partyId:", partyId); 
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const playerRef = useRef(null);
  const wsRef = useRef(null);
  
  useEffect(() => {
    if (!wsRef.current) {
      console.log("🔌 Initializing WebSocket...");
      wsRef.current = new WebSocket("ws://localhost:8000");

      wsRef.current.onopen = () => {
        console.log("✅ WebSocket connected.");
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.partyId !== partyId) return;

          if (data.type === "PLAY") setPlaying(true);
          if (data.type === "PAUSE") setPlaying(false);
          if (data.type === "SKIP") {
            setCurrentIndex((prev) => (prev + 1) % songQueue.length);
          }
        } catch (error) {
          console.error("Error handling WebSocket message:", error);
        }
      };

      wsRef.current.onclose = () => {
        console.warn("⚠️ WebSocket disconnected. Attempting to reconnect...");
        setTimeout(() => {
          wsRef.current = new WebSocket("ws://localhost:8000"); // Auto-reconnect
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error("❌ WebSocket Error:", error);
      };
    }
  }, [partyId, songQueue]);

  console.log('party id', [partyId]);
  const sendWebSocketMessage = (message) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn("⚠️ WebSocket not open, cannot send message.");
        return;
    }
    console.log("📨 Sending WebSocket message:", message);
    wsRef.current.send(JSON.stringify(message));
};

  const handlePlay = () => {
    console.log("▶ Sending PLAY event to WebSocket...", partyId);
    sendWebSocketMessage({ type: "PLAY", partyId });
    setPlaying(true);
};

  const handlePause = () => {
    sendWebSocketMessage({ type: "PAUSE", partyId });
    setPlaying(false);
  };

  const handleSkip = () => {
    sendWebSocketMessage({ type: "SKIP", partyId });
  };

  return (
    <div className="web-player-container">
      <ReactPlayer
        ref={playerRef}
        url={songQueue[currentIndex]?.url}
        playing={playing}
        controls
        volume={volume}
        muted={muted}
        width="100%"
        height="80px"
        onEnded={handleSkip}
        onError={() => console.error("Error playing track")}
      />
      <div className="player-controls">
        <button onClick={handlePlay}>▶ Play</button>
        <button onClick={handlePause}>⏸ Pause</button>
        <button onClick={handleSkip}>⏭ Skip</button>
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
