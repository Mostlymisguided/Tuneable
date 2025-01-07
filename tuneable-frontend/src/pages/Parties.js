import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const Parties = () => {
  const [parties, setParties] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchParties = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/parties`, {
          headers: {
            Authorization: `Bearer ${process.env.REACT_APP_DEV_TOKEN}`,
          },
        });
        setParties(response.data.parties);
        setError('');
      } catch (err) {
        setError('Failed to load parties. Please try again.');
        console.error('Error fetching parties:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchParties();
  }, []);

  const goToParty = (partyId) => {
    navigate(`/party/${partyId}`);
  };

  if (loading) {
    return <div>Loading parties...</div>;
  }

  if (error) {
    return (
      <div style={{ color: 'red' }}>
        {error}
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (parties.length === 0) {
    return <div>No parties found. Create a new party to get started!</div>;
  }

  return (
    <div>
      <button
        onClick={() => navigate('/create-party')}
        style={{
          padding: '0.5em 1em',
          backgroundColor: '#28a745',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          marginBottom: '1em',
        }}
      >
        Create New Party
      </button>
      <h1>Parties</h1>
      <ul style={{ listStyleType: 'none', padding: 0 }}>
        {parties.map((party) => (
          <li
            key={party._id}
            style={{
              marginBottom: '1em',
              border: '1px solid #ccc',
              padding: '1em',
              borderRadius: '5px',
            }}
          >
            <div>
              <h2>{party.name}</h2>
              <p>Host: {party.host?.username || 'Unknown User'}</p> {/* Fixed host rendering */}
              <p>Party Code: {party.partyCode || 'No code available'}</p>
              <button
                onClick={() => goToParty(party._id)}
                style={{
                  padding: '0.5em 1em',
                  backgroundColor: '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                }}
              >
                Go to Party
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Parties;
