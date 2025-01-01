import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SongCard from '../components/SongCard';
import NewRequest from '../components/NewRequest';
import Footer from '../components/Footer';

const Party = () => {
  const [playlist, setPlaylist] = useState([]);
  const [currentSong, setCurrentSong] = useState({});

  // Fetch playlist data
  useEffect(() => {
    const fetchPlaylist = async () => {
      try {
        const response = await axios.get('/api/party/playlist'); // Replace with your API endpoint
        setPlaylist(response.data.playlist);
        setCurrentSong(response.data.currentSong);
      } catch (error) {
        console.error('Error fetching playlist:', error);
      }
    };

    fetchPlaylist();
  }, []);

  return (
    <div className="party-container">
      <h1>Leon’s Party</h1>
      <div className="playlist">
        {playlist.map((song, index) => (
          <SongCard key={song.id} song={song} rank={index + 1} />
        ))}
      </div>
      <NewRequest />
      <Footer currentSong={currentSong} />
    </div>
  );
};

export default Party;
