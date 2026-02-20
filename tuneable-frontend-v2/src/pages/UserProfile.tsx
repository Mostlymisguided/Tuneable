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
  Facebook,
  Youtube,
  Instagram,
  Play,
  Music2,
  Settings,
  Bell,
  MapPin,
  CheckCircle,
  Flag,
  Award,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Minus
} from 'lucide-react';
import { userAPI, authAPI, creatorAPI, mediaAPI, searchAPI } from '../lib/api';
import LabelLinkModal from '../components/LabelLinkModal';
import CollectiveLinkModal from '../components/CollectiveLinkModal';
import ReportModal from '../components/ReportModal';
import QuotaWarningBanner from '../components/QuotaWarningBanner';
import TagInputModal from '../components/TagInputModal';
import { useAuth } from '../contexts/AuthContext';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { usePodcastPlayerStore } from '../stores/podcastPlayerStore';
import SocialMediaModal from '../components/SocialMediaModal';
import { penceToPounds, poundsToPence } from '../utils/currency';
import ClickableArtistDisplay from '../components/ClickableArtistDisplay';

interface LibraryItem {
  mediaId: string;
  mediaUuid: string;
  title: string;
  artist: string;
  coverArt?: string;
  duration?: number;
  bpm?: number;
  globalMediaAggregate: number;
  globalMediaAggregateAvg: number;
  globalUserMediaAggregate: number;
  bidCount: number;
  tuneBytesEarned: number;
  lastBidAt: string;
}

interface UserProfile {
  id: string; // UUID as primary ID
  _id?: string; // ObjectId
  uuid: string;
  username: string;
  profilePic?: string;
  email: string;
  balance: number;
  personalInviteCode?: string;
  personalInviteCodes?: Array<{
    _id: string;
    code: string;
    label?: string;
    isActive: boolean;
    createdAt: string;
    usageCount: number;
  }>;
  primaryInviteCode?: string;
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
  const { user: currentUser, token: authToken, handleOAuthCallback } = useAuth();
  
