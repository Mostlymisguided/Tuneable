import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AudioLines, Globe, Coins, Gift, UserPlus, Users, Music, Play, Plus, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Search as SearchIcon, Link as LinkIcon, Upload, Building, Award, TrendingUp, Filter, Settings, Copy, Mail, Share2, Facebook, Instagram, Clock, X, History, ArrowRight } from 'lucide-react';
import { userAPI, mediaAPI, searchAPI, partyAPI, emailAPI } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { toast } from 'react-toastify';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { penceToPounds } from '../utils/currency';
import QuotaWarningBanner from '../components/QuotaWarningBanner';
import BetaWarningBanner from '../components/BetaWarningBanner';
import { showCreatorDashboard } from '../utils/permissionHelpers';
import LabelCreateModal from '../components/LabelCreateModal';
import CollectiveCreateModal from '../components/CollectiveCreateModal';
import TagInputModal from '../components/TagInputModal';
import EmailInviteModal from '../components/EmailInviteModal';
import CreatorProfilePrompts from '../components/CreatorProfilePrompts';
import UserProfilePrompts from '../components/UserProfilePrompts';
import ClickableArtistDisplay from '../components/ClickableArtistDisplay';
import MediaValidationModal from '../components/MediaValidationModal';

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

interface SearchResult {
  _id?: string;
  id?: string;
  title: string;
  artist: string;
  coverArt?: string;
  duration?: number;
  sources?: Record<string, string>;
  isLocal?: boolean;
  category?: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setCurrentMedia, setQueue, setGlobalPlayerActive } = useWebPlayerStore();
  const [invitedUsers, setInvitedUsers] = useState<any[]>([]);
  const [isLoadingInvited, setIsLoadingInvited] = useState(false);
  const [tuneLibrary, setTuneLibrary] = useState<LibraryItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [sortField, setSortField] = useState<string>('lastBidAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showAllInvitedUsers, setShowAllInvitedUsers] = useState(false);
  const [showAllLibrary, setShowAllLibrary] = useState(false);
  const [isCreatorBannerDismissed, setIsCreatorBannerDismissed] = useState(false);
  
  // Add Tune feature state
  const [addTuneQuery, setAddTuneQuery] = useState('');
  const [addTuneResults, setAddTuneResults] = useState<SearchResult[]>([]);
  const [isSearchingTune, setIsSearchingTune] = useState(false);
  const [addTuneBidAmounts, setAddTuneBidAmounts] = useState<Record<string, string>>({});
  const [isAddingTune, setIsAddingTune] = useState(false);
  const [minimumBid, setMinimumBid] = useState<number>(0.01);
  const [showAddTuneTagModal, setShowAddTuneTagModal] = useState(false);
  const [pendingAddTuneResult, setPendingAddTuneResult] = useState<SearchResult | null>(null);
  
  // Validation modal state
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<{category?: boolean; duration?: boolean}>({});
  const [validationCategory, setValidationCategory] = useState<string>('');
  const [validationDuration, setValidationDuration] = useState<number>(0);
  const [pendingMedia, setPendingMedia] = useState<SearchResult | null>(null);

  // Creator Dashboard state
  const [creatorStats, setCreatorStats] = useState<any>(null);
  const [isLoadingCreatorStats, setIsLoadingCreatorStats] = useState(false);
  const [creatorActiveTab, setCreatorActiveTab] = useState<'overview' | 'media' | 'labels' | 'collectives'>('overview');
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [isCollectiveModalOpen, setIsCollectiveModalOpen] = useState(false);
  const [isEmailInviteModalOpen, setIsEmailInviteModalOpen] = useState(false);
  
  // My Media state
  const [myMedia, setMyMedia] = useState<any[]>([]);
  const [isLoadingMyMedia, setIsLoadingMyMedia] = useState(false);
  const [myMediaSortField, setMyMediaSortField] = useState<string>('createdAt');
  const [myMediaSortDirection, setMyMediaSortDirection] = useState<'asc' | 'desc'>('desc');
  const [myMediaPage, setMyMediaPage] = useState(1);
  const [myMediaTotal, setMyMediaTotal] = useState(0);

  // Labels tab state
  const [labelsFilterRole, setLabelsFilterRole] = useState<string>('all'); // 'all', 'owner', 'admin', 'affiliation'
  const [labelsFilterVerification, setLabelsFilterVerification] = useState<string>('all'); // 'all', 'verified', 'pending', 'unverified'
  const [labelsSortField, setLabelsSortField] = useState<string>('name');
  const [labelsSortDirection, setLabelsSortDirection] = useState<'asc' | 'desc'>('asc');
  const [collapsedSections, setCollapsedSections] = useState<{
    owned: boolean;
    admin: boolean;
    affiliated: boolean;
  }>({ owned: false, admin: false, affiliated: false });

  // Collectives tab state
  const [collectives, setCollectives] = useState<any[]>([]);
  const [isLoadingCollectives, setIsLoadingCollectives] = useState(false);
  const [collectivesFilterRole, setCollectivesFilterRole] = useState<string>('all'); // 'all', 'founder', 'admin', 'member'
  const [collectivesFilterVerification, setCollectivesFilterVerification] = useState<string>('all'); // 'all', 'verified', 'pending', 'unverified'
  const [collectivesSortField, setCollectivesSortField] = useState<string>('name');
  const [collectivesSortDirection, setCollectivesSortDirection] = useState<'asc' | 'desc'>('asc');
  const [collapsedCollectiveSections, setCollapsedCollectiveSections] = useState<{
    owned: boolean;
    admin: boolean;
    member: boolean;
  }>({ owned: false, admin: false, member: false });

  const inviteLink = useMemo(() => {
    if (!user?.personalInviteCode) {
      return window.location.origin;
    }
    return `${window.location.origin}/register?invite=${user.personalInviteCode}`;
  }, [user?.personalInviteCode]);

  const inviteMessage = useMemo(() => {
    const codeLine = user?.personalInviteCode ? `Use my invite code ${user.personalInviteCode} when you sign up.` : '';
    return `Hey! I'm inviting you to try Tuneable, the social music platform for supporting your favourite artists by bidding on beats.

${codeLine}

Join here: ${inviteLink}`.trim();
  }, [inviteLink, user?.personalInviteCode]);


  const handleCopyInvite = useCallback(async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(inviteMessage);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = inviteMessage;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast.success('Invite message copied to clipboard');
    } catch (error) {
      console.error('Failed to copy invite message:', error);
      toast.error('Could not copy invite. Please try again.');
    }
  }, [inviteMessage]);

  const handleUploadClick = useCallback(async () => {
    // Check if user's email is verified
    if (!user?.emailVerified) {
      const shouldSendVerification = window.confirm(
        'Please verify your email address before uploading media. Would you like us to send you a verification email?'
      );
      
      if (shouldSendVerification) {
        try {
          await emailAPI.resendVerification();
          toast.success('Verification email sent! Please check your inbox and click the verification link.');
        } catch (error: any) {
          console.error('Error sending verification email:', error);
          toast.error(error.response?.data?.error || 'Failed to send verification email');
        }
      }
      return;
    }
    
    // Email is verified, proceed to upload page
    navigate('/creator/upload');
  }, [user?.emailVerified, navigate]);

  const handleEmailInvite = useCallback(() => {
    setIsEmailInviteModalOpen(true);
  }, []);

  const handleDismissCreatorBanner = useCallback(() => {
    setIsCreatorBannerDismissed(true);
    localStorage.setItem('creatorBannerDismissed', 'true');
  }, []);

  const handleFacebookShare = useCallback(() => {
    const quote = user?.personalInviteCode 
      ? `Support your favourite Artists on Tuneable! Join with this invite code: ${user.personalInviteCode}`
      : 'Support your favourite Artists on Tuneable! Join the social music platform for tipping on tunes.';
    const hashtag = 'Tuneable';
    
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteLink)}&quote=${encodeURIComponent(quote)}&hashtag=${encodeURIComponent(hashtag)}`;
    window.open(shareUrl, '_blank', 'noopener');
  }, [inviteLink, user?.personalInviteCode]);

  const handleInstagramShare = useCallback(async () => {
    if (!user?.personalInviteCode) {
      toast.error('You need an invite code to share on Instagram');
      return;
    }

    // Create Instagram-friendly invite message
    const instagramMessage = `Support your favourite Artists on Tuneable! 🎵\n\nJoin with this invite code: ${user.personalInviteCode}\n\n${inviteLink}`;

    try {
      // Copy message to clipboard first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(instagramMessage);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = instagramMessage;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        // Use Instagram Stories URL scheme (works on mobile browsers when app is installed)
        const instagramStoriesUrl = 'instagram-stories://share';
        
        // Try to open Instagram Stories
        window.location.href = instagramStoriesUrl;
        
        // Show success message
        toast.success(
          <div>
            <div className="font-semibold mb-1">Opening Instagram Stories...</div>
            <div className="text-sm">
              The invite message is copied. Paste it as a text sticker in your story!
            </div>
          </div>,
          { autoClose: 5000 }
        );
        
        // Fallback: if Instagram app doesn't open, try regular Instagram app
        setTimeout(() => {
          // Check if we're still on the page (Instagram didn't open)
          if (document.hasFocus()) {
            window.location.href = 'instagram://';
          }
        }, 1000);
      } else {
        // Desktop - open Instagram web
        window.open('https://www.instagram.com/', '_blank');
        toast.success(
          <div>
            <div className="font-semibold mb-1">Invite message copied!</div>
            <div className="text-sm">
              Open Instagram and paste the message in your story or DM. The link includes your invite code.
            </div>
          </div>,
          { autoClose: 5000 }
        );
      }
    } catch (error) {
      console.error('Failed to share to Instagram:', error);
      toast.error('Could not share to Instagram. Please try again.');
    }
  }, [user?.personalInviteCode, inviteLink]);

  const handleSystemShare = useCallback(() => {
    const sharePayload = {
      title: 'Tuneable Invite',
      text: inviteMessage,
      url: inviteLink,
    };

    if (navigator.share) {
      navigator.share(sharePayload).catch((error) => {
        if (error && error.name !== 'AbortError') {
          console.error('Share failed:', error);
          toast.error('Unable to open share sheet.');
        }
      });
    } else {
      toast.info('Sharing not supported on this device. Try copying the invite instead.');
    }
  }, [inviteLink, inviteMessage]);

  // Helper function to detect YouTube URLs
  const isYouTubeUrl = (query: string) => {
    const youtubePatterns = [
      /youtube\.com\/watch\?v=/,
      /youtu\.be\//,
      /youtube\.com\/embed\//
    ];
    return youtubePatterns.some(pattern => pattern.test(query));
  };

  // Helper to extract YouTube video ID
  const extractYouTubeVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  // Helper to fetch video category if needed
  const fetchVideoCategory = async (videoId: string): Promise<string> => {
    try {
      const response = await searchAPI.searchByYouTubeUrl(`https://www.youtube.com/watch?v=${videoId}`);
      if (response.videos && response.videos.length > 0) {
        return response.videos[0].category || 'Unknown';
      }
    } catch (error) {
      console.error('Error fetching video category:', error);
    }
    return 'Unknown';
  };

  // Fetch global party minimum bid
  useEffect(() => {
    const fetchGlobalPartyMinimumBid = async () => {
      try {
        const response = await partyAPI.getParties();
        const globalParty = response.parties.find((p: any) => p.type === 'global');
        if (globalParty && globalParty.minimumBid) {
          setMinimumBid(globalParty.minimumBid);
        }
      } catch (error) {
        console.error('Error fetching global party minimum tip:', error);
        // Keep default 0.01 if fetch fails
      }
    };
    fetchGlobalPartyMinimumBid();
  }, []);

  useEffect(() => {
    // Check if creator banner has been dismissed
    const dismissed = localStorage.getItem('creatorBannerDismissed');
    if (dismissed === 'true') {
      setIsCreatorBannerDismissed(true);
    }
  }, []);

  useEffect(() => {
    const loadInvitedUsers = async () => {
      try {
        setIsLoadingInvited(true);
        const data = await userAPI.getInvitedUsers();
        setInvitedUsers(data.invitedUsers || []);
      } catch (error) {
        console.error('Failed to load invited users:', error);
      } finally {
        setIsLoadingInvited(false);
      }
    };
    loadInvitedUsers();
  }, []);

  useEffect(() => {
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
    loadTuneLibrary();
  }, []);

  useEffect(() => {
    const loadCreatorStats = async () => {
      if (!showCreatorDashboard(user)) return;
      
      try {
        setIsLoadingCreatorStats(true);
        const data = await userAPI.getCreatorStats();
        setCreatorStats(data);
      } catch (error) {
        console.error('Failed to load creator stats:', error);
        // Don't show error toast - creator dashboard is optional
      } finally {
        setIsLoadingCreatorStats(false);
      }
    };
    loadCreatorStats();
  }, [user]);

  useEffect(() => {
    const loadMyMedia = async () => {
      if (!showCreatorDashboard(user) || creatorActiveTab !== 'media') return;
      
      try {
        setIsLoadingMyMedia(true);
        const data = await userAPI.getMyMedia({
          page: myMediaPage,
          limit: 20,
          sortBy: myMediaSortField,
          sortOrder: myMediaSortDirection
        });
        setMyMedia(data.media || []);
        setMyMediaTotal(data.pagination?.total || 0);
      } catch (error) {
        console.error('Failed to load my media:', error);
        toast.error('Failed to load your media');
      } finally {
        setIsLoadingMyMedia(false);
      }
    };
    loadMyMedia();
  }, [user, creatorActiveTab, myMediaPage, myMediaSortField, myMediaSortDirection]);

  useEffect(() => {
    const loadCollectives = async () => {
      if (!showCreatorDashboard(user) || creatorActiveTab !== 'collectives') return;
      
      try {
        setIsLoadingCollectives(true);
        const data = await userAPI.getCollectiveMemberships();
        setCollectives(data.collectives || []);
      } catch (error) {
        console.error('Failed to load collectives:', error);
        toast.error('Failed to load your collectives');
      } finally {
        setIsLoadingCollectives(false);
      }
    };
    loadCollectives();
  }, [user, creatorActiveTab]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortedLibrary = () => {
    return [...tuneLibrary].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
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

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-gray-400" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-purple-400" />
      : <ArrowDown className="h-4 w-4 ml-1 text-purple-400" />;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlay = async (item: LibraryItem) => {
    try {
      // Fetch full media details with sources
      const mediaId = item.mediaUuid || item.mediaId;
      const mediaData = await mediaAPI.getProfile(mediaId);
      const media = mediaData.media || mediaData;

      // Clean and format sources
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

      const formattedMedia = {
        id: item.mediaUuid || item.mediaId,
        _id: item.mediaId,
        title: item.title,
        artist: item.artist,
        duration: item.duration,
        coverArt: item.coverArt,
        sources: sources,
        globalMediaAggregate: item.globalMediaAggregate,
        bids: [],
        addedBy: null,
        totalBidValue: item.globalMediaAggregate
      } as any;

      setQueue([formattedMedia]);
      setCurrentMedia(formattedMedia, 0, true);
    setGlobalPlayerActive(true);
      toast.success(`Now playing: ${item.title}`);
    } catch (error) {
      console.error('Error loading media for playback:', error);
      toast.error('Failed to load media for playback');
    }
  };

  const handleIncreaseBid = async (item: LibraryItem) => {
    if (!user) {
      toast.info('Please log in to place a bid');
      navigate('/login');
      return;
    }

    const amountStr = prompt(`Enter bid amount for "${item.title}" (minimum £${minimumBid.toFixed(2)}):`);
    if (!amountStr) return;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount < minimumBid) {
      toast.error(`Minimum bid is £${minimumBid.toFixed(2)}`);
      return;
    }

    if ((user as any)?.balance < amount) {
      toast.error('Insufficient balance');
      return;
    }

    try {
      await mediaAPI.placeGlobalBid(item.mediaUuid || item.mediaId, amount);
      toast.success(`Tip of £${amount.toFixed(2)} placed successfully!`);
      // Reload library to update bid amounts
      const data = await userAPI.getTuneLibrary();
      setTuneLibrary(data.library || []);
    } catch (error: any) {
      console.error('Error placing bid:', error);
      toast.error(error.response?.data?.error || 'Failed to place tip');
    }
  };

  const handleAddTuneSearch = async () => {
    if (!addTuneQuery.trim()) {
      toast.error('Please enter a search query or YouTube URL');
      return;
    }

    setIsSearchingTune(true);
    setAddTuneResults([]);

    try {
      let response;
      
      // Check if it's a YouTube URL
      if (isYouTubeUrl(addTuneQuery)) {
        console.log('🎥 Detected YouTube URL, processing...');
        response = await searchAPI.searchByYouTubeUrl(addTuneQuery);
        console.log('🎥 YouTube URL response:', response);
        
        let results: SearchResult[] = [];
        if (response.source === 'local' && response.videos) {
          results = response.videos.map((v: any) => ({ ...v, isLocal: true }));
          toast.success(`Found "${response.videos[0]?.title}" in our database`);
        } else if (response.source === 'external' && response.videos) {
          results = response.videos.map((v: any) => ({ ...v, isLocal: false }));
          toast.success(`Found "${response.videos[0]?.title}" from YouTube`);
        }
        
        setAddTuneResults(results);
        
        // Initialize bid amounts (default to 0.33 to encourage higher bids)
        const defaultBid = 0.33;
        const newBidAmounts: Record<string, string> = {};
        results.forEach((media: SearchResult) => {
          newBidAmounts[media._id || media.id || ''] = Math.max(defaultBid, minimumBid).toFixed(2);
        });
        setAddTuneBidAmounts(newBidAmounts);
      } else {
        // Regular search
        console.log('🔍 Searching for media:', addTuneQuery);
        response = await searchAPI.search(addTuneQuery, 'youtube');
        
        let results: SearchResult[] = [];
        if (response.source === 'local' && response.videos) {
          results = response.videos.map((v: any) => ({ ...v, isLocal: true }));
        } else if (response.videos) {
          results = response.videos.map((v: any) => ({ ...v, isLocal: false }));
        }
        
        setAddTuneResults(results);
        
        // Initialize bid amounts (default to 0.33 to encourage higher bids)
        const defaultBid = 0.33;
        const newBidAmounts: Record<string, string> = {};
        results.forEach((media: SearchResult) => {
          newBidAmounts[media._id || media.id || ''] = Math.max(defaultBid, minimumBid).toFixed(2);
        });
        setAddTuneBidAmounts(newBidAmounts);
      }
    } catch (error: any) {
      console.error('Error searching for tune:', error);
      toast.error(error.response?.data?.error || 'Failed to search for tune');
    } finally {
      setIsSearchingTune(false);
    }
  };

  const handleAddTune = async (media: SearchResult, tags: string[] = []) => {
    if (!user) {
      toast.info('Please log in to add tunes');
      navigate('/login');
      return;
    }

    const mediaKey = media._id || media.id || '';
    const rawAmount = addTuneBidAmounts[mediaKey] ?? '';
    const bidAmount = parseFloat(rawAmount);

    if (!Number.isFinite(bidAmount) || bidAmount < minimumBid) {
      toast.error(`Minimum bid is £${minimumBid.toFixed(2)}`);
      return;
    }
    
    if ((user as any)?.balance < bidAmount) {
      toast.error('Insufficient balance');
      return;
    }

    const isExistingMedia = Boolean(media._id);
    const targetMediaId = isExistingMedia ? (media._id || media.id || '') : 'external';

    if (!targetMediaId) {
      toast.error('Invalid media ID');
      return;
    }

    const externalSources = !isExistingMedia
      ? (media.sources && Object.keys(media.sources).length > 0
          ? media.sources
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
      const externalMedia = !isExistingMedia
        ? {
            title: media.title,
            artist: media.artist,
            coverArt: media.coverArt,
            duration: media.duration,
            category: media.category,
            tags,
            sources: externalSources
          }
        : undefined;

      await mediaAPI.placeGlobalBid(targetMediaId, bidAmount, externalMedia);
      toast.success(`Added "${media.title}" to your library with £${bidAmount.toFixed(2)} bid!`);
      
      // Clear search
      setAddTuneQuery('');
      setAddTuneResults([]);
      
      // Reload library to show new tune
      const data = await userAPI.getTuneLibrary();
      setTuneLibrary(data.library || []);
      
      setPendingAddTuneResult(null);
      setShowAddTuneTagModal(false);
    } catch (error: any) {
      console.error('Error adding tune:', error);
      toast.error(error.response?.data?.error || 'Failed to add tune');
    } finally {
      setIsAddingTune(false);
    }
  };

  const startAddTune = async (media: SearchResult) => {
    // Validate category and duration before proceeding
    let category = media.category || 'Unknown';
    const duration = media.duration || 0;

    // If category is Unknown and it's a YouTube video, fetch it
    if (category === 'Unknown' && media.sources?.youtube) {
      const videoId = extractYouTubeVideoId(media.sources.youtube);
      if (videoId) {
        category = await fetchVideoCategory(videoId);
        media.category = category;
      }
    }

    // Check for warnings
    const warnings: {category?: boolean; duration?: boolean} = {};
    const DURATION_THRESHOLD = 671; // 11:11 in seconds

    if (category.toLowerCase() !== 'music') {
      warnings.category = true;
    }

    if (duration > DURATION_THRESHOLD) {
      warnings.duration = true;
    }

    // If there are warnings, show validation modal
    if (Object.keys(warnings).length > 0) {
      setValidationWarnings(warnings);
      setValidationCategory(category);
      setValidationDuration(duration);
      setPendingMedia(media);
      setShowValidationModal(true);
      return;
    }

    // No warnings, proceed to tag modal or directly add
    if (!media._id) {
      setPendingAddTuneResult(media);
      setShowAddTuneTagModal(true);
    } else {
      void handleAddTune(media, []);
    }
  };

  const handleValidationConfirm = () => {
    if (!pendingMedia) return;
    setShowValidationModal(false);
    // Proceed to tag modal or add directly
    if (!pendingMedia._id) {
      setPendingAddTuneResult(pendingMedia);
      setShowAddTuneTagModal(true);
    } else {
      void handleAddTune(pendingMedia, []);
    }
    // Clear validation state
    setValidationWarnings({});
    setValidationCategory('');
    setValidationDuration(0);
    setPendingMedia(null);
  };

  const handleValidationCancel = () => {
    setShowValidationModal(false);
    setValidationWarnings({});
    setValidationCategory('');
    setValidationDuration(0);
    setPendingMedia(null);
  };

  return (
    <React.Fragment>
    <div className="min-h-screen bg-gray-900">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Beta Warning Banner */}
      <BetaWarningBanner variant="inline" dismissible={true} className="mb-6" />
      
      <div className="mb-8">
        <h1 className="text-3xl text-center font-bold text-gray-300">
          Welcome back, {user?.username}!
        </h1>
        <p className="text-center text-gray-400 mt-2">
          Ready to create some amazing music experiences?
        </p>
      </div>


        {/* Creator Dashboard */}
        {showCreatorDashboard(user) && (
          <div className="mb-8">
            {/* Header */}
            <div className="bg-gray-800 border-b border-gray-700 rounded-t-lg">
              <div className="px-4 sm:px-6 lg:px-8 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Award className="hidden md:inline h-6 w-6 text-purple-400 mr-3" />
                    <h2 className="text-xl font-semibold text-white">Creator Dashboard</h2>
                  </div>
                     
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-gray-800 border-b border-gray-700">
              <div className="px-4 sm:px-6 lg:px-8">
                <nav className="flex space-x-8">
                  <button
                    onClick={() => setCreatorActiveTab('overview')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      creatorActiveTab === 'overview'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <TrendingUp className="hidden md:inline h-4 w-4 mr-2" />
                    Overview
                  </button>
                  <button
                    onClick={() => setCreatorActiveTab('media')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      creatorActiveTab === 'media'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Music className="hidden md:inline h-4 w-4 mr-2" />
                    My Media
                  </button>
                  <button
                    onClick={() => setCreatorActiveTab('labels')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      creatorActiveTab === 'labels'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Building className="hidden md:inline h-4 w-4 mr-2" />
                    Labels
                  </button>
                  <button
                    onClick={() => setCreatorActiveTab('collectives')}
                    className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                      creatorActiveTab === 'collectives'
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <Users className="hidden md:inline h-4 w-4 mr-2" />
                    Collectives
                  </button>
                </nav>
              </div>
            </div>

            {/* Content */}
            <div className="bg-gray-800 rounded-b-lg p-6">
              {isLoadingCreatorStats ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
                  <p className="text-gray-400 mt-2">Loading creator stats...</p>
                </div>
              ) : creatorStats ? (
                <>
                  {creatorActiveTab === 'overview' && (
                    <div className="space-y-6">
                      {/* Stats Grid */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-gray-900 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-400">Total Media</p>
                              <p className="text-2xl font-bold text-white mt-1">
                                {creatorStats.stats?.totalMedia || 0}
                              </p>
                            </div>
                            <Music className="h-8 w-8 text-purple-400 opacity-50" />
                          </div>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-400">Total Tip Amount</p>
                              <p className="text-2xl font-bold text-white mt-1">
                                {penceToPounds(creatorStats.stats?.totalBidAmount || 0)}
                              </p>
                            </div>
                            <Coins className="h-8 w-8 text-green-400 opacity-50" />
                          </div>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-gray-400">Labels Owned</p>
                              <p className="text-2xl font-bold text-white mt-1">
                                {creatorStats.stats?.labelsOwned || 0}
                              </p>
                            </div>
                            <Building className="h-8 w-8 text-blue-400 opacity-50" />
                          </div>
                        </div>
                        <div className="bg-gray-900 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
                              <p className="text-sm text-gray-400">Labels Admin</p>
                              <p className="text-2xl font-bold text-white mt-1">
                                {creatorStats.stats?.labelsAdmin || 0}
                              </p>
                            </div>
                            <Users className="h-8 w-8 text-orange-400 opacity-50" />
                          </div>
                        </div>
                      </div>

                      {/* Profile Completion Prompts */}
                      {showCreatorDashboard(user) && (
                        <CreatorProfilePrompts user={user} />
                      )}

                      {/* Quick Actions */}
                      <div className="bg-gray-900 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <button
                            onClick={handleUploadClick}
                            className="flex items-center justify-between p-4 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                          >
                            <div className="flex items-center">
                              <Upload className="h-5 w-5 text-white mr-3" />
                              <span className="text-white font-medium">Upload Media</span>
                            </div>
                            <ArrowUp className="h-4 w-4 text-white" />
                          </button>
                          <button
                            onClick={() => navigate('/artist-escrow')}
                            className="flex items-center justify-between p-4 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition-colors"
                          >
                            <div className="flex items-center">
                              <Coins className="h-5 w-5 text-white mr-3" />
                              <span className="text-white font-medium">Escrow Balance</span>
                            </div>
                            <ArrowUp className="h-4 w-4 text-white" />
                          </button>
                          {(user?.creatorProfile?.verificationStatus === 'verified' || user?.role?.includes('admin')) && (
                            <>
                              <button
                                onClick={() => setIsLabelModalOpen(true)}
                                className="flex items-center justify-between p-4 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                              >
                                <div className="flex items-center">
                                  <Building className="h-5 w-5 text-white mr-3" />
                                  <span className="text-white font-medium">Create Label</span>
                                </div>
                                <Plus className="h-4 w-4 text-white" />
                              </button>
                              <button
                                onClick={() => setIsCollectiveModalOpen(true)}
                                className="flex items-center justify-between p-4 bg-orange-500 hover:bg-pink-700 rounded-lg transition-colors"
                              >
                                <div className="flex items-center">
                                  <Users className="h-5 w-5 text-white mr-3" />
                                  <span className="text-white font-medium">Create Collective</span>
                                </div>
                                <Plus className="h-4 w-4 text-white" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Recent Media */}
                      {creatorStats.recentMedia && creatorStats.recentMedia.length > 0 && (
                        <div className="bg-gray-900 rounded-lg p-6">
                          <h3 className="text-lg font-semibold text-white mb-4">Recent Media</h3>
                          <div className="space-y-3">
                            {creatorStats.recentMedia.map((media: any) => (
                              <div
                                key={media._id}
                                onClick={() => navigate(`/tune/${media._id || media.uuid}`)}
                                className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg cursor-pointer transition-colors"
                              >
                                {media.coverArt && (
                                  <img
                                    src={media.coverArt}
                                    alt={media.title}
                                    className="h-12 w-12 rounded object-cover"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-medium truncate">{media.title}</p>
                                  <p className="text-gray-400 text-sm truncate">
                                    <ClickableArtistDisplay media={media} />
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-purple-400 font-medium">
                                    {penceToPounds(media.globalMediaAggregate || 0)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {creatorActiveTab === 'media' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">My Media</h3>
                        <button
                          onClick={handleUploadClick}
                          className="flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Media
                        </button>
                      </div>

                      {isLoadingMyMedia ? (
                        <div className="text-center py-8">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
                          <p className="text-gray-400 mt-2">Loading your media...</p>
                        </div>
                      ) : myMedia.length === 0 ? (
                        <div className="text-center py-8 bg-gray-900 rounded-lg">
                          <Music className="h-12 w-12 mx-auto text-gray-500 mb-4" />
                          <p className="text-gray-400 mb-2">No media found</p>
                          <p className="text-gray-500 text-sm mb-4">Upload your first track to get started!</p>
                          <button
                            onClick={handleUploadClick}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                          >
                            Upload Media
                          </button>
                        </div>
                      ) : (
                        <div className="bg-gray-900 rounded-lg overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-gray-800">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    <button
                                      onClick={() => {
                                        if (myMediaSortField === 'title') {
                                          setMyMediaSortDirection(myMediaSortDirection === 'asc' ? 'desc' : 'asc');
                                        } else {
                                          setMyMediaSortField('title');
                                          setMyMediaSortDirection('asc');
                                        }
                                      }}
                                      className="flex items-center hover:text-purple-400 transition-colors"
                                    >
                                      Title
                                      {myMediaSortField === 'title' ? (
                                        myMediaSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                      ) : (
                                        <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                      )}
                                    </button>
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Artist
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    <button
                                      onClick={() => {
                                        if (myMediaSortField === 'globalMediaAggregate') {
                                          setMyMediaSortDirection(myMediaSortDirection === 'asc' ? 'desc' : 'asc');
                                        } else {
                                          setMyMediaSortField('globalMediaAggregate');
                                          setMyMediaSortDirection('desc');
                                        }
                                      }}
                                      className="flex items-center hover:text-purple-400 transition-colors"
                                    >
                                      Total Tips
                                      {myMediaSortField === 'globalMediaAggregate' ? (
                                        myMediaSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                      ) : (
                                        <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                      )}
                                    </button>
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Ownership
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    <button
                                      onClick={() => {
                                        if (myMediaSortField === 'createdAt') {
                                          setMyMediaSortDirection(myMediaSortDirection === 'asc' ? 'desc' : 'asc');
                                        } else {
                                          setMyMediaSortField('createdAt');
                                          setMyMediaSortDirection('desc');
                                        }
                                      }}
                                      className="flex items-center hover:text-purple-400 transition-colors"
                                    >
                                      Uploaded
                                      {myMediaSortField === 'createdAt' ? (
                                        myMediaSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                      ) : (
                                        <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                      )}
                                    </button>
                                  </th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-800">
                                {myMedia.map((item: any) => (
                                  <tr key={item._id} className="hover:bg-gray-800/50 transition-colors">
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-3">
                                        {item.coverArt ? (
                                          <img
                                            src={item.coverArt}
                                            alt={item.title}
                                            className="h-10 w-10 rounded object-cover"
                                          />
                                        ) : (
                                          <div className="h-10 w-10 rounded bg-gray-700 flex items-center justify-center">
                                            <Music className="h-5 w-5 text-gray-500" />
                                          </div>
                                        )}
                                        <button
                                          onClick={() => navigate(`/tune/${String(item._id || item.uuid)}`)}
                                          className="text-white font-medium hover:text-purple-400 transition-colors text-left"
                                        >
                                          {item.title}
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-300">
                                      <ClickableArtistDisplay media={item} />
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="text-white font-medium">
                                        {penceToPounds(item.globalMediaAggregate || 0)}
                                      </div>
                                      <div className="text-xs text-gray-400">
                                        {item.bidCount || 0} Tips
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="text-white font-medium">
                                        {item.ownershipPercentage}%
                                      </div>
                                      <div className="text-xs text-gray-400 capitalize">
                                        {item.ownershipRole}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-sm">
                                      {new Date(item.uploadedAt || item.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3">
                                      <button
                                        onClick={() => navigate(`/tune/${String(item._id || item.uuid)}`)}
                                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                                      >
                                        View
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          
                          {/* Pagination */}
                          {myMediaTotal > 20 && (
                            <div className="px-4 py-3 bg-gray-800 border-t border-gray-700 flex items-center justify-between">
                              <div className="text-sm text-gray-400">
                                Showing {(myMediaPage - 1) * 20 + 1} to {Math.min(myMediaPage * 20, myMediaTotal)} of {myMediaTotal} media
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setMyMediaPage(prev => Math.max(1, prev - 1))}
                                  disabled={myMediaPage === 1}
                                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
                                >
                                  Previous
                                </button>
                                <span className="text-sm text-gray-400">
                                  Page {myMediaPage} of {Math.ceil(myMediaTotal / 20)}
                                </span>
                                <button
                                  onClick={() => setMyMediaPage(prev => prev + 1)}
                                  disabled={myMediaPage >= Math.ceil(myMediaTotal / 20)}
                                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
                                >
                                  Next
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {creatorActiveTab === 'labels' && (() => {
                    // Helper functions
                    const getRoleBadgeColor = (role: string, relationshipType: string) => {
                      if (relationshipType === 'admin') {
                        return role === 'owner' ? 'bg-purple-600' : 'bg-blue-600';
                      }
                      return 'bg-gray-600';
                    };

                    const getRoleLabel = (role: string, relationshipType: string) => {
                      if (relationshipType === 'admin') {
                        return role === 'owner' ? 'Owner' : 'Admin';
                      }
                      return role.charAt(0).toUpperCase() + role.slice(1);
                    };

                    // Filter and sort labels
                    const filteredLabels = (creatorStats.labels || []).filter((label: any) => {
                      // Filter by role
                      if (labelsFilterRole !== 'all') {
                        if (labelsFilterRole === 'owner' && !(label.relationshipType === 'admin' && label.role === 'owner')) {
                          return false;
                        }
                        if (labelsFilterRole === 'admin' && !(label.relationshipType === 'admin' && label.role === 'admin')) {
                          return false;
                        }
                        if (labelsFilterRole === 'affiliation' && label.relationshipType !== 'affiliation') {
                          return false;
                        }
                      }

                      // Filter by verification status
                      if (labelsFilterVerification !== 'all') {
                        if (labelsFilterVerification === 'verified' && label.verificationStatus !== 'verified') {
                          return false;
                        }
                        if (labelsFilterVerification === 'pending' && label.verificationStatus !== 'pending') {
                          return false;
                        }
                        if (labelsFilterVerification === 'unverified' && label.verificationStatus === 'verified') {
                          return false;
                        }
                      }

                      return true;
                    });

                    // Sort labels
                    const sortedLabels = [...filteredLabels].sort((a: any, b: any) => {
                      let comparison = 0;
                      
                      if (labelsSortField === 'name') {
                        comparison = a.name.localeCompare(b.name);
                      } else if (labelsSortField === 'totalBids') {
                        comparison = (a.totalBidAmount || 0) - (b.totalBidAmount || 0);
                      } else if (labelsSortField === 'artistCount') {
                        comparison = (a.artistCount || 0) - (b.artistCount || 0);
                      } else if (labelsSortField === 'releaseCount') {
                        comparison = (a.releaseCount || 0) - (b.releaseCount || 0);
                      } else if (labelsSortField === 'verificationStatus') {
                        comparison = (a.verificationStatus || 'unverified').localeCompare(b.verificationStatus || 'unverified');
                      }

                      return labelsSortDirection === 'asc' ? comparison : -comparison;
                    });

                    // Group labels by role
                    const ownedLabels = sortedLabels.filter((label: any) => 
                      label.relationshipType === 'admin' && label.role === 'owner'
                    );
                    const adminLabels = sortedLabels.filter((label: any) => 
                      label.relationshipType === 'admin' && label.role === 'admin'
                    );
                    const affiliatedLabels = sortedLabels.filter((label: any) => 
                      label.relationshipType === 'affiliation'
                    );

                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-white">My Labels</h3>
                          {(user?.creatorProfile?.verificationStatus === 'verified' || user?.role?.includes('admin')) && (
                            <button
                              onClick={() => setIsLabelModalOpen(true)}
                              className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Create Label
                            </button>
                          )}
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap gap-4 items-center bg-gray-900 rounded-lg p-4">
                          <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-400">Filter by:</span>
                          </div>
                          <select
                            value={labelsFilterRole}
                            onChange={(e) => setLabelsFilterRole(e.target.value)}
                            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="all">All Roles</option>
                            <option value="owner">Owner</option>
                            <option value="admin">Admin</option>
                            <option value="affiliation">Affiliated</option>
                          </select>
                          <select
                            value={labelsFilterVerification}
                            onChange={(e) => setLabelsFilterVerification(e.target.value)}
                            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="all">All Status</option>
                            <option value="verified">Verified</option>
                            <option value="pending">Pending</option>
                            <option value="unverified">Unverified</option>
                          </select>
                        </div>

                        {sortedLabels.length > 0 ? (
                          <div className="space-y-6">
                            {/* Owned Labels Section */}
                            {ownedLabels.length > 0 && (
                              <div>
                                <button
                                  onClick={() => setCollapsedSections(prev => ({ ...prev, owned: !prev.owned }))}
                                  className="w-full flex items-center justify-between mb-3 p-2 hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                  <h4 className="text-md font-semibold text-white flex items-center gap-2">
                                    <Building className="h-5 w-5 text-purple-400" />
                                    Labels You Own ({ownedLabels.length})
                                  </h4>
                                  {collapsedSections.owned ? (
                                    <ChevronDown className="h-5 w-5 text-gray-400" />
                                  ) : (
                                    <ChevronUp className="h-5 w-5 text-gray-400" />
                                  )}
                                </button>
                                {!collapsedSections.owned && (
                                <div className="bg-gray-900 rounded-lg overflow-hidden">
                                  <div className="overflow-x-auto">
                                    <table className="w-full">
                                      <thead className="bg-gray-800">
                                        <tr>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'name' ? '' : 'name');
                                                setLabelsSortDirection(labelsSortField === 'name' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Label
                                              {labelsSortField === 'name' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Artists</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Releases</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'totalBids' ? '' : 'totalBids');
                                                setLabelsSortDirection(labelsSortField === 'totalBids' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Total Bids
                                              {labelsSortField === 'totalBids' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-800">
                                        {ownedLabels.map((label: any) => (
                                          <tr key={label._id} className="hover:bg-gray-800/50 transition-colors">
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-3">
                                                <img 
                                                  src={label.profilePicture || DEFAULT_PROFILE_PIC} 
                                                  alt={label.name} 
                                                  className="h-10 w-10 rounded object-cover"
                                                  onError={(e) => {
                                                    e.currentTarget.src = DEFAULT_PROFILE_PIC;
                                                  }}
                                                />
                                                <button
                                                  onClick={() => navigate(`/label/${label.slug}`)}
                                                  className="text-white font-medium hover:text-purple-400 transition-colors text-left"
                                                >
                                                  {label.name}
                                                </button>
                                              </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-300">{label.artistCount || 0}</td>
                                            <td className="px-4 py-3 text-gray-300">{label.releaseCount || 0}</td>
                                            <td className="px-4 py-3">
                                              <div className="text-white font-medium">{penceToPounds(label.globalLabelAggregate || 0)}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                              {label.verificationStatus === 'verified' ? (
                                                <span className="px-2 py-1 bg-green-600 text-green-100 text-xs rounded">Verified</span>
                                              ) : (
                                                <span className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                                                  {label.verificationStatus === 'pending' ? 'Pending' : 'Unverified'}
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-2">
                                                <button
                                                  onClick={() => navigate(`/label/${label.slug}`)}
                                                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                                                >
                                                  View
                                                </button>
                                                <button
                                                  onClick={() => navigate(`/label/${label.slug}?edit=true`)}
                                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                                                >
                                                  <Settings className="h-3 w-3" />
                                                  Manage
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                                )}
                              </div>
                            )}

                            {/* Admin Labels Section */}
                            {adminLabels.length > 0 && (
                              <div>
                                <button
                                  onClick={() => setCollapsedSections(prev => ({ ...prev, admin: !prev.admin }))}
                                  className="w-full flex items-center justify-between mb-3 p-2 hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                  <h4 className="text-md font-semibold text-white flex items-center gap-2">
                                    <Users className="h-5 w-5 text-blue-400" />
                                    Labels You Admin ({adminLabels.length})
                                  </h4>
                                  {collapsedSections.admin ? (
                                    <ChevronDown className="h-5 w-5 text-gray-400" />
                                  ) : (
                                    <ChevronUp className="h-5 w-5 text-gray-400" />
                                  )}
                                </button>
                                {!collapsedSections.admin && (
                                <div className="bg-gray-900 rounded-lg overflow-hidden">
                                  <div className="overflow-x-auto">
                                    <table className="w-full">
                                      <thead className="bg-gray-800">
                                        <tr>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'name' ? '' : 'name');
                                                setLabelsSortDirection(labelsSortField === 'name' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Label
                                              {labelsSortField === 'name' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'artistCount' ? '' : 'artistCount');
                                                setLabelsSortDirection(labelsSortField === 'artistCount' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Artists
                                              {labelsSortField === 'artistCount' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'releaseCount' ? '' : 'releaseCount');
                                                setLabelsSortDirection(labelsSortField === 'releaseCount' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Releases
                                              {labelsSortField === 'releaseCount' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'totalBids' ? '' : 'totalBids');
                                                setLabelsSortDirection(labelsSortField === 'totalBids' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Total Bids
                                              {labelsSortField === 'totalBids' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'verificationStatus' ? '' : 'verificationStatus');
                                                setLabelsSortDirection(labelsSortField === 'verificationStatus' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Status
                                              {labelsSortField === 'verificationStatus' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-800">
                                        {adminLabels.map((label: any) => (
                                          <tr key={label._id} className="hover:bg-gray-800/50 transition-colors">
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-3">
                                                <img 
                                                  src={label.profilePicture || DEFAULT_PROFILE_PIC} 
                                                  alt={label.name} 
                                                  className="h-10 w-10 rounded object-cover"
                                                  onError={(e) => {
                                                    e.currentTarget.src = DEFAULT_PROFILE_PIC;
                                                  }}
                                                />
                                                <button
                                                  onClick={() => navigate(`/label/${label.slug}`)}
                                                  className="text-white font-medium hover:text-purple-400 transition-colors text-left"
                                                >
                                                  {label.name}
                                                </button>
                                              </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-300">{label.artistCount || 0}</td>
                                            <td className="px-4 py-3 text-gray-300">{label.releaseCount || 0}</td>
                                            <td className="px-4 py-3">
                                              <div className="text-white font-medium">{penceToPounds(label.globalLabelAggregate || 0)}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                              {label.verificationStatus === 'verified' ? (
                                                <span className="px-2 py-1 bg-green-600 text-green-100 text-xs rounded">Verified</span>
                                              ) : (
                                                <span className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                                                  {label.verificationStatus === 'pending' ? 'Pending' : 'Unverified'}
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-2">
                                                <button
                                                  onClick={() => navigate(`/label/${label.slug}`)}
                                                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                                                >
                                                  View
                                                </button>
                                                <button
                                                  onClick={() => navigate(`/label/${label.slug}?edit=true`)}
                                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                                                >
                                                  <Settings className="h-3 w-3" />
                                                  Manage
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                                )}
                              </div>
                            )}

                            {/* Affiliated Labels Section */}
                            {affiliatedLabels.length > 0 && (
                              <div>
                                <button
                                  onClick={() => setCollapsedSections(prev => ({ ...prev, affiliated: !prev.affiliated }))}
                                  className="w-full flex items-center justify-between mb-3 p-2 hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                  <h4 className="text-md font-semibold text-white flex items-center gap-2">
                                    <Music className="h-5 w-5 text-gray-400" />
                                    Labels You're Affiliated With ({affiliatedLabels.length})
                                  </h4>
                                  {collapsedSections.affiliated ? (
                                    <ChevronDown className="h-5 w-5 text-gray-400" />
                                  ) : (
                                    <ChevronUp className="h-5 w-5 text-gray-400" />
                                  )}
                                </button>
                                {!collapsedSections.affiliated && (
                                <div className="bg-gray-900 rounded-lg overflow-hidden">
                                  <div className="overflow-x-auto">
                                    <table className="w-full">
                                      <thead className="bg-gray-800">
                                        <tr>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'name' ? '' : 'name');
                                                setLabelsSortDirection(labelsSortField === 'name' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Label
                                              {labelsSortField === 'name' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Your Role</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'artistCount' ? '' : 'artistCount');
                                                setLabelsSortDirection(labelsSortField === 'artistCount' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Artists
                                              {labelsSortField === 'artistCount' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'releaseCount' ? '' : 'releaseCount');
                                                setLabelsSortDirection(labelsSortField === 'releaseCount' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Releases
                                              {labelsSortField === 'releaseCount' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'totalBids' ? '' : 'totalBids');
                                                setLabelsSortDirection(labelsSortField === 'totalBids' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Total Bids
                                              {labelsSortField === 'totalBids' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                            <button
                                              onClick={() => {
                                                setLabelsSortField(labelsSortField === 'verificationStatus' ? '' : 'verificationStatus');
                                                setLabelsSortDirection(labelsSortField === 'verificationStatus' && labelsSortDirection === 'asc' ? 'desc' : 'asc');
                                              }}
                                              className="flex items-center hover:text-purple-400 transition-colors"
                                            >
                                              Status
                                              {labelsSortField === 'verificationStatus' ? (
                                                labelsSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                              ) : (
                                                <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                              )}
                                            </button>
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-800">
                                        {affiliatedLabels.map((label: any) => (
                                          <tr key={label._id} className="hover:bg-gray-800/50 transition-colors">
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-3">
                                                <img 
                                                  src={label.profilePicture || DEFAULT_PROFILE_PIC} 
                                                  alt={label.name} 
                                                  className="h-10 w-10 rounded object-cover"
                                                  onError={(e) => {
                                                    e.currentTarget.src = DEFAULT_PROFILE_PIC;
                                                  }}
                                                />
                                                <button
                                                  onClick={() => navigate(`/label/${label.slug}`)}
                                                  className="text-white font-medium hover:text-purple-400 transition-colors text-left"
                                                >
                                                  {label.name}
                                                </button>
                                              </div>
                                            </td>
                                            <td className="px-4 py-3">
                                              <span className={`px-2 py-1 ${getRoleBadgeColor(label.role || 'artist', label.relationshipType || 'affiliation')} text-white text-xs rounded capitalize`}>
                                                {getRoleLabel(label.role || 'artist', label.relationshipType || 'affiliation')}
                                              </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-300">{label.artistCount || 0}</td>
                                            <td className="px-4 py-3 text-gray-300">{label.releaseCount || 0}</td>
                                            <td className="px-4 py-3">
                                              <div className="text-white font-medium">{penceToPounds(label.globalLabelAggregate || 0)}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                              {label.verificationStatus === 'verified' ? (
                                                <span className="px-2 py-1 bg-green-600 text-green-100 text-xs rounded">Verified</span>
                                              ) : (
                                                <span className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                                                  {label.verificationStatus === 'pending' ? 'Pending' : 'Unverified'}
                                                </span>
                                              )}
                                            </td>
                                            <td className="px-4 py-3">
                                              <button
                                                onClick={() => navigate(`/label/${label.slug}`)}
                                                className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                                              >
                                                View
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-gray-900 rounded-lg">
                            <Building className="h-12 w-12 mx-auto text-gray-500 mb-4" />
                            <p className="text-gray-400 mb-2">No labels found</p>
                            <p className="text-gray-500 text-sm mb-4">
                              {labelsFilterRole !== 'all' || labelsFilterVerification !== 'all' 
                                ? 'Try adjusting your filters' 
                                : 'Create your first label or join an existing one!'}
                            </p>
                            {(labelsFilterRole !== 'all' || labelsFilterVerification !== 'all') && (
                              <button
                                onClick={() => {
                                  setLabelsFilterRole('all');
                                  setLabelsFilterVerification('all');
                                }}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors mr-2"
                              >
                                Clear Filters
                              </button>
                            )}
                            {(user?.creatorProfile?.verificationStatus === 'verified' || user?.role?.includes('admin')) && (
                              <button
                                onClick={() => setIsLabelModalOpen(true)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                              >
                                Create Label
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {creatorActiveTab === 'collectives' && (() => {
                    // Helper functions for collectives
                    const getCollectiveRoleBadgeColor = (role: string) => {
                      if (role === 'founder') return 'bg-purple-600';
                      if (role === 'admin') return 'bg-blue-600';
                      return 'bg-gray-600';
                    };

                    const getCollectiveRoleLabel = (role: string) => {
                      if (role === 'founder') return 'Founder';
                      if (role === 'admin') return 'Admin';
                      return 'Member';
                    };

                    // Filter and sort collectives
                    const filteredCollectives = collectives.filter((collective: any) => {
                      // Filter by role
                      if (collectivesFilterRole !== 'all') {
                        if (collectivesFilterRole === 'founder' && collective.role !== 'founder') {
                          return false;
                        }
                        if (collectivesFilterRole === 'admin' && collective.role !== 'admin') {
                          return false;
                        }
                        if (collectivesFilterRole === 'member' && collective.role !== 'member') {
                          return false;
                        }
                      }

                      // Filter by verification status
                      if (collectivesFilterVerification !== 'all') {
                        if (collectivesFilterVerification === 'verified' && collective.verificationStatus !== 'verified') {
                          return false;
                        }
                        if (collectivesFilterVerification === 'pending' && collective.verificationStatus !== 'pending') {
                          return false;
                        }
                        if (collectivesFilterVerification === 'unverified' && collective.verificationStatus === 'verified') {
                          return false;
                        }
                      }

                      return true;
                    });

                    // Sort collectives
                    const sortedCollectives = [...filteredCollectives].sort((a: any, b: any) => {
                      let comparison = 0;
                      
                      if (collectivesSortField === 'name') {
                        comparison = a.name.localeCompare(b.name);
                      } else if (collectivesSortField === 'totalBids') {
                        comparison = (a.globalCollectiveAggregate || 0) - (b.globalCollectiveAggregate || 0);
                      } else if (collectivesSortField === 'memberCount') {
                        comparison = (a.memberCount || 0) - (b.memberCount || 0);
                      } else if (collectivesSortField === 'releaseCount') {
                        comparison = (a.releaseCount || 0) - (b.releaseCount || 0);
                      } else if (collectivesSortField === 'verificationStatus') {
                        comparison = (a.verificationStatus || 'unverified').localeCompare(b.verificationStatus || 'unverified');
                      }

                      return collectivesSortDirection === 'asc' ? comparison : -comparison;
                    });

                    // Group collectives by role
                    const ownedCollectives = sortedCollectives.filter((collective: any) => 
                      collective.role === 'founder'
                    );
                    const adminCollectives = sortedCollectives.filter((collective: any) => 
                      collective.role === 'admin'
                    );
                    const memberCollectives = sortedCollectives.filter((collective: any) => 
                      collective.role === 'member'
                    );

                    return (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-white">My Collectives</h3>
                          {(user?.creatorProfile?.verificationStatus === 'verified' || user?.role?.includes('admin')) && (
                            <button
                              onClick={() => setIsCollectiveModalOpen(true)}
                              className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Create Collective
                            </button>
                          )}
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap gap-4 items-center bg-gray-900 rounded-lg p-4">
                          <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-400">Filter by:</span>
                          </div>
                          <select
                            value={collectivesFilterRole}
                            onChange={(e) => setCollectivesFilterRole(e.target.value)}
                            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="all">All Roles</option>
                            <option value="founder">Founder</option>
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                          </select>
                          <select
                            value={collectivesFilterVerification}
                            onChange={(e) => setCollectivesFilterVerification(e.target.value)}
                            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
                          >
                            <option value="all">All Status</option>
                            <option value="verified">Verified</option>
                            <option value="pending">Pending</option>
                            <option value="unverified">Unverified</option>
                          </select>
                        </div>

                        {isLoadingCollectives ? (
                          <div className="text-center py-8">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
                            <p className="text-gray-400 mt-2">Loading collectives...</p>
                          </div>
                        ) : sortedCollectives.length > 0 ? (
                          <div className="space-y-6">
                            {/* Owned Collectives Section */}
                            {ownedCollectives.length > 0 && (
                              <div>
                                <button
                                  onClick={() => setCollapsedCollectiveSections(prev => ({ ...prev, owned: !prev.owned }))}
                                  className="w-full flex items-center justify-between mb-3 p-2 hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                  <h4 className="text-md font-semibold text-white flex items-center gap-2">
                                    <Award className="h-5 w-5 text-purple-400" />
                                    Collectives You Own ({ownedCollectives.length})
                                  </h4>
                                  {collapsedCollectiveSections.owned ? (
                                    <ChevronDown className="h-5 w-5 text-gray-400" />
                                  ) : (
                                    <ChevronUp className="h-5 w-5 text-gray-400" />
                                  )}
                                </button>
                                {!collapsedCollectiveSections.owned && (
                                  <div className="bg-gray-900 rounded-lg overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <table className="w-full">
                                        <thead className="bg-gray-800">
                                          <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                              <button
                                                onClick={() => {
                                                  setCollectivesSortField(collectivesSortField === 'name' ? '' : 'name');
                                                  setCollectivesSortDirection(collectivesSortField === 'name' && collectivesSortDirection === 'asc' ? 'desc' : 'asc');
                                                }}
                                                className="flex items-center hover:text-purple-400 transition-colors"
                                              >
                                                Collective
                                                {collectivesSortField === 'name' ? (
                                                  collectivesSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                                ) : (
                                                  <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                                )}
                                              </button>
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                              <button
                                                onClick={() => {
                                                  setCollectivesSortField(collectivesSortField === 'memberCount' ? '' : 'memberCount');
                                                  setCollectivesSortDirection(collectivesSortField === 'memberCount' && collectivesSortDirection === 'asc' ? 'desc' : 'asc');
                                                }}
                                                className="flex items-center hover:text-purple-400 transition-colors"
                                              >
                                                Members
                                                {collectivesSortField === 'memberCount' ? (
                                                  collectivesSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                                ) : (
                                                  <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                                )}
                                              </button>
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                              <button
                                                onClick={() => {
                                                  setCollectivesSortField(collectivesSortField === 'releaseCount' ? '' : 'releaseCount');
                                                  setCollectivesSortDirection(collectivesSortField === 'releaseCount' && collectivesSortDirection === 'asc' ? 'desc' : 'asc');
                                                }}
                                                className="flex items-center hover:text-purple-400 transition-colors"
                                              >
                                                Releases
                                                {collectivesSortField === 'releaseCount' ? (
                                                  collectivesSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                                ) : (
                                                  <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                                )}
                                              </button>
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                              <button
                                                onClick={() => {
                                                  setCollectivesSortField(collectivesSortField === 'totalBids' ? '' : 'totalBids');
                                                  setCollectivesSortDirection(collectivesSortField === 'totalBids' && collectivesSortDirection === 'asc' ? 'desc' : 'asc');
                                                }}
                                                className="flex items-center hover:text-purple-400 transition-colors"
                                              >
                                                Total Bids
                                                {collectivesSortField === 'totalBids' ? (
                                                  collectivesSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                                ) : (
                                                  <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                                )}
                                              </button>
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                              <button
                                                onClick={() => {
                                                  setCollectivesSortField(collectivesSortField === 'verificationStatus' ? '' : 'verificationStatus');
                                                  setCollectivesSortDirection(collectivesSortField === 'verificationStatus' && collectivesSortDirection === 'asc' ? 'desc' : 'asc');
                                                }}
                                                className="flex items-center hover:text-purple-400 transition-colors"
                                              >
                                                Status
                                                {collectivesSortField === 'verificationStatus' ? (
                                                  collectivesSortDirection === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                                                ) : (
                                                  <ArrowUpDown className="h-4 w-4 ml-1 text-gray-500" />
                                                )}
                                              </button>
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                          {ownedCollectives.map((collective: any) => (
                                            <tr key={collective._id} className="hover:bg-gray-800/50 transition-colors">
                                              <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                  <img 
                                                    src={collective.profilePicture || DEFAULT_PROFILE_PIC} 
                                                    alt={collective.name} 
                                                    className="h-10 w-10 rounded object-cover"
                                                    onError={(e) => {
                                                      e.currentTarget.src = DEFAULT_PROFILE_PIC;
                                                    }}
                                                  />
                                                  <button
                                                    onClick={() => navigate(`/collective/${collective.slug}`)}
                                                    className="text-white font-medium hover:text-purple-400 transition-colors text-left"
                                                  >
                                                    {collective.name}
                                                  </button>
                                                </div>
                                              </td>
                                              <td className="px-4 py-3 text-gray-300">{collective.memberCount || 0}</td>
                                              <td className="px-4 py-3 text-gray-300">{collective.releaseCount || 0}</td>
                                              <td className="px-4 py-3">
                                                <div className="text-white font-medium">{penceToPounds(collective.globalCollectiveAggregate || 0)}</div>
                                              </td>
                                              <td className="px-4 py-3">
                                                {collective.verificationStatus === 'verified' ? (
                                                  <span className="px-2 py-1 bg-green-600 text-green-100 text-xs rounded">Verified</span>
                                                ) : (
                                                  <span className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                                                    {collective.verificationStatus === 'pending' ? 'Pending' : 'Unverified'}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                  <button
                                                    onClick={() => navigate(`/collective/${collective.slug}`)}
                                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                                                  >
                                                    View
                                                  </button>
                                                  <button
                                                    onClick={() => navigate(`/collective/${collective.slug}?edit=true`)}
                                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                                                  >
                                                    <Settings className="h-3 w-3" />
                                                    Manage
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Admin Collectives Section */}
                            {adminCollectives.length > 0 && (
                              <div>
                                <button
                                  onClick={() => setCollapsedCollectiveSections(prev => ({ ...prev, admin: !prev.admin }))}
                                  className="w-full flex items-center justify-between mb-3 p-2 hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                  <h4 className="text-md font-semibold text-white flex items-center gap-2">
                                    <Users className="h-5 w-5 text-blue-400" />
                                    Collectives You Admin ({adminCollectives.length})
                                  </h4>
                                  {collapsedCollectiveSections.admin ? (
                                    <ChevronDown className="h-5 w-5 text-gray-400" />
                                  ) : (
                                    <ChevronUp className="h-5 w-5 text-gray-400" />
                                  )}
                                </button>
                                {!collapsedCollectiveSections.admin && (
                                  <div className="bg-gray-900 rounded-lg overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <table className="w-full">
                                        <thead className="bg-gray-800">
                                          <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Collective</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Members</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Releases</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Total Bids</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                          {adminCollectives.map((collective: any) => (
                                            <tr key={collective._id} className="hover:bg-gray-800/50 transition-colors">
                                              <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                  <img 
                                                    src={collective.profilePicture || DEFAULT_PROFILE_PIC} 
                                                    alt={collective.name} 
                                                    className="h-10 w-10 rounded object-cover"
                                                    onError={(e) => {
                                                      e.currentTarget.src = DEFAULT_PROFILE_PIC;
                                                    }}
                                                  />
                                                  <button
                                                    onClick={() => navigate(`/collective/${collective.slug}`)}
                                                    className="text-white font-medium hover:text-purple-400 transition-colors text-left"
                                                  >
                                                    {collective.name}
                                                  </button>
                                                </div>
                                              </td>
                                              <td className="px-4 py-3 text-gray-300">{collective.memberCount || 0}</td>
                                              <td className="px-4 py-3 text-gray-300">{collective.releaseCount || 0}</td>
                                              <td className="px-4 py-3">
                                                <div className="text-white font-medium">{penceToPounds(collective.globalCollectiveAggregate || 0)}</div>
                                              </td>
                                              <td className="px-4 py-3">
                                                {collective.verificationStatus === 'verified' ? (
                                                  <span className="px-2 py-1 bg-green-600 text-green-100 text-xs rounded">Verified</span>
                                                ) : (
                                                  <span className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                                                    {collective.verificationStatus === 'pending' ? 'Pending' : 'Unverified'}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                  <button
                                                    onClick={() => navigate(`/collective/${collective.slug}`)}
                                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                                                  >
                                                    View
                                                  </button>
                                                  <button
                                                    onClick={() => navigate(`/collective/${collective.slug}?edit=true`)}
                                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors flex items-center gap-1"
                                                  >
                                                    <Settings className="h-3 w-3" />
                                                    Manage
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Member Collectives Section */}
                            {memberCollectives.length > 0 && (
                              <div>
                                <button
                                  onClick={() => setCollapsedCollectiveSections(prev => ({ ...prev, member: !prev.member }))}
                                  className="w-full flex items-center justify-between mb-3 p-2 hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                  <h4 className="text-md font-semibold text-white flex items-center gap-2">
                                    <Music className="h-5 w-5 text-gray-400" />
                                    Collectives You're a Member Of ({memberCollectives.length})
                                  </h4>
                                  {collapsedCollectiveSections.member ? (
                                    <ChevronDown className="h-5 w-5 text-gray-400" />
                                  ) : (
                                    <ChevronUp className="h-5 w-5 text-gray-400" />
                                  )}
                                </button>
                                {!collapsedCollectiveSections.member && (
                                  <div className="bg-gray-900 rounded-lg overflow-hidden">
                                    <div className="overflow-x-auto">
                                      <table className="w-full">
                                        <thead className="bg-gray-800">
                                          <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Collective</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Your Role</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Members</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Releases</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Total Bids</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                          {memberCollectives.map((collective: any) => (
                                            <tr key={collective._id} className="hover:bg-gray-800/50 transition-colors">
                                              <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                  <img 
                                                    src={collective.profilePicture || DEFAULT_PROFILE_PIC} 
                                                    alt={collective.name} 
                                                    className="h-10 w-10 rounded object-cover"
                                                    onError={(e) => {
                                                      e.currentTarget.src = DEFAULT_PROFILE_PIC;
                                                    }}
                                                  />
                                                  <button
                                                    onClick={() => navigate(`/collective/${collective.slug}`)}
                                                    className="text-white font-medium hover:text-purple-400 transition-colors text-left"
                                                  >
                                                    {collective.name}
                                                  </button>
                                                </div>
                                              </td>
                                              <td className="px-4 py-3">
                                                <span className={`px-2 py-1 ${getCollectiveRoleBadgeColor(collective.role || 'member')} text-white text-xs rounded`}>
                                                  {getCollectiveRoleLabel(collective.role || 'member')}
                                                </span>
                                              </td>
                                              <td className="px-4 py-3 text-gray-300">{collective.memberCount || 0}</td>
                                              <td className="px-4 py-3 text-gray-300">{collective.releaseCount || 0}</td>
                                              <td className="px-4 py-3">
                                                <div className="text-white font-medium">{penceToPounds(collective.globalCollectiveAggregate || 0)}</div>
                                              </td>
                                              <td className="px-4 py-3">
                                                {collective.verificationStatus === 'verified' ? (
                                                  <span className="px-2 py-1 bg-green-600 text-green-100 text-xs rounded">Verified</span>
                                                ) : (
                                                  <span className="px-2 py-1 bg-gray-600 text-gray-300 text-xs rounded">
                                                    {collective.verificationStatus === 'pending' ? 'Pending' : 'Unverified'}
                                                  </span>
                                                )}
                                              </td>
                                              <td className="px-4 py-3">
                                                <button
                                                  onClick={() => navigate(`/collective/${collective.slug}`)}
                                                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                                                >
                                                  View
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-gray-900 rounded-lg">
                            <Users className="h-12 w-12 mx-auto text-gray-500 mb-4" />
                            <p className="text-gray-400 mb-2">No collectives found</p>
                            <p className="text-gray-500 text-sm mb-4">
                              {collectivesFilterRole !== 'all' || collectivesFilterVerification !== 'all' 
                                ? 'Try adjusting your filters' 
                                : 'Create your first collective or join an existing one!'}
                            </p>
                            {(collectivesFilterRole !== 'all' || collectivesFilterVerification !== 'all') && (
                              <button
                                onClick={() => {
                                  setCollectivesFilterRole('all');
                                  setCollectivesFilterVerification('all');
                                }}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors mr-2"
                              >
                                Clear Filters
                              </button>
                            )}
                            {(user?.creatorProfile?.verificationStatus === 'verified' || user?.role?.includes('admin')) && (
                              <button
                                onClick={() => setIsCollectiveModalOpen(true)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                              >
                                Create Collective
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : null}
            </div>
          </div>
        )}

      {/* Add Tune Section */}
      <div className="card mb-8">
        <div className="flex items-center mb-4">
          <Music className="h-6 w-6 text-purple-400 mr-2" />
          <h2 className="text-2xl font-semibold text-white">Add Tune</h2>
        </div>
        
        <QuotaWarningBanner className="mb-4" />
        
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={addTuneQuery}
              onChange={(e) => setAddTuneQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTuneSearch();
                }
              }}
                placeholder="Search or paste YouTube URL..."
              className="w-full bg-gray-900 border border-gray-600 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            onClick={handleAddTuneSearch}
            disabled={isSearchingTune || !addTuneQuery.trim()}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSearchingTune ? 'Searching...' : 'Search'}
          </button>
        </div>

        {addTuneQuery && (
          <div className="flex items-center space-x-2 text-xs text-gray-500 bg-purple-50 dark:bg-purple-900/20 p-2 rounded">
            <LinkIcon className="h-3 w-3 text-purple-600 dark:text-purple-400" />
            <span>
              💡 <strong>Tip:</strong> Paste a YouTube URL directly instead of searching to use 100x fewer API credits!
            </span>
          </div>
        )}
        
        {/* Search Results */}
        {addTuneResults.length > 0 && (
        <div className="mt-4 space-y-2">
            {addTuneResults.map((result) => (
                <div
                  key={result._id || result.id}
                  className="bg-black/20 rounded px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div className="flex items-start md:items-center gap-3 flex-1 min-w-0">
                  {result.coverArt && (
                    <img 
                      src={result.coverArt} 
                      alt={result.title}
                        className="h-14 w-14 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-white font-medium text-sm md:text-base truncate">
                        {result.title}
                      </div>
                      <div className="text-gray-400 text-xs md:text-sm truncate">
                        {result.artist}
                      </div>
                      {result.duration && (
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3 w-3 text-gray-500" />
                          <span className="text-gray-500 text-xs">{formatDuration(result.duration)}</span>
                        </div>
                      )}
                      {result.isLocal && (
                        <span className="inline-block px-2 py-0.5 bg-purple-900 text-purple-200 text-xs rounded">
                          In Database
                        </span>
                      )}
                    </div>
                </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div>
                      <div className="text-gray-400 text-xs mb-1">Bid Amount</div>
                    <input
                      type="number"
                      min={minimumBid}
                      step="0.01"
                        value={addTuneBidAmounts[result._id || result.id || ''] ?? ''}
                      onChange={(e) => {
                          const value = e.target.value;
                          setAddTuneBidAmounts((prev) => ({
                          ...prev,
                            [result._id || result.id || '']: value
                        }));
                      }}
                        className="w-full sm:w-24 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                    />
                  </div>
                  <button
                    disabled={isAddingTune}
                      onClick={() => startAddTune(result)}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                    >
                      <Play className="h-4 w-4" />
                      <span>
                        {(() => {
                          const raw = addTuneBidAmounts[result._id || result.id || ''] ?? '';
                          const parsed = parseFloat(raw);
                          if (!Number.isFinite(parsed)) {
                            return 'Add';
                          }
                          return `Bid £${parsed.toFixed(2)}`;
                        })()}
                      </span>
                  </button>
                </div>
            </div>
          ))}
        </div>
        )}
      </div>

      </div>

{/* User Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center">
            <div className="bg-primary-100 p-3 rounded-lg">
              <Coins className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Balance</p>
                <p className="text-base md:text-2xl font-semibold text-white">
                {penceToPounds(user?.balance || 0)}
              </p>
            </div>
          </div>
        </div>

          <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center">
            <div className="bg-green-100 p-3 rounded-lg">
              <Globe className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Global Rank</p>
                <p className="text-base md:text-2xl font-semibold text-white">
                #{user?.globalUserAggregateRank || 'N/A'}
              </p>
            </div>
          </div>
        </div>

          <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Gift className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">TuneBytes</p>
                <p className="text-base md:text-2xl font-semibold text-white">
                {(user as any)?.tuneBytes?.toFixed(0) || '0'}
              </p>
            </div>
          </div>
        </div>

          <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Coins className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Avg Tip</p>
                <p className="text-base md:text-2xl font-semibold text-white">
                {penceToPounds(user?.globalUserBidAvg || 0)}
              </p>
            </div>
          </div>
        </div>

          <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-lg">
              <AudioLines className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Total Tips</p>
                <p className="text-base md:text-2xl font-semibold text-white">
                {user?.globalUserBids || 0}
              </p>
            </div>
          </div>
        </div>

          <div className="bg-gray-900 rounded-lg p-4">
          <div className="flex items-center">
            <div className="bg-orange-100 p-3 rounded-lg">
              <UserPlus className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Invite Credits</p>
                <p className="text-base md:text-2xl font-semibold text-white">
                {user?.inviteCredits ?? 10}
              </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* User Profile Prompts - for all users */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-8">
        <UserProfilePrompts user={user} />
      </div>

      {/* Become a Creator Banner */}
      {user && 
        !isCreatorBannerDismissed &&
        !user.role?.includes('creator') && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-500/30 rounded-lg p-6 flex flex-col md:flex-row items-center justify-between gap-4 relative">
            <button
              onClick={handleDismissCreatorBanner}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 pr-8">
              <h3 className="text-xl font-semibold text-white mb-2">Become a Creator</h3>
              <p className="text-gray-300">
                {user.creatorProfile?.verificationStatus === 'pending' 
                  ? 'Your application is under review' 
                  : user.creatorProfile?.verificationStatus === 'rejected'
                  ? 'Re-apply to become a verified creator'
                  : 'Join our community of verified creators and start sharing your music'}
              </p>
            </div>
            <button
              onClick={() => navigate('/creator/register')}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 whitespace-nowrap"
            >
              <Award className="w-5 h-5" />
              <span>
                {user.creatorProfile?.verificationStatus === 'pending' 
                  ? 'View Application' 
                  : user.creatorProfile?.verificationStatus === 'rejected'
                  ? 'Re-apply'
                  : 'Apply Now'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Invited Users Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-8">
        <div className="card flex items-center mb-4">
          <Users className="h-6 w-6 text-purple-400 mr-2" />
          <h2 className="text-2xl font-semibold text-white">Invited Users</h2>
          <span className="ml-3 px-3 py-1 bg-purple-900 text-purple-200 text-sm rounded-full">
            {invitedUsers.length}
          </span>
        </div>
        
        {/* Invite Sharing Section - Always visible */}
        {!isLoadingInvited && (
          <div className="bg-black/30 border border-purple-500/20 rounded-lg p-4 mb-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <p className="text-sm text-gray-300">Share your invite link</p>
                <p className="text-xs text-gray-500 mt-1 break-all">
                  {inviteLink}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleCopyInvite}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
                >
                  <Copy className="h-4 w-4" />
                  Copy Invite
                </button>
                <button
                  onClick={handleEmailInvite}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                >
                  <Mail className="h-4 w-4" />
                  Email
                </button>
                <button
                  onClick={handleFacebookShare}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm"
                >
                  <Facebook className="h-4 w-4" />
                  Facebook
                </button>
                <button
                  onClick={handleInstagramShare}
                  className="flex items-center gap-2 px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors text-sm"
                >
                  <Instagram className="h-4 w-4" />
                  Instagram
                </button>
                <button
                  onClick={handleSystemShare}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              </div>
            </div>
          </div>
        )}
        
        {isLoadingInvited && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          </div>
        )}
        {!isLoadingInvited && invitedUsers.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-500" />
            <p>No users have signed up with your invite code yet.</p>
            <p className="text-sm mt-2">Share your invite code: <span className="font-mono text-purple-400">{user?.personalInviteCode}</span></p>
          </div>
        )}
        {!isLoadingInvited && invitedUsers.length > 0 && (
          <div className="space-y-3">
            {(showAllInvitedUsers ? invitedUsers : invitedUsers.slice(0, 3)).map((invitedUser) => {
              const userName = (invitedUser.givenName || invitedUser.familyName) 
                ? `${invitedUser.givenName || ''} ${invitedUser.familyName || ''}`.trim()
                : `Joined ${new Date(invitedUser.createdAt).toLocaleDateString()}`;
              
              return (
                <div key={invitedUser._id || invitedUser.id} className="flex items-center gap-3 bg-black/20 rounded px-4 py-3">
                  <img 
                    src={invitedUser.profilePic || DEFAULT_PROFILE_PIC} 
                    alt={invitedUser.username} 
                    className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_PROFILE_PIC;
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-medium">{invitedUser.username}</div>
                    <div className="text-gray-400 text-sm">
                      {userName}
                    </div>
                    {(invitedUser.givenName || invitedUser.familyName) && (
                      <div className="text-gray-500 text-xs mt-1">
                        Joined {new Date(invitedUser.createdAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {invitedUsers.length > 3 && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setShowAllInvitedUsers(!showAllInvitedUsers)}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <span>{showAllInvitedUsers ? 'Show Less' : `Show More (${invitedUsers.length - 3} more)`}</span>
                  {showAllInvitedUsers ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tune Library Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="card flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Music className="h-6 w-6 text-purple-400 mr-2" />
            <h2 className="text-2xl font-semibold text-white">Tune Library</h2>
            <span className="ml-3 px-3 py-1 bg-purple-900 text-purple-200 text-sm rounded-full">
              {tuneLibrary.length}
            </span>
          </div>
          {user && (user._id || user.uuid) && (
            <button
              onClick={() => navigate(`/user/${user._id || user.uuid}?view=tip-history`)}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white rounded-lg transition-colors"
            >
              <History className="h-4 w-4" />
              <span>View Tip History</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
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
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center">
                      Title
                      {getSortIcon('title')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('artist')}
                  >
                    <div className="flex items-center">
                      Artist
                      {getSortIcon('artist')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('duration')}
                  >
                    <div className="flex items-center">
                      Duration
                      {getSortIcon('duration')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('globalMediaAggregateAvg')}
                  >
                    <div className="flex items-center">
                      Avg Tip
                      {getSortIcon('globalMediaAggregateAvg')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('globalUserMediaAggregate')}
                  >
                    <div className="flex items-center">
                      Your Tip
                      {getSortIcon('globalUserMediaAggregate')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('tuneBytesEarned')}
                  >
                    <div className="flex items-center">
                      TuneBytes
                      {getSortIcon('tuneBytesEarned')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {(showAllLibrary ? getSortedLibrary() : getSortedLibrary().slice(0, 5)).map((item) => (
                  <tr key={item.mediaId} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="relative w-12 h-12 group cursor-pointer" onClick={() => handlePlay(item)}>
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/tune/${item.mediaId || item.mediaUuid}`)}
                        className="text-sm font-medium text-white hover:text-purple-400 transition-colors text-left"
                      >
                        {item.title}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-300">
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
                        onClick={() => handleIncreaseBid(item)}
                        className="inline-flex items-center px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                        title="Increase tip"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Tip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {getSortedLibrary().length > 5 && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => setShowAllLibrary(!showAllLibrary)}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <span>{showAllLibrary ? 'Show Less' : `Show More (${getSortedLibrary().length - 5} more)`}</span>
                  {showAllLibrary ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        )}

      {/* Create Label Modal */}
      <LabelCreateModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
      />
      
      {/* Create Collective Modal */}
      <CollectiveCreateModal
        isOpen={isCollectiveModalOpen}
        onClose={() => setIsCollectiveModalOpen(false)}
      />


    </div>
      </div>

      {/* Media Validation Modal */}
      <MediaValidationModal
        isOpen={showValidationModal}
        onConfirm={handleValidationConfirm}
        onCancel={handleValidationCancel}
        mediaTitle={pendingMedia?.title}
        mediaArtist={pendingMedia?.artist}
        warnings={validationWarnings}
        category={validationCategory}
        duration={validationDuration}
      />

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

      <EmailInviteModal
        isOpen={isEmailInviteModalOpen}
        onClose={() => setIsEmailInviteModalOpen(false)}
        inviteCode={user?.personalInviteCode || ''}
        inviterUsername={user?.username || ''}
      />
    </React.Fragment>
  );
}

export default Dashboard;
