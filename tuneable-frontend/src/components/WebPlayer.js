import React, { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";

const WebPlayer = ({ partyId, currentSong }) => {
  const [playing, setPlaying] = useState(true);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!partyId) return;

    wsRef.current = new WebSocket("ws://localhost:8000");

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
      setTimeout(() => new WebSocket("ws://localhost:8000"), 3000);
    };

    return () => wsRef.current?.close();
  }, [partyId]);

  const handleEnded = () => {
    wsRef.current?.send(JSON.stringify({ type: "SKIP", partyId }));
  };

  console.log("🎵 WebPlayer received currentSong:", currentSong);

  console.log (currentSong?.url || currentSong || 'no url')

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
