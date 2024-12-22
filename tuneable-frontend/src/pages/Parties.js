import React, { useState, useEffect } from "react";
import axios from "axios";

function Parties() {
  const [parties, setParties] = useState([]);
  const [error, setError] = useState(null);

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
        setError("Failed to load parties");
      }
    };

    fetchParties();
  }, []);

  return (
    <div>
      <h1>Parties</h1>
      {error && <p>{error}</p>}
      <ul>
        {parties.map((party) => (
          <li key={party._id}>{party.name}</li>
        ))}
      </ul>
    </div>
  );
}

export default Parties;
