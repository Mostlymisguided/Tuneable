import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Parties = () => {
  const [parties, setParties] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [partyCode, setPartyCode] = useState({});
  const navigate = useNavigate();
  const getUserLocation = useState();

  useEffect(() => {
    const fetchParties = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('You are not authorized. Please log in again.');
        setLoading(false);
        return;
      }
      try {
        const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/parties`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setParties(response.data.parties);
        setError('');
      } catch (err) {
        console.error('Error fetching parties:', err);
        setError('Failed to load parties. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchParties();
  }, []);

  const handleJoinParty = async (party) => {
    try {
      let body = {};
      if (party.type === 'private') {
        if (!partyCode[party._id] || partyCode[party._id] !== party.partyCode) {
          alert('Incorrect party code');
          return;
        }
        body.partyCode = partyCode[party._id]; // User enters party code
      } else if (party.type === 'geocoded') {
        const location = await getUserLocation(); // Fetch user location
        body.location = location;
      }

      const token = localStorage.getItem('token');
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/parties/join/${party._id}`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data) navigate(`/party/${party._id}`);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to join party');
    }
  };

  if (loading) return <div>Loading parties...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (parties.length === 0) return <div>No parties found. Create one to get started!</div>;

  return (
    <div>
      <h1>Parties</h1>
      <ul>
        {parties.map((party) => (
          <li key={party._id}>
            <h2>{party.name}</h2>
            <p>Host: {party.host?.username || 'Unknown'}</p>
            {party.type === 'private' && (
              <input
                type='text'
                placeholder='Enter Party Code'
                value={partyCode[party._id] || ''}
                onChange={(e) => setPartyCode({ ...partyCode, [party._id]: e.target.value })}
              />
            )}
            <button onClick={() => handleJoinParty(party)}>Join Party</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Parties;
