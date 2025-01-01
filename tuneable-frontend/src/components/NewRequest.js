import React from "react";
import { useNavigate } from "react-router-dom";

const NewRequest = () => {
  const navigate = useNavigate();

  const handleRequest = () => {
    navigate("/search"); // Navigate to the new search route
  };

  return (
    <div className="new-request">
      <button onClick={handleRequest}>+ New Request</button>
    </div>
  );
};

export default NewRequest;
