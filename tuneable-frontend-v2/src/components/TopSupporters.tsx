import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, TrendingUp } from 'lucide-react';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { penceToPounds } from '../utils/currency';

interface Bid {
  userId: {
    username: string;
    profilePic?: string;
    uuid: string;
    location?: string;
  };
  amount: number;
  createdAt: string;
  _doc?: any;
}

interface TopSupportersProps {
  bids: Bid[];
  maxDisplay?: number;
  userStatsMap?: Record<string, { tuneBytes?: number; globalUserAggregate?: number }>;
}

const TopSupporters: React.FC<TopSupportersProps> = ({ bids, maxDisplay = 10, userStatsMap }) => {
  const navigate = useNavigate();

  if (!bids || bids.length === 0) {
    return null;
  }

  // Aggregate bids by user
  const userAggregates = bids.reduce((acc, bid) => {
    if (!bid.userId || !bid.userId.username) return acc;
    
    const status = bid.status || (bid._doc && bid._doc.status) || 'active';
    if (status === 'vetoed') return acc; // Skip vetoed bids
    
    const userId = bid.userId.uuid || bid.userId.username;
    const amount = bid.amount || (bid._doc && bid._doc.amount) || 0;
    
    if (!acc[userId]) {
      acc[userId] = {
        user: bid.userId,
        totalAmount: 0,
        bidCount: 0,
        firstBidDate: bid.createdAt || new Date().toISOString(),
        lastBidDate: bid.createdAt || new Date().toISOString(),
      };
    }
    
    acc[userId].totalAmount += amount;
    acc[userId].bidCount += 1;
    
    // Track earliest and latest bid dates
    const currentBidDate = new Date(bid.createdAt || new Date());
    const firstBidDate = new Date(acc[userId].firstBidDate);
    const lastBidDate = new Date(acc[userId].lastBidDate);
    
    if (currentBidDate < firstBidDate) {
      acc[userId].firstBidDate = bid.createdAt;
    }
    if (currentBidDate > lastBidDate) {
      acc[userId].lastBidDate = bid.createdAt;
    }
    
    return acc;
  }, {} as Record<string, any>);

  // Convert to array and sort by total amount
  const topSupporters = Object.values(userAggregates)
    .sort((a: any, b: any) => b.totalAmount - a.totalAmount)
    .slice(0, maxDisplay);

  if (topSupporters.length === 0) {
    return null;
  }

  // Format date to relative time
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  return (
    <div className="space-y-2 md:space-y-3">
      {topSupporters.map((supporter: any, index: number) => (
        <div
          key={supporter.user._id || supporter.user.uuid || index}
          className="flex flex-row md:items-center md:justify-between p-1.5 md:p-4 bg-purple-900/20 rounded-lg hover:bg-purple-500/40 transition-all cursor-pointer"
          onClick={() => (supporter.user._id || supporter.user.uuid) && navigate(`/user/${supporter.user._id || supporter.user.uuid}`)}
        >
          {/* Left: Rank + Profile + Info */}
          <div className="flex items-center space-x-2 md:space-x-4 flex-1 min-w-0">
            {/* Rank Badge */}
            <div className="w-6 h-6 md:w-8 md:h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs md:text-sm">#{index + 1}</span>
            </div>
            
            {/* Profile Picture */}
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden bg-gray-800 border-2 border-purple-500 flex-shrink-0">
              <img
                src={supporter.user.profilePic || DEFAULT_PROFILE_PIC}
                alt={supporter.user.username}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PROFILE_PIC;
                }}
              />
            </div>
            
            {/* User Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-1 md:space-x-2">
                <h4 className="text-white font-semibold text-sm md:text-lg truncate">
                  {supporter.user.username}
                </h4>
                <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-green-400 flex-shrink-0" />
              </div>
              
              <div className="flex flex-wrap items-center gap-x-1.5 md:gap-x-3 text-xs md:text-sm text-gray-400 mt-0.5 md:mt-0">
                {supporter.user.location && (
                  <>
                    <div className="flex items-center space-x-1">
                      <MapPin className="h-2.5 w-2.5 md:h-3 md:w-3" />
                      <span className="truncate">{supporter.user.location}</span>
                    </div>
                    <span className="hidden md:inline">•</span>
                  </>
                )}
                <span>{supporter.bidCount} {supporter.bidCount === 1 ? 'Tip' : 'Tips'}</span>
                <span className="hidden md:inline">•</span>
                <span className="truncate">Since {getRelativeTime(supporter.firstBidDate)}</span>
              </div>
            </div>
          </div>
          
          {/* Right: Totals */}
          <div className="text-right md:ml-4 items-center block justify-between md:justify-end">
            <div className="text-sm md:text-xl font-bold text-green-400">
              {penceToPounds(supporter.totalAmount)}
            </div>
            <div className="flex items-center justify-end space-x-1 text-xs text-gray-400">
              <span title="Average Tip">
                <TrendingUp className="h-3 w-3" />
              </span>
              <span>{penceToPounds(supporter.totalAmount / supporter.bidCount)}</span>
            </div>
            {userStatsMap && (supporter.user.uuid || supporter.user._id) && (
              <div className="text-xs text-purple-300 mt-1 hidden md:block">
                TuneBytes: {userStatsMap[supporter.user.uuid || supporter.user._id]?.tuneBytes ?? '—'}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TopSupporters;

