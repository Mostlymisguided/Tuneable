import React from "react";
import { useNavigate, useParams } from "react-router-dom";

const NewRequest = ({ refreshPlaylist }) => {
  const navigate = useNavigate();
  const { partyId } = useParams(); // Extract partyId from the URL

  const handleRequest = () => {
    if (!partyId) {
      alert("Party ID is missing. Please ensure you are on a valid party page.");
      return;
    }

    // Trigger playlist refresh if the function is provided
    if (typeof refreshPlaylist === "function") {
      refreshPlaylist();
    }

    // Navigate to the search page with partyId as a query parameter
    navigate(`/search?partyId=${partyId}`);
  };

  return (
    <div className="new-request">
      <button onClick={handleRequest}>+ New Request</button>
    </div>
  );
};

export default NewRequest;
