// Preserved copy of party page (minimal placeholder to keep build clean)
import React from 'react';
import { useParams } from 'react-router-dom';

const PartyFull: React.FC = () => {
  const { partyId } = useParams<{ partyId: string }>();
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6">
      <div className="card">
        <h1 className="text-2xl font-bold text-white mb-2">Preserved Party Page</h1>
        <p className="text-gray-400">This is a preserved copy for future development. It currently acts as a minimal placeholder so builds stay clean.</p>
        <div className="mt-4 text-sm text-gray-300">Party ID: {partyId}</div>
      </div>
    </div>
  );
};

export default PartyFull;


