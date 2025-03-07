import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../App.css';

const Home = () => {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch songs from a public endpoint (or your regular endpoint without token restrictions)
  const fetchSongs = async () => {
    try {
      setLoading(true);
      setError(null);
      // Assuming this endpoint provides public data without needing a token:
      const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/songs/public`);
      setSongs(response.data.songs || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch songs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSongs();
  }, []);

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="home-container">
      <header className="hero">
        <h1>TUNEABLE</h1>
        <h2>The Group Music App</h2>
      </header>
      {loading ? (
        <p>Loading songs...</p>
      ) : error ? (
        <p style={{ color: "red" }}>Error: {error}</p>
      ) : (
        <div className="song-list">
          {songs.map((song, index) => (
            <div key={song.id} className="song-item">
              <span className="rank">{index + 1}</span>
              <div className="song-info">
                <h3>{song.title}</h3>
                <p>{song.artist} • £{song.globalBidValue} • ⏱ {formatDuration(song.duration)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Home;
