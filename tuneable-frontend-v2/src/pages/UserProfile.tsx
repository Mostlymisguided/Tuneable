import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { 
  Coins, 
  Music, 
  TrendingUp,
  Clock,
  BarChart3,
  Activity,
  Save,
  X,
  Loader2,
  Gift,
  Copy,
  Facebook,
  Youtube,
  Instagram,
  Play,
  Music2,
  Settings,
  Bell,
  MapPin
} from 'lucide-react';
import { userAPI, authAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import SocialMediaModal from '../components/SocialMediaModal';

interface UserProfile {
  id: string; // UUID as primary ID
  _id?: string; // ObjectId
  uuid: string;
  username: string;
  profilePic?: string;
  email: string;
  balance: number;
  personalInviteCode?: string;
  givenName?: string;
  familyName?: string;
  cellPhone?: string;
    homeLocation?: {
      city?: string;
      region?: string;
      country?: string;
      countryCode?: string;
      coordinates?: {
        lat: number;
        lng: number;
      };
      detectedFromIP?: boolean;
    };
    secondaryLocation?: {
      city?: string;
      region?: string;
      country?: string;
      countryCode?: string;
      coordinates?: {
        lat: number;
        lng: number;
      };
    } | null;
  role: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Social media fields
  creatorProfile?: {
    socialMedia?: {
      facebook?: string;
      instagram?: string;
      soundcloud?: string;
      spotify?: string;
      youtube?: string;
      twitter?: string;
    };
  };
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

interface MediaWithBids {
  media: {
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  
  // Web player store for playing media
  const { setCurrentMedia, setGlobalPlayerActive } = useWebPlayerStore();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [mediaWithBids, setMediaWithBids] = useState<MediaWithBids[]>([]);
  const [tagRankings, setTagRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Settings mode - controlled by query params
  const isSettingsMode = searchParams.get('settings') === 'true';
  const settingsTab = (searchParams.get('tab') as 'profile' | 'notifications') || 'profile';
  
  // Edit profile state (kept for potential revert)
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Notification preferences state
  const [notificationPrefs, setNotificationPrefs] = useState({
    bid_received: true,
    bid_outbid: true,
    comment_reply: true,
    tune_bytes_earned: true,
    email: true,
    anonymousMode: false,
    inApp: true // Always true
  });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    givenName: '',
    familyName: '',
    cellPhone: '',
    homeLocation: {
      city: '',
      region: '',
      country: ''
    },
    secondaryLocation: null as {
      city: string;
      region: string;
      country: string;
    } | null,
    socialMedia: {
      soundcloud: '',
      facebook: '',
      instagram: ''
    }
  });
  
  // Social media modal state
  const [socialModal, setSocialModal] = useState<{
    isOpen: boolean;
    platform: 'facebook' | 'instagram' | 'soundcloud' | null;
    currentUrl?: string;
  }>({
    isOpen: false,
    platform: null,
    currentUrl: undefined
  });

  // Check if viewing own profile
  const isOwnProfile = currentUser && user && (currentUser._id === user._id || currentUser.uuid === user.uuid);

  useEffect(() => {
    if (userId) {
      // Always fetch from API to ensure we have complete profile data including givenName, familyName, cellPhone
      fetchUserProfile();
    }
  }, [userId]);


  // Settings handlers
  const handleSettingsClick = () => {
    setSearchParams({ settings: 'true', tab: 'profile' });
  };

  const handleSettingsTabChange = (tab: 'profile' | 'notifications') => {
    setSearchParams({ settings: 'true', tab });
  };

  const exitSettings = () => {
    setSearchParams({});
  };

  // Populate edit form when user data loads
  useEffect(() => {
    // Check if this is the user's own profile
    const ownProfile = currentUser && user && (currentUser._id === user._id || currentUser.uuid === user.uuid || currentUser.uuid === user.id || currentUser._id === user.id);
    
    if (user && ownProfile) {
      console.log('📝 Populating edit form with user data:', {
        givenName: user.givenName,
        familyName: user.familyName,
        cellPhone: user.cellPhone,
        homeLocation: user.homeLocation,
        userId: user._id || user.id,
        currentUserId: currentUser._id || currentUser.uuid
      });
      setEditForm({
        username: user.username || '',
        givenName: user.givenName || '',
        familyName: user.familyName || '',
        cellPhone: user.cellPhone || '',
        homeLocation: {
          city: user.homeLocation?.city || '',
          region: user.homeLocation?.region || '',
          country: user.homeLocation?.country || ''
        },
        secondaryLocation: user.secondaryLocation ? {
          city: user.secondaryLocation.city || '',
          region: user.secondaryLocation.region || '',
          country: user.secondaryLocation.country || ''
        } : null,
        socialMedia: {
          soundcloud: user.creatorProfile?.socialMedia?.soundcloud || '',
          facebook: user.creatorProfile?.socialMedia?.facebook || '',
          instagram: user.creatorProfile?.socialMedia?.instagram || ''
        }
      });
    }
  }, [user, currentUser]);

  // Load notification preferences when user data is loaded
  useEffect(() => {
    if (user && isOwnProfile) {
      // Load preferences from user object if available
      const prefs = (user as any).preferences;
      if (prefs) {
        const notifPrefs = prefs.notifications || {};
        setNotificationPrefs({
          bid_received: notifPrefs.types?.bid_received ?? true,
          bid_outbid: notifPrefs.types?.bid_outbid ?? true,
          comment_reply: notifPrefs.types?.comment_reply ?? true,
          tune_bytes_earned: notifPrefs.types?.tune_bytes_earned ?? true,
          email: notifPrefs.email ?? true,
          anonymousMode: prefs.anonymousMode ?? false,
          inApp: true // Always true
        });
      }
    }
  }, [user, isOwnProfile]);

  // Save notification preferences
  const handleSaveNotificationPrefs = async () => {
    try {
      setIsSavingPrefs(true);
      await userAPI.updateNotificationPreferences(notificationPrefs);
      toast.success('Notification preferences saved successfully!');
    } catch (error: any) {
      console.error('Error saving notification preferences:', error);
      toast.error(error.response?.data?.error || 'Failed to save notification preferences');
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      const response = await userAPI.getProfile(userId!);
      console.log('📥 Full API response:', response);
      console.log('📥 User data from API:', {
        cellPhone: response.user?.cellPhone,
        givenName: response.user?.givenName,
        familyName: response.user?.familyName,
        fullUser: response.user
      });
      setUser(response.user);
      setStats(response.stats);
      setMediaWithBids(response.mediaWithBids);
      // Also load tag rankings
      loadTagRankings();
    } catch (err: any) {
      console.error('Error fetching user profile:', err);
      setError(err.response?.data?.error || 'Failed to load user profile');
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };

  const loadTagRankings = async () => {
    try {
      console.log('🏷️ Loading tag rankings for user:', userId);
      const response = await userAPI.getTagRankings(userId!, 10);
      console.log('📊 Tag rankings response:', response);
      setTagRankings(response.tagRankings || []);
      console.log('✅ Tag rankings loaded:', response.tagRankings?.length || 0, 'tags');
    } catch (err: any) {
      console.error('❌ Error loading tag rankings:', err);
      // Silent fail - not critical
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
    if (roles.includes('creator')) return 'Creator';
    return 'User';
  };

  const getRoleColor = (roles: string[]) => {
    if (roles.includes('admin')) return 'text-white';
    if (roles.includes('moderator')) return 'text-blue-400';
    if (roles.includes('creator')) return 'text-white';
    return 'text-green-400';
  };

  // Handle playing media from Top Tunes
  const handlePlayMedia = (mediaData: any) => {
    if (!mediaData.media) return;
    
    const media = mediaData.media;
    const mediaId = media._id || media.uuid;
    
    if (!mediaId) {
      toast.error('Unable to identify media item');
      return;
    }

    // Clean and format the media for the webplayer
    let sources = {};
    
    if (media.sources) {
      sources = media.sources;
    } else {
      // Fallback to individual source fields
      if (media.youtubeId) sources = { ...sources, youtube: media.youtubeId };
      if (media.uploadUrl) sources = { ...sources, upload: media.uploadUrl };
    }
    
    const cleanedMedia = {
      id: mediaId,
      title: media.title,
      artist: Array.isArray(media.artist) ? media.artist[0]?.name || 'Unknown Artist' : media.artist,
      duration: media.duration,
      coverArt: media.coverArt,
      sources: sources,
      globalMediaAggregate: media.globalMediaAggregate || 0,
      bids: mediaData.bids || [],
      addedBy: media.addedBy || null,
      totalBidValue: mediaData.totalAmountBid || 0,
    };
    
    // Set the media in the webplayer and start playing
    setCurrentMedia(cleanedMedia, 0, true); // true = autoplay
    setGlobalPlayerActive(true);
    
    toast.success(`Now playing: ${cleanedMedia.title}`);
  };

  // Get social media links based on manual URLs only
  const getSocialMediaLinks = () => {
    const socialLinks = [];
    
    // Facebook - manual URL only
    if (user?.creatorProfile?.socialMedia?.facebook) {
      socialLinks.push({
        name: 'Facebook',
        icon: Facebook,
        url: user.creatorProfile.socialMedia.facebook,
        platform: 'facebook' as const,
        color: 'hover:bg-blue-600/30 hover:border-blue-500'
      });
    }
    
    // YouTube - manual URL only
    if (user?.creatorProfile?.socialMedia?.youtube) {
      socialLinks.push({
        name: 'YouTube',
        icon: Youtube,
        url: user.creatorProfile.socialMedia.youtube,
        platform: undefined, // YouTube not supported in modal
        color: 'hover:bg-red-600/30 hover:border-red-500'
      });
    }
    
    // SoundCloud - manual URL only
    if (user?.creatorProfile?.socialMedia?.soundcloud) {
      socialLinks.push({
        name: 'SoundCloud',
        icon: Music2,
        url: user.creatorProfile.socialMedia.soundcloud,
        platform: 'soundcloud' as const,
        color: 'hover:bg-orange-600/30 hover:border-orange-500'
      });
    }
    
    // Instagram - manual URL only
    if (user?.creatorProfile?.socialMedia?.instagram) {
      socialLinks.push({
        name: 'Instagram',
        icon: Instagram,
        url: user.creatorProfile.socialMedia.instagram,
        platform: 'instagram' as const,
        color: 'hover:bg-pink-600/30 hover:border-pink-500'
      });
    }
    
    return socialLinks;
  };

  // Get list of social accounts that aren't connected yet (for own profile)
  const getUnconnectedSocialAccounts = () => {
    if (!isOwnProfile) return [];
    
    const unconnected = [];
    
    // Check if Facebook has manual URL
    if (!user?.creatorProfile?.socialMedia?.facebook) {
      unconnected.push({
        name: 'Facebook',
        icon: Facebook,
        platform: 'facebook' as const,
        color: 'border-blue-500 text-blue-300 hover:bg-blue-600/20'
      });
    }
    
    // Check if SoundCloud has manual URL
    if (!user?.creatorProfile?.socialMedia?.soundcloud) {
      unconnected.push({
        name: 'SoundCloud',
        icon: Music2,
        platform: 'soundcloud' as const,
        color: 'border-orange-500 text-orange-300 hover:bg-orange-600/20'
      });
    }
    
    // Check if Instagram has manual URL
    if (!user?.creatorProfile?.socialMedia?.instagram) {
      unconnected.push({
        name: 'Instagram',
        icon: Instagram,
        platform: 'instagram' as const,
        color: 'border-pink-500 text-pink-300 hover:bg-pink-600/20'
      });
    }
    
    return unconnected;
  };

  // Copy invite code to clipboard
  const copyInviteCode = () => {
    if (user?.personalInviteCode) {
      navigator.clipboard.writeText(user.personalInviteCode);
      toast.success('Invite code copied to clipboard!');
    }
  };

  // Social media modal handlers
  const openSocialModal = (platform: 'facebook' | 'instagram' | 'soundcloud') => {
    const currentUrl = user?.creatorProfile?.socialMedia?.[platform];
    setSocialModal({
      isOpen: true,
      platform,
      currentUrl
    });
  };

  const closeSocialModal = () => {
    setSocialModal({
      isOpen: false,
      platform: null,
      currentUrl: undefined
    });
  };

  const handleSaveSocialMedia = async (url: string) => {
    if (!socialModal.platform) return;
    
    try {
      await userAPI.updateSocialMedia(socialModal.platform, url);
      toast.success(`${socialModal.platform} URL updated successfully!`);
      
      // Refresh user data
      if (userId) {
        await fetchUserProfile();
      }
    } catch (error: any) {
      console.error('Error updating social media:', error);
      toast.error(error.response?.data?.error || 'Failed to update social media URL');
      throw error;
    }
  };

  // Edit profile handlers
  const handleSaveProfile = async () => {
    if (isSettingsMode) {
      // Save and exit settings mode
      try {
        await handleSaveProfileInternal();
        exitSettings();
      } catch (error) {
        // Error already handled in handleSaveProfileInternal
      }
      return;
    }
    // Legacy modal behavior (keep for potential revert)
    await handleSaveProfileInternal();
    setIsEditingProfile(false);
  };

  const handleSaveProfileInternal = async () => {
    try {
      // Format the data for the backend - move socialMedia under creatorProfile
      const { socialMedia, homeLocation, secondaryLocation, ...otherFields } = editForm;
      const formattedData = {
        ...otherFields,
        homeLocation: homeLocation,
        secondaryLocation: secondaryLocation && (secondaryLocation.city || secondaryLocation.region || secondaryLocation.country)
          ? secondaryLocation
          : null,
        creatorProfile: {
          socialMedia: socialMedia
        }
      };
      
      await authAPI.updateProfile(formattedData);
      toast.success('Profile updated successfully!');
      // Only update modal state if NOT in settings mode
      if (!isSettingsMode) {
        setIsEditingProfile(false);
      }
      // Refresh user data
      await fetchUserProfile();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      toast.error(err.response?.data?.error || 'Failed to update profile');
      throw err; // Re-throw so caller can handle it
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
      toast.error(err.response?.data?.error || err.response?.data?.details || 'Failed to upload profile picture');
    } finally {
      setIsUploading(false);
      // Reset file input to allow re-uploading the same file
      if (e.target) {
        e.target.value = '';
      }
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
            className="px-4 py-2 mb-4 rounded-lg font-medium transition-colors border border-white/20 bg-gray-700/40 text-white hover:bg-purple-500"
          >
            Back
          </button>
            {/* Settings Button - Only show when viewing own profile and not in settings mode */}
            {isOwnProfile && !isSettingsMode && (
             <div className='inline rounded-full items-center absolute right-3 mb-4'>
             <button
                onClick={handleSettingsClick}
                className="px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </button>
              </div>
            )}
            
            {/* Exit Settings Button - Only show in settings mode */}
            {isOwnProfile && isSettingsMode && (
             <div className='inline rounded-full items-center absolute right-3 mb-4'>
             <button
                onClick={exitSettings}
                className="px-4 py-2 bg-gray-600/40 hover:bg-gray-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Exit Settings</span>
              </button>
              </div>
            )}
          
          <div className="card flex items-start relative">
            <div className='absolute top-0 right-0'>

              {/* Member Since */}
              <div className="flex rounded-full p-4 items-center">
                {/* <div className="text-sm text-gray-300 mr-2">Joined</div> */}
                <span className="px-3 py-2 bg-purple-600/50 text-white text-xs md:text-base rounded-full font-semibold">
                  {formatJoinDate(user.createdAt)}
                </span>
              </div>
          
      
            </div>
            {/* Profile Picture */}
            <div className="flex-shrink-0 relative">
              <img
                src={user.profilePic || DEFAULT_PROFILE_PIC}
                alt={`${user.username} profile`}
                className={`rounded-full shadow-xl object-cover ${isOwnProfile ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                style={{ width: '200px', height: '200px' }}
                onClick={handleProfilePicClick}
                title={isOwnProfile ? 'Click to change profile picture' : ''}
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PROFILE_PIC;
                }}
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
                {(user.givenName || user.familyName) && (
                  <p className="text-xl text-gray-300 mb-2">
                    {user.givenName} {user.familyName}
                  </p>
                )}
                {(user.homeLocation?.city || user.homeLocation?.country || user.secondaryLocation?.city || user.secondaryLocation?.country) && (
                  <div className="flex flex-col gap-2 mb-4">
                    {user.homeLocation?.city || user.homeLocation?.country ? (
                      <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-purple-900/30 border border-purple-500/30 rounded-full text-gray-300 text-sm w-fit">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>
                          {[
                            user.homeLocation?.city,
                            user.homeLocation?.region,
                            user.homeLocation?.country
                          ].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    ) : null}
                    {user.secondaryLocation?.city || user.secondaryLocation?.country ? (
                      <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-purple-900/30 border border-purple-500/30 rounded-full text-gray-300 text-sm w-fit">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>
                          {[
                            user.secondaryLocation?.city,
                            user.secondaryLocation?.region,
                            user.secondaryLocation?.country
                          ].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              
              <div className="mb-6"></div>


              {/* Social Media Buttons */}
              {getSocialMediaLinks().length > 0 && (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2">
                    {getSocialMediaLinks().map((social) => (
                      <a
                        key={social.name}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center space-x-2 px-4 py-2 bg-black/20 border border-white/20 rounded-lg text-gray-200 transition-all ${social.color}`}
                      >
                        <social.icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{social.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Connect Social Media Buttons - Only for own profile */}
              {isOwnProfile && getUnconnectedSocialAccounts().length > 0 && (
                <div className="mb-4">
                  <div className="text-xs text-gray-400 mb-2">Connect accounts:</div>
                  <div className="flex flex-wrap gap-2">
                    {getUnconnectedSocialAccounts().map((social) => (
                      <button
                        key={social.name}
                        onClick={() => openSocialModal(social.platform)}
                        className={`flex items-center space-x-2 px-3 py-1.5 bg-black/10 border rounded-lg text-xs font-medium transition-all ${social.color}`}
                      >
                        <social.icon className="w-3.5 h-3.5" />
                        <span>Add {social.name}</span>
                      </button>
                    ))}
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
              <div className="absolute bottom-0 right-0 p-4">
              <span className={`px-3 py-2 bg-purple-600/50 text-xs md:text-base rounded-full font-semibold ${getRoleColor(user.role)}`}>
                  {getRoleDisplay(user.role)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Conditional Rendering: Settings Mode vs Normal Mode */}
        {!isSettingsMode ? (
          <>
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
                <div className="text-sm text-gray-300">Tunes Bid</div>
              </div>
            </div>
          </div>
        )}

        {/* Top Tags */}
        {tagRankings.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-center text-white mb-4">Top Tags</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tagRankings.slice(0, 6).map((ranking, index) => (
                <div 
                  key={ranking.tag} 
                  className="card bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-500/30 rounded-lg p-6 hover:border-purple-500/60 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-purple-600/50 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">#{index + 1}</span>
                      </div>
                      <span className="text-white font-medium text-lg">{ranking.tag}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Total Bid</span>
                      <span className="text-xl font-bold text-white">£{ranking.aggregate.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Rank</span>
                      <span className="text-lg font-bold text-purple-400">#{ranking.rank}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Percentile</span>
                      <span className="text-sm text-purple-300">Top {ranking.percentile}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Songs with Bids */}
        {mediaWithBids.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl text-center font-bold text-white mb-4">Top Tunes</h2>
            <div className="bg-black/20 rounded-lg p-6">
              <div className="space-y-4">
                {mediaWithBids.map((mediaData, index) => (
                  <div key={mediaData.media?._id || mediaData.media?.uuid || 'unknown'} className="card flex items-center space-x-4 p-4 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center w-12 h-12 bg-purple-600/50 rounded-full">
                        <span className="text-white font-bold text-lg">{index + 1}</span>
                      </div>
                    </div>
                    {/* Album Artwork with Play Icon Overlay */}
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <img
                        src={mediaData.media?.coverArt || '/android-chrome-192x192.png'}
                        alt={`${mediaData.media?.title || 'Unknown Song'} cover`}
                        className="w-full h-full rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => {
                          const mediaId = mediaData.media?._id || mediaData.media?.uuid;
                          if (mediaId) navigate(`/tune/${mediaId}`);
                        }}
                      />
                      {/* Play Icon Overlay - Only visible on hover */}
                      <div 
                        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg cursor-pointer hover:bg-black/60 transition-colors opacity-0 hover:opacity-100 group"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayMedia(mediaData);
                        }}
                      >
                        <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors">
                          <Play className="h-4 w-4 text-white" fill="currentColor" />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 
                          className="text-lg font-semibold text-white cursor-pointer hover:text-purple-300 transition-colors"
                          onClick={() => {
                            const mediaId = mediaData.media?._id || mediaData.media?.uuid;
                            if (mediaId) navigate(`/tune/${mediaId}`);
                          }}
                        >
                          {mediaData.media?.title || 'Unknown Song'}
                        </h3>
                        <span className="text-gray-400">by</span>
                        <span className="text-purple-300">{mediaData.media?.artist || 'Unknown Artist'}</span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-400">
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {formatDuration(mediaData.media?.duration)}
                        </span>
                        <span className="flex items-center">
                          <Activity className="w-4 h-4 mr-1" />
                          {mediaData.bidCount || 0} bid{(mediaData.bidCount || 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {/* Tags Display */}
                      {mediaData.media?.tags && mediaData.media.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {mediaData.media.tags.slice(0, 5).map((tag: string, tagIndex: number) => (
                            <span 
                              key={tagIndex}
                              className="px-2 py-1 bg-purple-600/30 text-purple-200 text-xs rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                          {mediaData.media.tags.length > 5 && (
                            <span className="px-2 py-1 text-gray-400 text-xs">
                              +{mediaData.media.tags.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-400">£{(mediaData.totalAmount || 0).toFixed(2)}</div>
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
          </>
        ) : (
          /* SETTINGS MODE */
          <>
            {/* Tabs Navigation */}
            <div className="border-b border-gray-700 mb-6">
              <nav className="flex space-x-8">
                <button
                  onClick={() => handleSettingsTabChange('profile')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    settingsTab === 'profile'
                      ? 'border-purple-500 text-purple-400'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  Edit Profile
                </button>
                <button
                  onClick={() => handleSettingsTabChange('notifications')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    settingsTab === 'notifications'
                      ? 'border-purple-500 text-purple-400'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  Preferences
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            {settingsTab === 'profile' && (
              <div className="card p-6">
                <h2 className="text-2xl font-bold text-white mb-6">Edit Profile</h2>
                
                {/* Username */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Username</label>
                  <input
                    type="text"
                    value={editForm.username}
                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                    className="input"
                    placeholder="Enter username"
                  />
                </div>

                {/* Name Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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
                </div>

                {/* Cell Phone */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={editForm.cellPhone}
                    onChange={(e) => setEditForm({ ...editForm, cellPhone: e.target.value })}
                    className="input"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                {/* Home Location */}
                <div className="mb-6">
                  <label className="block text-white font-medium mb-3">Home Location</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-white text-sm mb-2">City</label>
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
                      <label className="block text-white text-sm mb-2">Region/State</label>
                      <input
                        type="text"
                        value={editForm.homeLocation.region}
                        onChange={(e) => setEditForm({ 
                          ...editForm, 
                          homeLocation: { ...editForm.homeLocation, region: e.target.value }
                        })}
                        className="input"
                        placeholder="Enter region/state"
                      />
                    </div>
                    <div>
                      <label className="block text-white text-sm mb-2">Country</label>
                      <select
                        value={editForm.homeLocation.country}
                        onChange={(e) => setEditForm({ 
                          ...editForm, 
                          homeLocation: { ...editForm.homeLocation, country: e.target.value }
                        })}
                        className="input"
                      >
                        <option value="">Select Country</option>
                        <option value="United Kingdom">United Kingdom</option>
                        <option value="United States">United States</option>
                        <option value="Canada">Canada</option>
                        <option value="Australia">Australia</option>
                        <option value="Germany">Germany</option>
                        <option value="France">France</option>
                        <option value="Spain">Spain</option>
                        <option value="Italy">Italy</option>
                        <option value="Netherlands">Netherlands</option>
                        <option value="Belgium">Belgium</option>
                        {/* Add more countries as needed */}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Secondary Location */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-white font-medium">Secondary Location</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (editForm.secondaryLocation) {
                          setEditForm({
                            ...editForm,
                            secondaryLocation: null
                          });
                        } else {
                          setEditForm({
                            ...editForm,
                            secondaryLocation: { city: '', region: '', country: '' }
                          });
                        }
                      }}
                      className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      {editForm.secondaryLocation ? 'Remove' : 'Add Secondary Location'}
                    </button>
                  </div>
                  {editForm.secondaryLocation ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-white text-sm mb-2">City</label>
                        <input
                          type="text"
                          value={editForm.secondaryLocation.city}
                          onChange={(e) => setEditForm({ 
                            ...editForm, 
                            secondaryLocation: { ...editForm.secondaryLocation!, city: e.target.value }
                          })}
                          className="input"
                          placeholder="Enter city"
                        />
                      </div>
                      <div>
                        <label className="block text-white text-sm mb-2">Region/State</label>
                        <input
                          type="text"
                          value={editForm.secondaryLocation.region}
                          onChange={(e) => setEditForm({ 
                            ...editForm, 
                            secondaryLocation: { ...editForm.secondaryLocation!, region: e.target.value }
                          })}
                          className="input"
                          placeholder="Enter region/state"
                        />
                      </div>
                      <div>
                        <label className="block text-white text-sm mb-2">Country</label>
                        <select
                          value={editForm.secondaryLocation.country}
                          onChange={(e) => setEditForm({ 
                            ...editForm, 
                            secondaryLocation: { ...editForm.secondaryLocation!, country: e.target.value }
                          })}
                          className="input"
                        >
                          <option value="">Select Country</option>
                          <option value="United Kingdom">United Kingdom</option>
                          <option value="United States">United States</option>
                          <option value="Canada">Canada</option>
                          <option value="Australia">Australia</option>
                          <option value="Germany">Germany</option>
                          <option value="France">France</option>
                          <option value="Spain">Spain</option>
                          <option value="Italy">Italy</option>
                          <option value="Netherlands">Netherlands</option>
                          <option value="Belgium">Belgium</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">No secondary location added</p>
                  )}
                </div>

                {/* Social Media Section */}
                <div className="mb-6">
                  <label className="block text-white font-medium mb-3">Social Media</label>
                  <div className="space-y-3">
                    {getSocialMediaLinks()
                      .filter((social) => social.platform) // Only show platforms that can be edited via modal
                      .map((social) => (
                      <div key={social.name} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <social.icon className="w-5 h-5" />
                          <span className="text-white">{social.name}</span>
                        </div>
                        <button
                          onClick={() => openSocialModal(social.platform!)}
                          className="px-3 py-1 bg-purple-600/40 hover:bg-purple-500 rounded text-sm text-white transition-colors"
                        >
                          {social.url ? 'Edit' : 'Add'}
                        </button>
                      </div>
                    ))}
                    {getUnconnectedSocialAccounts().map((social) => (
                      <div key={social.name} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <social.icon className="w-5 h-5" />
                          <span className="text-gray-400">{social.name}</span>
                        </div>
                        <button
                          onClick={() => openSocialModal(social.platform)}
                          className="px-3 py-1 bg-purple-600/40 hover:bg-purple-500 rounded text-sm text-white transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={exitSettings}
                    className="px-4 py-2 bg-gray-600/40 hover:bg-gray-500 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    className="px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Changes</span>
                  </button>
                </div>
              </div>
            )}

            {settingsTab === 'notifications' && (
              <div className="card p-6">
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                  <Bell className="h-6 w-6" />
                  Preferences
                </h2>
                <p className="text-gray-400 mb-6">Choose which notifications you want to receive</p>

                {/* Notification Types */}
                <div className="space-y-4 mb-8">
                  <h3 className="text-lg font-semibold text-white mb-3">Notification Types</h3>
                  
                  {[
                    { key: 'bid_received', label: 'Bid Received', desc: 'When someone bids on your media' },
                    { key: 'bid_outbid', label: 'Outbid', desc: 'When you are outbid on media' },
                    { key: 'comment_reply', label: 'Comment Replies', desc: 'When someone replies to your comment' },
                    { key: 'tune_bytes_earned', label: 'TuneBytes Earned', desc: 'When you earn TuneBytes' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-start justify-between p-4 bg-black/20 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            id={key}
                            checked={notificationPrefs[key as keyof typeof notificationPrefs]}
                            onChange={(e) => setNotificationPrefs({
                              ...notificationPrefs,
                              [key]: e.target.checked
                            })}
                            className="w-5 h-5 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                          />
                          <label htmlFor={key} className="text-white font-medium cursor-pointer">
                            {label}
                          </label>
                        </div>
                        <p className="text-sm text-gray-400 ml-8 mt-1">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delivery Methods */}
                <div className="space-y-4 mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Delivery Methods</h3>
                  
                  <div className="p-4 bg-black/20 rounded-lg">
                    <div className="flex items-center space-x-3 mb-3">
                      <input
                        type="checkbox"
                        id="inApp"
                        checked={true}
                        disabled
                        className="w-5 h-5 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                      />
                      <label htmlFor="inApp" className="text-white font-medium">
                        In-App Notifications
                      </label>
                      <span className="text-xs text-gray-400">(Always enabled)</span>
                    </div>
                  </div>

                  <div className="p-4 bg-black/20 rounded-lg">
                    <div className="flex items-center space-x-3 mb-2">
                      <input
                        type="checkbox"
                        id="email"
                        checked={notificationPrefs.email}
                        onChange={(e) => setNotificationPrefs({
                          ...notificationPrefs,
                          email: e.target.checked
                        })}
                        className="w-5 h-5 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                      />
                      <label htmlFor="email" className="text-white font-medium">
                        Email Notifications
                      </label>
                    </div>
                    <p className="text-sm text-gray-400 ml-8">Receive notifications via email</p>
                  </div>
                </div>

                {/* Privacy Settings */}
                <div className="space-y-4 mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Privacy</h3>
                  
                  <div className="p-4 bg-black/20 rounded-lg">
                    <div className="flex items-start space-x-3 mb-2">
                      <input
                        type="checkbox"
                        id="anonymousMode"
                        checked={notificationPrefs.anonymousMode}
                        onChange={(e) => setNotificationPrefs({
                          ...notificationPrefs,
                          anonymousMode: e.target.checked
                        })}
                        className="w-5 h-5 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 mt-0.5"
                      />
                      <div className="flex-1">
                        <label htmlFor="anonymousMode" className="text-white font-medium cursor-pointer block">
                          Anonymous Mode
                        </label>
                        <p className="text-sm text-gray-400 mt-1">
                          Hide your name from public profiles while keeping your username and bidding activity visible for platform transparency
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNotificationPrefs}
                    disabled={isSavingPrefs}
                    className="px-6 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingPrefs ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Save Preferences</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Profile Modal */}
      {isEditingProfile && isOwnProfile && (
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 overflow-y-auto" 
          style={{ zIndex: 10000 }}
          onClick={(e) => {
            // Close modal when clicking outside the content area
            if (e.target === e.currentTarget) {
              setIsEditingProfile(false);
            }
          }}
        >
          <div 
            className="card max-w-2xl w-full my-8 max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h2 className="text-2xl font-bold text-white">Edit Profile</h2>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
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

              {/* Home Location */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-3">Home Location</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-white text-sm mb-2">City</label>
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
                    <label className="block text-white text-sm mb-2">Region/State</label>
                    <input
                      type="text"
                      value={editForm.homeLocation.region}
                      onChange={(e) => setEditForm({ 
                        ...editForm, 
                        homeLocation: { ...editForm.homeLocation, region: e.target.value }
                      })}
                      className="input"
                      placeholder="Enter region/state"
                    />
                  </div>
                  <div>
                    <label className="block text-white text-sm mb-2">Country</label>
                    <select
                      value={editForm.homeLocation.country}
                      onChange={(e) => setEditForm({ 
                        ...editForm, 
                        homeLocation: { ...editForm.homeLocation, country: e.target.value }
                      })}
                      className="input"
                    >
                    <option value="">Select Country</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Afghanistan">Afghanistan</option>
                    <option value="Albania">Albania</option>
                    <option value="Algeria">Algeria</option>
                    <option value="Andorra">Andorra</option>
                    <option value="Angola">Angola</option>
                    <option value="Antigua and Barbuda">Antigua and Barbuda</option>
                    <option value="Argentina">Argentina</option>
                    <option value="Armenia">Armenia</option>
                    <option value="Australia">Australia</option>
                    <option value="Austria">Austria</option>
                    <option value="Azerbaijan">Azerbaijan</option>
                    <option value="Bahamas">Bahamas</option>
                    <option value="Bahrain">Bahrain</option>
                    <option value="Bangladesh">Bangladesh</option>
                    <option value="Barbados">Barbados</option>
                    <option value="Belarus">Belarus</option>
                    <option value="Belgium">Belgium</option>
                    <option value="Belize">Belize</option>
                    <option value="Benin">Benin</option>
                    <option value="Bhutan">Bhutan</option>
                    <option value="Bolivia">Bolivia</option>
                    <option value="Bosnia and Herzegovina">Bosnia and Herzegovina</option>
                    <option value="Botswana">Botswana</option>
                    <option value="Brazil">Brazil</option>
                    <option value="Brunei">Brunei</option>
                    <option value="Bulgaria">Bulgaria</option>
                    <option value="Burkina Faso">Burkina Faso</option>
                    <option value="Burundi">Burundi</option>
                    <option value="Cambodia">Cambodia</option>
                    <option value="Cameroon">Cameroon</option>
                    <option value="Canada">Canada</option>
                    <option value="Cape Verde">Cape Verde</option>
                    <option value="Central African Republic">Central African Republic</option>
                    <option value="Chad">Chad</option>
                    <option value="Chile">Chile</option>
                    <option value="China">China</option>
                    <option value="Colombia">Colombia</option>
                    <option value="Comoros">Comoros</option>
                    <option value="Congo">Congo</option>
                    <option value="Costa Rica">Costa Rica</option>
                    <option value="Croatia">Croatia</option>
                    <option value="Cuba">Cuba</option>
                    <option value="Cyprus">Cyprus</option>
                    <option value="Czech Republic">Czech Republic</option>
                    <option value="Democratic Republic of the Congo">Democratic Republic of the Congo</option>
                    <option value="Denmark">Denmark</option>
                    <option value="Djibouti">Djibouti</option>
                    <option value="Dominica">Dominica</option>
                    <option value="Dominican Republic">Dominican Republic</option>
                    <option value="East Timor">East Timor</option>
                    <option value="Ecuador">Ecuador</option>
                    <option value="Egypt">Egypt</option>
                    <option value="El Salvador">El Salvador</option>
                    <option value="England">England</option>
                    <option value="Equatorial Guinea">Equatorial Guinea</option>
                    <option value="Eritrea">Eritrea</option>
                    <option value="Estonia">Estonia</option>
                    <option value="Ethiopia">Ethiopia</option>
                    <option value="Fiji">Fiji</option>
                    <option value="Finland">Finland</option>
                    <option value="France">France</option>
                    <option value="Gabon">Gabon</option>
                    <option value="Gambia">Gambia</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Germany">Germany</option>
                    <option value="Ghana">Ghana</option>
                    <option value="Greece">Greece</option>
                    <option value="Grenada">Grenada</option>
                    <option value="Guatemala">Guatemala</option>
                    <option value="Guinea">Guinea</option>
                    <option value="Guinea-Bissau">Guinea-Bissau</option>
                    <option value="Guyana">Guyana</option>
                    <option value="Haiti">Haiti</option>
                    <option value="Honduras">Honduras</option>
                    <option value="Hungary">Hungary</option>
                    <option value="Iceland">Iceland</option>
                    <option value="India">India</option>
                    <option value="Indonesia">Indonesia</option>
                    <option value="Iran">Iran</option>
                    <option value="Iraq">Iraq</option>
                    <option value="Ireland">Ireland</option>
                    <option value="Israel">Israel</option>
                    <option value="Italy">Italy</option>
                    <option value="Ivory Coast">Ivory Coast</option>
                    <option value="Jamaica">Jamaica</option>
                    <option value="Japan">Japan</option>
                    <option value="Jordan">Jordan</option>
                    <option value="Kazakhstan">Kazakhstan</option>
                    <option value="Kenya">Kenya</option>
                    <option value="Kiribati">Kiribati</option>
                    <option value="Kosovo">Kosovo</option>
                    <option value="Kuwait">Kuwait</option>
                    <option value="Kyrgyzstan">Kyrgyzstan</option>
                    <option value="Laos">Laos</option>
                    <option value="Latvia">Latvia</option>
                    <option value="Lebanon">Lebanon</option>
                    <option value="Lesotho">Lesotho</option>
                    <option value="Liberia">Liberia</option>
                    <option value="Libya">Libya</option>
                    <option value="Liechtenstein">Liechtenstein</option>
                    <option value="Lithuania">Lithuania</option>
                    <option value="Luxembourg">Luxembourg</option>
                    <option value="Macau">Macau</option>
                    <option value="Madagascar">Madagascar</option>
                    <option value="Malawi">Malawi</option>
                    <option value="Malaysia">Malaysia</option>
                    <option value="Maldives">Maldives</option>
                    <option value="Mali">Mali</option>
                    <option value="Malta">Malta</option>
                    <option value="Marshall Islands">Marshall Islands</option>
                    <option value="Mauritania">Mauritania</option>
                    <option value="Mauritius">Mauritius</option>
                    <option value="Mexico">Mexico</option>
                    <option value="Micronesia">Micronesia</option>
                    <option value="Moldova">Moldova</option>
                    <option value="Monaco">Monaco</option>
                    <option value="Mongolia">Mongolia</option>
                    <option value="Montenegro">Montenegro</option>
                    <option value="Morocco">Morocco</option>
                    <option value="Mozambique">Mozambique</option>
                    <option value="Myanmar">Myanmar</option>
                    <option value="Namibia">Namibia</option>
                    <option value="Nauru">Nauru</option>
                    <option value="Nepal">Nepal</option>
                    <option value="Netherlands">Netherlands</option>
                    <option value="New Zealand">New Zealand</option>
                    <option value="Nicaragua">Nicaragua</option>
                    <option value="Niger">Niger</option>
                    <option value="Nigeria">Nigeria</option>
                    <option value="North Korea">North Korea</option>
                    <option value="North Macedonia">North Macedonia</option>
                    <option value="Norway">Norway</option>
                    <option value="Oman">Oman</option>
                    <option value="Pakistan">Pakistan</option>
                    <option value="Palau">Palau</option>
                    <option value="Palestine">Palestine</option>
                    <option value="Panama">Panama</option>
                    <option value="Papua New Guinea">Papua New Guinea</option>
                    <option value="Paraguay">Paraguay</option>
                    <option value="Peru">Peru</option>
                    <option value="Philippines">Philippines</option>
                    <option value="Poland">Poland</option>
                    <option value="Portugal">Portugal</option>
                    <option value="Qatar">Qatar</option>
                    <option value="Republic of the Congo">Republic of the Congo</option>
                    <option value="Romania">Romania</option>
                    <option value="Russia">Russia</option>
                    <option value="Rwanda">Rwanda</option>
                    <option value="Saint Kitts and Nevis">Saint Kitts and Nevis</option>
                    <option value="Saint Lucia">Saint Lucia</option>
                    <option value="Saint Vincent and the Grenadines">Saint Vincent and the Grenadines</option>
                    <option value="Samoa">Samoa</option>
                    <option value="San Marino">San Marino</option>
                    <option value="Sao Tome and Principe">Sao Tome and Principe</option>
                    <option value="Saudi Arabia">Saudi Arabia</option>
                    <option value="Scotland">Scotland</option>
                    <option value="Senegal">Senegal</option>
                    <option value="Serbia">Serbia</option>
                    <option value="Seychelles">Seychelles</option>
                    <option value="Sierra Leone">Sierra Leone</option>
                    <option value="Singapore">Singapore</option>
                    <option value="Slovakia">Slovakia</option>
                    <option value="Slovenia">Slovenia</option>
                    <option value="Solomon Islands">Solomon Islands</option>
                    <option value="Somalia">Somalia</option>
                    <option value="South Africa">South Africa</option>
                    <option value="South Korea">South Korea</option>
                    <option value="South Sudan">South Sudan</option>
                    <option value="Spain">Spain</option>
                    <option value="Sri Lanka">Sri Lanka</option>
                    <option value="Sudan">Sudan</option>
                    <option value="Suriname">Suriname</option>
                    <option value="Swaziland">Swaziland</option>
                    <option value="Sweden">Sweden</option>
                    <option value="Switzerland">Switzerland</option>
                    <option value="Syria">Syria</option>
                    <option value="Taiwan">Taiwan</option>
                    <option value="Tajikistan">Tajikistan</option>
                    <option value="Tanzania">Tanzania</option>
                    <option value="Thailand">Thailand</option>
                    <option value="Togo">Togo</option>
                    <option value="Tonga">Tonga</option>
                    <option value="Trinidad and Tobago">Trinidad and Tobago</option>
                    <option value="Tunisia">Tunisia</option>
                    <option value="Turkey">Turkey</option>
                    <option value="Turkmenistan">Turkmenistan</option>
                    <option value="Tuvalu">Tuvalu</option>
                    <option value="Uganda">Uganda</option>
                    <option value="Ukraine">Ukraine</option>
                    <option value="United Arab Emirates">United Arab Emirates</option>
                    <option value="United States">United States</option>
                    <option value="Uruguay">Uruguay</option>
                    <option value="Uzbekistan">Uzbekistan</option>
                    <option value="Vanuatu">Vanuatu</option>
                    <option value="Vatican City">Vatican City</option>
                    <option value="Venezuela">Venezuela</option>
                    <option value="Vietnam">Vietnam</option>
                    <option value="Wales">Wales</option>
                    <option value="Yemen">Yemen</option>
                    <option value="Zambia">Zambia</option>
                    <option value="Zimbabwe">Zimbabwe</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                </div>
              </div>

              {/* Secondary Location */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-white font-medium">Secondary Location</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (editForm.secondaryLocation) {
                        setEditForm({
                          ...editForm,
                          secondaryLocation: null
                        });
                      } else {
                        setEditForm({
                          ...editForm,
                          secondaryLocation: { city: '', region: '', country: '' }
                        });
                      }
                    }}
                    className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {editForm.secondaryLocation ? 'Remove' : 'Add Secondary Location'}
                  </button>
                </div>
                {editForm.secondaryLocation ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-white text-sm mb-2">City</label>
                      <input
                        type="text"
                        value={editForm.secondaryLocation.city}
                        onChange={(e) => setEditForm({ 
                          ...editForm, 
                          secondaryLocation: { ...editForm.secondaryLocation!, city: e.target.value }
                        })}
                        className="input"
                        placeholder="Enter city"
                      />
                    </div>
                    <div>
                      <label className="block text-white text-sm mb-2">Region/State</label>
                      <input
                        type="text"
                        value={editForm.secondaryLocation.region}
                        onChange={(e) => setEditForm({ 
                          ...editForm, 
                          secondaryLocation: { ...editForm.secondaryLocation!, region: e.target.value }
                        })}
                        className="input"
                        placeholder="Enter region/state"
                      />
                    </div>
                    <div>
                      <label className="block text-white text-sm mb-2">Country</label>
                      <select
                        value={editForm.secondaryLocation.country}
                        onChange={(e) => setEditForm({ 
                          ...editForm, 
                          secondaryLocation: { ...editForm.secondaryLocation!, country: e.target.value }
                        })}
                        className="input"
                      >
                        <option value="">Select Country</option>
                        <option value="United Kingdom">United Kingdom</option>
                        <option value="United States">United States</option>
                        <option value="Canada">Canada</option>
                        <option value="Australia">Australia</option>
                        <option value="Germany">Germany</option>
                        <option value="France">France</option>
                        <option value="Spain">Spain</option>
                        <option value="Italy">Italy</option>
                        <option value="Netherlands">Netherlands</option>
                        <option value="Belgium">Belgium</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">No secondary location added</p>
                )}
              </div>

              {/* Social Media Links */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white border-b border-gray-600 pb-2">
                  Social Media Links
                </h3>
                
                {/* SoundCloud */}
                <div>
                  <label className="block text-white font-medium mb-2 flex items-center">
                    <Music className="h-4 w-4 mr-2 text-orange-400" />
                    SoundCloud
                  </label>
                  <input
                    type="url"
                    value={editForm.socialMedia.soundcloud}
                    onChange={(e) => setEditForm({ 
                      ...editForm, 
                      socialMedia: { ...editForm.socialMedia, soundcloud: e.target.value }
                    })}
                    className="input"
                    placeholder="https://soundcloud.com/yourusername"
                  />
                </div>

                {/* Facebook */}
                <div>
                  <label className="block text-white font-medium mb-2 flex items-center">
                    <Facebook className="h-4 w-4 mr-2 text-blue-400" />
                    Facebook
                  </label>
                  <input
                    type="url"
                    value={editForm.socialMedia.facebook}
                    onChange={(e) => setEditForm({ 
                      ...editForm, 
                      socialMedia: { ...editForm.socialMedia, facebook: e.target.value }
                    })}
                    className="input"
                    placeholder="https://facebook.com/yourusername"
                  />
                </div>

                {/* Instagram */}
                <div>
                  <label className="block text-white font-medium mb-2 flex items-center">
                    <Instagram className="h-4 w-4 mr-2 text-pink-400" />
                    Instagram
                  </label>
                  <input
                    type="url"
                    value={editForm.socialMedia.instagram}
                    onChange={(e) => setEditForm({ 
                      ...editForm, 
                      socialMedia: { ...editForm.socialMedia, instagram: e.target.value }
                    })}
                    className="input"
                    placeholder="https://instagram.com/yourusername"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons - Fixed at bottom */}
            <div className="flex space-x-3 mt-6 pt-4 border-t border-gray-600 flex-shrink-0">
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

      {/* Social Media Modal */}
      {socialModal.platform && (
        <SocialMediaModal
          isOpen={socialModal.isOpen}
          onClose={closeSocialModal}
          platform={socialModal.platform}
          currentUrl={socialModal.currentUrl}
          onSave={handleSaveSocialMedia}
        />
      )}
    </div>
  );
};

export default UserProfile;
