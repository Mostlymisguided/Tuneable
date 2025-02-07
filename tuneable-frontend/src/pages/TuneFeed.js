import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../App.css";

const TuneFeed = () => {
  const [songs, setSongs] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ time: "this_week", location: "all", genre: "all" });
  const [sortBy, setSortBy] = useState("highest_paid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const fetchSongs = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.warn("⚠️ No token found, redirecting to login...");
        navigate("/login");
        return;
      }

      setLoading(true);
      setError(null);

      const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/songs`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { ...filter, sortBy },
      });

      setSongs(response.data.songs || []);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch songs");
    } finally {
      setLoading(false);
    }
  }, [filter, sortBy, navigate]);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  return (
    <div className="tunefeed-container">
      <header className="hero">
        <h1>TUNEABLE</h1>
        <h2>The Group Music App</h2>
        <input 
          type="text" 
          placeholder="Search..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
        />
      </header>

      <div className="filters">
        <select onChange={(e) => setFilter((prev) => ({ ...prev, time: e.target.value }))}>
          <option value="this_week">This Week</option>
          <option value="this_month">This Month</option>
          <option value="this_year">This Year</option>
        </select>
        <select onChange={(e) => setFilter((prev) => ({ ...prev, location: e.target.value }))}>
          <option value="all">All Locations</option>
          <option value="bucharest">Bucharest</option>
          <option value="berlin">Berlin</option>
          <option value="london">London</option>
        </select>
        <select onChange={(e) => setFilter((prev) => ({ ...prev, genre: e.target.value }))}>
          <option value="all">All Genres</option>
          <option value="jazz">Jazz</option>
          <option value="house">House</option>
          <option value="pop">Pop</option>
        </select>
        <button className={sortBy === "highest_paid" ? "active" : ""} onClick={() => setSortBy("highest_paid")}>Most Bids</button>
        <button className={sortBy === "newest" ? "active" : ""} onClick={() => setSortBy("newest")}>Most Recent</button>
      </div>

      {loading ? (
        <p>Loading songs...</p>
      ) : error ? (
        <p style={{ color: "red" }}>Error: {error}</p>
      ) : (
        <div className="song-list">
          {songs
            .filter((song) => song.title.toLowerCase().includes(search.toLowerCase()))
            .map((song, index) => (
              <div key={song._id} className="song-item">
                <span className="rank">{index + 1}</span>
                <div className="song-info">
                  <h3>{song.title}</h3>
                  <p>{song.artist} • {song.bpm} BPM • {song.uploadedAt} • £{song.globalBidValue} </p>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default TuneFeed;
