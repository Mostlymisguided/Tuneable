import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  MapPin, 
  Coins, 
  Music, 
  TrendingUp,
  Clock,
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
    tags?: string[];
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
    tags?: string[];
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
      setSongsWithBids(response.songsWithBids);
    } catch (err: any) {
      console.error('Error fetching user profile:', err);
      setError(err.response?.data?.error || 'Failed to load user profile');
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const formatJoinDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
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
            className="px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30"
            style={{ backgroundColor: 'rgba(55, 65, 81, 0.2)' }}
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
            className="px-4 py-2 mb-4 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30"
            style={{ backgroundColor: 'rgba(55, 65, 81, 0.2)' }}
          >
            Back
          </button>
          
          <div className="card flex items-start space-x-6">
            {/* Profile Picture */}
            <div className="flex-shrink-0 p-6">
              <img
                src={user.profilePic || '/android-chrome-192x192.png'}
                alt={`${user.username} profile`}
                className="rounded-full shadow-xl object-cover"
                style={{ width: '200px', height: '200px' }}
              />
            </div>
            
            {/* User Info */}
            <div className="flex-1 text-white">
              <div className="p-4 flex items-center space-x-3 mb-2">
                <h1 className="text-4xl font-bold">{user.username}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getRoleColor(user.role)} bg-black/20`}>
                  {getRoleDisplay(user.role)}
                </span>
              </div>
              
              <div className="mb-6"></div>

              {/* Location */}
              {user.homeLocation && (
                <div className="mb-4">
                  <div className="bg-black/20 rounded-full px-4 py-2 inline-flex items-center text-gray-300">
                    <MapPin className="w-4 h-4 mr-2" />
                    <span>
                      {user.homeLocation.city},  {user.homeLocation.country}
                    </span>
                  </div>
                </div>
              )}

              {/* Member Since */}
              <div className="bg-black/20 rounded-full px-4 py-2 inline-flex items-center">
                <div className="text-sm text-gray-300 mr-2">Member Since</div>
                <div className="text-sm font-semibold text-blue-400">
                  {formatJoinDate(user.createdAt)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bidding Statistics */}
        {stats && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-center text-white mb-4">Profile Info</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card bg-black/20 rounded-lg p-6 text-center">
                <BarChart3 className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{stats.totalBids || 0}</div>
                <div className="text-sm text-gray-300">Total Bids</div>
              </div>
              <div className="card bg-black/20 rounded-lg p-6 text-center">
                <Coins className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">£{(stats.totalAmountBid || 0).toFixed(2)}</div>
                <div className="text-sm text-gray-300">Total Spent</div>
              </div>
              <div className="card bg-black/20 rounded-lg p-6 text-center">
                <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">£{(stats.averageBidAmount || 0).toFixed(2)}</div>
                <div className="text-sm text-gray-300">Avg Bid</div>
              </div>
              <div className="card bg-black/20 rounded-lg p-6 text-center">
                <Music className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{stats.uniqueSongsCount || 0}</div>
                <div className="text-sm text-gray-300">Unique Songs</div>
              </div>
            </div>
          </div>
        )}

        {/* Songs with Bids */}
        {songsWithBids.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl text-center font-bold text-white mb-4">Top Tunes</h2>
            <div className="bg-black/20 rounded-lg p-6">
              <div className="space-y-4">
                {songsWithBids.map((songData, index) => (
                  <div key={songData.song?.uuid || songData.song?._id || 'unknown'} className="card flex items-center space-x-4 p-4 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center w-12 h-12 bg-purple-600 rounded-full">
                        <span className="text-white font-bold text-lg">#{index + 1}</span>
                      </div>
                    </div>
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
                      {/* Tags Display */}
                      {songData.song?.tags && songData.song.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {songData.song.tags.slice(0, 5).map((tag: string, tagIndex: number) => (
                            <span 
                              key={tagIndex}
                              className="px-2 py-1 bg-purple-600/30 text-purple-200 text-xs rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                          {songData.song.tags.length > 5 && (
                            <span className="px-2 py-1 text-gray-400 text-xs">
                              +{songData.song.tags.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-400">£{(songData.totalAmount || 0).toFixed(2)}</div>
                      <div className="text-sm text-gray-400">Total Bid</div>
                    </div>
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
