import React, { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";

const WS_URL = process.env.REACT_APP_WEBSOCKET_URL || "ws://localhost:8000";

const WebPlayer = ({ partyId, currentSong }) => {
  const [playing, setPlaying] = useState(true);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!partyId) return;
    wsRef.current = new WebSocket(WS_URL);

    wsRef.current.onopen = () => {
      wsRef.current.send(JSON.stringify({ type: "JOIN", partyId }));
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.partyId !== partyId) return;

      if (data.type === "PLAY") setPlaying(true);
      else if (data.type === "PAUSE") setPlaying(false);
      else if (data.type === "SKIP" || data.type === "PLAY_NEXT") setPlaying(true);
    };

    wsRef.current.onclose = () => {
      console.warn("WebSocket disconnected, reconnecting...");
      setTimeout(() => new WebSocket(WS_URL), 3000);
        };

    return () => wsRef.current?.close();
  }, [partyId]);

  const handleEnded = () => {
    // For auto-transition, the event is user agnostic.
    wsRef.current?.send(JSON.stringify({ 
      type: "TRANSITION_SONG", 
      partyId,
      // Optionally, you can include the userId if needed for logging,
      // but it won't affect authorization for auto transitions.
      userId: localStorage.getItem("userId")
    }));
  };

  return (
    <div className="web-player-container">
      {currentSong?.url ? (
        <ReactPlayer
          url={currentSong.url}
          playing={playing}
          controls={true}
          volume={0.8}
          onEnded={handleEnded}
          width="100%"  
          height="60px"
          config={{
            youtube: {
              playerVars: { origin: window.location.origin }
            }
          }}
        />
      ) : (
        <p>No song selected.</p>
      )}
    </div>
  );
};

export default WebPlayer;
