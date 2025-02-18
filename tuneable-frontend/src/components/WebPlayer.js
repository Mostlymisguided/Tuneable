import React, { useState, useEffect, useRef } from "react";
import { Howl } from "howler";

const WebPlayer = ({ partyId, songQueue = [] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const howlRef = useRef(null);
  const wsRef = useRef(null);

  // ✅ Debugging Log
  useEffect(() => {
    console.log("🎵 WebPlayer received partyId:", partyId);
  }, [partyId]);

  // 🔌 Initialize WebSocket
  useEffect(() => {
    if (!partyId) return; // Ensure partyId exists before connecting

    console.log("🔌 Initializing WebSocket...");
    wsRef.current = new WebSocket("ws://localhost:8000");

    wsRef.current.onopen = () => {
      console.log("✅ WebSocket connected.");
      sendWebSocketMessage({ type: "JOIN", partyId });
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data.partyId || data.partyId !== partyId) return;

        console.log("📡 WebSocket Message Received:", data);

        if (data.type === "PLAY") handlePlay();
        if (data.type === "PAUSE") handlePause();
        if (data.type === "SKIP") handleSkip();
        if (data.type === "PLAY_NEXT") {
          console.log("⏭ Playing Next Song...");
          setCurrentIndex((prev) => (prev + 1) % songQueue.length);
          playSong((currentIndex + 1) % songQueue.length);
        }
      } catch (error) {
        console.error("❌ Error handling WebSocket message:", error);
      }
    };

    wsRef.current.onclose = () => {
      console.warn("⚠️ WebSocket disconnected. Reconnecting...");
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        wsRef.current = new WebSocket("ws://localhost:8000");
      }
    };

    wsRef.current.onerror = (error) => console.error("❌ WebSocket Error:", error);

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [partyId]); // Only runs when partyId changes

  // 🎵 Handle Song Playback
  useEffect(() => {
    if (songQueue.length > 0) {
      playSong(currentIndex);
    }
  }, [songQueue, currentIndex]);

  const extractYouTubeURL = (song) => {
    if (!song || !song.url) {
      console.warn("⚠️ Missing song or URL:", song);
      return null;
    }

    if (song.url.includes("youtube.com") || song.url.includes("youtu.be")) {
      return song.url;
    }

    console.error("❌ Invalid YouTube URL:", song.url);
    return null;
  };

  const playSong = (index) => {
    if (index >= songQueue.length) return;

    // Stop and unload current song
    if (howlRef.current) {
      howlRef.current.stop();
      howlRef.current.unload();
    }

    const youtubeURL = extractYouTubeURL(songQueue[index]);
    console.log("🎬 Extracted YouTube source:", youtubeURL);

    // Load and play new song
    howlRef.current = new Howl({
      src: [youtubeURL],
      html5: true,
      volume: muted ? 0 : volume,
      autoplay: true,
      onend: () => handleSkip(), // Auto-play next song
    });

    console.log(`🎶 Playing song: ${songQueue[index]?.title}`);
    howlRef.current.play();
  };

  const sendWebSocketMessage = (message) => {
    if (!wsRef.current) {
      console.warn("⚠️ WebSocket reference is missing, retrying...");
      setTimeout(() => sendWebSocketMessage(message), 1000);
      return;
    }

    if (wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ WebSocket not open, retrying...");
      setTimeout(() => sendWebSocketMessage(message), 1000);
      return;
    }

    console.log("📨 Sending WebSocket message:", message);
    wsRef.current.send(JSON.stringify(message));
  };

  const handlePlay = () => {
    sendWebSocketMessage({ type: "PLAY", partyId });
    setPlaying(true);
    howlRef.current?.play();
  };

  const handlePause = () => {
    sendWebSocketMessage({ type: "PAUSE", partyId });
    setPlaying(false);
    howlRef.current?.pause();
  };

  const handleSkip = () => {
    sendWebSocketMessage({ type: "SKIP", partyId });
    setCurrentIndex((prev) => (prev + 1) % songQueue.length);
  };

  return (
    <div className="web-player-container">
      <h3>Now Playing: {songQueue[currentIndex]?.title || "None"}</h3>
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
          onChange={(e) => {
            const newVolume = parseFloat(e.target.value);
            setVolume(newVolume);
            howlRef.current?.volume(newVolume);
          }}
        />
      </div>
    </div>
  );
};

export default WebPlayer;
