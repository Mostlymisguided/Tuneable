import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Playlists = () => {
  const [playlists, setPlaylists] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/playlists', {
          headers: {
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NzY1N2YwYTdkMjUxOWI0NTQyMTQ2MjciLCJlbWFpbCI6InRlc3R1c2VyQGV4YW1wbGUuY29tIiwiaWF0IjoxNzM0NzI2NTg0LCJleHAiOjE3MzQ3MzM3ODR9.afPtV_uWfo84qaT2rLE1lRpaK7lz5_XHaogl2A2U8hk`
          }
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