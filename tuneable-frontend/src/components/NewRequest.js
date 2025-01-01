import React from 'react';

const NewRequest = () => {
  const handleRequest = () => {
    // Logic to open a modal or redirect to search
    console.log('New song request initiated');
  };

  return (
    <div className="new-request">
      <button onClick={handleRequest}>+ New Request</button>
    </div>
  );
};

export default NewRequest;
