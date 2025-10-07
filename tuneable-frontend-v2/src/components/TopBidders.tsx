import React from 'react';
import { User } from 'lucide-react';

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
  if (!bids || bids.length === 0) {
    return null;
  }

  // Sort bids by amount (highest first) and take top N
  const topBids = [...bids]
    .filter(bid => bid.userId && bid.amount > 0) // Filter out invalid bids
    .sort((a, b) => b.amount - a.amount)
    .slice(0, maxDisplay);

  if (topBids.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center space-x-2 mt-2">
      <span className="text-xs text-gray-400 mr-1">Top bidders:</span>
      <div className="flex -space-x-2">
        {topBids.map((bid, index) => (
          <div
            key={bid.userId.uuid || index}
            className="relative group"
            style={{ zIndex: topBids.length - index }}
          >
            {/* Profile Picture */}
            <div className="w-8 h-8 rounded-full overflow-hidden bg-white border-2 border-purple-800 flex items-center justify-center">
              <img
                src={bid.userId.profilePic || '/android-chrome-192x192.png'}
                alt={bid.userId.username}
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-50">
              <div className="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
                <p className="font-semibold">{bid.userId.username}</p>
                <p className="text-gray-300">£{bid.amount.toFixed(2)}</p>
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                  <div className="border-4 border-transparent border-t-gray-900"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {/* Show count if more than maxDisplay */}
        {bids.length > maxDisplay && (
          <div className="w-8 h-8 rounded-full bg-gray-700 border-2 border-purple-800 flex items-center justify-center">
            <span className="text-xs text-white font-semibold">+{bids.length - maxDisplay}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopBidders;

