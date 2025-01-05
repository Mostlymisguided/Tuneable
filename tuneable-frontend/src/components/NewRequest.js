import React from "react";
import { useNavigate } from "react-router-dom";

const NewRequest = ({ refreshPlaylist, partyId }) => {
  const navigate = useNavigate();

  const handleRequest = () => {
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
