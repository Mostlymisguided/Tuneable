import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import '../App.css';

const Home = () => {
  const [songs, setSongs] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ time: 'this_week', location: 'all', genre: 'all' });
  const [sortBy, setSortBy] = useState('highest_paid');

  useEffect(() => {
    fetchSongs();
  }, [filter, sortBy]);

  const fetchSongs = async () => {
    try {
      const response = await axios.get(`/api/songs`, {
        params: { ...filter, sortBy }
      });
      setSongs(response.data);
    } catch (error) {
      console.error('Error fetching songs:', error);
    }
  };

  return (
    <div className="home-container">
      <header className="hero">
        <h1>TUNEABLE</h1>
        <h2> The Group Music App </h2>
        <input 
          type="text" 
          placeholder="Search..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
        />
      </header>
      <div className="filters">
        <select onChange={(e) => setFilter({ ...filter, time: e.target.value })}>
          <option value="this_week">This Week</option>
          <option value="this_month">This Month</option>
          <option value="this_year">This Year</option>
        </select>
        <select onChange={(e) => setFilter({ ...filter, location: e.target.value })}>
          <option value="all">All Locations</option>
          <option value="bucharest">Bucharest</option>
          <option value="berlin">Berlin</option>
          <option value="london">London</option>
        </select>
        <select onChange={(e) => setFilter({ ...filter, genre: e.target.value })}>
          <option value="all">All Genres</option>
          <option value="jazz">Jazz</option>
          <option value="house">House</option>
          <option value="pop">Pop</option>
        </select>
        <button className={sortBy === 'highest_paid' ? 'active' : ''} onClick={() => setSortBy('highest_paid')}>Highest Paid</button>
        <button className={sortBy === 'newest' ? 'active' : ''} onClick={() => setSortBy('newest')}>Newest</button>
      </div>
      <div className="song-list">
        {songs.filter(song => song.title.toLowerCase().includes(search.toLowerCase())).map((song, index) => (
          <div key={song.id} className="song-item">
            <span className="rank">{index + 1}</span>
            <div className="song-info">
              <h3>{song.title}</h3>
              <p>{song.artist} • {song.bpm} BPM • {song.duration}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;