import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { DEFAULT_PROFILE_PIC, DEFAULT_COVER_ART, COUNTRIES } from '../constants';
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
  MapPin,
  ChevronDown,
  ChevronUp,
  Building,
  CheckCircle,
  Flag,
  Users,
  Award,
  AlertTriangle,
  Info,
  Ban,
  AlertCircle
} from 'lucide-react';
import { userAPI, authAPI, creatorAPI } from '../lib/api';
import LabelCreateModal from '../components/LabelCreateModal';
import CollectiveCreateModal from '../components/CollectiveCreateModal';
import ReportModal from '../components/ReportModal';
import BetaWarningBanner from '../components/BetaWarningBanner';
import { useAuth } from '../contexts/AuthContext';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import SocialMediaModal from '../components/SocialMediaModal';
import { penceToPounds } from '../utils/currency';
import ClickableArtistDisplay from '../components/ClickableArtistDisplay';

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
  // Social media fields (now top-level, available to all users)
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    soundcloud?: string;
    spotify?: string;
    youtube?: string;
    twitter?: string;
  };
  creatorProfile?: {
    artistName?: string;
    bio?: string;
    genres?: string[];
    roles?: string[];
    website?: string;
    label?: string;
    management?: string;
    distributor?: string;
    verificationStatus?: string;
    verificationMethod?: string;
    verifiedAt?: string;
    verifiedBy?: string;
  };
}

interface Bid {
  _id: string;
  mediaId: {
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
  const { user: currentUser, handleOAuthCallback } = useAuth();
  
  // Web player store for playing media
  const { setCurrentMedia, setGlobalPlayerActive } = useWebPlayerStore();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [mediaWithBids, setMediaWithBids] = useState<MediaWithBids[]>([]);
  const [tagRankings, setTagRankings] = useState<any[]>([]);
  const [showAllTunes, setShowAllTunes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<any>(null);
  
  // Settings mode - controlled by query params
  const isSettingsMode = searchParams.get('settings') === 'true';
  const settingsTab = (searchParams.get('tab') as 'profile' | 'notifications' | 'creator') || 'profile';
  
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

  const isBetaMode = import.meta.env.VITE_BETA_MODE === 'true' || import.meta.env.VITE_BETA_MODE === true;
  
  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);
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

  // Creator profile edit state
  const [creatorProfileForm, setCreatorProfileForm] = useState({
    artistName: '',
    bio: '',
    genres: [] as string[],
    roles: [] as string[],
    website: '',
    socialMedia: {
      instagram: '',
      facebook: '',
      soundcloud: '',
      youtube: '',
      twitter: ''
    },
    label: '',
    management: '',
    distributor: ''
  });
  const [genreInput, setGenreInput] = useState('');
  const [roleInput, setRoleInput] = useState('');
  const [isSavingCreatorProfile, setIsSavingCreatorProfile] = useState(false);

  // Label creation modal state
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isCollectiveModalOpen, setIsCollectiveModalOpen] = useState(false);

  // Label affiliations state
  const [labelAffiliations, setLabelAffiliations] = useState<any[]>([]);
  
  // Collective memberships state
  const [collectiveMemberships, setCollectiveMemberships] = useState<any[]>([]);

  // Check if viewing own profile
  const isOwnProfile = currentUser && user && (currentUser._id === user._id || currentUser.uuid === user.uuid);

  // Helper functions for loading additional data
  const loadLabelAffiliations = async () => {
    try {
      // Only load if viewing own profile
      const ownProfile = currentUser && user && (currentUser._id === user._id || currentUser.uuid === user.uuid);
      if (ownProfile && currentUser) {
        const response = await userAPI.getLabelAffiliations();
        setLabelAffiliations(response.labelAffiliations || []);
      }
      // If viewing another user's profile, we'd need an endpoint to get their labels
      // For now, we'll skip this - can be added later
    } catch (err: any) {
      console.error('Error loading label affiliations:', err);
      // Silent fail - not critical
    }
  };

  const loadCollectiveMemberships = async () => {
    try {
      // Only load if viewing own profile
      const ownProfile = currentUser && user && (currentUser._id === user._id || currentUser.uuid === user.uuid);
      if (ownProfile && currentUser) {
        const response = await userAPI.getCollectiveMemberships();
        setCollectiveMemberships(response.collectives || []);
      }
      // If viewing another user's profile, we'd need an endpoint to get their collectives
      // For now, we'll skip this - can be added later
    } catch (err: any) {
      console.error('Error loading collective memberships:', err);
      // Silent fail - not critical
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

  // Settings handlers
  const handleSettingsClick = () => {
    setSearchParams({ settings: 'true', tab: 'profile' });
  };

  const handleSettingsTabChange = (tab: 'profile' | 'notifications' | 'creator') => {
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
          soundcloud: user.socialMedia?.soundcloud || '',
          facebook: user.socialMedia?.facebook || '',
          instagram: user.socialMedia?.instagram || ''
        }
      });

