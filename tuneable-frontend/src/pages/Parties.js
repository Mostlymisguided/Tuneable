import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom'; // Import Link and useNavigate from React Router

const Parties = () => {
  const [parties, setParties] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate(); // Initialize useNavigate

  useEffect(() => {
    const fetchParties = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/parties`, {
          headers: {
            Authorization: `Bearer ${process.env.REACT_APP_DEV_TOKEN}`,
          },
        });
        setParties(response.data.parties);
      } catch (err) {
        setError('Failed to load parties');
        console.error('Error fetching parties:', err);
      }
    };

    fetchParties();
  }, []);

  const navigateToSearch = (party) => {
    localStorage.setItem('partyId', party._id); // Save partyId in localStorage
    navigate(`/search?partyId=${party._id}`); // Navigate to the search page with partyId
  };

  if (error) {
    return <div style={{ color: 'red' }}>{error}</div>;
  }

  return (
    <div>
      <h1>Parties</h1>
      <ul>
        {parties.map((party) => (
          <li key={party._id}>
            <div>
              {/* Link to the party detail page */}
              <Link to={`/party/${party._id}`}>{party.name}: Hosted by {party.host}</Link>
              <p>Party Code: {party.code}</p> {/* Display the party code */}
              <button onClick={() => navigateToSearch(party)}>Search for Songs</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Parties;
