import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  ArrowLeft, 
  MapPin, 
  Coins, 
  Music, 
  TrendingUp,
  Clock,
  ExternalLink,
  BarChart3,
  Activity
} from 'lucide-react';
import { userAPI } from '../lib/api';

interface UserProfile {
  id: string; // UUID as primary ID
  uuid: string;
  username: string;
  profilePic?: string;
  email: string;
  balance: number;
  homeLocation: {
    city: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  role: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Bid {
  _id: string;
  songId: {
    _id: string;
    title: string;
    artist: string;
    coverArt?: string;
    duration?: number;
    globalBidValue?: number;
    uuid: string;
  };
  partyId: {
    _id: string;
    name: string;
    partyCode: string;
    uuid: string;
  };
  amount: number;
  createdAt: string;
}

interface SongWithBids {
  song: {
    _id: string;
    title: string;
    artist: string;
    coverArt?: string;
    duration?: number;
    globalBidValue?: number;
    uuid: string;
  };
  bids: Bid[];
  totalAmount: number;
  bidCount: number;
}

interface UserStats {
  totalBids: number;
  totalAmountBid: number;
  averageBidAmount: number;
  uniqueSongsCount: number;
}

const UserProfile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [topBids, setTopBids] = useState<Bid[]>([]);
  const [songsWithBids, setSongsWithBids] = useState<SongWithBids[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      fetchUserProfile();
    }
  }, [userId]);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const response = await userAPI.getProfile(userId!);
      setUser(response.user);
      setStats(response.stats);
      setTopBids(response.topBids);
      setSongsWithBids(response.songsWithBids);
    } catch (err: any) {
      console.error('Error fetching user profile:', err);
      setError(err.response?.data?.error || 'Failed to load user profile');
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRoleDisplay = (roles: string[]) => {
    if (roles.includes('admin')) return 'Administrator';
    if (roles.includes('moderator')) return 'Moderator';
    return 'User';
  };

  const getRoleColor = (roles: string[]) => {
    if (roles.includes('admin')) return 'text-red-400';
    if (roles.includes('moderator')) return 'text-blue-400';
    return 'text-green-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading user profile...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Error loading user profile</div>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-white hover:text-purple-300 mb-4 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          
          <div className="flex items-start space-x-6">
            {/* Profile Picture */}
            <div className="flex-shrink-0">
              <img
                src={user.profilePic || '/android-chrome-192x192.png'}
                alt={`${user.username} profile`}
                className="w-48 h-48 rounded-full shadow-xl object-cover"
              />
            </div>
            
            {/* User Info */}
            <div className="flex-1 text-white">
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-4xl font-bold">{user.username}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getRoleColor(user.role)} bg-black/20`}>
                  {getRoleDisplay(user.role)}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-black/20 rounded-lg p-4">
                  <div className="text-sm text-gray-300">Wallet Balance</div>
                  <div className="text-2xl font-bold text-green-400">
                    £{user.balance?.toFixed(2) || '0.00'}
                  </div>
                </div>
                <div className="bg-black/20 rounded-lg p-4">
                  <div className="text-sm text-gray-300">Member Since</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {formatDate(user.createdAt)}
                  </div>
                </div>
              </div>

              {/* Location */}
              {user.homeLocation && (
                <div className="mb-6">
                  <div className="flex items-center text-gray-300">
                    <MapPin className="w-5 h-5 mr-2" />
                    <span>
                      {user.homeLocation.city}, {user.homeLocation.country}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bidding Statistics */}
        {stats && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">Bidding Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-black/20 rounded-lg p-6 text-center">
                <BarChart3 className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{stats.totalBids || 0}</div>
                <div className="text-sm text-gray-300">Total Bids</div>
              </div>
              <div className="bg-black/20 rounded-lg p-6 text-center">
                <Coins className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">£{(stats.totalAmountBid || 0).toFixed(2)}</div>
                <div className="text-sm text-gray-300">Total Spent</div>
              </div>
              <div className="bg-black/20 rounded-lg p-6 text-center">
                <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">£{(stats.averageBidAmount || 0).toFixed(2)}</div>
                <div className="text-sm text-gray-300">Avg Bid</div>
              </div>
              <div className="bg-black/20 rounded-lg p-6 text-center">
                <Music className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{stats.uniqueSongsCount || 0}</div>
                <div className="text-sm text-gray-300">Unique Songs</div>
              </div>
            </div>
          </div>
        )}

        {/* Top Bids */}
        {topBids.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">Top Bids</h2>
            <div className="bg-black/20 rounded-lg p-6">
              <div className="space-y-4">
                {topBids.map((bid, index) => (
                  <div key={bid._id} className="flex items-center space-x-4 p-4 bg-black/10 rounded-lg">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center w-12 h-12 bg-purple-600 rounded-full">
                        <span className="text-white font-bold text-lg">#{index + 1}</span>
                      </div>
                    </div>
                    <img
                      src={bid.songId?.coverArt || '/android-chrome-192x192.png'}
                      alt={`${bid.songId?.title || 'Unknown Song'} cover`}
                      className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => bid.songId?.uuid && navigate(`/tune/${bid.songId.uuid}`)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 
                          className="text-lg font-semibold text-white cursor-pointer hover:text-purple-300 transition-colors"
                          onClick={() => bid.songId?.uuid && navigate(`/tune/${bid.songId.uuid}`)}
                        >
                          {bid.songId?.title || 'Unknown Song'}
                        </h3>
                        <span className="text-gray-400">by</span>
                        <span className="text-purple-300">{bid.songId?.artist || 'Unknown Artist'}</span>
                      </div>
                      <div className="text-sm text-gray-400">
                        {bid.partyId?.name || 'Unknown Party'} • {formatDate(bid.createdAt)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-400">£{bid.amount?.toFixed(2) || '0.00'}</div>
                      <div className="text-sm text-gray-400">Bid Amount</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Songs with Bids */}
        {songsWithBids.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">Songs Bid On</h2>
            <div className="bg-black/20 rounded-lg p-6">
              <div className="space-y-4">
                {songsWithBids.map((songData) => (
                  <div key={songData.song?.uuid || songData.song?._id || 'unknown'} className="flex items-center space-x-4 p-4 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                    <img
                      src={songData.song?.coverArt || '/android-chrome-192x192.png'}
                      alt={`${songData.song?.title || 'Unknown Song'} cover`}
                      className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => songData.song?.uuid && navigate(`/tune/${songData.song.uuid}`)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 
                          className="text-lg font-semibold text-white cursor-pointer hover:text-purple-300 transition-colors"
                          onClick={() => songData.song?.uuid && navigate(`/tune/${songData.song.uuid}`)}
                        >
                          {songData.song?.title || 'Unknown Song'}
                        </h3>
                        <span className="text-gray-400">by</span>
                        <span className="text-purple-300">{songData.song?.artist || 'Unknown Artist'}</span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-400">
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {formatDuration(songData.song?.duration)}
                        </span>
                        <span className="flex items-center">
                          <Activity className="w-4 h-4 mr-1" />
                          {songData.bidCount || 0} bid{(songData.bidCount || 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-400">£{(songData.totalAmount || 0).toFixed(2)}</div>
                      <div className="text-sm text-gray-400">Total Bid</div>
                    </div>
                    <button
                      onClick={() => songData.song?.uuid && navigate(`/tune/${songData.song.uuid}`)}
                      className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors"
                      disabled={!songData.song?.uuid}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Song
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No Bids Message */}
        {stats && stats.totalBids === 0 && (
          <div className="text-center py-12">
            <Music className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Bids Yet</h3>
            <p className="text-gray-400">This user hasn't placed any bids yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