      // Populate creator profile form if user has a creator profile
      if ((user as any).creatorProfile) {
        const cp = (user as any).creatorProfile;
        setCreatorProfileForm({
          artistName: cp.artistName || '',
          bio: cp.bio || '',
          genres: cp.genres || [],
          roles: cp.roles || [],
          website: cp.website || '',
          socialMedia: {
            instagram: cp.socialMedia?.instagram || '',
            facebook: cp.socialMedia?.facebook || '',
            soundcloud: cp.socialMedia?.soundcloud || '',
            youtube: cp.socialMedia?.youtube || '',
            twitter: cp.socialMedia?.twitter || ''
          },
          label: cp.label || '',
          management: cp.management || '',
          distributor: cp.distributor || ''
        });
      }
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
  }, [user, isOwnProfile, isBetaMode]);

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


  const fetchUserProfile = useCallback(async () => {
    try {
      setLoading(true);
      const response = await userAPI.getProfile(userId!);
      console.log('📥 Full API response:', response);
      console.log('📥 User data from API:', {
        cellPhone: response.user?.cellPhone,
        givenName: response.user?.givenName,
        familyName: response.user?.familyName,
        preferences: response.user?.preferences,
        anonymousMode: response.user?.preferences?.anonymousMode,
        fullUser: response.user
      });
      setUser(response.user);
      setStats(response.stats);
      setMediaWithBids(response.mediaWithBids);
      // Also load tag rankings, label affiliations, and collective memberships
      loadTagRankings();
      loadLabelAffiliations();
      loadCollectiveMemberships();
      
      // Load warnings if viewing own profile
      const ownProfile = currentUser && response.user && (currentUser._id === response.user._id || currentUser.uuid === response.user.uuid || currentUser.uuid === response.user.id || currentUser._id === response.user.id);
      if (ownProfile) {
        try {
          const warningsData = await userAPI.getWarnings();
          setWarnings(warningsData);
        } catch (err) {
          console.error('Error loading warnings:', err);
        }
      }
    } catch (err: any) {
      console.error('Error fetching user profile:', err);
      setError(err.response?.data?.error || 'Failed to load user profile');
      toast.error('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Handle user profile loading
  useEffect(() => {
    if (userId) {
      // If userId is "profile", redirect to proper profile route
      if (userId === 'profile') {
        if (currentUser && (currentUser._id || currentUser.uuid)) {
          // Redirect to proper user profile route
          navigate(`/user/${currentUser._id || currentUser.uuid}${searchParams.toString() ? '?' + searchParams.toString() : ''}`, { replace: true });
          return;
        } else {
          // No current user, redirect to profile page which will handle auth
          navigate('/profile', { replace: true });
          return;
        }
      } else {
        // Always fetch from API to ensure we have complete profile data including givenName, familyName, cellPhone
        fetchUserProfile();
      }
    }
  }, [userId, currentUser, navigate, searchParams, fetchUserProfile]);

  // Separate useEffect for OAuth callbacks to avoid dependency issues with isOwnProfile
  useEffect(() => {
    // Calculate isOwnProfile inside the effect to avoid dependency loop
    const ownProfile = currentUser && user && (currentUser._id === user._id || currentUser.uuid === user.uuid);
    
    // Handle OAuth token in URL (for account linking redirects)
    const token = searchParams.get('token');
    if (token && ownProfile) {
      // Handle OAuth callback
      handleOAuthCallback(token).then(() => {
        // Refresh user profile to show updated OAuth connections
        fetchUserProfile();
        // Remove token and oauth_success from URL
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('token');
        newParams.delete('oauth_success');
        setSearchParams(newParams, { replace: true });
        toast.success('Account connected successfully!');
      }).catch((error: any) => {
        console.error('Error handling OAuth callback:', error);
        toast.error('Failed to connect account');
        // Remove token from URL even on error
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('token');
        setSearchParams(newParams, { replace: true });
      });
    } else {
      // Check if we're returning from OAuth connection and refresh user data
      const oauthSuccess = searchParams.get('oauth_success');
      if (oauthSuccess === 'true' && ownProfile) {
        // Refresh user profile to show updated OAuth connections
        fetchUserProfile();
        // Remove the oauth_success param from URL
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('oauth_success');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [currentUser, user, searchParams, handleOAuthCallback, fetchUserProfile, setSearchParams]);

  const formatJoinDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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
      artists: Array.isArray(media.artist) ? media.artist : (media.artists || []), // Preserve full artist array with userIds
      featuring: media.featuring || [],
      creatorDisplay: media.creatorDisplay,
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
    if (user?.socialMedia?.facebook) {
      socialLinks.push({
        name: 'Facebook',
        icon: Facebook,
        url: user.socialMedia.facebook,
        platform: 'facebook' as const,
        color: 'hover:bg-blue-600/30 hover:border-blue-500'
      });
    }
    
    // YouTube - manual URL only
    if (user?.socialMedia?.youtube) {
      socialLinks.push({
        name: 'YouTube',
        icon: Youtube,
        url: user.socialMedia.youtube,
        platform: undefined, // YouTube not supported in modal
        color: 'hover:bg-red-600/30 hover:border-red-500'
      });
    }
    
    // SoundCloud - manual URL only
    if (user?.socialMedia?.soundcloud) {
      socialLinks.push({
        name: 'SoundCloud',
        icon: Music2,
        url: user.socialMedia.soundcloud,
        platform: 'soundcloud' as const,
        color: 'hover:bg-orange-600/30 hover:border-orange-500'
      });
    }
    
    // Instagram - manual URL only
    if (user?.socialMedia?.instagram) {
      socialLinks.push({
        name: 'Instagram',
        icon: Instagram,
        url: user.socialMedia.instagram,
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
    if (!user?.socialMedia?.facebook) {
      unconnected.push({
        name: 'Facebook',
        icon: Facebook,
        platform: 'facebook' as const,
        color: 'border-blue-500 text-blue-300 hover:bg-blue-600/20'
      });
    }
    
    // Check if SoundCloud has manual URL
    if (!user?.socialMedia?.soundcloud) {
      unconnected.push({
        name: 'SoundCloud',
        icon: Music2,
        platform: 'soundcloud' as const,
        color: 'border-orange-500 text-orange-300 hover:bg-orange-600/20'
      });
    }
    
    // Check if Instagram has manual URL
    if (!user?.socialMedia?.instagram) {
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
    const currentUrl = user?.socialMedia?.[platform];
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

  // Label creation handlers
  const handleAddLabelClick = () => {
    setIsLabelModalOpen(true);
  };

  const handleLabelCreated = async () => {
    // Refresh user profile to show updated data
    await fetchUserProfile();
    // Modal will close automatically via onClose
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

  // Save creator profile
  const handleSaveCreatorProfile = async () => {
    try {
      setIsSavingCreatorProfile(true);
      await creatorAPI.updateProfile(creatorProfileForm);
      toast.success('Creator profile updated successfully!');
      
      // Refresh user data
      if (userId) {
        await fetchUserProfile();
      }
    } catch (error: any) {
      console.error('Error updating creator profile:', error);
      toast.error(error.response?.data?.error || 'Failed to update creator profile');
    } finally {
      setIsSavingCreatorProfile(false);
    }
  };

  const handleSaveProfileInternal = async () => {
    try {
      // Format the data for the backend - socialMedia is now top-level
      const { socialMedia, homeLocation, secondaryLocation, ...otherFields } = editForm;
      const formattedData = {
        ...otherFields,
        homeLocation: homeLocation,
        secondaryLocation: secondaryLocation && (secondaryLocation.city || secondaryLocation.region || secondaryLocation.country)
          ? secondaryLocation
          : null,
        socialMedia: socialMedia
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
        {/* Beta Warning Banner */}
        {isBetaMode && isOwnProfile && (
          <BetaWarningBanner variant="inline" dismissible={true} className="mb-6" />
        )}

        {/* Warnings Section - Only show if user has warnings and is viewing own profile */}
        {isOwnProfile && warnings && warnings.warnings && warnings.warnings.length > 0 && (
          <div className="mb-6 card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <span>Account Warnings</span>
              </h3>
              <div className="text-sm text-gray-400">
                {warnings.warningCount > 0 && (
                  <span className="text-yellow-400 mr-3">
                    {warnings.warningCount} warning{warnings.warningCount !== 1 ? 's' : ''}
                  </span>
                )}
                {warnings.finalWarningCount > 0 && (
                  <span className="text-red-400">
                    {warnings.finalWarningCount} final warning{warnings.finalWarningCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {warnings.warnings.slice(0, 3).map((warning: any, idx: number) => {
                const getWarningConfig = (type: string) => {
                  switch (type) {
                    case 'info':
                      return { icon: Info, color: 'text-blue-400', bgColor: 'bg-blue-900/30', borderColor: 'border-blue-500' };
                    case 'warning':
                      return { icon: AlertTriangle, color: 'text-yellow-400', bgColor: 'bg-yellow-900/30', borderColor: 'border-yellow-500' };
                    case 'final_warning':
                      return { icon: AlertCircle, color: 'text-red-400', bgColor: 'bg-red-900/30', borderColor: 'border-red-500' };
                    case 'suspension_notice':
                      return { icon: Ban, color: 'text-red-500', bgColor: 'bg-red-900/40', borderColor: 'border-red-600' };
                    default:
                      return { icon: Info, color: 'text-gray-400', bgColor: 'bg-gray-900/30', borderColor: 'border-gray-500' };
                  }
                };
                const config = getWarningConfig(warning.type);
                const Icon = config.icon;
                return (
                  <div key={idx} className={`${config.bgColor} border-2 ${config.borderColor} rounded-lg p-3`}>
                    <div className="flex items-start space-x-3">
                      <Icon className={`h-5 w-5 ${config.color} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-semibold ${config.color}`}>
                            {warning.type === 'info' && 'Information'}
                            {warning.type === 'warning' && 'Warning'}
                            {warning.type === 'final_warning' && 'Final Warning'}
                            {warning.type === 'suspension_notice' && 'Account Suspension'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(warning.issuedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300 mb-1">{warning.message}</p>
                        {warning.reason && (
                          <p className="text-xs text-gray-400">
                            <strong>Reason:</strong> {warning.reason}
                          </p>
                        )}
                        {warning.expiresAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            Expires: {new Date(warning.expiresAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {warnings.warnings.length > 3 && (
                <p className="text-xs text-gray-400 text-center">
                  +{warnings.warnings.length - 3} more warning{warnings.warnings.length - 3 !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        )}

        {/* User Profile Header */}
        <div className="mb-8 relative">
          <button
            onClick={() => navigate(-1)}
            className="px-3 md:px-4 py-2 mb-4 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30 text-sm md:text-base"
          >
            Back
          </button>
          
          {/* Report & Settings Buttons */}
          <div className='inline rounded-full items-center absolute right-0 top-0 md:right-3 mb-4 flex space-x-2'>
            {/* Report Button - Always visible when viewing someone else's profile */}
            {!isOwnProfile && (
              <button
                onClick={() => setShowReportModal(true)}
                className="px-3 md:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
              >
                <Flag className="h-4 w-4" />
                <span className="hidden sm:inline">Report</span>
              </button>
            )}
            
            {/* Settings Button - Only show when viewing own profile and not in settings mode */}
            {isOwnProfile && !isSettingsMode && (
              <button
                onClick={handleSettingsClick}
                className="px-3 md:px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            )}
            
            {/* Exit Settings Button - Only show in settings mode */}
            {isOwnProfile && isSettingsMode && (
              <button
                onClick={exitSettings}
                className="px-3 md:px-4 py-2 bg-gray-600/40 hover:bg-gray-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Exit Settings</span>
              </button>
            )}
          </div>
          
          <div className="card p-4 flex flex-col sm:flex-row items-start relative">
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
            <div className="flex-shrink-0 relative mb-2 md:mb-0 md:mr-4">
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
            <div className="flex-1 text-white">
              <div className="">
                <h1 className="text-4xl font-bold">{user.username}</h1>
                {(user.givenName || user.familyName) && (
                  <p className="text-xl text-gray-300 mb-2">
                    {user.givenName} {user.familyName}
                  </p>
                )}
                {(user.homeLocation?.city || user.homeLocation?.country || user.secondaryLocation?.city || user.secondaryLocation?.country) && (
                  <div className="flex flex-col gap-2 mb-1">
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
              
              <div className="mb-2"></div>

              {/* Become a Creator Button - Only show if user doesn't have 'creator' role */}
              {isOwnProfile && currentUser && 
                !currentUser.role?.includes('creator') && (
                <div className="mb-2">
                  <button
                    onClick={() => navigate('/creator/register')}
                    className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-medium transition-colors border border-purple-400/50"
                  >
                    <Award className="w-4 h-4" />
                    <span>
                      {(user as any).creatorProfile?.verificationStatus === 'pending' 
                        ? 'Creator Application Pending' 
                        : (user as any).creatorProfile?.verificationStatus === 'rejected'
                        ? 'Re-apply as Creator'
                        : 'Become a Creator'}
                    </span>
                  </button>
                </div>
              )}

              {/* Add Label & Collective Buttons - Only for verified creators or admins viewing own profile */}
              {isOwnProfile && currentUser && (currentUser.creatorProfile?.verificationStatus === 'verified' || currentUser.role?.includes('admin')) && (
                <div className="mb-2 flex items-center space-x-2">
                  <button
                    onClick={() => setIsCollectiveModalOpen(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors border border-purple-400/50"
                  >
                    <Users className="w-4 h-4" />
                    <span>Add Collective</span>
                  </button>
                  <button
                    onClick={handleAddLabelClick}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors border border-purple-400/50"
                  >
                    <Building className="w-4 h-4" />
                    <span>Add Label</span>
                  </button>
                </div>
              )}

              {/* Collective Memberships - Above label affiliations */}
              {collectiveMemberships.length > 0 && (
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">Collective Memberships</h3>
                  <div className="flex flex-wrap gap-2">
                    {collectiveMemberships.map((collective) => {
                      if (!collective) return null;
                      const roleColors: Record<string, string> = {
                        founder: 'bg-purple-600/20 text-purple-300 border-purple-500/30',
                        admin: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
                        member: 'bg-green-600/20 text-green-300 border-green-500/30'
                      };
                      const roleColor = roleColors[collective.role] || 'bg-gray-600/20 text-gray-300 border-gray-500/30';
                      
                      return (
                        <a
                          key={collective._id}
                          href={`/collective/${collective.slug}`}
                          className={`flex items-center space-x-2 px-3 py-2 bg-black/20 border rounded-lg transition-all hover:bg-black/30 ${roleColor}`}
                        >
                          <img
                            src={collective.profilePicture || DEFAULT_PROFILE_PIC}
                            alt={collective.name}
                            className="h-6 w-6 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_PROFILE_PIC;
                            }}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{collective.name}</span>
                            <span className="text-xs opacity-75 capitalize">{collective.role}</span>
                          </div>
                          {collective.verificationStatus === 'verified' && (
                            <CheckCircle className="h-3 w-3 text-green-400" />
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Label Affiliations - Above social media */}
              {labelAffiliations.length > 0 && (
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">Label Affiliations</h3>
                  <div className="flex flex-wrap gap-2">
                    {labelAffiliations.map((affiliation) => {
                      if (!affiliation.label) return null;
                      const roleColors: Record<string, string> = {
                        artist: 'bg-purple-600/20 text-purple-300 border-purple-500/30',
                        producer: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
                        manager: 'bg-green-600/20 text-green-300 border-green-500/30',
                        staff: 'bg-gray-600/20 text-gray-300 border-gray-500/30'
                      };
                      const roleColor = roleColors[affiliation.role] || 'bg-gray-600/20 text-gray-300 border-gray-500/30';
                      
                      return (
                        <a
                          key={affiliation.labelId}
                          href={`/label/${affiliation.label.slug}`}
                          className={`flex items-center space-x-2 px-3 py-2 bg-black/20 border rounded-lg transition-all hover:bg-black/30 ${roleColor}`}
                        >
                          <img
                            src={affiliation.label.profilePicture || DEFAULT_PROFILE_PIC}
                            alt={affiliation.label.name}
                            className="h-6 w-6 rounded-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_PROFILE_PIC;
                            }}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{affiliation.label.name}</span>
                            <span className="text-xs opacity-75 capitalize">{affiliation.role}</span>
                          </div>
                          {affiliation.label.verificationStatus === 'verified' && (
                            <CheckCircle className="h-3 w-3 text-green-400" />
                          )}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Social Media Buttons - Hide in anonymous mode (unless own profile) */}
              {!((user as any)?.preferences?.anonymousMode && !isOwnProfile) && getSocialMediaLinks().length > 0 && (
                <div className="mb-2">
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
              
              </div>
              <div className="flex justify-end self-end">
              <span className={`px-3 py-2 bg-purple-600/50 text-xs md:text-base rounded-full font-semibold ${getRoleColor(user.role)}`}>
                  {getRoleDisplay(user.role)}
                </span>
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
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              <div className="card bg-black/20 rounded-lg p-2 md:p-4 text-center">
                <BarChart3 className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <div className="text-lg md:text-2xl font-bold text-white">{stats.totalBids || 0}</div>
                <div className="text-xs md:text-sm text-gray-300">Tips</div>
              </div>
              <div className="card bg-black/20 rounded-lg p-2 md:p-4 text-center">
                <Coins className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <div className="text-lg md:text-2xl font-bold text-white">{penceToPounds(stats.totalAmountBid || 0)}</div>
                <div className="text-xs md:text-sm text-gray-300">Total Tips</div>
              </div>
              <div className="card bg-black/20 rounded-lg p-2 md:p-4 text-center">
                <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <div className="text-lg md:text-2xl font-bold text-white">{penceToPounds(stats.averageBidAmount || 0)}</div>
                <div className="text-xs md:text-sm text-gray-300">Avg Tip</div>
              </div>
              <div className="card bg-black/20 rounded-lg p-2 md:p-4 text-center">
                <Music className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <div className="text-lg md:text-2xl font-bold text-white">{stats.uniqueSongsCount || 0}</div>
                <div className="text-xs md:text-sm text-gray-300">Tunes</div>
              </div>
            </div>
          </div>
        )}

        {/* Songs with Bids */}
        {mediaWithBids.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl text-center font-bold text-white mb-4">Top Tunes</h2>
            <div className="md:bg-black/20 rounded-lg p-0 md:p-6">
              <div className="space-y-4">
                {(showAllTunes ? mediaWithBids : mediaWithBids.slice(0, 10)).map((mediaData, index) => (
                  <div key={mediaData.media?._id || mediaData.media?.uuid || 'unknown'} className="card flex items-center space-x-4 p-2 md:p-4 bg-black/10 rounded-lg hover:bg-black/20 transition-colors">
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 md:w-8 md:h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-base md:text-lg">{index + 1}</span>
                      </div>
                    </div>
                    {/* Album Artwork with Play Icon Overlay */}
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <img
                        src={mediaData.media?.coverArt || DEFAULT_COVER_ART}
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
                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-1 sm:space-y-0">
                        <h3 
                          className="text-base md:text-lg font-semibold text-white cursor-pointer hover:text-purple-300 transition-colors"
                          onClick={() => {
                            const mediaId = mediaData.media?._id || mediaData.media?.uuid;
                            if (mediaId) navigate(`/tune/${mediaId}`);
                          }}
                        >
                          {mediaData.media?.title || 'Unknown Song'}
                        </h3>
                        <div className="flex items-center text-sm text-gray-400">
                          <span className="hidden sm:inline mr-1">by</span>
                          <span className="text-purple-300">
                            {mediaData.media ? (
                              <ClickableArtistDisplay media={mediaData.media} />
                            ) : (
                              'Unknown Artist'
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-400">
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {formatDuration(mediaData.media?.duration)}
                        </span>
                        <span className="flex items-center">
                          <Activity className="w-4 h-4 mr-1" />
                          {mediaData.bidCount || 0} Tip{(mediaData.bidCount || 0) !== 1 ? 's' : ''}
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
                      <div className="text-lg md:text-xl font-bold text-green-400">{penceToPounds(mediaData.totalAmount || 0)}</div>
                      <div className="text-xs md:text-sm text-gray-400">Total Tip</div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Show More/Less Button */}
              {mediaWithBids.length > 10 && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => setShowAllTunes(!showAllTunes)}
                    className="px-6 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <span>{showAllTunes ? 'Show Less' : `Show More (${mediaWithBids.length - 10} more)`}</span>
                    {showAllTunes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Tags */}
        {tagRankings.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-center text-white mb-4">Top Tags</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {tagRankings.slice(0, 6).map((ranking, index) => (
                <div 
                  key={ranking.tag} 
                  className="card bg-gradient-to-br from-purple-900/40 to-pink-900/40 border border-purple-500/30 rounded-lg p-4 md:p-6 hover:border-purple-500/60 transition-all"
                >
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-7 h-7 md:w-8 md:h-8 bg-purple-600/50 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xs md:text-sm">#{index + 1}</span>
                    </div>
                    <span className="text-white font-medium text-base md:text-lg truncate">
                      {ranking.tag}
                    </span>
                  </div>
                  <div className="space-y-1.5 md:space-y-2 text-xs md:text-sm text-gray-300">
                    <div className="flex items-center justify-between">
                      <span>Total Tip</span>
                      <span className="text-sm md:text-base font-semibold text-white">
                        {penceToPounds(ranking.aggregate || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Rank</span>
                      <span className="text-sm md:text-base font-semibold text-purple-300">
                        #{ranking.rank}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Percentile</span>
                      <span className="text-sm md:text-base text-purple-200">
                        Top {ranking.percentile}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Bids Message */}
        {stats && stats.totalBids === 0 && (
          <div className="text-center py-12">
            <Music className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No Tips Yet</h3>
            <p className="text-gray-400">This user hasn't given any tips yet.</p>
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
                {user && (
                  (user as any).role?.includes('creator') ? (
                    <button
                      onClick={() => handleSettingsTabChange('creator')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                        settingsTab === 'creator'
                          ? 'border-purple-500 text-purple-400'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      {(user as any).creatorProfile?.verificationStatus === 'verified' 
                        ? 'Edit Creator Profile'
                        : (user as any).creatorProfile?.verificationStatus === 'pending' 
                        ? 'Creator Application (Pending)' 
                        : (user as any).creatorProfile?.verificationStatus === 'rejected'
                        ? 'Creator Application (Rejected)'
                        : 'Creator Profile'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSettingsTabChange('creator')}
                      className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                        settingsTab === 'creator'
                          ? 'border-purple-500 text-purple-400'
                          : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      Become a Creator
                    </button>
                  )
                )}
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
                        {COUNTRIES.map(country => (
                          <option key={country} value={country}>{country}</option>
                        ))}
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
                          {COUNTRIES.map(country => (
                            <option key={country} value={country}>{country}</option>
                          ))}
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

            {settingsTab === 'creator' && (
              <div className="card p-6">
                {(user as any).creatorProfile?.verificationStatus === 'verified' ? (
                  <>
                    <h2 className="text-2xl font-bold text-white mb-6">Edit Creator Profile</h2>
                    
                    {/* Artist Name */}
                    <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Artist Name *</label>
                  <input
                    type="text"
                    value={creatorProfileForm.artistName}
                    onChange={(e) => setCreatorProfileForm({ ...creatorProfileForm, artistName: e.target.value })}
                    className="input"
                    placeholder="Enter artist name"
                  />
                </div>

                {/* Bio */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Bio</label>
                  <textarea
                    value={creatorProfileForm.bio}
                    onChange={(e) => setCreatorProfileForm({ ...creatorProfileForm, bio: e.target.value })}
                    className="input"
                    placeholder="Tell us about yourself..."
                    rows={4}
                    maxLength={500}
                  />
                  <p className="text-gray-400 text-sm mt-1">{creatorProfileForm.bio.length}/500</p>
                </div>

                {/* Genres */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Genres</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {creatorProfileForm.genres.map((genre, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-purple-600/40 text-white rounded-full text-sm flex items-center space-x-2"
                      >
                        <span>{genre}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newGenres = creatorProfileForm.genres.filter((_, i) => i !== index);
                            setCreatorProfileForm({ ...creatorProfileForm, genres: newGenres });
                          }}
                          className="hover:text-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={genreInput}
                      onChange={(e) => setGenreInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && genreInput.trim()) {
                          e.preventDefault();
                          if (!creatorProfileForm.genres.includes(genreInput.trim())) {
                            setCreatorProfileForm({
                              ...creatorProfileForm,
                              genres: [...creatorProfileForm.genres, genreInput.trim()]
                            });
                            setGenreInput('');
                          }
                        }
                      }}
                      className="input flex-1"
                      placeholder="Type genre and press Enter"
                    />
                  </div>
                  <p className="text-gray-400 text-sm mt-1">Available: Pop, Rock, Hip Hop, R&B, Electronic, Country, Jazz, Classical, Reggae, Metal, Indie, Folk, Blues, Soul, Funk, Punk, Alternative, Dance, Latin, World, Techno, House, Minimal, D&B, Jungle, Trance</p>
                </div>

                {/* Roles */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Roles</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {creatorProfileForm.roles.map((role, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-blue-600/40 text-white rounded-full text-sm flex items-center space-x-2"
                      >
                        <span>{role}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const newRoles = creatorProfileForm.roles.filter((_, i) => i !== index);
                            setCreatorProfileForm({ ...creatorProfileForm, roles: newRoles });
                          }}
                          className="hover:text-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={roleInput}
                      onChange={(e) => setRoleInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && roleInput.trim()) {
                          e.preventDefault();
                          if (!creatorProfileForm.roles.includes(roleInput.trim())) {
                            setCreatorProfileForm({
                              ...creatorProfileForm,
                              roles: [...creatorProfileForm.roles, roleInput.trim()]
                            });
                            setRoleInput('');
                          }
                        }
                      }}
                      className="input flex-1"
                      placeholder="Type role and press Enter"
                    />
                  </div>
                  <p className="text-gray-400 text-sm mt-1">Available: artist, producer, songwriter, composer, DJ, vocalist, instrumentalist</p>
                </div>

                {/* Website */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Website</label>
                  <input
                    type="url"
                    value={creatorProfileForm.website}
                    onChange={(e) => setCreatorProfileForm({ ...creatorProfileForm, website: e.target.value })}
                    className="input"
                    placeholder="https://yourwebsite.com"
                  />
                </div>

                {/* Social Media */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-3">Social Media</label>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-white text-sm mb-1">Instagram</label>
                      <input
                        type="url"
                        value={creatorProfileForm.socialMedia.instagram}
                        onChange={(e) => setCreatorProfileForm({
                          ...creatorProfileForm,
                          socialMedia: { ...creatorProfileForm.socialMedia, instagram: e.target.value }
                        })}
                        className="input"
                        placeholder="https://instagram.com/yourhandle"
                      />
                    </div>
                    <div>
                      <label className="block text-white text-sm mb-1">Facebook</label>
                      <input
                        type="url"
                        value={creatorProfileForm.socialMedia.facebook}
                        onChange={(e) => setCreatorProfileForm({
                          ...creatorProfileForm,
                          socialMedia: { ...creatorProfileForm.socialMedia, facebook: e.target.value }
                        })}
                        className="input"
                        placeholder="https://facebook.com/yourpage"
                      />
                    </div>
                    <div>
                      <label className="block text-white text-sm mb-1">SoundCloud</label>
                      <input
                        type="url"
                        value={creatorProfileForm.socialMedia.soundcloud}
                        onChange={(e) => setCreatorProfileForm({
                          ...creatorProfileForm,
                          socialMedia: { ...creatorProfileForm.socialMedia, soundcloud: e.target.value }
                        })}
                        className="input"
                        placeholder="https://soundcloud.com/yourhandle"
                      />
                    </div>
                    <div>
                      <label className="block text-white text-sm mb-1">YouTube</label>
                      <input
                        type="url"
                        value={creatorProfileForm.socialMedia.youtube}
                        onChange={(e) => setCreatorProfileForm({
                          ...creatorProfileForm,
                          socialMedia: { ...creatorProfileForm.socialMedia, youtube: e.target.value }
                        })}
                        className="input"
                        placeholder="https://youtube.com/@yourchannel"
                      />
                    </div>
                    <div>
                      <label className="block text-white text-sm mb-1">Twitter/X</label>
                      <input
                        type="url"
                        value={creatorProfileForm.socialMedia.twitter}
                        onChange={(e) => setCreatorProfileForm({
                          ...creatorProfileForm,
                          socialMedia: { ...creatorProfileForm.socialMedia, twitter: e.target.value }
                        })}
                        className="input"
                        placeholder="https://twitter.com/yourhandle"
                      />
                    </div>
                  </div>
                </div>

                {/* Label */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Label</label>
                  <input
                    type="text"
                    value={creatorProfileForm.label}
                    onChange={(e) => setCreatorProfileForm({ ...creatorProfileForm, label: e.target.value })}
                    className="input"
                    placeholder="Enter label name"
                  />
                </div>

                {/* Management */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Management</label>
                  <input
                    type="text"
                    value={creatorProfileForm.management}
                    onChange={(e) => setCreatorProfileForm({ ...creatorProfileForm, management: e.target.value })}
                    className="input"
                    placeholder="Enter management company"
                  />
                </div>

                {/* Distributor */}
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">Distributor</label>
                  <input
                    type="text"
                    value={creatorProfileForm.distributor}
                    onChange={(e) => setCreatorProfileForm({ ...creatorProfileForm, distributor: e.target.value })}
                    className="input"
                    placeholder="Enter distributor name"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={exitSettings}
                    className="px-4 py-2 bg-gray-600/40 hover:bg-gray-500 text-white rounded-lg transition-colors"
                    disabled={isSavingCreatorProfile}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCreatorProfile}
                    disabled={isSavingCreatorProfile || !creatorProfileForm.artistName.trim()}
                    className="px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingCreatorProfile ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </>
                ) : (user as any).creatorProfile?.verificationStatus === 'pending' ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-16 w-16 text-purple-400 mx-auto mb-4 animate-spin" />
                    <h2 className="text-2xl font-bold text-white mb-4">Application Pending</h2>
                    <p className="text-gray-400 mb-6 max-w-md mx-auto">
                      Your creator application is currently under review. We'll notify you once it's been processed.
                    </p>
                    <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4 max-w-md mx-auto">
                      <p className="text-sm text-gray-300">
                        <strong>Artist Name:</strong> {(user as any).creatorProfile?.artistName || 'N/A'}
                      </p>
                      {(user as any).creatorProfile?.submittedAt && (
                        <p className="text-sm text-gray-300 mt-2">
                          <strong>Submitted:</strong> {new Date((user as any).creatorProfile.submittedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (user as any).creatorProfile?.verificationStatus === 'rejected' ? (
                  <div className="text-center py-12">
                    <X className="h-16 w-16 text-red-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-4">Application Rejected</h2>
                    <p className="text-gray-400 mb-6 max-w-md mx-auto">
                      {(user as any).creatorProfile?.reviewNotes 
                        ? (user as any).creatorProfile.reviewNotes 
                        : 'Your creator application was not approved. You can re-apply with updated information.'}
                    </p>
                    <button
                      onClick={() => navigate('/creator/register')}
                      className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 mx-auto"
                    >
                      <Award className="w-5 h-5" />
                      <span>Re-apply as Creator</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Award className="h-16 w-16 text-purple-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-4">Become a Creator</h2>
                    <p className="text-gray-400 mb-6 max-w-md mx-auto">
                      Join our community of verified creators and artists. Apply to get verified and start sharing your music on Tuneable.
                    </p>
                    <button
                      onClick={() => navigate('/creator/register')}
                      className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 mx-auto"
                    >
                      <Award className="w-5 h-5" />
                      <span>Apply to Become a Creator</span>
                    </button>
                  </div>
                )}
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
                          Hide your name from public profiles while keeping your username and tipping activity visible for platform transparency
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
                    {COUNTRIES.map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))}
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
                        {COUNTRIES.map(country => (
                          <option key={country} value={country}>{country}</option>
                        ))}
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

      {/* Report Modal */}
      {user && !isOwnProfile && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportType="user"
          targetId={user.uuid || user._id || user.id}
          targetTitle={`@${user.username}`}
        />
      )}

      {/* Create Label Modal */}
      <LabelCreateModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        onSuccess={handleLabelCreated}
      />
      
      {/* Create Collective Modal */}
      <CollectiveCreateModal
        isOpen={isCollectiveModalOpen}
        onClose={() => setIsCollectiveModalOpen(false)}
        onSuccess={handleLabelCreated} // Reuse same handler for now
      />
    </div>
  );
};

export default UserProfile;
