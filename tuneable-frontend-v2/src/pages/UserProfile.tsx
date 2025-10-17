import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  MapPin, 
  Coins, 
  Music, 
  TrendingUp,
  Clock,
  BarChart3,
  Activity,
  Edit3,
  Save,
  X,
  Loader2,
  Gift,
  Copy
} from 'lucide-react';
import { userAPI, authAPI } from '../lib/api';
import CreatorUserToggle from '../components/CreatorUserToggle';
import { useAuth } from '../contexts/AuthContext';

interface UserProfile {
  id: string; // UUID as primary ID
  uuid: string;
  username: string;
  profilePic?: string;
  email: string;
  balance: number;
  personalInviteCode?: string;
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
    globalMediaAggregate?: number;
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
    globalMediaAggregate?: number;
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
  const { user: currentUser } = useAuth();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [songsWithBids, setSongsWithBids] = useState<SongWithBids[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'creator' | 'user'>('user');
  
  // Edit profile state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editForm, setEditForm] = useState({
    username: '',
    givenName: '',
    familyName: '',
    cellPhone: '',
    homeLocation: { city: '', country: '' }
  });
  
  // Check if viewing own profile
  const isOwnProfile = currentUser && user && currentUser.uuid === user.uuid;

  useEffect(() => {
    if (userId) {
      fetchUserProfile();
    }
  }, [userId]);

  // Populate edit form when user data loads
  useEffect(() => {
    if (user && isOwnProfile) {
      setEditForm({
        username: user.username || '',
        givenName: (user as any).givenName || '',
        familyName: (user as any).familyName || '',
        cellPhone: (user as any).cellPhone || '',
        homeLocation: {
          city: user.homeLocation?.city || '',
          country: user.homeLocation?.country || ''
        }
      });
    }
  }, [user, isOwnProfile]);

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
    if (roles.includes('admin')) return 'Admin';
    if (roles.includes('moderator')) return 'Moderator';
    return 'User';
  };

  const getRoleColor = (roles: string[]) => {
    if (roles.includes('admin')) return 'text-red-400';
    if (roles.includes('moderator')) return 'text-blue-400';
    return 'text-green-400';
  };

  // Copy invite code to clipboard
  const copyInviteCode = () => {
    if (user?.personalInviteCode) {
      navigator.clipboard.writeText(user.personalInviteCode);
      toast.success('Invite code copied to clipboard!');
    }
  };

  // Edit profile handlers
  const handleSaveProfile = async () => {
    try {
      await authAPI.updateProfile(editForm);
      toast.success('Profile updated successfully!');
      setIsEditingProfile(false);
      // Refresh user data
      await fetchUserProfile();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      toast.error(err.response?.data?.error || 'Failed to update profile');
    }
  };

  const handleProfilePicClick = () => {
    if (isOwnProfile && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleProfilePicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    try {
      setIsUploading(true);
      await authAPI.uploadProfilePic(file);
      toast.success('Profile picture updated!');
      
      // Refresh user data
      await fetchUserProfile();
    } catch (err: any) {
      console.error('Error uploading profile pic:', err);
      toast.error(err.response?.data?.error || 'Failed to upload profile picture');
    } finally {
      setIsUploading(false);
    }
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
            className="px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 text-white hover:bg-gray-700/30"
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
        <div className="mb-8 relative">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 mb-4 rounded-lg font-medium transition-colors bg-black/20 text-white hover:bg-gray-700/30"
          >
            Back
          </button>
            {/* Edit Profile Button - Only show when viewing own profile */}
            {isOwnProfile && (
             <div className='inline rounded-full items-center absolute right-3 mb-4'>
             <button
                onClick={() => setIsEditingProfile(true)}
                className="px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2"
              >
                <Edit3 className="h-4 w-4" />
                <span className="hidden sm:inline">Edit Profile</span>
              </button>
              </div>
            )}
          
          <div className="card flex items-start relative">
            <div className='absolute top-0 right-0'>

              {/* Member Since */}
              <div className="flex rounded-full p-4 items-center">
                {/* <div className="text-sm text-gray-300 mr-2">Joined</div> */}
                <span className="px-3 py-2 bg-purple-600/50 text-white text-xs rounded-full font-semibold">
                  {formatJoinDate(user.createdAt)}
                </span>
              </div>
          
      
            </div>
            {/* Profile Picture */}
            <div className="flex-shrink-0 relative">
              <img
                src={user.profilePic || '/android-chrome-192x192.png'}
                alt={`${user.username} profile`}
                className={`rounded-full shadow-xl object-cover ${isOwnProfile ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                style={{ width: '200px', height: '200px' }}
                onClick={handleProfilePicClick}
                title={isOwnProfile ? 'Click to change profile picture' : ''}
              />
              {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                  <Loader2 className="h-8 w-8 text-white animate-spin" />
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleProfilePicUpload}
                className="hidden"
              />
            </div>
            
            {/* User Info */}
            <div className="ml-6 flex-1 text-white">
              <div className="">
                <h1 className="text-4xl font-bold mb-4">{user.username}</h1>
                <span className={`px-3 py-2 bg-purple-600/50 text-white text-xs rounded-full font-semibold ${getRoleColor(user.role)}`}>
                  {getRoleDisplay(user.role)}
                </span>
              </div>
              
              <div className="mb-6"></div>

              {/* Location */}
              {user.homeLocation && (
                <div className="mb-4">
                  <div className="bg-black/20 rounded-full px-2 inline-flex items-center text-gray-300">
                    <MapPin className="w-4 h-4 mr-2" />
                    <span className="p-2">
                      {user.homeLocation.city}  {user.homeLocation.country}
                    </span>
                  </div>
                </div>
              )}

             

              {/* Personal Invite Code - Only visible to profile owner */}
              {isOwnProfile && user.personalInviteCode && (
                <button onClick={copyInviteCode}
                title="Copy invite code"
                className="block w-fit px-4 py-2 bg-yellow-600/30 rounded-full text-yellow-200 hover:bg-yellow-600/60 transition-colors text-sm font-medium items-center">
                  <Gift className="inline h-4 w-4 mr-2" />
                  <span className="text-gray-300">Invite Code:</span>{' '}
                  <span className="font-mono font-bold">{user.personalInviteCode}</span>
                 
                    <Copy className="ml-2 inline h-3.5 w-3.5" />
                  </button>

              )}
              <div className="absolute bottom-4 right-0">
              {/* Creator/User Toggle */}
              <CreatorUserToggle 
                mode={viewMode}
                onToggle={(mode) => setViewMode(mode)}
              />
              </div>
            </div>
          </div>
        </div>

        {/* Bidding Statistics */}
        {stats && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-center text-white mb-4">Profile Info</h2>
            <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      <div className="flex items-center justify-center w-12 h-12 bg-purple-600/50 rounded-full">
                        <span className="text-white font-bold text-lg">{index + 1}</span>
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

      {/* Edit Profile Modal */}
      {isEditingProfile && isOwnProfile && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="card max-w-2xl w-full my-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Edit Profile</h2>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-white font-medium mb-2">Username</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="input"
                  placeholder="Enter username"
                />
              </div>

              {/* Given Name */}
              <div>
                <label className="block text-white font-medium mb-2">First Name</label>
                <input
                  type="text"
                  value={editForm.givenName}
                  onChange={(e) => setEditForm({ ...editForm, givenName: e.target.value })}
                  className="input"
                  placeholder="Enter first name"
                />
              </div>

              {/* Family Name */}
              <div>
                <label className="block text-white font-medium mb-2">Last Name</label>
                <input
                  type="text"
                  value={editForm.familyName}
                  onChange={(e) => setEditForm({ ...editForm, familyName: e.target.value })}
                  className="input"
                  placeholder="Enter last name"
                />
              </div>

              {/* Cell Phone */}
              <div>
                <label className="block text-white font-medium mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={editForm.cellPhone}
                  onChange={(e) => setEditForm({ ...editForm, cellPhone: e.target.value })}
                  className="input"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">City</label>
                  <input
                    type="text"
                    value={editForm.homeLocation.city}
                    onChange={(e) => setEditForm({ 
                      ...editForm, 
                      homeLocation: { ...editForm.homeLocation, city: e.target.value }
                    })}
                    className="input"
                    placeholder="Enter city"
                  />
                </div>
                <div>
                  <label className="block text-white font-medium mb-2">Country</label>
                  <input
                    type="text"
                    value={editForm.homeLocation.country}
                    onChange={(e) => setEditForm({ 
                      ...editForm, 
                      homeLocation: { ...editForm.homeLocation, country: e.target.value }
                    })}
                    className="input"
                    placeholder="Enter country"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleSaveProfile}
                className="btn-primary flex-1 flex items-center justify-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>Save Changes</span>
              </button>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
