import React, { useState } from 'react';
import { Trophy, ChevronDown, ChevronUp, Globe, Users, Coins, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface User {
  _id?: string;
  uuid: string;
  username: string;
  profilePic?: string;
  homeLocation?: {
    city?: string;
    country?: string;
  };
}

interface Bid {
  _id: string;
  userId: User;
  amount: number;
  createdAt?: string;
}

interface MediaLeaderboardProps {
  // Top 1 metrics (always shown)
  globalMediaBidTop?: number;
  globalMediaBidTopUser?: User;
  globalMediaAggregateTop?: number;
  globalMediaAggregateTopUser?: User;
  partyMediaBidTop?: number;
  partyMediaBidTopUser?: User;
  
  // All bids for calculating Top 5
  bids?: Bid[];
  
  // Media info for context
  mediaTitle?: string;
}

const MediaLeaderboard: React.FC<MediaLeaderboardProps> = ({
  globalMediaBidTop,
  globalMediaBidTopUser,
  globalMediaAggregateTop,
  globalMediaAggregateTopUser,
  partyMediaBidTop,
  partyMediaBidTopUser,
  bids = [],
  mediaTitle = 'this media'
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  // Calculate Top 5 Party Supporters (by aggregate)
  const getTopPartySupporters = () => {
    const userAggregates: { [userId: string]: { user: User; total: number } } = {};
    
    bids.forEach(bid => {
      if (bid.userId) {
        const userId = bid.userId._id || bid.userId.uuid;
        if (userId) {
          if (!userAggregates[userId]) {
            userAggregates[userId] = {
              user: bid.userId,
              total: 0
            };
          }
          userAggregates[userId].total += bid.amount;
        }
      }
    });

    return Object.values(userAggregates)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  };

  // Calculate Top 5 Individual Bids
  const getTopIndividualBids = () => {
    return [...bids]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  };

  const topPartySupporters = getTopPartySupporters();
  const topIndividualBids = getTopIndividualBids();

  // Use all props (suppress warnings)
  if (globalMediaBidTop && globalMediaBidTopUser && mediaTitle) {
    // These props are available but not currently displayed in compact view
  }

  const formatLocation = (homeLocation?: { city?: string; country?: string }) => {
    if (!homeLocation) return null;
    if (homeLocation.city && homeLocation.country) {
      return `${homeLocation.city}, ${homeLocation.country}`;
    }
    return homeLocation.country || homeLocation.city || null;
  };

  const UserBadge: React.FC<{ 
    user?: User; 
    amount: number; 
    icon: React.ReactNode;
    label: string;
    color: string;
    showLocation?: boolean;
  }> = ({ user, amount, label, color, showLocation = false }) => {
    if (!user || amount === 0) return null;

    return (
      <div className={`flex items-center justify-between p-2 rounded-lg bg-gradient-to-r ${color} border border-opacity-30`}>
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          {/* Profile Picture replacing icon */}
          {user.profilePic ? (
            <img
              src={user.profilePic}
              alt={user.username}
              className="w-6 h-6 rounded-full flex-shrink-0 object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                if (placeholder) placeholder.style.display = 'flex';
              }}
            />
          ) : null}
          <div 
            className={`w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 ${user.profilePic ? 'hidden' : 'flex'}`}
            style={{ display: user.profilePic ? 'none' : 'flex' }}
          >
            <img src="/default-profile.png" alt="Tuneable" className="w-6 h-6" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-300 mb-0.5">{label}</div>
            <button
              onClick={() => navigate(`/user/${user._id || user.uuid}`)}
              className="text-sm font-medium text-white hover:text-purple-300 transition-colors truncate block"
            >
              @{user.username}
            </button>
            {showLocation && formatLocation(user.homeLocation) && (
              <div className="flex items-center space-x-1 mt-0.5">
                <MapPin className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400">{formatLocation(user.homeLocation)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="text-sm font-bold text-white  ">
          £{amount.toFixed(2)}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-3 space-y-2">
      {/* Top 1 Badges - Always Visible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <UserBadge
          user={globalMediaAggregateTopUser}
          amount={globalMediaAggregateTop || 0}
          icon={<Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />}
          label="Top Global Fan"
          color="from-blue-900/20 to-blue-800/10"
        />
        <UserBadge
          user={partyMediaBidTopUser}
          amount={partyMediaBidTop || 0}
          icon={<Coins className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
          label="Top Party Bid"
          color="from-yellow-900/20 to-yellow-800/10"
        />
      </div>

      {/* Expand/Collapse Button */}
      {bids.length > 0 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center space-x-2 p-2 bg-purple-900/30 hover:bg-purple-900/50 rounded-lg transition-colors text-sm text-purple-300"
        >
          <Trophy className="w-4 h-4" />
          <span>{isExpanded ? 'Hide' : 'Show'} Full Leaderboard</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      )}

      {/* Expanded Leaderboards */}
      {isExpanded && (
        <div className="space-y-4 p-4 bg-black/30 rounded-lg border border-purple-500/20">
          {/* Top 5 Party Supporters */}
          {topPartySupporters.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-purple-300 mb-2 flex items-center">
                <Users className="w-4 h-4 mr-2" />
                Top 5 Party Supporters (Total Bids)
              </h4>
              <div className="space-y-2">
                {topPartySupporters.map((supporter, index) => (
                  <div
                    key={supporter.user._id || supporter.user.uuid}
                    className="flex items-center justify-between p-3 bg-purple-900/20 rounded-lg hover:bg-purple-900/30 transition-colors"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-6 h-6 bg-purple-600/50 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-xs">#{index + 1}</span>
                      </div>
                      {supporter.user.profilePic ? (
                        <img
                          src={supporter.user.profilePic}
                          alt={supporter.user.username}
                          className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                            if (placeholder) placeholder.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 ${supporter.user.profilePic ? 'hidden' : 'flex'}`}
                        style={{ display: supporter.user.profilePic ? 'none' : 'flex' }}
                      >
                        <img src="/default-profile.png" alt="Tuneable" className="w-8 h-8" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => navigate(`/user/${supporter.user._id || supporter.user.uuid}`)}
                          className="text-sm font-medium text-white hover:text-purple-300 transition-colors truncate block"
                        >
                          @{supporter.user.username}
                        </button>
                        {formatLocation(supporter.user.homeLocation) && (
                          <div className="flex items-center space-x-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-400">{formatLocation(supporter.user.homeLocation)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-white">
                      £{supporter.total.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top 5 Individual Bids */}
          {topIndividualBids.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-yellow-300 mb-2 flex items-center">
                <Coins className="w-4 h-4 mr-2" />
                Top 5 Individual Bids
              </h4>
              <div className="space-y-2">
                {topIndividualBids.map((bid, index) => (
                  <div
                    key={bid._id}
                    className="flex items-center justify-between p-3 bg-yellow-900/20 rounded-lg hover:bg-yellow-900/30 transition-colors"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-6 h-6 bg-yellow-600/50 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-xs">#{index + 1}</span>
                      </div>
                      {bid.userId?.profilePic ? (
                        <img
                          src={bid.userId.profilePic}
                          alt={bid.userId?.username || 'Unknown'}
                          className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const placeholder = e.currentTarget.nextElementSibling as HTMLElement;
                            if (placeholder) placeholder.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 ${bid.userId?.profilePic ? 'hidden' : 'flex'}`}
                        style={{ display: bid.userId?.profilePic ? 'none' : 'flex' }}
                      >
                        <img src="/default-profile.png" alt="Tuneable" className="w-8 h-8 " />
                      </div>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => navigate(`/user/${bid.userId?.uuid}`)}
                          className="text-sm font-medium text-white hover:text-yellow-300 transition-colors truncate block"
                        >
                          @{bid.userId?.username || 'Unknown'}
                        </button>
                        {bid.createdAt && (
                          <span className="text-xs text-gray-400">
                            {new Date(bid.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-white">
                      £{bid.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MediaLeaderboard;