  // Web player store for playing media
  const { setCurrentMedia, setQueue, setGlobalPlayerActive } = useWebPlayerStore();
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [, setMediaWithBids] = useState<MediaWithBids[]>([]);
  const [, setTagRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tip history state
  const [tipHistory, setTipHistory] = useState<any[]>([]);
  const [isLoadingTipHistory, setIsLoadingTipHistory] = useState(false);
  const [tipHistoryFilters, setTipHistoryFilters] = useState({
    status: '' as 'active' | 'vetoed' | 'refunded' | '',
    bidScope: '' as 'party' | 'global' | '',
    page: 1,
    limit: 50
  });
  const [tipHistoryPagination, setTipHistoryPagination] = useState<any>(null);
  
  // Wallet history state
  const [walletHistory, setWalletHistory] = useState<any[]>([]);
  const [walletHistoryStats, setWalletHistoryStats] = useState<any>(null);
  const [isLoadingWalletHistory, setIsLoadingWalletHistory] = useState(false);
  const [walletHistoryFilters, setWalletHistoryFilters] = useState({
    type: '' as 'topup' | 'refund' | 'adjustment' | 'beta_credit' | 'gift' | '',
    status: '' as 'pending' | 'completed' | 'failed' | 'refunded' | '',
    paymentMethod: '' as 'stripe' | 'manual' | 'beta' | 'gift' | '',
    page: 1,
    limit: 50
  });
  const [walletHistoryPagination, setWalletHistoryPagination] = useState<any>(null);
  
  // Tune Library state
  const [tuneLibrary, setTuneLibrary] = useState<LibraryItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [librarySortField, setLibrarySortField] = useState<string>('lastBidAt');
  const [librarySortDirection, setLibrarySortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Add Tune search state
  const [addTuneSearchQuery, setAddTuneSearchQuery] = useState('');
  const [addTuneResults, setAddTuneResults] = useState<{
    database: any[];
    youtube: any[];
  }>({ database: [], youtube: [] });
  const [isSearchingTune, setIsSearchingTune] = useState(false);
  const [addTuneBidAmounts, setAddTuneBidAmounts] = useState<Record<string, string>>({});
  const [showAddTuneTagModal, setShowAddTuneTagModal] = useState(false);
  const [pendingAddTuneResult, setPendingAddTuneResult] = useState<any>(null);
  const [isAddingTune, setIsAddingTune] = useState(false);
  const [showAddTunePanel, setShowAddTunePanel] = useState(false);
  
  // Settings mode - controlled by query params
  const isSettingsMode = searchParams.get('settings') === 'true';
  const settingsTab = (searchParams.get('tab') as 'profile' | 'notifications' | 'creator') || 'profile';
  
  // View mode tabs - controlled by query params
  const viewTab = (searchParams.get('view') as 'tip-history' | 'wallet-history' | 'tune-library') || 'tune-library';
  
  // Edit profile state (kept for potential revert)
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Username validation state
  const [usernameError, setUsernameError] = useState<string | null>(null);
  
  // Notification preferences state
  const [notificationPrefs, setNotificationPrefs] = useState({
    bid_received: true,
    bid_outbid: true,
    comment_reply: true,
    tune_bytes_earned: true,
    email: true,
    anonymousMode: false,
    inApp: true, // Always true
    defaultTip: 0.11 // Default tip amount in pounds
  });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

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

  const loadTipHistory = async () => {
    if (!isOwnProfile) return;
    
    try {
      setIsLoadingTipHistory(true);
      const params: any = {
        page: tipHistoryFilters.page,
        limit: tipHistoryFilters.limit,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      };
      
      if (tipHistoryFilters.status) {
        params.status = tipHistoryFilters.status;
      }
      
      if (tipHistoryFilters.bidScope) {
        params.bidScope = tipHistoryFilters.bidScope;
      }
      
      const response = await userAPI.getTipHistory(params);
      setTipHistory(response.tips || []);
      setTipHistoryPagination(response.pagination || null);
    } catch (err: any) {
      console.error('Error loading tip history:', err);
      toast.error('Failed to load tip history');
    } finally {
      setIsLoadingTipHistory(false);
    }
  };

  // Settings handlers
  const handleSettingsClick = () => {
    setSearchParams({ settings: 'true', tab: 'profile' });
  };

  const handleSettingsTabChange = (tab: 'profile' | 'notifications' | 'creator') => {
    setSearchParams({ settings: 'true', tab });
  };

  const handleViewTabChange = (tab: 'tip-history' | 'wallet-history' | 'tune-library') => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('view', tab);
      // Remove settings params when switching view tabs
      newParams.delete('settings');
      newParams.delete('tab');
      return newParams;
    });
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
          inApp: true, // Always true
          defaultTip: prefs.defaultTip ?? 0.11
        });
      }
      
    }
  }, [user, isOwnProfile]);

  // Clear search results when query is cleared
  useEffect(() => {
    if (!addTuneSearchQuery.trim()) {
      setAddTuneResults({ database: [], youtube: [] });
      setAddTuneBidAmounts({});
    }
  }, [addTuneSearchQuery]);

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

  // Load tip history when viewing tip history tab
  useEffect(() => {
    if (viewTab === 'tip-history' && isOwnProfile && !isSettingsMode) {
      loadTipHistory();
    }
  }, [viewTab, isOwnProfile, isSettingsMode, tipHistoryFilters]);

  const loadWalletHistory = async () => {
    if (!isOwnProfile) return;
    
    try {
      setIsLoadingWalletHistory(true);
      const params: any = {
        page: walletHistoryFilters.page,
        limit: walletHistoryFilters.limit,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      };
      
      if (walletHistoryFilters.type) {
        params.type = walletHistoryFilters.type;
      }
      
      if (walletHistoryFilters.status) {
        params.status = walletHistoryFilters.status;
      }
      
      if (walletHistoryFilters.paymentMethod) {
        params.paymentMethod = walletHistoryFilters.paymentMethod;
      }
      
      const response = await userAPI.getWalletHistory(params);
      setWalletHistory(response.transactions || []);
      setWalletHistoryStats(response.stats || null);
      setWalletHistoryPagination(response.pagination || null);
    } catch (err: any) {
      console.error('Error loading wallet history:', err);
      toast.error('Failed to load wallet history');
    } finally {
      setIsLoadingWalletHistory(false);
    }
  };

  // Load wallet history when viewing wallet history tab
  useEffect(() => {
    if (viewTab === 'wallet-history' && isOwnProfile && !isSettingsMode) {
      loadWalletHistory();
    }
  }, [viewTab, isOwnProfile, isSettingsMode, walletHistoryFilters]);

  // Load tune library when viewing tune library tab
  useEffect(() => {
    if (viewTab === 'tune-library' && isOwnProfile && !isSettingsMode) {
      loadTuneLibrary();
    }
  }, [viewTab, isOwnProfile, isSettingsMode]);

  const formatJoinDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper functions for add tune feature
  const isYouTubeUrl = (query: string) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return youtubeRegex.test(query);
  };

  const getEffectiveMinimumBid = (media?: any): number => {
    return media?.minimumBid ?? 0.01;
  };

  const getDefaultBidAmount = (media?: any): number => {
    const minBid = getEffectiveMinimumBid(media);
    const userDefaultTip = currentUser?.preferences?.defaultTip || 0.11;
    return Math.max(minBid, userDefaultTip);
  };

  const calculateAverageBid = (media: any): number => {
    if (!media || !media.globalMediaAggregateAvg) return 0;
    return media.globalMediaAggregateAvg / 100; // Convert from pence to pounds
  };

  // Add tune search handler
  const handleAddTuneSearch = async () => {
    if (!addTuneSearchQuery.trim()) return;
    
    if (!currentUser) {
      toast.info('Please sign up to search for tunes');
      navigate('/register');
      return;
    }

    setIsSearchingTune(true);
    try {
      let response;
      
      // Check if it's a YouTube URL
      if (isYouTubeUrl(addTuneSearchQuery)) {
        response = await searchAPI.searchByYouTubeUrl(addTuneSearchQuery);
        
        let databaseResults = [];
        let youtubeResults = [];
        
        if (response.source === 'local' && response.videos) {
          databaseResults = response.videos;
        } else if (response.source === 'external' && response.videos) {
          youtubeResults = response.videos;
        }
        
        setAddTuneResults({
          database: databaseResults,
          youtube: youtubeResults
        });
        
        // Initialize bid amounts
        const newBidAmounts: Record<string, string> = {};
        [...databaseResults, ...youtubeResults].forEach(media => {
          const avgBid = calculateAverageBid(media);
          newBidAmounts[media._id || media.id] = Math.max(getDefaultBidAmount(media), avgBid || 0).toFixed(2);
        });
        setAddTuneBidAmounts(newBidAmounts);
      } else {
        // Regular search
        response = await searchAPI.search(addTuneSearchQuery, 'youtube');
        
        let databaseResults = [];
        let youtubeResults = [];
        
        if (response.source === 'local' && response.videos) {
          databaseResults = response.videos;
        } else if (response.source === 'external' && response.videos) {
          youtubeResults = response.videos;
        }
        
        // If we got local results but want to show YouTube too, fetch YouTube
        if (databaseResults.length > 0 && response.hasMoreExternal) {
          const youtubeResponse = await searchAPI.search(addTuneSearchQuery, 'youtube', undefined, undefined, true);
          if (youtubeResponse.videos) {
            youtubeResults = youtubeResponse.videos;
          }
        }
        
        setAddTuneResults({ database: databaseResults, youtube: youtubeResults });
        
        // Initialize bid amounts
        const newBidAmounts: Record<string, string> = {};
        [...databaseResults, ...youtubeResults].forEach(media => {
          const avgBid = calculateAverageBid(media);
          newBidAmounts[media._id || media.id] = Math.max(getDefaultBidAmount(media), avgBid || 0).toFixed(2);
        });
        setAddTuneBidAmounts(newBidAmounts);
      }
    } catch (error: any) {
      console.error('Search error:', error);
      if (error?.response?.status === 429) {
        toast.error('YouTube search is temporarily disabled due to quota limits');
      } else {
        toast.error(error.response?.data?.error || 'Search failed');
      }
    } finally {
      setIsSearchingTune(false);
    }
  };

  // Add tune handler
  const handleAddTune = async (media: any, tags: string[] = []) => {
    if (!currentUser) {
      toast.info('Please log in to add tunes');
      return;
    }
    if (!authToken && !localStorage.getItem('token')) {
      toast.error('Your session has expired. Please log in again.');
      navigate('/login?returnUrl=' + encodeURIComponent(window.location.pathname));
      return;
    }

    const mediaKey = media._id || media.id || '';
    const rawAmount = addTuneBidAmounts[mediaKey] ?? '';
    const parsedAmount = parseFloat(rawAmount);
    const bidAmount = Number.isFinite(parsedAmount) ? parsedAmount : getDefaultBidAmount(media);
    const minBid = getEffectiveMinimumBid(media);

    if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
      toast.error(`Minimum tip is £${minBid.toFixed(2)}`);
      return;
    }

    // Check balance (balance is in pence, bidAmount is in pounds)
    if ((currentUser as any)?.balance < poundsToPence(bidAmount)) {
      toast.error('Insufficient balance');
      return;
    }

    const isExistingMedia = Boolean(media._id);
    const targetMediaId = isExistingMedia ? (media._id || media.id || '') : 'external';

    if (!targetMediaId) {
      toast.error('Invalid media ID');
      return;
    }

    // Prepare external sources
    const externalSources = !isExistingMedia
      ? (media.sources && Object.keys(media.sources).length > 0
          ? media.sources
          : media.url
            ? { youtube: media.url }
            : media.id
              ? { youtube: `https://www.youtube.com/watch?v=${media.id}` }
              : {})
      : {};

    if (!isExistingMedia && Object.keys(externalSources).length === 0) {
      toast.error('Unable to add this tune because no source URL was provided.');
      return;
    }

    setIsAddingTune(true);

    try {
      // Prepare external media data if needed (only for new media)
      // For existing media, externalMedia should be undefined
      const externalMedia = !isExistingMedia
        ? {
            title: media.title || '',
            artist: media.artist || '',
            coverArt: media.coverArt,
            duration: media.duration,
            category: media.category || 'Music',
            ...(tags.length > 0 && { tags }),
            sources: externalSources
          }
        : undefined;

      await mediaAPI.placeGlobalBid(targetMediaId, bidAmount, externalMedia);
      toast.success(`Added "${media.title}" to your library with £${bidAmount.toFixed(2)} tip!`);
      
      // Clear search
      setAddTuneSearchQuery('');
      setAddTuneResults({ database: [], youtube: [] });
      setAddTuneBidAmounts({});
      
      // Reload library and top tunes to show new tune
      if (isOwnProfile) {
        await loadTuneLibrary();
        // Reload profile data to refresh top tunes
        const profileData = await userAPI.getProfile(userId || '');
        if (profileData.user) {
          setUser(profileData.user);
          setMediaWithBids(profileData.mediaWithBids || []);
        }
      }
      
      setPendingAddTuneResult(null);
      setShowAddTuneTagModal(false);
    } catch (error: any) {
      console.error('Error adding tune:', error);
      const msg = error.response?.data?.error;
      if (error.response?.status === 401 && (msg?.includes('token') || msg?.includes('No token'))) {
        toast.error('Your session has expired. Please log in again.');
        navigate('/login?returnUrl=' + encodeURIComponent(window.location.pathname));
      } else {
        toast.error(msg || 'Failed to add tune');
      }
    } finally {
      setIsAddingTune(false);
    }
  };

  const startAddTune = async (media: any) => {
    setPendingAddTuneResult(media);
    setShowAddTuneTagModal(true);
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

  // Load tune library
  const loadTuneLibrary = async () => {
    try {
      setIsLoadingLibrary(true);
      const data = await userAPI.getTuneLibrary();
      setTuneLibrary(data.library || []);
    } catch (error) {
      console.error('Failed to load tune library:', error);
      toast.error('Failed to load tune library');
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  // Handle playing media from Tune Library with auto-transition
  const handlePlayLibrary = async (item: LibraryItem, index: number) => {
    try {
      // Use sorted library to maintain the order the user sees
      const sortedLibrary = getSortedLibrary();
      
      // Fetch all media details for the entire library to create the queue
      const allMediaPromises = sortedLibrary.map(async (libItem) => {
        const mediaId = libItem.mediaUuid || libItem.mediaId;
        const mediaData = await mediaAPI.getProfile(mediaId);
        const media = mediaData.media || mediaData;
        
        // Format sources
        let sources: any = {};
        if (media.sources) {
          if (Array.isArray(media.sources)) {
            for (const source of media.sources) {
              if (source?.platform === 'youtube' && source?.url) {
                sources.youtube = source.url;
              }
            }
          } else if (typeof media.sources === 'object') {
            sources = media.sources;
          }
        }
        
        return {
          id: libItem.mediaUuid || libItem.mediaId,
          _id: libItem.mediaId,
          title: libItem.title,
          artist: libItem.artist,
          duration: libItem.duration,
          coverArt: libItem.coverArt,
          sources: sources,
          globalMediaAggregate: libItem.globalMediaAggregate,
          bids: [],
          addedBy: null,
          totalBidValue: libItem.globalMediaAggregate
        } as any;
      });
      
      const allFormattedMedia = await Promise.all(allMediaPromises);
      
      // Clear podcast player so PlayerRenderer switches to web player
      usePodcastPlayerStore.getState().clear();
      // Set entire library as queue for auto-transition
      setQueue(allFormattedMedia);
      // Set current media to the clicked item (with its index)
      setCurrentMedia(allFormattedMedia[index], index);
      setGlobalPlayerActive(true);
      toast.success(`Now playing: ${item.title}`);
    } catch (error) {
      console.error('Error loading media for playback:', error);
      toast.error('Failed to load media for playback');
    }
  };

  // Sort library items
  const getSortedLibrary = () => {
    return [...tuneLibrary].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (librarySortField) {
        case 'title':
          aValue = a.title?.toLowerCase() || '';
          bValue = b.title?.toLowerCase() || '';
          break;
        case 'artist':
          aValue = a.artist?.toLowerCase() || '';
          bValue = b.artist?.toLowerCase() || '';
          break;
        case 'duration':
          aValue = a.duration || 0;
          bValue = b.duration || 0;
          break;
        case 'globalMediaAggregateAvg':
          aValue = a.globalMediaAggregateAvg || 0;
          bValue = b.globalMediaAggregateAvg || 0;
          break;
        case 'globalUserMediaAggregate':
          aValue = a.globalUserMediaAggregate || 0;
          bValue = b.globalUserMediaAggregate || 0;
          break;
        case 'tuneBytesEarned':
          aValue = a.tuneBytesEarned || 0;
          bValue = b.tuneBytesEarned || 0;
          break;
        case 'lastBidAt':
        default:
          aValue = new Date(a.lastBidAt).getTime();
          bValue = new Date(b.lastBidAt).getTime();
          break;
      }

      if (aValue < bValue) return librarySortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return librarySortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const getLibrarySortIcon = (field: string) => {
    if (librarySortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-gray-400" />;
    }
    return librarySortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-purple-400" />
      : <ArrowDown className="h-4 w-4 ml-1 text-purple-400" />;
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

  const handleCollectiveLinked = async () => {
    // Refresh collective memberships after linking
    await loadCollectiveMemberships();
  };

  const handleLabelLinked = async () => {
    // Refresh label affiliations after linking
    await loadLabelAffiliations();
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

  // Validate username format
  const validateUsername = (username: string): string | null => {
    const trimmed = username.trim();
    
    if (!trimmed) {
      return 'Username cannot be empty';
    }
    
    if (trimmed.length < 3) {
      return 'Username must be at least 3 characters';
    }
    
    if (trimmed.length > 20) {
      return 'Username must be no more than 20 characters';
    }
    
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(trimmed)) {
      return 'Username can only contain letters, numbers, underscores, and hyphens';
    }
    
    return null; // Valid
  };

  const handleSaveProfileInternal = async () => {
    try {
      // Validate username before submitting
      if (editForm.username && editForm.username !== user?.username) {
        const usernameValidationError = validateUsername(editForm.username);
        if (usernameValidationError) {
          setUsernameError(usernameValidationError);
          toast.error(usernameValidationError);
          return;
        }
        setUsernameError(null);
      }
      
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
      setUsernameError(null); // Clear any errors on success
      // Only update modal state if NOT in settings mode
      if (!isSettingsMode) {
      setIsEditingProfile(false);
      }
      // Refresh user data
      await fetchUserProfile();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      const errorMessage = err.response?.data?.error || 'Failed to update profile';
      
      // Set username-specific error if field is specified
      if (err.response?.data?.field === 'username') {
        setUsernameError(errorMessage);
      }
      
      toast.error(errorMessage);
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
            <div className='absolute top-0 right-0 flex flex-col items-end gap-2'>

              {/* Member Since */}
              <div className="flex rounded-full p-4 items-center">
                <span className="px-3 py-2 bg-purple-600/50 text-white text-xs md:text-base rounded-full font-semibold">
                  {formatJoinDate(user.createdAt)}
                </span>
              </div>

              {/* Role (Admin/Moderator/Creator/User) */}
              <div className="flex rounded-full p-4 pt-0 items-center">
                <span className={`px-3 py-2 bg-purple-600/50 text-xs md:text-base rounded-full font-semibold ${getRoleColor(user.role)}`}>
                  {getRoleDisplay(user.role)}
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
                <h1 className="text-4xl font-bold mb-2">{user.username}</h1>
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

              {/* User metrics - Tips, Total Tips, Avg Tip, Tunes */}
              {stats && (
                <div className="mb-4">
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-2 md:gap-3 lg:grid-cols-4 w-fit max-w-full">
                    <div className="card bg-black/20 rounded-lg p-2 md:p-2.5 text-center">
                      <BarChart3 className="w-6 h-6 md:w-5 md:h-5 text-purple-400 mx-auto mb-1 md:mb-1.5" />
                      <div className="text-lg md:text-base font-bold text-white">{stats.totalBids || 0}</div>
                      <div className="text-xs text-gray-300">Tips</div>
                    </div>
                    <div className="card bg-black/20 rounded-lg p-2 md:p-2.5 text-center">
                      <Coins className="w-6 h-6 md:w-5 md:h-5 text-green-400 mx-auto mb-1 md:mb-1.5" />
                      <div className="text-lg md:text-base font-bold text-white">{penceToPounds(stats.totalAmountBid || 0)}</div>
                      <div className="text-xs text-gray-300">Total Tips</div>
                    </div>
                    <div className="card bg-black/20 rounded-lg p-2 md:p-2.5 text-center">
                      <TrendingUp className="w-6 h-6 md:w-5 md:h-5 text-blue-400 mx-auto mb-1 md:mb-1.5" />
                      <div className="text-lg md:text-base font-bold text-white">{penceToPounds(stats.averageBidAmount || 0)}</div>
                      <div className="text-xs text-gray-300">Avg Tip</div>
                    </div>
                    <div className="card bg-black/20 rounded-lg p-2 md:p-2.5 text-center">
                      <Music className="w-6 h-6 md:w-5 md:h-5 text-yellow-400 mx-auto mb-1 md:mb-1.5" />
                      <div className="text-lg md:text-base font-bold text-white">{stats.uniqueSongsCount || 0}</div>
                      <div className="text-xs text-gray-300">Tunes</div>
                    </div>
                  </div>
                </div>
              )}
              
              </div>
          </div>
        </div>

        {/* Conditional Rendering: Settings Mode vs Normal Mode */}
        {!isSettingsMode ? (
          <>
        {/* View Mode Tabs - Only show for own profile */}
        {isOwnProfile && (
          <div className="border-b border-gray-700 mb-6">
            <nav className="flex space-x-8">
              <button
                onClick={() => handleViewTabChange('tune-library')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  viewTab === 'tune-library'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Tune Library
              </button>
              <button
                onClick={() => handleViewTabChange('tip-history')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  viewTab === 'tip-history'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Tip History
              </button>
              <button
                onClick={() => handleViewTabChange('wallet-history')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  viewTab === 'wallet-history'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Top Up History
              </button>
            </nav>
          </div>
        )}

        {/* Tab Content */}
        {viewTab === 'tune-library' || !isOwnProfile ? (
          /* TUNE LIBRARY TAB */
          <div className="space-y-6">
        {/* Add Tune Search Section - Only show for own profile */}
        {isOwnProfile && (
          <div className="mb-8">
            <div className="justify-center text-center rounded-lg p-3 sm:p-4 shadow-xl">
              {!showAddTunePanel ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowAddTunePanel(true)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors text-sm sm:text-base flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4 text-purple-400" />
                    Add Tune
                  </button>
                </div>
              ) : (
                <>
                  {/* Quota Warning Banner */}
                  <QuotaWarningBanner className="mb-4" />
                    
                  {/* Search Input */}
                  <div className="flex flex-col sm:flex-row justify-center gap-2 mb-4">
                    <input
                      type="text"
                      value={addTuneSearchQuery}
                      onChange={(e) => setAddTuneSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTuneSearch();
                        }
                      }}
                      placeholder="Paste a YouTube URL or Search for Tunes in our Library..."
                      className="flex-1 bg-gray-900 hover:shadow-2xl rounded-xl p-2 sm:p-3 text-slate placeholder-gray-400 focus:outline-none focus:border-purple-500 text-sm sm:text-base"
                    />
                  </div>
                  <div className="flex justify-center">
                    <button
                      onClick={handleAddTuneSearch}
                      disabled={isSearchingTune || !addTuneSearchQuery.trim()}
                      className="flex py-2 px-4 bg-purple-800 hover:bg-purple-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
                    >
                      {isSearchingTune ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        'Search'
                      )}
                    </button>
                  </div>
                </>
              )}

              {/* Database Results - only when panel is expanded */}
              {showAddTunePanel && addTuneResults.database.length > 0 && (
                <div className="mb-4 mt-4">
                  <div className="flex items-center mb-2">
                    <Music className="h-4 w-4 text-green-400 mr-2" />
                    <h4 className="text-sm font-semibold text-green-300">From Tuneable Library ({addTuneResults.database.length})</h4>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {addTuneResults.database.map((mediaItem: any) => {
                      const media = {
                        ...mediaItem,
                        artists: Array.isArray(mediaItem.artists) ? mediaItem.artists : 
                                (Array.isArray(mediaItem.artist) ? mediaItem.artist : []),
                        artist: mediaItem.artist,
                        featuring: mediaItem.featuring || [],
                        creatorDisplay: mediaItem.creatorDisplay
                      };
                      return (
                        <div key={media._id || media.id} className="bg-gray-900 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <img
                              src={media.coverArt || DEFAULT_COVER_ART}
                              alt={media.title}
                              className="h-12 w-12 md:h-12 md:w-12 rounded object-cover flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p 
                                className="text-white font-medium truncate cursor-pointer hover:text-purple-300 transition-colors text-sm md:text-base"
                                onClick={() => navigate(`/tune/${media._id || media.id}`)}
                                title="View tune profile"
                              >
                                {media.title}
                              </p>
                              <p className="text-gray-400 text-xs md:text-sm truncate">
                                <ClickableArtistDisplay media={media} />
                              </p>
                              {media.duration && (
                                <div className="flex justify-center items-center space-x-1 mt-1">
                                  <Clock className="h-3 w-3 text-gray-500" />
                                  <span className="text-gray-500 text-xs">{formatDuration(media.duration)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-center space-x-0 md:flex-shrink-0">
                            <div className="flex items-center space-x-0 mr-4">
                              <button
                                type="button"
                                onClick={() => {
                                  const mediaId = media._id || media.id;
                                  const avgBid = calculateAverageBid(media);
                                  const minBid = getEffectiveMinimumBid(media);
                                  const defaultBid = Math.max(getDefaultBidAmount(media), avgBid || 0);
                                  const current = parseFloat(addTuneBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                  const newAmount = Math.max(minBid, current - 0.01);
                                  setAddTuneBidAmounts(prev => ({
                                    ...prev,
                                    [mediaId]: newAmount.toFixed(2)
                                  }));
                                }}
                                className="px-1.5 py-2 bg-white hover:bg-gray-900 hover:text-white rounded-tl-xl rounded-bl-xl text-black transition-colors flex items-center justify-center"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                step="0.01"
                                min={getEffectiveMinimumBid(media)}
                                value={addTuneBidAmounts[media._id || media.id] ?? (() => {
                                  const avgBid = calculateAverageBid(media);
                                  return Math.max(getDefaultBidAmount(media), avgBid || 0).toFixed(2);
                                })()}
                                onChange={(e) => setAddTuneBidAmounts(prev => ({
                                  ...prev,
                                  [media._id || media.id]: e.target.value
                                }))}
                                className="w-14 md:w-14 bg-gray-800 rounded px-2 py-1 text-gray text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const mediaId = media._id || media.id;
                                  const avgBid = calculateAverageBid(media);
                                  const defaultBid = Math.max(getDefaultBidAmount(media), avgBid || 0);
                                  const current = parseFloat(addTuneBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                  const newAmount = current + 0.01;
                                  setAddTuneBidAmounts(prev => ({
                                    ...prev,
                                    [mediaId]: newAmount.toFixed(2)
                                  }));
                                }}
                                className="px-1.5 py-2 bg-white hover:bg-gray-900 hover:text-white rounded-tr-xl rounded-br-xl text-black transition-colors flex items-center justify-center"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => startAddTune(media)}
                              disabled={isAddingTune}
                              className="z-999 px-3 md:px-4 py-2 bg-purple-800 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap"
                            >
                              {isAddingTune ? (
                                <>
                                  <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin inline mr-2" />
                                  Adding...
                                </>
                              ) : (
                                (() => {
                                  const defaultBid = getDefaultBidAmount(media);
                                  const raw = addTuneBidAmounts[media._id || media.id] ?? defaultBid.toFixed(2);
                                  const parsed = parseFloat(raw);
                                  if (!Number.isFinite(parsed)) {
                                    return 'Add';
                                  }
                                  return `Add £${parsed.toFixed(2)}`;
                                })()
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* YouTube Results - only when panel is expanded */}
              {showAddTunePanel && addTuneResults.youtube.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center mb-2">
                    <Youtube className="h-4 w-4 text-red-400 mr-2" />
                    <h4 className="text-sm font-semibold text-red-300">From YouTube ({addTuneResults.youtube.length})</h4>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {addTuneResults.youtube.map((mediaItem: any) => {
                      const media = {
                        ...mediaItem,
                        artists: Array.isArray(mediaItem.artists) ? mediaItem.artists : 
                                (Array.isArray(mediaItem.artist) ? mediaItem.artist : []),
                        artist: mediaItem.artist,
                        featuring: mediaItem.featuring || [],
                        creatorDisplay: mediaItem.creatorDisplay
                      };
                      return (
                        <div key={media._id || media.id} className="bg-gray-900 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <img
                              src={media.coverArt || DEFAULT_COVER_ART}
                              alt={media.title}
                              className="h-12 w-12 md:h-12 md:w-12 rounded object-cover flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate text-sm md:text-base">{media.title}</p>
                              <p className="text-gray-400 text-xs md:text-sm truncate">
                                <ClickableArtistDisplay media={media} />
                              </p>
                              {media.duration && (
                                <div className="flex justify-center items-center space-x-1 mt-1">
                                  <Clock className="h-3 w-3 text-gray-500" />
                                  <span className="text-gray-500 text-xs">{formatDuration(media.duration)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-center space-x-0 md:flex-shrink-0">
                            <div className="flex items-center space-x-0 mr-4">
                              <button
                                type="button"
                                onClick={() => {
                                  const mediaId = media._id || media.id;
                                  const avgBid = calculateAverageBid(media);
                                  const minBid = getEffectiveMinimumBid(media);
                                  const defaultBid = Math.max(getDefaultBidAmount(media), avgBid || 0);
                                  const current = parseFloat(addTuneBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                  const newAmount = Math.max(minBid, current - 0.01);
                                  setAddTuneBidAmounts(prev => ({
                                    ...prev,
                                    [mediaId]: newAmount.toFixed(2)
                                  }));
                                }}
                                className="px-1.5 py-2 bg-white hover:bg-gray-900 hover:text-white rounded-tl-xl rounded-bl-xl text-black transition-colors flex items-center justify-center"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <input
                                type="number"
                                step="0.01"
                                min={getEffectiveMinimumBid(media)}
                                value={addTuneBidAmounts[media._id || media.id] ?? (() => {
                                  const avgBid = calculateAverageBid(media);
                                  return Math.max(getDefaultBidAmount(media), avgBid || 0).toFixed(2);
                                })()}
                                onChange={(e) => setAddTuneBidAmounts(prev => ({
                                  ...prev,
                                  [media._id || media.id]: e.target.value
                                }))}
                                className="w-14 md:w-14 bg-gray-800 rounded px-2 py-1 text-gray text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const mediaId = media._id || media.id;
                                  const avgBid = calculateAverageBid(media);
                                  const defaultBid = Math.max(getDefaultBidAmount(media), avgBid || 0);
                                  const current = parseFloat(addTuneBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                  const newAmount = current + 0.01;
                                  setAddTuneBidAmounts(prev => ({
                                    ...prev,
                                    [mediaId]: newAmount.toFixed(2)
                                  }));
                                }}
                                className="px-1.5 py-2 bg-white hover:bg-gray-900 hover:text-white rounded-tr-xl rounded-br-xl text-black transition-colors flex items-center justify-center"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => startAddTune(media)}
                              disabled={isAddingTune}
                              className="z-999 px-3 md:px-4 py-2 bg-purple-800 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap"
                            >
                              {isAddingTune ? (
                                <>
                                  <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin inline mr-2" />
                                  Adding...
                                </>
                              ) : (
                                (() => {
                                  const defaultBid = getDefaultBidAmount(media);
                                  const raw = addTuneBidAmounts[media._id || media.id] ?? defaultBid.toFixed(2);
                                  const parsed = parseFloat(raw);
                                  if (!Number.isFinite(parsed)) {
                                    return 'Add';
                                  }
                                  return `Add £${parsed.toFixed(2)}`;
                                })()
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

            <div className="card flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Music className="h-6 w-6 text-purple-400 mr-2" />
                <h2 className="text-2xl font-semibold text-white">Tune Library</h2>
                <span className="ml-3 px-3 py-1 bg-purple-900 text-purple-200 text-sm rounded-full">
                  {tuneLibrary.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const sorted = getSortedLibrary();
                  if (sorted.length > 0) handlePlayLibrary(sorted[0], 0);
                }}
                disabled={isLoadingLibrary || tuneLibrary.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                <Play className="h-4 w-4" fill="currentColor" />
                Play
              </button>
            </div>

            {isLoadingLibrary ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
              </div>
            ) : tuneLibrary.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Music className="h-12 w-12 mx-auto mb-4 text-gray-500" />
                <p>You haven't tipped on any media yet.</p>
                <p className="text-sm mt-2">Start tipping on tunes to build your library!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Artwork
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors max-w-[220px] w-[220px]"
                        onClick={() => {
                          if (librarySortField === 'title') {
                            setLibrarySortDirection(librarySortDirection === 'asc' ? 'desc' : 'asc');
                          } else {
                            setLibrarySortField('title');
                            setLibrarySortDirection('asc');
                          }
                        }}
                      >
                        <div className="flex items-center truncate">
                          Title
                          {getLibrarySortIcon('title')}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors max-w-[220px] w-[220px]"
                        onClick={() => {
                          if (librarySortField === 'artist') {
                            setLibrarySortDirection(librarySortDirection === 'asc' ? 'desc' : 'asc');
                          } else {
                            setLibrarySortField('artist');
                            setLibrarySortDirection('asc');
                          }
                        }}
                      >
                        <div className="flex items-center truncate">
                          Artist
                          {getLibrarySortIcon('artist')}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                        onClick={() => {
                          if (librarySortField === 'duration') {
                            setLibrarySortDirection(librarySortDirection === 'asc' ? 'desc' : 'asc');
                          } else {
                            setLibrarySortField('duration');
                            setLibrarySortDirection('asc');
                          }
                        }}
                      >
                        <div className="flex items-center">
                          Duration
                          {getLibrarySortIcon('duration')}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                        onClick={() => {
                          if (librarySortField === 'globalMediaAggregateAvg') {
                            setLibrarySortDirection(librarySortDirection === 'asc' ? 'desc' : 'asc');
                          } else {
                            setLibrarySortField('globalMediaAggregateAvg');
                            setLibrarySortDirection('desc');
                          }
                        }}
                      >
                        <div className="flex items-center">
                          Avg Tip
                          {getLibrarySortIcon('globalMediaAggregateAvg')}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                        onClick={() => {
                          if (librarySortField === 'globalUserMediaAggregate') {
                            setLibrarySortDirection(librarySortDirection === 'asc' ? 'desc' : 'asc');
                          } else {
                            setLibrarySortField('globalUserMediaAggregate');
                            setLibrarySortDirection('desc');
                          }
                        }}
                      >
                        <div className="flex items-center">
                          Your Tip
                          {getLibrarySortIcon('globalUserMediaAggregate')}
                        </div>
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                        onClick={() => {
                          if (librarySortField === 'tuneBytesEarned') {
                            setLibrarySortDirection(librarySortDirection === 'asc' ? 'desc' : 'asc');
                          } else {
                            setLibrarySortField('tuneBytesEarned');
                            setLibrarySortDirection('desc');
                          }
                        }}
                      >
                        <div className="flex items-center">
                          TuneBytes
                          {getLibrarySortIcon('tuneBytesEarned')}
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {getSortedLibrary().map((item, index) => (
                      <tr key={item.mediaId} className="hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="relative w-12 h-12 group cursor-pointer" onClick={() => handlePlayLibrary(item, index)}>
                            {item.coverArt ? (
                              <img 
                                src={item.coverArt} 
                                alt={item.title}
                                className="w-full h-full rounded object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-700 rounded flex items-center justify-center">
                                <Music className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors shadow-lg">
                                <Play className="h-4 w-4 text-white ml-0.5" fill="currentColor" />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[220px] w-[220px]">
                          <button
                            onClick={() => navigate(`/tune/${item.mediaId || item.mediaUuid}`)}
                            className="block w-full min-w-0 truncate text-sm font-medium text-white hover:text-purple-400 transition-colors text-left"
                            title={item.title}
                          >
                            {item.title}
                          </button>
                        </td>
                        <td className="px-4 py-3 max-w-[220px] w-[220px]">
                          <div className="min-w-0 truncate text-sm text-gray-300" title={item.artist}>
                            <ClickableArtistDisplay media={item} />
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-300">{formatDuration(item.duration)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-300">{penceToPounds(item.globalMediaAggregateAvg)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-semibold text-green-400">{penceToPounds(item.globalUserMediaAggregate)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-semibold text-yellow-400">{item.tuneBytesEarned.toFixed(1)}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => navigate(`/tune/${item.mediaId || item.mediaUuid}`)}
                            className="inline-flex items-center px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                            title="View tune"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : viewTab === 'tip-history' ? (
          /* TIP HISTORY TAB */
          <div className="space-y-6">
            {/* Filters */}
            <div className="card bg-black/20 rounded-lg p-4 mb-6">
              <div className="flex flex-wrap gap-4 items-center">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Status</label>
                  <select
                    value={tipHistoryFilters.status}
                    onChange={(e) => setTipHistoryFilters({ ...tipHistoryFilters, status: e.target.value as any, page: 1 })}
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="">All</option>
                    <option value="active">Active</option>
                    <option value="vetoed">Vetoed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Scope</label>
                  <select
                    value={tipHistoryFilters.bidScope}
                    onChange={(e) => setTipHistoryFilters({ ...tipHistoryFilters, bidScope: e.target.value as any, page: 1 })}
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="">All</option>
                    <option value="party">Party</option>
                    <option value="global">Global</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tip History List */}
            {isLoadingTipHistory ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-purple-400 mx-auto mb-4 animate-spin" />
                <p className="text-gray-400">Loading tip history...</p>
              </div>
            ) : tipHistory.length === 0 ? (
              <div className="text-center py-12">
                <Music className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No Tips Found</h3>
                <p className="text-gray-400">You haven't placed any tips yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {tipHistory.map((tip: any) => (
                  <div
                    key={tip._id}
                    className="card bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors"
                  >
                    <div className="flex items-start space-x-4">
                      {/* Media Cover Art */}
                      {tip.media?.coverArt && (
                        <img
                          src={tip.media.coverArt}
                          alt={tip.media.title || 'Media'}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0 cursor-pointer"
                          onClick={() => {
                            const mediaId = tip.media?._id || tip.media?.uuid;
                            if (mediaId) navigate(`/tune/${mediaId}`);
                          }}
                        />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        {/* Media Title */}
                        <h3
                          className="text-lg font-semibold text-white cursor-pointer hover:text-purple-300 transition-colors mb-1"
                          onClick={() => {
                            const mediaId = tip.media?._id || tip.media?.uuid;
                            if (mediaId) navigate(`/tune/${mediaId}`);
                          }}
                        >
                          {tip.media?.title || tip.mediaTitle || 'Unknown Media'}
                        </h3>
                        
                        {/* Artist */}
                        {tip.media && (
                          <div className="text-sm text-gray-400 mb-2">
                            <ClickableArtistDisplay media={tip.media} />
                          </div>
                        )}
                        
                        {/* Party/Scope Info */}
                        <div className="flex items-center space-x-4 text-xs text-gray-400 mb-2">
                          {tip.party ? (
                            <span
                              className="cursor-pointer hover:text-purple-300 transition-colors"
                              onClick={() => {
                                const partyId = tip.party?._id || tip.party?.uuid;
                                if (partyId) navigate(`/party/${partyId}`);
                              }}
                            >
                              {tip.party.type === 'global' ? '🌍 Global' : `🎉 ${tip.party.name || tip.partyName || 'Unknown Party'}`}
                            </span>
                          ) : (
                            <span>{tip.bidScope === 'global' ? '🌍 Global' : '🎉 Party'}</span>
                          )}
                          {tip.isInitialBid && (
                            <span className="px-2 py-0.5 bg-purple-600/30 text-purple-200 rounded text-xs">
                              Initial Tip
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            tip.status === 'active' ? 'bg-green-600/30 text-green-200' :
                            tip.status === 'vetoed' ? 'bg-red-600/30 text-red-200' :
                            'bg-gray-600/30 text-gray-200'
                          }`}>
                            {tip.status || 'active'}
                          </span>
                        </div>
                        
                        {/* Date */}
                        <div className="flex items-center text-xs text-gray-500">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(tip.createdAt).toLocaleString()}
                        </div>
                      </div>
                      
                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-xl font-bold text-green-400">
                          {penceToPounds(tip.amount || 0)}
                        </div>
                        {tip.status === 'vetoed' && (
                          <div className="text-xs text-red-400 mt-1">Refunded</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {tipHistoryPagination && tipHistoryPagination.totalPages > 1 && (
              <div className="flex justify-center items-center space-x-4 mt-6">
                <button
                  onClick={() => setTipHistoryFilters({ ...tipHistoryFilters, page: tipHistoryFilters.page - 1 })}
                  disabled={tipHistoryFilters.page === 1}
                  className="px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-gray-400 text-sm">
                  Page {tipHistoryPagination.page} of {tipHistoryPagination.totalPages}
                </span>
                <button
                  onClick={() => setTipHistoryFilters({ ...tipHistoryFilters, page: tipHistoryFilters.page + 1 })}
                  disabled={tipHistoryFilters.page >= tipHistoryPagination.totalPages}
                  className="px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        ) : viewTab === 'wallet-history' ? (
          /* WALLET HISTORY TAB */
          <div className="space-y-6">
            {/* Stats Summary */}
            {walletHistoryStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="card bg-black/20 rounded-lg p-4 text-center">
                  <BarChart3 className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-white">{walletHistoryStats.totalTransactions || 0}</div>
                  <div className="text-xs text-gray-300">Total Transactions</div>
                </div>
                <div className="card bg-black/20 rounded-lg p-4 text-center">
                  <Coins className="w-6 h-6 text-green-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-white">{penceToPounds(walletHistoryStats.totalTopUps || 0)}</div>
                  <div className="text-xs text-gray-300">Total Top-ups</div>
                </div>
                <div className="card bg-black/20 rounded-lg p-4 text-center">
                  <TrendingUp className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-white">{penceToPounds(walletHistoryStats.totalRefunds || 0)}</div>
                  <div className="text-xs text-gray-300">Total Refunds</div>
                </div>
                <div className="card bg-black/20 rounded-lg p-4 text-center">
                  <Activity className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                  <div className="text-xl font-bold text-white">{penceToPounds((walletHistoryStats.totalTopUps || 0) - (walletHistoryStats.totalRefunds || 0))}</div>
                  <div className="text-xs text-gray-300">Net Top-ups</div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="card bg-black/20 rounded-lg p-4 mb-6">
              <div className="flex flex-wrap gap-4 items-center">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Type</label>
                  <select
                    value={walletHistoryFilters.type}
                    onChange={(e) => setWalletHistoryFilters({ ...walletHistoryFilters, type: e.target.value as any, page: 1 })}
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="">All</option>
                    <option value="topup">Top-up</option>
                    <option value="refund">Refund</option>
                    <option value="adjustment">Adjustment</option>
                    <option value="beta_credit">Beta Credit</option>
                    <option value="gift">Gift</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Status</label>
                  <select
                    value={walletHistoryFilters.status}
                    onChange={(e) => setWalletHistoryFilters({ ...walletHistoryFilters, status: e.target.value as any, page: 1 })}
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="">All</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Payment Method</label>
                  <select
                    value={walletHistoryFilters.paymentMethod}
                    onChange={(e) => setWalletHistoryFilters({ ...walletHistoryFilters, paymentMethod: e.target.value as any, page: 1 })}
                    className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="">All</option>
                    <option value="stripe">Stripe</option>
                    <option value="manual">Manual</option>
                    <option value="beta">Beta</option>
                    <option value="gift">Gift</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Wallet History List */}
            {isLoadingWalletHistory ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 text-purple-400 mx-auto mb-4 animate-spin" />
                <p className="text-gray-400">Loading wallet history...</p>
              </div>
            ) : walletHistory.length === 0 ? (
              <div className="text-center py-12">
                <Coins className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">No Transactions Found</h3>
                <p className="text-gray-400">You haven't made any wallet transactions yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {walletHistory.map((tx: any) => (
                  <div
                    key={tx._id}
                    className="card bg-black/20 rounded-lg p-4 hover:bg-black/30 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Transaction Type and Status */}
                        <div className="flex items-center space-x-2 mb-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            tx.type === 'topup' ? 'bg-green-600/30 text-green-200' :
                            tx.type === 'refund' ? 'bg-red-600/30 text-red-200' :
                            tx.type === 'beta_credit' ? 'bg-purple-600/30 text-purple-200' :
                            tx.type === 'adjustment' ? 'bg-blue-600/30 text-blue-200' :
                            'bg-gray-600/30 text-gray-200'
                          }`}>
                            {tx.type === 'topup' ? 'Top-up' :
                             tx.type === 'refund' ? 'Refund' :
                             tx.type === 'beta_credit' ? 'Beta Credit' :
                             tx.type === 'adjustment' ? 'Adjustment' :
                             tx.type === 'gift' ? 'Gift' : tx.type}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            tx.status === 'completed' ? 'bg-green-600/30 text-green-200' :
                            tx.status === 'pending' ? 'bg-yellow-600/30 text-yellow-200' :
                            tx.status === 'failed' ? 'bg-red-600/30 text-red-200' :
                            'bg-gray-600/30 text-gray-200'
                          }`}>
                            {tx.status || 'completed'}
                          </span>
                          {tx.paymentMethod && (
                            <span className="px-2 py-0.5 bg-gray-600/30 text-gray-200 rounded text-xs">
                              {tx.paymentMethod === 'stripe' ? '💳 Stripe' :
                               tx.paymentMethod === 'manual' ? '✋ Manual' :
                               tx.paymentMethod === 'beta' ? '🧪 Beta' :
                               tx.paymentMethod === 'gift' ? '🎁 Gift' : tx.paymentMethod}
                            </span>
                          )}
                        </div>
                        
                        {/* Description */}
                        {tx.description && (
                          <p className="text-sm text-gray-300 mb-2">{tx.description}</p>
                        )}
                        
                        {/* Balance Before/After */}
                        {tx.balanceBefore !== null && tx.balanceAfter !== null && (
                          <div className="flex items-center space-x-4 text-xs text-gray-400 mb-2">
                            <span>Balance: {penceToPounds(tx.balanceBefore)} → {penceToPounds(tx.balanceAfter)}</span>
                          </div>
                        )}
                        
                        {/* Date */}
                        <div className="flex items-center text-xs text-gray-500">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(tx.createdAt).toLocaleString()}
                        </div>
                      </div>
                      
                      {/* Amount */}
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className={`text-xl font-bold ${
                          tx.type === 'topup' || tx.type === 'beta_credit' || tx.type === 'gift' ? 'text-green-400' :
                          tx.type === 'refund' ? 'text-red-400' :
                          'text-blue-400'
                        }`}>
                          {tx.type === 'refund' ? '-' : '+'}{penceToPounds(tx.amount || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {walletHistoryPagination && walletHistoryPagination.totalPages > 1 && (
              <div className="flex justify-center items-center space-x-4 mt-6">
                <button
                  onClick={() => setWalletHistoryFilters({ ...walletHistoryFilters, page: walletHistoryFilters.page - 1 })}
                  disabled={walletHistoryFilters.page === 1}
                  className="px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-gray-400 text-sm">
                  Page {walletHistoryPagination.page} of {walletHistoryPagination.totalPages}
                </span>
                <button
                  onClick={() => setWalletHistoryFilters({ ...walletHistoryFilters, page: walletHistoryFilters.page + 1 })}
                  disabled={walletHistoryFilters.page >= walletHistoryPagination.totalPages}
                  className="px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        ) : null}
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
                    onChange={(e) => {
                      const newUsername = e.target.value;
                      setEditForm({ ...editForm, username: newUsername });
                      // Clear error when user starts typing
                      if (usernameError) {
                        setUsernameError(null);
                      }
                      // Real-time validation (only if changed from original)
                      if (newUsername !== user?.username && newUsername.trim()) {
                        const error = validateUsername(newUsername);
                        setUsernameError(error);
                      }
                    }}
                    className={`input ${usernameError ? 'border-red-500' : editForm.username && editForm.username !== user?.username && !usernameError ? 'border-green-500' : ''}`}
                    placeholder="Enter username"
                  />
                  {usernameError && (
                    <p className="mt-1 text-sm text-red-400">{usernameError}</p>
                  )}
                  {!usernameError && editForm.username && editForm.username !== user?.username && (
                    <p className="mt-1 text-sm text-green-400">Username looks good!</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    3-20 characters, letters, numbers, underscores, and hyphens only
                  </p>
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
                      <span>Become a Creator</span>
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
                    { key: 'bid_received', label: 'Tip Received', desc: 'When someone tips on your media' },
                    { key: 'bid_outbid', label: 'Outtipped', desc: 'When you are outtipped on media' },
                    { key: 'comment_reply', label: 'Comment Replies', desc: 'When someone replies to your comment' },
                    { key: 'tune_bytes_earned', label: 'TuneBytes Earned', desc: 'When you earn TuneBytes' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-start justify-between p-4 bg-black/20 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            id={key}
                            checked={notificationPrefs[key as keyof typeof notificationPrefs] as boolean}
                            onChange={(e) => setNotificationPrefs({
                              ...notificationPrefs,
                              [key]: e.target.checked
                            } as typeof notificationPrefs)}
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

                {/* Default Tip Setting */}
                <div className="space-y-4 mb-6">
                  <h3 className="text-lg font-semibold text-white mb-3">Tip Settings</h3>
                  
                  <div className="p-4 bg-black/20 rounded-lg">
                    <label htmlFor="defaultTip" className="block text-white font-medium mb-2">
                      Default Tip Amount (£)
                    </label>
                    <input
                      type="number"
                      id="defaultTip"
                      step="0.01"
                      min="0.01"
                      value={notificationPrefs.defaultTip}
                      onChange={(e) => setNotificationPrefs({
                        ...notificationPrefs,
                        defaultTip: parseFloat(e.target.value) || 0.11
                      })}
                      className="w-full max-w-xs px-3 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="0.11"
                    />
                    <p className="text-sm text-gray-400 mt-2">
                      Default tip amount when placing bids (minimum: £0.01). Currently set to £{notificationPrefs.defaultTip.toFixed(2)}.
                    </p>
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
                  onChange={(e) => {
                    const newUsername = e.target.value;
                    setEditForm({ ...editForm, username: newUsername });
                    // Clear error when user starts typing
                    if (usernameError) {
                      setUsernameError(null);
                    }
                    // Real-time validation (only if changed from original)
                    if (newUsername !== user?.username && newUsername.trim()) {
                      const error = validateUsername(newUsername);
                      setUsernameError(error);
                    }
                  }}
                  className={`input ${usernameError ? 'border-red-500' : editForm.username && editForm.username !== user?.username && !usernameError ? 'border-green-500' : ''}`}
                  placeholder="Enter username"
                />
                {usernameError && (
                  <p className="mt-1 text-sm text-red-400">{usernameError}</p>
                )}
                {!usernameError && editForm.username && editForm.username !== user?.username && (
                  <p className="mt-1 text-sm text-green-400">Username looks good!</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  3-20 characters, letters, numbers, underscores, and hyphens only
                </p>
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

      {/* Link Label Modal */}
      <LabelLinkModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        onSuccess={handleLabelLinked}
      />
      
      {/* Link Collective Modal */}
      <CollectiveLinkModal
        isOpen={isCollectiveModalOpen}
        onClose={() => setIsCollectiveModalOpen(false)}
        onSuccess={handleCollectiveLinked}
      />
      {/* Tag Input Modal for Add Tune */}
      <TagInputModal
        isOpen={showAddTuneTagModal}
        onClose={() => {
          setShowAddTuneTagModal(false);
          setPendingAddTuneResult(null);
        }}
        onSubmit={(tags) => {
          if (pendingAddTuneResult) {
            void handleAddTune(pendingAddTuneResult, tags);
          }
        }}
        mediaTitle={pendingAddTuneResult?.title}
        mediaArtist={pendingAddTuneResult?.artist}
      />
    </div>
  );
};

export default UserProfile;
