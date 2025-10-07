import React from 'react';
import { useNavigate } from 'react-router-dom';

interface Bid {
  userId: {
    username: string;
    profilePic?: string;
    uuid: string;
  };
  amount: number;
}

interface TopBiddersProps {
  bids: Bid[];
  maxDisplay?: number;
}

const TopBidders: React.FC<TopBiddersProps> = ({ bids, maxDisplay = 5 }) => {
  const navigate = useNavigate();

  if (!bids || bids.length === 0) {
    return null;
  }

  // Debug: Log the bids data to see what we're receiving
  console.log('TopBidders received bids:', bids);

  // Sort bids by amount (highest first) and take top N
  const topBids = [...bids]
    .filter(bid => bid.userId && bid.amount > 0) // Filter out invalid bids
    .sort((a, b) => b.amount - a.amount)
    .slice(0, maxDisplay);

  if (topBids.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 mb-6">
      <div className="flex items-start space-x-2">
        {topBids.map((bid, index) => (
          <div
            key={bid.userId.uuid || index}
            className="flex flex-col items-center"
          >
            {/* Profile Picture - Clickable */}
            <div 
              className="w-12 h-12 rounded-full overflow-hidden bg-white border-2 border-purple-800 flex items-center justify-center cursor-pointer hover:border-purple-600 transition-colors"
              onClick={() => bid.userId.uuid && navigate(`/user/${bid.userId.uuid}`)}
            >
              <img
                src={bid.userId.profilePic || '/android-chrome-192x192.png'}
                alt={bid.userId.username}
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Bid Amount - Permanently displayed */}
            <span className="text-xs text-white font-semibold mt-1">
              £{bid.amount.toFixed(2)}
            </span>
          </div>
        ))}
        
        {/* Show count if more than maxDisplay */}
        {bids.length > maxDisplay && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-gray-700 border-2 border-purple-800 flex items-center justify-center">
              <span className="text-sm text-white font-semibold">+{bids.length - maxDisplay}</span>
            </div>
            <span className="text-xs text-gray-400 mt-1">more</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopBidders;

