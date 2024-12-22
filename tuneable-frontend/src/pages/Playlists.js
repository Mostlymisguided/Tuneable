import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Playlists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/playlists`, {
          headers: {
            Authorization: `Bearer ${process.env.REACT_APP_DEV_TOKEN}`,
          },
        });
        setPlaylists(response.data.playlists);
      } catch (err) {
        setError('Failed to load playlists');
        console.error(err);
      }
    };

    fetchPlaylists();
  }, []);

  if (error) {
    return <div>{error}</div>;
  }

  return (
    <div>
      <h1>Playlists</h1>
      <ul>
        {playlists.map((playlist) => (
          <li key={playlist.id}>
            {playlist.name}: {playlist.description}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Playlists;
