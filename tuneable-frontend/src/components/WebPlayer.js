import React, { useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";

const WS_URL = process.env.REACT_APP_WEBSOCKET_URL || "ws://localhost:8000";

const WebPlayer = ({ partyId, currentSong, isHost, userId }) => {
  const [playing, setPlaying] = useState(true);
  const wsRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    console.log("WebPlayer - isHost:", isHost, "UserId:", userId);
    if (!partyId) return;
    wsRef.current = new WebSocket(WS_URL);

    wsRef.current.onopen = () => {
      // Join the party
      wsRef.current.send(JSON.stringify({ type: "JOIN", partyId }));
      // If this client is the host, set it as the host on the server.
      if (isHost && userId) {
        wsRef.current.send(JSON.stringify({ type: "SET_HOST", partyId, userId }));
      }
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

    return () => {
      wsRef.current?.close();
      clearTimeout(timerRef.current);
    };
  }, [partyId, isHost, userId]);

  const sendPlaybackAction = (type) => {
    if (!isHost) {
      console.warn("Only the host can trigger playback actions.");
      return;
    }
    wsRef.current?.send(
      JSON.stringify({
        type,
        partyId,
        userId,
      })
    );
  };

  const handlePlay = () => sendPlaybackAction("PLAY");
  const handlePause = () => sendPlaybackAction("PAUSE");
  const handleEnded = () => {
    console.log("Song ended, triggering transition.");
    sendPlaybackAction("TRANSITION_SONG");
  };

  // Fallback timer: if currentSong has a duration, trigger transition after its duration
  useEffect(() => {
    if (currentSong?.duration && playing && isHost) {
      timerRef.current = setTimeout(() => {
        console.log("Fallback timer reached, triggering transition.");
        handleEnded();
      }, currentSong.duration * 1000 + 1000); // duration in ms plus a buffer
    }
    return () => clearTimeout(timerRef.current);
  }, [currentSong, playing, isHost]);

  return (
    <div className="web-player-container">
      {currentSong?.url ? (
        <ReactPlayer
          key={`${partyId}-${isHost}`}
          url={currentSong.url}
          playing={playing}
          controls={true}
          volume={0.8}
          onEnded={handleEnded}
          onPlay={handlePlay}
          onPause={handlePause}
          width="100%"
          height="60px"
          config={{
            youtube: {
              playerVars: { origin: window.location.origin },
            },
          }}
        />
      ) : (
        <p>No song selected.</p>
      )}
    </div>
  );
};

export default WebPlayer;
