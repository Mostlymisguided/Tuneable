import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../App.css";

const TuneFeed = () => {
  const [songs, setSongs] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState({ time: "this_week", location: "all", tag: "all" });
  const [sortBy, setSortBy] = useState("highest_bid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  // Fetch songs based on filters and sortBy
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

  // Fetch songs on filter or sort change
  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  // Memoize client-side search filtering for performance
  const filteredSongs = useMemo(() => {
    return songs.filter(song =>
      song.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [songs, search]);

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const formatUploadedAt = (uploadedAt) => {
    const date = new Date(uploadedAt);
    return date.toLocaleString("en-GB", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

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
        <select
          value={filter.time}
          onChange={(e) => setFilter(prev => ({ ...prev, time: e.target.value }))}
        >
          <option value="this_week">This Week</option>
          <option value="this_month">This Month</option>
          <option value="this_year">This Year</option>
        </select>
        <select
          value={filter.location}
          onChange={(e) => setFilter(prev => ({ ...prev, location: e.target.value }))}
        >
          <option value="all">All Locations</option>
          <option value="global">Global</option>
          <option value="antarctica">Antarctica</option>
          <option value="london">London</option>
        </select>
        <select
          value={filter.tag}
          onChange={(e) => setFilter(prev => ({ ...prev, tag: e.target.value }))}
        >
          <option value="all">All Tags</option>
          <option value="music">Music</option>
          <option value="electronic">Electronic</option>
          <option value="healing">Healing</option>
        </select>
        <div className="sort-buttons">
          <button
            className={sortBy === "highest_bid" ? "active" : ""}
            onClick={() => setSortBy("highest_bid")}
          >
            Most Bids
          </button>
          <button
            className={sortBy === "newest" ? "active" : ""}
            onClick={() => setSortBy("newest")}
          >
            Most Recent
          </button>
        </div>
      </div>

      {loading ? (
        <p>Loading songs...</p>
      ) : error ? (
        <p style={{ color: "red" }}>Error: {error}</p>
      ) : (
        <div className="song-list">
          {filteredSongs.map((song, index) => (
            <div key={song._id} className="song-item">
              <span className="rank">{index + 1}</span>
              <div className="song-info">
                <h3>{song.title}</h3>
                <p>
                  {song.artist} • ⏱ {formatDuration(song.duration)} • {formatUploadedAt(song.uploadedAt)} • £{song.globalBidValue}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TuneFeed;
