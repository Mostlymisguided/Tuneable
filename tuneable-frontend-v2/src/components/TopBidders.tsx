import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';

interface Bid {
  userId: {
    username: string;
    profilePic?: string;
    uuid: string;
  };
  amount: number;
  createdAt?: string; // Optional - may not be present in all contexts
  _doc?: any; // Mongoose document property
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

  // Sort bids by amount (highest first) and take top N
  // Handle Mongoose documents by accessing amount from _doc if needed
  const validBids = [...bids].filter(bid => {
    const amount = bid.amount || (bid._doc && bid._doc.amount) || 0;
    return bid.userId && bid.userId.username && amount > 0;
  });
  
  const topBids = validBids
    .sort((a, b) => {
      const amountA = a.amount || (a._doc && a._doc.amount) || 0;
      const amountB = b.amount || (b._doc && b._doc.amount) || 0;
      return amountB - amountA;
    })
    .slice(0, maxDisplay);

  if (topBids.length === 0) {
    return null;
  }

  // Format date to relative time
  const getRelativeTime = (dateString: string) => {
    if (!dateString) return 'Recently';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  };

  return (
    <div className="space-y-2">
      {topBids.map((bid, index) => (
        <div
          key={bid.userId.uuid || index}
          className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-900/10 to-pink-900/10 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-all cursor-pointer"
          onClick={() => bid.userId.uuid && navigate(`/user/${bid.userId.uuid}`)}
        >
          {/* Left: Profile + Username */}
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            {/* Profile Picture */}
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-800 border-2 border-yellow-500 flex-shrink-0">
              <img
                src={bid.userId.profilePic || '/Tuneable-Logo-180x180.svg'}
                alt={bid.userId.username}
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Username */}
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold truncate">
                {bid.userId.username}
              </div>
              {bid.createdAt && (
                <div className="flex items-center space-x-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span>{getRelativeTime(bid.createdAt)}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Right: Bid Amount */}
          <div className="text-right flex-shrink-0">
            <div className="text-xl font-bold text-yellow-400">
              £{(bid.amount || (bid._doc && bid._doc.amount) || 0).toFixed(2)}
            </div>
          </div>
        </div>
      ))}
      
      {/* Show count if more bids exist */}
      {bids.length > maxDisplay && (
        <div className="text-center py-2 text-sm text-gray-400">
          +{bids.length - maxDisplay} more {bids.length - maxDisplay === 1 ? 'bid' : 'bids'}
        </div>
      )}
    </div>
  );
};

export default TopBidders;

