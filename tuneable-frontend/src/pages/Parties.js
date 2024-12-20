import React, { useState, useEffect } from "react";
import axios from "axios";

function Parties() {
  const [parties, setParties] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchParties = async () => {
      try {
        const response = await axios.get("http://localhost:3000/api/parties", {
          headers: {
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2NzY1N2YwYTdkMjUxOWI0NTQyMTQ2MjciLCJlbWFpbCI6InRlc3R1c2VyQGV4YW1wbGUuY29tIiwiaWF0IjoxNzM0NzI2NTg0LCJleHAiOjE3MzQ3MzM3ODR9.afPtV_uWfo84qaT2rLE1lRpaK7lz5_XHaogl2A2U8hk`,
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
