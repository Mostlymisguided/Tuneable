import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { DEFAULT_PROFILE_PIC, DEFAULT_COVER_ART } from '../constants';
import { 
  Music, 
  User, 
  Calendar, 
  Clock, 
  Heart, 
  ThumbsUp,
  Trash2,
  Play,
  ExternalLink,
  Globe,
  Tag,
  Mic,
  Disc,
  Headphones,
  Volume2,
  Award,
  X,
  Save,
  Youtube,
  Music2,
  Coins,
  Loader2,
  Flag,
  Building,
  CheckCircle,
  Users
} from 'lucide-react';
import { mediaAPI, claimAPI, labelAPI, collectiveAPI } from '../lib/api';
import TopBidders from '../components/TopBidders';
import TopSupporters from '../components/TopSupporters';
import ReportModal from '../components/ReportModal';
import { useAuth } from '../contexts/AuthContext';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { canEditMedia } from '../utils/permissionHelpers';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
import { getCreatorDisplay } from '../utils/creatorDisplay';

interface Media {
  _id: string;
  uuid: string;
  title: string;
  artist: string;
  producer?: string;
  featuring?: string[];
  rightsHolder?: string;
  rightsHolderEmail?: string;
  album?: string;
  EP?: string;
  genre?: string;
  genres?: string[];
  releaseDate?: string;
  duration?: number;
  coverArt?: string;
  explicit?: boolean;
  isrc?: string;
  upc?: string;
  globalMediaAggregate?: number; // Updated to schema grammar
  globalMediaBidTop?: number;
  globalMediaAggregateTop?: number;
  globalMediaAggregateTopRank?: number;
  bpm?: number;
  pitch?: number;
  key?: string;
  elements?: string[];
  tags?: string[];
  category?: string;
  timeSignature?: string;
  bitrate?: number;
  sampleRate?: number;
  lyrics?: string;
  playCount?: number;
  popularity?: number;
  sources?: { [key: string]: string };
  externalIds?: { [key: string]: string };
  bids?: Bid[];
  comments?: Comment[];
  addedBy?: {
    _id: string;
    username: string;
    profilePic?: string;
    uuid: string;
  };
  uploadedAt?: string;
  updatedAt?: string;
  label?: Array<{
    name?: string;
    labelId?: {
      _id?: string;
      name: string;
      slug?: string;
      logo?: string;
      verificationStatus?: string;
      stats?: {
        artistCount?: number;
        releaseCount?: number;
        totalBidAmount?: number;
      };
    } | string;
    verified?: boolean;
    catalogNumber?: string;
    releaseDate?: string | Date;
  }>;
}

interface Bid {
  _id: string;
  userId: {
    _id: string;
    username: string;
    profilePic?: string;
    uuid: string;
  };
  amount: number;
  createdAt: string;
}

interface Comment {
  _id: string;
  content: string;
  userId: {
    _id: string;
    username: string;
    profilePic?: string;
    uuid: string;
  };
  likeCount: number;
  likes: string[];
  createdAt: string;
  updatedAt: string;
}

const TuneProfile: React.FC = () => {
  const { mediaId: mediaId } = useParams<{ mediaId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [media, setMedia] = useState<Media | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  
  // Claim tune modals
  const [showCreatorSignupModal, setShowCreatorSignupModal] = useState(false);
  const [showClaimVerificationModal, setShowClaimVerificationModal] = useState(false);
  const [claimProofText, setClaimProofText] = useState('');
  const [claimProofFiles, setClaimProofFiles] = useState<File[]>([]);

  // Edit tune state
  const [isEditingTune, setIsEditingTune] = useState(false);
  const [tagInput, setTagInput] = useState(''); // Separate state for tag input
  const [selectedLabel, setSelectedLabel] = useState<{ _id: string; name: string; slug?: string } | null>(null);
  const [labelSearchResults, setLabelSearchResults] = useState<any[]>([]);
  const [isSearchingLabels, setIsSearchingLabels] = useState(false);
  const [showLabelDropdown, setShowLabelDropdown] = useState(false);
  const [labelSearchQuery, setLabelSearchQuery] = useState('');
  
  // Collective search state (for artist, producer, featuring)
  const [selectedCollective, setSelectedCollective] = useState<{ _id: string; name: string; slug?: string } | null>(null);
  const [collectiveSearchResults, setCollectiveSearchResults] = useState<any[]>([]);
  const [isSearchingCollectives, setIsSearchingCollectives] = useState(false);
  const [showCollectiveDropdown, setShowCollectiveDropdown] = useState(false);
  const [collectiveSearchQuery, setCollectiveSearchQuery] = useState('');
  const [collectiveSearchField, setCollectiveSearchField] = useState<'artist' | 'producer' | 'featuring' | null>(null);
  
  const editFormRef = useRef<HTMLDivElement>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    artist: '',
    producer: '',
    featuring: [] as string[],
    album: '',
    EP: '',
    genres: [] as string[],
    genre: '', // Keep for backward compatibility
    releaseDate: '',
    duration: 0,
    explicit: false,
    isrc: '',
    upc: '',
    bpm: 0,
    key: '',
    tags: [] as string[],
    lyrics: '',
    description: '',
    // Enhanced metadata fields
    composer: '',
    mediawriter: '',
    label: '',
    language: '',
    bitrate: 0,
    sampleRate: 0,
    pitch: 440,
    timeSignature: '',
    elements: [] as string[],
    coverArt: ''
  });

  // Add Link modal state
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // Global bidding state
  const [globalBidAmount, setGlobalBidAmount] = useState<number>(0.33);
  const [isPlacingGlobalBid, setIsPlacingGlobalBid] = useState(false);
  const [topParties, setTopParties] = useState<any[]>([]);
  const [tagRankings, setTagRankings] = useState<any[]>([]);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);

  // WebPlayer integration
  const { setCurrentMedia, setQueue, setGlobalPlayerActive, setCurrentPartyId } = useWebPlayerStore();

  useEffect(() => {
    console.log('🔍 TuneProfile useEffect triggered with mediaId:', mediaId);
    if (mediaId) {
      console.log('✅ mediaId exists, calling fetchMediaProfile');
      fetchMediaProfile().then(() => {
        // Only load top parties and tag rankings after media is loaded
        loadTopParties();
        loadTagRankings();
      });
    } else {
      console.log('❌ No mediaId provided');
    }
  }, [mediaId]);

  const fetchMediaProfile = async () => {
    try {
      console.log('🔍 Fetching media profile for mediaId:', mediaId);
      setLoading(true);
      const response = await mediaAPI.getProfile(mediaId!);
      console.log('📥 Media profile response:', response);
      setMedia(response.media);
      setComments(response.media.comments || []);
      console.log('✅ Media profile loaded successfully');
    } catch (err: any) {
      console.error('❌ Error fetching media profile:', err);
      console.error('❌ Error details:', err.response?.data);
      setError(err.response?.data?.error || 'Failed to load media profile');
      toast.error('Failed to load media profile');
    } finally {
      setLoading(false);
    }
  };

  // Calculate GlobalMediaBidAvg (average individual bid amount)
  const calculateGlobalMediaBidAvg = (mediaData: Media) => {
    const bids = mediaData.bids || [];
    if (bids.length === 0) return 0;
    const total = bids.reduce((sum, bid) => sum + bid.amount, 0);
    return total / bids.length;
  };

  // Check if user can edit this tune
  const canEditTune = () => {
    return canEditMedia(user, media);
  };

  // Label search function with debounce
  const searchLabels = async (query: string) => {
    if (query.length < 2) {
      setLabelSearchResults([]);
      setShowLabelDropdown(false);
      return;
    }
    setIsSearchingLabels(true);
    try {
      const response = await labelAPI.getLabels({ search: query, limit: 10 });
      setLabelSearchResults(response.labels || []);
      setShowLabelDropdown(true);
    } catch (error) {
      console.error('Error searching labels:', error);
      setLabelSearchResults([]);
    } finally {
      setIsSearchingLabels(false);
    }
  };

  // Debounce label search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (labelSearchQuery) {
        searchLabels(labelSearchQuery);
      } else {
        setLabelSearchResults([]);
        setShowLabelDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [labelSearchQuery]);

  // Search collectives
  const searchCollectives = async (query: string) => {
    if (!query || query.trim().length < 2) {
      setCollectiveSearchResults([]);
      setShowCollectiveDropdown(false);
      return;
    }
    setIsSearchingCollectives(true);
    try {
      const response = await collectiveAPI.getCollectives({ search: query, limit: 10 });
      setCollectiveSearchResults(response.collectives || []);
      setShowCollectiveDropdown(true);
    } catch (error) {
      console.error('Error searching collectives:', error);
      setCollectiveSearchResults([]);
    } finally {
      setIsSearchingCollectives(false);
    }
  };

  // Debounce collective search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (collectiveSearchQuery && collectiveSearchField) {
        searchCollectives(collectiveSearchQuery);
      } else {
        setCollectiveSearchResults([]);
        setShowCollectiveDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [collectiveSearchQuery, collectiveSearchField]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editFormRef.current && !editFormRef.current.contains(event.target as Node)) {
        setShowLabelDropdown(false);
        setShowCollectiveDropdown(false);
      }
    };

    if (showLabelDropdown || showCollectiveDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showLabelDropdown, showCollectiveDropdown]);

  // Populate edit form when media loads
  useEffect(() => {
    if (media && canEditTune()) {
      // Extract artist name from subdocument array
      const artistName = (media as any).artist?.[0]?.name || media.artist || '';
      
      // Extract producer name from subdocument array
      const producerName = (media as any).producer?.[0]?.name || '';
      
      // Extract featuring names from subdocument array
      const featuringNames = (media as any).featuring?.map((f: any) => f.name || f) || [];
      
      // Extract genres array and first genre for backward compatibility
      const genresArray = (media as any).genres || [];
      const genreValue = genresArray[0] || (media as any).genre || '';
      
      // Format release date for date input
      const releaseDateFormatted = media.releaseDate 
        ? new Date(media.releaseDate).toISOString().split('T')[0] 
        : '';
      
      setEditForm({
        title: media.title || '',
        artist: artistName,
        producer: producerName,
        featuring: featuringNames,
        album: media.album || '',
        EP: media.EP || '',
        genres: genresArray,
        genre: genreValue,
        releaseDate: releaseDateFormatted,
        duration: media.duration || 0,
        explicit: media.explicit || false,
        isrc: media.isrc || '',
        upc: media.upc || '',
        bpm: media.bpm || 0,
        key: media.key || '',
        tags: media.tags || [],
        lyrics: media.lyrics || '',
        description: (media as any).description || '',
        // Enhanced metadata fields
        composer: (media as any).composer?.[0]?.name || (media as any).composer || '',
        mediawriter: (media as any).mediawriter?.[0]?.name || (media as any).mediawriter || '',
        label: (media as any).label?.[0]?.name || (media as any).label || '',
        language: (media as any).language || '',
        bitrate: media.bitrate || 0,
        sampleRate: media.sampleRate || 0,
        pitch: media.pitch || 440,
        timeSignature: media.timeSignature || '',
        elements: media.elements || [],
        coverArt: media.coverArt || ''
      });
      // Set tag input as comma-separated string
      setTagInput(media.tags?.join(', ') || '');
      
      // Set selected label if label has labelId
      const existingLabel = (media as any).label?.[0];
      if (existingLabel && existingLabel.labelId) {
        setSelectedLabel({
          _id: existingLabel.labelId._id || existingLabel.labelId,
          name: existingLabel.name || '',
          slug: existingLabel.labelId.slug
        });
        setLabelSearchQuery(existingLabel.name || '');
      } else if (existingLabel && existingLabel.name) {
        setSelectedLabel(null);
        setLabelSearchQuery(existingLabel.name || '');
      } else {
        setSelectedLabel(null);
        setLabelSearchQuery('');
      }
      
      // Set selected collective if artist has collectiveId
      const existingArtist = (media as any).artist?.[0];
      if (existingArtist && existingArtist.collectiveId) {
        // If collectiveId is an object (populated), use it directly
        const collective = existingArtist.collectiveId;
        if (typeof collective === 'object' && collective._id) {
          setSelectedCollective({
            _id: collective._id,
            name: collective.name || editForm.artist,
            slug: collective.slug
          });
          setCollectiveSearchField('artist');
        } else if (typeof collective === 'string') {
          // If it's just an ID, we'd need to fetch it, but for now just set the field
          setCollectiveSearchField('artist');
        }
      } else {
        setSelectedCollective(null);
        setCollectiveSearchField(null);
      }
    }
  }, [media, user]);

  // Save media updates
  const handleSaveTune = async () => {
    if (!mediaId) return;
    
    try {
      const updateData: any = {
        ...editForm,
        labelId: selectedLabel?._id || null // Send labelId if selected
      };
      
      // Add collectiveId for artist if collective is selected
      if (collectiveSearchField === 'artist' && selectedCollective) {
        updateData.artistCollectiveId = selectedCollective._id;
      } else {
        updateData.artistCollectiveId = null;
      }
      
      await mediaAPI.updateMedia(media?._id || mediaId, updateData);
      toast.success('Media updated successfully!');
      setIsEditingTune(false);
      // Refresh media data
      await fetchMediaProfile();
    } catch (err: any) {
      console.error('Error updating media:', err);
      toast.error(err.response?.data?.error || 'Failed to update media');
    }
  };

  // Process tags from input string
  const handleTagInputBlur = () => {
    const tags = tagInput.split(',').map(t => t.trim()).filter(t => t);
    setEditForm({ ...editForm, tags });
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTagInputBlur();
    }
  };

  // Get platform icon and color
  const getPlatformIcon = (platform: string) => {
    const platformLower = platform.toLowerCase();
    switch (platformLower) {
      case 'youtube':
        return { icon: Youtube, color: 'hover:bg-red-600/30 hover:border-red-500', bgColor: 'bg-red-600/20' };
      case 'soundcloud':
        return { icon: Music2, color: 'hover:bg-orange-600/30 hover:border-orange-500', bgColor: 'bg-orange-600/20' };
      default:
        return { icon: ExternalLink, color: 'hover:bg-purple-600/30 hover:border-purple-500', bgColor: 'bg-purple-600/20' };
    }
  };

  // Get available external links
  const getExternalLinks = () => {
    const links: Array<{
      platform: string;
      url: string;
      icon: any;
      color: string;
      bgColor: string;
      displayName: string;
    }> = [];
    
    // Add links from sources
    if (media?.sources) {
      Object.entries(media.sources).forEach(([platform, url]) => {
        // Skip 'upload' source - it's internal file storage, not an external platform link
        if (platform.toLowerCase() === 'upload') {
          return;
        }
        
        const { icon, color, bgColor } = getPlatformIcon(platform);
        links.push({
          platform,
          url,
          icon,
          color,
          bgColor,
          displayName: platform.charAt(0).toUpperCase() + platform.slice(1)
        });
      });
    }
    
    // Auto-populate YouTube link from externalIds if not already in sources
    if (media?.externalIds?.youtube && !media?.sources?.youtube) {
      const youtubeId = media.externalIds.youtube;
      const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
      const { icon, color, bgColor } = getPlatformIcon('youtube');
      links.push({
        platform: 'youtube',
        url: youtubeUrl,
        icon,
        color,
        bgColor,
        displayName: 'YouTube'
      });
    }
    
    return links;
  };

  // Get platforms that can be added
  const getMissingPlatforms = () => {
    if (!canEditTune()) return [];
    
    const existingSources = media?.sources || {};
    const existingExternalIds = media?.externalIds || {};
    const allPlatforms = ['YouTube', 'SoundCloud'];
    
    return allPlatforms
      .filter(platform => {
        const platformLower = platform.toLowerCase();
        // Don't show "Add" button if link exists in sources OR in externalIds
        return !existingSources[platformLower] && !existingExternalIds[platformLower];
      })
      .map(platform => {
        const { icon, color } = getPlatformIcon(platform);
        return {
          platform: platform.toLowerCase(),
          displayName: platform,
          icon,
          color
        };
      });
  };

  // Handle adding a new link
  const handleAddLink = (platform: string) => {
    setSelectedPlatform(platform);
    setShowAddLinkModal(true);
  };

  // Save new link
  const handleSaveLink = async () => {
    if (!mediaId || !selectedPlatform || !newLinkUrl.trim()) return;
    
    try {
      const updatedSources = {
        ...(media?.sources || {}),
        [selectedPlatform]: newLinkUrl.trim()
      };
      
      await mediaAPI.updateMedia(media?._id || mediaId, { sources: updatedSources });
      toast.success(`${selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)} link added!`);
      setShowAddLinkModal(false);
      setSelectedPlatform('');
      setNewLinkUrl('');
      
      // Refresh media data
      await fetchMediaProfile();
    } catch (err: any) {
      console.error('Error adding link:', err);
      toast.error(err.response?.data?.error || 'Failed to add link');
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !mediaId || !user) return;

    try {
      setSubmittingComment(true);
      const response = await mediaAPI.createComment(media?._id || mediaId, newComment.trim());
      setComments(prev => [response.comment, ...prev]);
      setNewComment('');
      toast.success('Comment added successfully!');
    } catch (err: any) {
      console.error('Error creating comment:', err);
      toast.error(err.response?.data?.error || 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!user) {
      toast.error('Please log in to like comments');
      return;
    }

    try {
      const response = await mediaAPI.likeComment(commentId);
      setComments(prev => prev.map(comment => 
        comment._id === commentId 
          ? { ...comment, likeCount: response.hasLiked ? comment.likeCount + 1 : comment.likeCount - 1 }
          : comment
      ));
    } catch (err: any) {
      console.error('Error liking comment:', err);
      toast.error('Failed to like comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!user) return;

    try {
      await mediaAPI.deleteComment(commentId);
      setComments(prev => prev.filter(comment => comment._id !== commentId));
      toast.success('Comment deleted successfully');
    } catch (err: any) {
      console.error('Error deleting comment:', err);
      toast.error('Failed to delete comment');
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  const getFieldValue = (value: any, fieldName?: string, fallback = 'Not specified') => {
    if (value === null || value === undefined || value === '') return fallback;
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : fallback;
    // Special handling for pitch - display as whole number with Hz
    if (fieldName === 'pitch' && typeof value === 'number') {
      return `${Math.round(value)} Hz`;
    }
    return value.toString();
  };

  // Handle claim tune button click
  const handleClaimTune = () => {
    if (!user) {
      toast.info('Please log in to claim this tune');
      navigate('/login');
      return;
    }

    if (!user.role?.includes('creator')) {
      // User is not a creator - show creator signup modal
      setShowCreatorSignupModal(true);
    } else {
      // User is already a creator - show claim verification modal
      setShowClaimVerificationModal(true);
    }
  };

  // Handle creator signup
  const handleCreatorSignup = () => {
    setShowCreatorSignupModal(false);
    // Navigate to creator registration page
    navigate('/creator/register');
  };

  // Handle claim submission
  const handleSubmitClaim = async () => {
    if (!claimProofText.trim()) {
      toast.error('Please provide proof of ownership');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('mediaId', media?._id || '');
      formData.append('proofText', claimProofText);
      claimProofFiles.forEach((file) => {
        formData.append('proofFiles', file);
      });

      await claimAPI.submitClaim(formData);
      
      toast.success('Claim submitted for review! We\'ll notify you when it\'s processed.');
      setShowClaimVerificationModal(false);
      setClaimProofText('');
      setClaimProofFiles([]);
    } catch (err: any) {
      console.error('Error submitting claim:', err);
      toast.error(err.response?.data?.error || 'Failed to submit claim');
    }
  };

  // Load top parties for this tune
  const loadTopParties = async () => {
    if (!media && !mediaId) {
      console.log('⚠️ No media or mediaId available for top parties');
      return;
    }
    
    try {
      console.log('🔍 Loading top parties for media:', mediaId);
      console.log('🔍 Media object:', media);
      const response = await mediaAPI.getTopPartiesForMedia(media?._id || mediaId!);
      console.log('📊 Top parties response:', response);
      console.log('📊 Parties data:', response.parties);
      setTopParties(response.parties || []);
      console.log('✅ Top parties state set:', response.parties?.length || 0, 'parties');
    } catch (err: any) {
      console.error('❌ Error loading top parties:', err);
      console.error('Error response:', err.response);
      console.error('Error data:', err.response?.data);
      console.error('Error status:', err.response?.status);
      // Temporarily show error to user for debugging
      toast.error(`Top Parties Error: ${err.response?.data?.error || err.message}`);
    }
  };

  // Load tag rankings for this tune
  const loadTagRankings = async () => {
    if (!media && !mediaId) {
      console.log('⚠️ No media or mediaId available for tag rankings');
      return;
    }
    
    try {
      console.log('🏷️ Loading tag rankings for media:', mediaId);
      console.log('🏷️ Media object:', media);
      const response = await mediaAPI.getTagRankings(media?._id || mediaId!);
      console.log('📊 Tag rankings response:', response);
      setTagRankings(response.tagRankings || []);
      console.log('✅ Tag rankings loaded:', response.tagRankings?.length || 0, 'tags');
    } catch (err: any) {
      console.error('❌ Error loading tag rankings:', err);
      // Silent fail - not critical
    }
  };

  // Handle play button click
  const handlePlaySong = () => {
    if (!media) return;

    console.log('🎵 Raw media object:', media);
    console.log('🎵 Raw sources:', media.sources, typeof media.sources);

    // Clean and format sources (same logic as Party page)
    let sources = {};
    
    if (media.sources) {
      if (Array.isArray(media.sources)) {
        for (const source of media.sources) {
          if (source && source.platform === '$__parent' && source.url && source.url.sources) {
            // Handle Mongoose metadata corruption
            sources = source.url.sources;
            break;
        } else if (source && source.platform === 'youtube' && source.url) {
          (sources as any).youtube = source.url;
        } else if (source?.youtube) {
          (sources as any).youtube = source.youtube;
        }
        }
      } else if (typeof media.sources === 'object') {
        // Preserve the original sources object
        sources = media.sources;
      }
    }

    // Format media for webplayer
    const formattedSong = {
      id: media._id || media.uuid,
      title: media.title,
      artist: Array.isArray(media.artist) ? media.artist[0]?.name || 'Unknown Artist' : media.artist,
      duration: media.duration,
      coverArt: media.coverArt,
      sources: sources, // Use cleaned sources
      globalMediaAggregate: media.globalMediaAggregate || 0,
      bids: media.bids || [],
      addedBy: media.addedBy?.username || 'Unknown',
      totalBidValue: media.globalMediaAggregate || 0
    } as any;

    console.log('🎵 Playing from TuneProfile:', formattedSong);
    console.log('Sources:', sources);

    // Clear any existing queue and set new media
    setQueue([formattedSong]);
    setCurrentMedia(formattedSong, 0, true); // true = autoplay
    setGlobalPlayerActive(true);
    setCurrentPartyId(null); // Not in a party context
    
    toast.success(`Now playing: ${media.title}`);
  };

  // Handle global bid (chart support)
  const handleGlobalBid = async () => {
    if (!user) {
      toast.info('Please log in to support this tune');
      navigate('/login');
      return;
    }

    if (globalBidAmount < 0.33) {
      toast.error('Minimum bid is £0.33');
      return;
    }

    // Convert balance from pence to pounds for comparison
    const balanceInPounds = penceToPoundsNumber((user as any)?.balance);
    if (balanceInPounds < globalBidAmount) {
      toast.error('Insufficient balance. Please top up your wallet.');
      navigate('/wallet');
      return;
    }

    setIsPlacingGlobalBid(true);

    try {
      await mediaAPI.placeGlobalBid(mediaId!, globalBidAmount);
      
      toast.success(`Placed £${globalBidAmount.toFixed(2)} bid on "${media?.title}"!`);
      
      // Refresh media data to show updated metrics
      await fetchMediaProfile();
      await loadTopParties();
      
    } catch (err: any) {
      console.error('Error placing global bid:', err);
      toast.error(err.response?.data?.error || 'Failed to place bid');
    } finally {
      setIsPlacingGlobalBid(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading Tune Profile...</div>
      </div>
    );
  }

  if (error || !media) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Error loading media profile</div>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const mediaFields = [
    { label: 'Title', value: media.title, icon: Music },
    { label: 'Artist', value: media.artist, icon: Mic },
    { label: 'Producer', value: media.producer, icon: Volume2 },
    { label: 'Featuring', value: media.featuring, icon: User },
    { label: 'BPM', value: media.bpm, icon: Headphones },
    { label: 'Duration', value: media.duration ? formatDuration(media.duration) : null, icon: Clock },
    { label: 'Tags', value: media.tags, icon: Tag },
    { label: 'Pitch', value: media.pitch, fieldName: 'pitch', icon: Music },
    { label: 'Album', value: media.album, icon: Disc },
    { label: 'Release Date', value: media.releaseDate, icon: Calendar },
    { label: 'Explicit', value: media.explicit ? 'Yes' : 'No', icon: Globe },
    { label: 'ISRC', value: media.isrc, icon: Music },
    { label: 'UPC', value: media.upc, icon: Disc },
    { label: 'Key', value: media.key, icon: Music },
    { label: 'Time Signature', value: media.timeSignature, icon: Music },
    { label: 'Bitrate', value: media.bitrate ? `${media.bitrate} kbps` : null, icon: Headphones },
    { label: 'Elements', value: media.elements, icon: Tag },
  ];

  const visibleFields = showAllFields ? mediaFields : mediaFields.slice(0, 8);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-2 md:px-4 py-4 md:py-8">
        {/* Header */}
        <div className="mb-6 md:mb-8 relative">
          <button
            onClick={() => navigate(-1)}
            className="px-3 md:px-4 py-2 mb-4 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30 text-sm md:text-base"   >
            Back
          </button>
          
          {/* Edit Tune & Report Buttons */}
          <div className='inline rounded-full items-center absolute right-0 top-0 md:right-3 mb-4 flex space-x-2'>
            {/* Report Button - Always visible */}
            <button
              onClick={() => setShowReportModal(true)}
              className="px-3 md:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
            >
              <Flag className="h-4 w-4" />
              <span className="hidden sm:inline">Report</span>
            </button>
            
            {/* Edit Tune Button - Only show if user can edit */}
            {canEditTune() && (
              <button
                onClick={() => setIsEditingTune(true)}
                className="px-3 md:px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
              >
                <span className="hidden sm:inline">Edit Tune</span>
                <span className="sm:hidden">Edit</span>
              </button>
            )}
          </div>
          
          <div className="card flex flex-col md:flex-row items-start relative">
            {/* Claim Tune Button - Top Right */}
            <button
              onClick={handleClaimTune}
              className="absolute top-3 right-3 md:top-6 md:right-6 px-3 py-2 md:px-4 md:py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-1 md:space-x-2 text-xs md:text-base z-10"
            >
              <Award className="h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Claim Tune</span>
              <span className="sm:hidden">Claim</span>
            </button>

            {/* Album Art with Play Button Overlay */}
            <div className="w-full md:w-auto flex justify-center md:justify-start mb-6 md:mb-0 md:mr-6 relative group">
              <img
                src={media.coverArt || DEFAULT_COVER_ART}
                alt={`${media.title} cover`}
                className="w-48 h-48 md:w-auto md:h-auto md:max-w-sm rounded-lg shadow-xl object-cover"
              />
              {/* Play Button Overlay */}
              <div 
                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={handlePlaySong}
              >
                <div className="w-16 h-16 md:w-20 md:h-20 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 hover:scale-110 transition-all shadow-2xl">
                  <Play className="h-8 w-8 md:h-10 md:w-10 text-white ml-1" fill="currentColor" />
                </div>
              </div>
            </div>
            
            {/* Song Info */}
            <div className="flex-1 w-full text-white">
              <h1 className="text-2xl md:text-4xl font-bold mb-2 text-center md:text-left px-2 md:px-4">{media.title}</h1>
              <p className="text-lg md:text-3xl text-purple-300 mb-4 text-center md:text-left px-2 md:px-4">
                {getCreatorDisplay(media)}
              </p>
              
              {/* Bid Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 mb-6 px-2 md:px-0">
                {/* Bid Total */}
                <div className="card bg-black/20 rounded-lg p-3 md:p-4 border-l-4 border-green-500/50">
                  <div className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wide mb-1">Bid Total</div>
                  <div className="text-base md:text-2xl font-bold text-green-400">
                    {penceToPounds(media.globalMediaAggregate)}
                  </div>
                </div>
                
                {/* Total Bids Count */}
                <div className="card bg-black/20 rounded-lg p-3 md:p-4 border-l-4 border-cyan-500/50">
                  <div className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wide mb-1">Total Bids</div>
                  <div className="text-base md:text-2xl font-bold text-cyan-400">
                    {media.bids?.length || 0}
                  </div>
                </div>
                
                {/* Global Rank */}
                <div className="card bg-black/20 rounded-lg p-3 md:p-4 border-l-4 border-pink-500/50">
                  <div className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wide mb-1">Global Rank</div>
                  <div className="text-base md:text-2xl font-bold text-pink-400">
                    #{media.globalMediaAggregateTopRank || '-'}
                  </div>
                </div>
                
                {/* Top Fan - Now visible on mobile */}
                <div className="card bg-black/20 rounded-lg p-3 md:p-4 border-l-4 border-purple-500/50">
                  <div className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wide mb-1">Top Fan</div>
                  <div className="text-base md:text-2xl font-bold text-purple-400">
                    {penceToPounds(media.globalMediaAggregateTop)}
                  </div>
                </div>
                
                {/* Top Bid - Hidden on mobile */}
                <div className="hidden md:block card bg-black/20 rounded-lg p-4 border-l-4 border-yellow-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Top Bid</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {penceToPounds(media.globalMediaBidTop)}
                  </div>
                </div>
                
                {/* Average Bid - Hidden on mobile */}
                <div className="hidden md:block card bg-black/20 rounded-lg p-4 border-l-4 border-blue-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Avg Bid</div>
                  <div className="text-2xl font-bold text-blue-400">
                    {penceToPounds(calculateGlobalMediaBidAvg(media))}
                  </div>
                </div>
              </div>

              {/* External Source Links - Desktop only */}
              {getExternalLinks().length > 0 && (
                <div className="hidden md:block mb-4 px-4">
                  <div className="flex flex-wrap gap-2">
                    {getExternalLinks().map((link) => (
                      <a
                        key={link.platform}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center space-x-2 px-4 py-2 bg-black/20 border border-white/20 rounded-lg text-gray-200 transition-all ${link.color}`}
                      >
                        <link.icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{link.displayName}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Add External Links - Only for admin/verified creators */}
              {canEditTune() && getMissingPlatforms().length > 0 && (
                <div className="mb-6 px-4">
                  <div className="text-xs text-gray-400 mb-2">Add external links:</div>
                  <div className="flex flex-wrap gap-2">
                    {getMissingPlatforms().map((platform) => (
                      <button
                        key={platform.platform}
                        onClick={() => handleAddLink(platform.platform)}
                        className={`flex items-center space-x-2 px-3 py-1.5 bg-black/10 border rounded-lg text-xs font-medium transition-all ${platform.color}`}
                      >
                        <platform.icon className="w-3.5 h-3.5" />
                        <span>Add {platform.displayName}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Global Bid Section - Support This Tune */}
        {user && (
          <div className="mb-8 px-2 md:px-0">
            <div className="max-w-2xl mx-auto">
              <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 border-2 border-purple-500/30 rounded-lg p-4 md:p-8 text-center">
                <h3 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center justify-center">
                  <Coins className="h-5 w-5 md:h-7 md:w-7 mr-2 md:mr-3 text-yellow-400" />
                  Support This Tune
                </h3>
                <p className="text-gray-300 text-sm md:text-base mb-4 md:mb-6">
                  Boost this tune's global ranking and support the artist
                </p>
                
                <div className="flex flex-col md:flex-row items-center justify-center space-y-3 md:space-y-0 md:space-x-3 mb-4">
                  <div className="flex items-center bg-gray-800 border border-gray-600 rounded-lg overflow-hidden">
                    <span className="px-2 md:px-3 text-gray-400 text-lg md:text-xl">£</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.33"
                      value={globalBidAmount}
                      onChange={(e) => setGlobalBidAmount(parseFloat(e.target.value) || 0.33)}
                      className="w-24 md:w-28 bg-gray-800 p-2 md:p-3 text-white text-xl md:text-2xl font-bold text-center focus:outline-none border-l border-gray-600"
                    />
                  </div>
                  <button
                    onClick={handleGlobalBid}
                    disabled={isPlacingGlobalBid || globalBidAmount < 0.33}
                    className="w-full md:w-auto px-6 md:px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all flex items-center justify-center space-x-2 text-base md:text-lg"
                  >
                    {isPlacingGlobalBid ? (
                      <>
                        <Loader2 className="h-5 w-5 md:h-6 md:w-6 animate-spin" />
                        <span>Placing Bid...</span>
                      </>
                    ) : (
                      <>
                        <Coins className="h-5 w-5 md:h-6 md:w-6" />
                        <span>Bid £{globalBidAmount.toFixed(2)}</span>
                      </>
                    )}
                  </button>
                </div>
                
                {/* Quick amounts */}
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {[0.33, 1.00, 5.00, 10.00, 20.00].map(amount => (
                    <button
                      key={amount}
                      onClick={() => setGlobalBidAmount(amount)}
                      className="px-3 md:px-4 py-1.5 md:py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs md:text-sm rounded-full transition-colors font-medium"
                    >
                      £{amount.toFixed(2)}
                    </button>
                  ))}
                </div>
                
                <p className="text-xs md:text-sm text-gray-400">
                  Your balance: {penceToPounds((user as any)?.balance)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Top Supporters */}
        {media.bids && media.bids.length > 0 && (
          <div className="mb-8 px-2 md:px-0">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4 flex items-center">
              <Heart className="h-5 w-5 md:h-6 md:w-6 mr-2 text-pink-400" />
              Top Supporters
            </h2>
            <div className="card bg-black/20 rounded-lg p-4 md:p-6">
              <TopSupporters bids={media.bids} maxDisplay={10} />
            </div>
          </div>
        )}

        {/* Top Bids */}
        {media.bids && media.bids.length > 0 && (
          <div className="mb-8 px-2 md:px-0">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4 flex items-center">
              <Coins className="h-5 w-5 md:h-6 md:w-6 mr-2 text-yellow-400" />
              Top Bids
            </h2>
            <div className="card bg-black/20 rounded-lg p-4 md:p-6">
              <TopBidders bids={media.bids} maxDisplay={5} />
            </div>
          </div>
        )}

        {/* Top Parties */}
        <div className="mb-8 px-2 md:px-0">
          <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4 flex items-center">
            <Music className="h-5 w-5 md:h-6 md:w-6 mr-2 text-purple-400" />
            Top Parties {topParties.length > 0 && `(${topParties.length})`}
          </h2>
          <div className="card bg-black/20 rounded-lg p-4 md:p-6">
            {(() => {
              console.log('🎪 Rendering Top Parties section, length:', topParties.length);
              console.log('🎪 Top Parties data:', topParties);
              return null;
            })()}
            {topParties.length > 0 ? (
              <div className="space-y-2 md:space-y-3">
                {topParties.map((party, index) => (
                  <div 
                    key={party._id} 
                    className="flex items-center justify-between p-4 bg-purple-900/20 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-all"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold">#{index + 1}</span>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold text-lg">{party.name}</h3>
                        <p className="text-sm text-gray-400">{party.location}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-xl font-bold text-green-400">
                          £{party.partyMediaAggregate?.toFixed(2) || '0.00'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {party.bidCount || 0} {party.bidCount === 1 ? 'bid' : 'bids'}
                        </p>
                      </div>
                      <button
                        onClick={() => navigate(`/party/${party._id}`)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        View Party
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Music className="h-12 w-12 mx-auto mb-3 text-gray-500" />
                <p>This tune hasn't been added to any parties yet</p>
                <p className="text-sm text-gray-500 mt-2">Be the first to add it to a party!</p>
              </div>
            )}
          </div>
        </div>

        {/* Tag Rankings */}
        {tagRankings.length > 0 && (
          <div className="mb-8 px-2 md:px-0">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4 flex items-center">
              <Tag className="h-5 w-5 md:h-6 md:w-6 mr-2 text-purple-400" />
              Tag Rankings
            </h2>
            <div className="card bg-black/20 rounded-lg p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {tagRankings.map((ranking, index) => (
                  <div 
                    key={index} 
                    className="flex items-center justify-between p-3 md:p-4 bg-purple-900/20 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-all"
                  >
                    <div className="flex items-center space-x-2 md:space-x-3">
                      <Tag className="h-4 w-4 text-purple-400 flex-shrink-0" />
                      <span className="text-white font-medium text-sm md:text-base">{ranking.tag}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-base md:text-lg font-bold text-purple-400">
                        #{ranking.rank}
                      </div>
                      <div className="text-xs text-gray-400">
                        of {ranking.total} • Top {ranking.percentile}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Song Details */}
        <div className="mb-8 px-2 md:px-0">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h2 className="text-xl md:text-2xl font-bold text-white">Song Details</h2>
            <button
              onClick={() => setShowAllFields(!showAllFields)}
              className="flex items-center px-3 md:px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors text-sm md:text-base"
            >
              {showAllFields ? 'Show Less' : 'Show All'}
            </button>
          </div>
          
          <div className="card bg-black/20 rounded-lg p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
              {visibleFields.map((field, index) => {
                const IconComponent = field.icon;
                return (
                  <div key={index} className="flex items-start space-x-3">
                    <IconComponent className="w-5 h-5 text-purple-400 mt-1 flex-shrink-0" />
                    <div>
                      <div className="text-sm text-gray-300">{field.label}</div>
                      <div className="text-white font-medium">
                        {getFieldValue(field.value, (field as any).fieldName)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Lyrics Section */}
            {media.lyrics && (
              <div className="mt-6 pt-6 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-3">Lyrics</h3>
                <div className="text-gray-300 whitespace-pre-wrap bg-black/10 rounded-lg p-4">
                  {media.lyrics}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Collectives Section - Above label, below metrics */}
        {(() => {
          const collectives: any[] = [];
          // Extract collectives from artist, producer, featuring
          if (media.artist && Array.isArray(media.artist)) {
            media.artist.forEach((artist: any) => {
              if (artist.collectiveId && typeof artist.collectiveId === 'object' && artist.collectiveId._id) {
                collectives.push({ ...artist.collectiveId, role: 'artist' });
              }
            });
          }
          if (media.producer && Array.isArray(media.producer)) {
            media.producer.forEach((producer: any) => {
              if (producer.collectiveId && typeof producer.collectiveId === 'object' && producer.collectiveId._id) {
                collectives.push({ ...producer.collectiveId, role: 'producer' });
              }
            });
          }
          if (media.featuring && Array.isArray(media.featuring)) {
            media.featuring.forEach((featuring: any) => {
              if (featuring.collectiveId && typeof featuring.collectiveId === 'object' && featuring.collectiveId._id) {
                collectives.push({ ...featuring.collectiveId, role: 'featuring' });
              }
            });
          }
          
          // Remove duplicates by _id
          const uniqueCollectives = collectives.filter((collective, index, self) =>
            index === self.findIndex(c => c._id.toString() === collective._id.toString())
          );
          
          return uniqueCollectives.length > 0 ? (
            <div className="mb-8 px-2 md:px-0">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4 flex items-center">
                <Users className="h-5 w-5 md:h-6 md:h-6 mr-2 text-purple-400" />
                Collectives
              </h2>
              <div className="card bg-black/20 rounded-lg p-4 md:p-6">
                <div className="space-y-3">
                  {uniqueCollectives.map((collective: any, index: number) => {
                    const collectiveName = collective.name;
                    const collectiveSlug = collective.slug;
                    const collectiveProfilePicture = collective.profilePicture;
                    const isVerified = collective.verificationStatus === 'verified';
                    const role = collective.role;
                    
                    return (
                      <div key={index} className="flex items-center space-x-4 p-4 bg-purple-900/20 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-all">
                        <img
                          src={collectiveProfilePicture || DEFAULT_PROFILE_PIC}
                          alt={collectiveName}
                          className="h-12 w-12 rounded-full object-cover flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.src = DEFAULT_PROFILE_PIC;
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          {collectiveSlug ? (
                            <a
                              href={`/collective/${collectiveSlug}`}
                              className="text-lg font-semibold text-white hover:text-purple-400 transition-colors block truncate"
                            >
                              {collectiveName}
                            </a>
                          ) : (
                            <div className="text-lg font-semibold text-white truncate">{collectiveName}</div>
                          )}
                          <div className="flex items-center space-x-3 mt-1">
                            <span className="text-sm text-gray-400 capitalize">{role}</span>
                          </div>
                        </div>
                        {isVerified && (
                          <div className="flex-shrink-0">
                            <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium flex items-center space-x-1">
                              <CheckCircle className="h-3 w-3" />
                              <span>Verified</span>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null;
        })()}

        {/* Label Section - Above external links, below metrics */}
        {media.label && Array.isArray(media.label) && media.label.length > 0 && (
          <div className="mb-8 px-2 md:px-0">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4 flex items-center">
              <Building className="h-5 w-5 md:h-6 md:w-6 mr-2 text-purple-400" />
              Label
            </h2>
            <div className="card bg-black/20 rounded-lg p-4 md:p-6">
              <div className="space-y-3">
                {media.label.map((labelItem: any, index: number) => {
                  const label = labelItem.labelId || labelItem;
                  if (!label || (typeof label === 'object' && !label.name)) return null;
                  
                  const labelName = typeof label === 'string' ? label : label.name;
                  const labelSlug = typeof label === 'object' ? label.slug : null;
                  const labelProfilePicture = typeof label === 'object' ? label.profilePicture : null;
                  const isVerified = typeof label === 'object' ? label.verificationStatus === 'verified' : false;
                  const catalogNumber = labelItem.catalogNumber;
                  const releaseDate = labelItem.releaseDate;
                  
                  return (
                    <div key={index} className="flex items-center space-x-4 p-4 bg-purple-900/20 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-all">
                      <img
                        src={labelProfilePicture || DEFAULT_PROFILE_PIC}
                        alt={labelName}
                        className="h-12 w-12 rounded-full object-cover flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_PIC;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        {labelSlug ? (
                          <a
                            href={`/label/${labelSlug}`}
                            className="text-lg font-semibold text-white hover:text-purple-400 transition-colors block truncate"
                          >
                            {labelName}
                          </a>
                        ) : (
                          <div className="text-lg font-semibold text-white truncate">{labelName}</div>
                        )}
                        <div className="flex items-center space-x-3 mt-1">
                          {catalogNumber && (
                            <span className="text-sm text-gray-400">Catalog: {catalogNumber}</span>
                          )}
                          {releaseDate && (
                            <span className="text-sm text-gray-400">
                              Released: {new Date(releaseDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {isVerified && (
                        <div className="flex-shrink-0">
                          <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium flex items-center space-x-1">
                            <CheckCircle className="h-3 w-3" />
                            <span>Verified</span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Links Section */}
        {media.sources && Object.keys(media.sources).length > 0 && (
          <div className="mb-8 md:hidden px-2">
            <h2 className="text-xl font-bold text-white mb-3">Links</h2>
            <div className="bg-black/20 rounded-lg p-4">
              <div className="flex flex-wrap gap-3 justify-center">
                {Object.entries(media.sources).map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center px-4 py-2.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors group"
                  >
                    <svg className="w-5 h-5 mr-2 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    <span className="text-white text-sm font-semibold group-hover:text-gray-200 transition-colors">
                      Watch on YouTube
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Comments Section */}
        <div className="mb-8 px-2 md:px-0">
          <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4">Comments</h2>
          
          {/* Add Comment Form */}
          {user && (
            <div className="card bg-black/20 rounded-lg p-4 md:p-6 mb-6">
              <form onSubmit={handleSubmitComment}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share your thoughts about this media..."
                  className="w-full h-24 bg-black/20 border border-gray-600 rounded-lg p-3 text-white placeholder-gray-400 resize-none focus:outline-none focus:border-purple-500"
                  style={{ color: 'white' }}
                  maxLength={1000}
                />
                <div className="flex justify-between items-center mt-3">
                  <div className="text-sm text-gray-400">
                    {newComment.length}/1000 characters
                  </div>
                  <button
                    type="submit"
                    disabled={!newComment.trim() || submittingComment}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                  >
                    {submittingComment ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Comments List */}
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No comments yet. Be the first to share your thoughts!
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment._id} className="bg-black/20 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <img
                      src={comment.userId.profilePic || DEFAULT_PROFILE_PIC}
                      alt={comment.userId.username}
                      className="w-10 h-10 rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_PROFILE_PIC;
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="font-semibold text-white">
                          {comment.userId.username}
                        </span>
                        <span className="text-sm text-gray-400">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-gray-300 mb-3">{comment.content}</p>
                      
                      <div className="flex items-center space-x-4">
                        <button
                          onClick={() => handleLikeComment(comment._id)}
                          className="flex items-center space-x-1 text-gray-400 hover:text-purple-400 transition-colors"
                        >
                          <ThumbsUp className="w-4 h-4" />
                          <span>{comment.likeCount}</span>
                        </button>
                        
                        {user && comment.userId._id === (user._id || user.id) && (
                          <button
                            onClick={() => handleDeleteComment(comment._id)}
                            className="flex items-center space-x-1 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Creator Signup Modal */}
      {showCreatorSignupModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
          <div className="card max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Become a Creator</h2>
              <button
                onClick={() => setShowCreatorSignupModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <p className="text-gray-300 mb-6">
              Join Tuneable as a creator to claim your music, earn directly from fan bids, 
              and connect with your audience in a revolutionary new way.
            </p>
            
            <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4 mb-6">
              <h3 className="text-white font-semibold mb-2">Creator Benefits:</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>✓ Claim ownership of your tracks</li>
                <li>✓ Earn directly from fan bids</li>
                <li>✓ Access to creator analytics</li>
                <li>✓ Verify your identity with badges</li>
                <li>✓ Connect with your biggest fans</li>
              </ul>
            </div>
            
            <div className="flex space-x-3">
              <button onClick={handleCreatorSignup} className="btn-primary flex-1">
                Enable Creator Mode
              </button>
              <button onClick={() => setShowCreatorSignupModal(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Claim Verification Modal */}
      {showClaimVerificationModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
          <div className="card max-w-lg w-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                Claim "{media?.title}"
              </h2>
              <button
                onClick={() => setShowClaimVerificationModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <p className="text-gray-300 mb-4">
              To verify you're a creator of this tune, please provide proof of ownership:
            </p>
            
            <div className="mb-4">
              <label className="block text-white font-medium mb-2">
                Proof of Ownership
              </label>
              <textarea
                value={claimProofText}
                onChange={(e) => setClaimProofText(e.target.value)}
                placeholder="Describe your role (artist, producer, mediawriter, etc.) and provide links to social media, streaming profiles, distribution platforms, or other verification..."
                className="input min-h-32"
                maxLength={2000}
              />
              <div className="text-xs text-gray-400 mt-1">
                {claimProofText.length}/2000 characters
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-white font-medium mb-2">
                Supporting Documents (Optional)
              </label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => setClaimProofFiles(Array.from(e.target.files || []))}
                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
              />
              <p className="text-xs text-gray-400 mt-2">
                Upload screenshots, contracts, distribution receipts, or other proof
              </p>
              {claimProofFiles.length > 0 && (
                <div className="mt-2 text-sm text-gray-300">
                  {claimProofFiles.length} file(s) selected
                </div>
              )}
            </div>
            
            <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-lg p-3 mb-4">
              <p className="text-yellow-200 text-sm">
                <strong>Note:</strong> Claims are reviewed by our team. False claims may result in account suspension.
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button 
                onClick={handleSubmitClaim}
                disabled={!claimProofText.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit Claim
              </button>
              <button 
                onClick={() => {
                  setShowClaimVerificationModal(false);
                  setClaimProofText('');
                  setClaimProofFiles([]);
                }} 
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Tune Modal */}
      {isEditingTune && canEditTune() && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 overflow-y-auto" style={{ zIndex: 10000 }}>
          <div className="card max-w-4xl w-full my-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Edit Tune</h2>
              <button
                onClick={() => setIsEditingTune(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">Title *</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="input"
                    placeholder="Song title"
                  />
                </div>
                <div>
                  <label className="block text-white font-medium mb-2">Artist *</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editForm.artist}
                      onChange={(e) => {
                        const value = e.target.value;
                        setEditForm({ ...editForm, artist: value });
                        // If user types, clear collective selection for artist
                        if (collectiveSearchField === 'artist') {
                          setSelectedCollective(null);
                          setCollectiveSearchQuery('');
                          setShowCollectiveDropdown(false);
                        }
                      }}
                      onFocus={() => {
                        // Optionally show collective search if query exists
                        if (collectiveSearchField === 'artist' && collectiveSearchQuery) {
                          setShowCollectiveDropdown(true);
                        }
                      }}
                      className="input pr-10"
                      placeholder="Artist name or search for collective"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (collectiveSearchField === 'artist') {
                          // Toggle off
                          setCollectiveSearchField(null);
                          setCollectiveSearchQuery('');
                          setShowCollectiveDropdown(false);
                        } else {
                          // Toggle on for artist
                          setCollectiveSearchField('artist');
                          setCollectiveSearchQuery(editForm.artist);
                          if (editForm.artist && editForm.artist.length >= 2) {
                            searchCollectives(editForm.artist);
                          }
                        }
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-purple-400 transition-colors"
                      title={collectiveSearchField === 'artist' ? 'Clear collective link' : 'Link to collective'}
                    >
                      <Users className="h-4 w-4" />
                    </button>
                  </div>
                  {collectiveSearchField === 'artist' && showCollectiveDropdown && collectiveSearchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto" style={{ top: '100%', left: 0 }}>
                      {collectiveSearchResults.map((collective) => (
                        <button
                          key={collective._id}
                          type="button"
                          onClick={() => {
                            setSelectedCollective(collective);
                            setEditForm({ ...editForm, artist: collective.name });
                            setCollectiveSearchQuery(collective.name);
                            setShowCollectiveDropdown(false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-gray-700 text-white flex items-center gap-3 transition-colors"
                        >
                          <img
                            src={collective.profilePicture || DEFAULT_PROFILE_PIC}
                            alt={collective.name}
                            className="h-8 w-8 rounded object-cover flex-shrink-0"
                            onError={(e) => {
                              e.currentTarget.src = DEFAULT_PROFILE_PIC;
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{collective.name}</div>
                            {collective.description && (
                              <div className="text-sm text-gray-400 truncate">{collective.description}</div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {isSearchingCollectives && collectiveSearchField === 'artist' && (
                    <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  )}
                  {selectedCollective && collectiveSearchField === 'artist' && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>Linked to: {selectedCollective.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Producer and Album */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">Producer</label>
                  <input
                    type="text"
                    value={editForm.producer}
                    onChange={(e) => setEditForm({ ...editForm, producer: e.target.value })}
                    className="input"
                    placeholder="Producer name"
                  />
                </div>
                <div>
                  <label className="block text-white font-medium mb-2">Album</label>
                  <input
                    type="text"
                    value={editForm.album}
                    onChange={(e) => setEditForm({ ...editForm, album: e.target.value })}
                    className="input"
                    placeholder="Album name"
                  />
                </div>
              </div>
              {/* Featuring Artists */}
              <div>
                <label className="block text-white font-medium mb-2">Featuring (comma-separated)</label>
                <input
                  type="text"
                  value={editForm.featuring.join(', ')}
                  onChange={(e) => setEditForm({ ...editForm, featuring: e.target.value.split(',').map(t => t.trim()).filter(t => t) })}
                  className="input"
                  placeholder="Artist 1, Artist 2, Artist 3"
                />
              </div>
   {/* Tags */}
   <div>
                <label className="block text-white font-medium mb-2">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onBlur={handleTagInputBlur}
                  onKeyDown={handleTagInputKeyDown}
                  className="input"
                  placeholder="pop, indie, summer, upbeat"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Type tags separated by commas. Press Enter or click away to save.
                </p>
              </div>
              {/* Elements */}
              <div>
                <label className="block text-white font-medium mb-2">Elements (comma-separated)</label>
                <input
                  type="text"
                  value={editForm.elements.join(', ')}
                  onChange={(e) => setEditForm({ ...editForm, elements: e.target.value.split(',').map(e => e.trim()).filter(e => e) })}
                  className="input"
                  placeholder="guitar, drums, bass, synthesizer, vocals"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Enter musical elements/instruments separated by commas
                </p>
              </div>

              {/* Genres and Release Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">Genres (comma-separated)</label>
                  <input
                    type="text"
                    value={editForm.genres.join(', ')}
                    onChange={(e) => setEditForm({ ...editForm, genres: e.target.value.split(',').map(g => g.trim()).filter(g => g) })}
                    className="input"
                    placeholder="pop, indie, rock, electronic"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Enter multiple genres separated by commas
                  </p>
                </div>
                <div>
                  <label className="block text-white font-medium mb-2">Release Date</label>
                  <input
                    type="date"
                    value={editForm.releaseDate}
                    onChange={(e) => setEditForm({ ...editForm, releaseDate: e.target.value })}
                    className="input"
                  />
                </div>
              </div>

              {/* Duration and Explicit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">Duration (seconds)</label>
                  <input
                    type="number"
                    value={editForm.duration}
                    onChange={(e) => setEditForm({ ...editForm, duration: parseInt(e.target.value) || 0 })}
                    className="input"
                    placeholder="Duration in seconds"
                  />
                </div>
                <div className="flex items-center mt-8">
                  <input
                    type="checkbox"
                    id="explicit"
                    checked={editForm.explicit}
                    onChange={(e) => setEditForm({ ...editForm, explicit: e.target.checked })}
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="explicit" className="ml-2 text-white font-medium">
                    Explicit Content
                  </label>
                </div>
              </div>

            
              {/* Description */}
              <div>
                <label className="block text-white font-medium mb-2">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="input min-h-[100px]"
                  placeholder="Song description..."
                />
              </div>

              {/* Lyrics */}
              <div>
                <label className="block text-white font-medium mb-2">Lyrics</label>
                <textarea
                  value={editForm.lyrics}
                  onChange={(e) => setEditForm({ ...editForm, lyrics: e.target.value })}
                  className="input min-h-[200px] font-mono text-sm"
                  placeholder="Enter lyrics..."
                />
              </div>

              {/* Enhanced Metadata Section */}
              <div className="border-t border-gray-600 pt-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <Music className="h-5 w-5 mr-2 text-purple-400" />
                  Enhanced Metadata
                </h3>

                {/* Creator Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-white font-medium mb-2">Composer</label>
                    <input
                      type="text"
                      value={editForm.composer}
                      onChange={(e) => setEditForm({ ...editForm, composer: e.target.value })}
                      className="input"
                      placeholder="Composer name"
                    />
                  </div>
                  <div>
                    <label className="block text-white font-medium mb-2">Songwriter</label>
                    <input
                      type="text"
                      value={editForm.mediawriter}
                      onChange={(e) => setEditForm({ ...editForm, mediawriter: e.target.value })}
                      className="input"
                      placeholder="Songwriter name"
                    />
                  </div>
                
    {/* EP */}
               <div>
                <label className="block text-white font-medium mb-2">EP</label>
                <input
                  type="text"
                  value={editForm.EP}
                  onChange={(e) => setEditForm({ ...editForm, EP: e.target.value })}
                  className="input"
                  placeholder="Extended Play name"
                />
              </div>

                {/* Label */}
                <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-4">
                  <div className="relative" ref={editFormRef}>
                    <label className="block text-white font-medium mb-2">Label</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={labelSearchQuery}
                        onChange={(e) => {
                          const value = e.target.value;
                          setLabelSearchQuery(value);
                          setEditForm({ ...editForm, label: value });
                          if (!value) {
                            setSelectedLabel(null);
                            setShowLabelDropdown(false);
                          }
                        }}
                        onFocus={() => {
                          if (labelSearchQuery && labelSearchResults.length > 0) {
                            setShowLabelDropdown(true);
                          }
                        }}
                        className="input"
                        placeholder="Search for a label..."
                      />
                      {selectedLabel && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLabel(null);
                            setLabelSearchQuery('');
                            setEditForm({ ...editForm, label: '' });
                            setShowLabelDropdown(false);
                          }}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                          title="Clear label"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {showLabelDropdown && labelSearchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {labelSearchResults.map((label) => (
                          <button
                            key={label._id}
                            type="button"
                            onClick={() => {
                              setSelectedLabel(label);
                              setLabelSearchQuery(label.name);
                              setEditForm({ ...editForm, label: label.name });
                              setShowLabelDropdown(false);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-gray-700 text-white flex items-center gap-3 transition-colors"
                          >
                            <img
                              src={label.profilePicture || DEFAULT_PROFILE_PIC}
                              alt={label.name}
                              className="h-8 w-8 rounded object-cover flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_PROFILE_PIC;
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{label.name}</div>
                              {label.description && (
                                <div className="text-sm text-gray-400 truncate">{label.description}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {isSearchingLabels && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      </div>
                    )}
                    {selectedLabel && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                        <CheckCircle className="h-4 w-4 text-green-400" />
                        <span>Linked to: {selectedLabel.name}</span>
                      </div>
                    )}
                  </div>
                </div>
                </div>

                {/* Technical Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-white font-medium mb-2">Bitrate (kbps)</label>
                    <input
                      type="number"
                      value={editForm.bitrate}
                      onChange={(e) => setEditForm({ ...editForm, bitrate: parseInt(e.target.value) || 0 })}
                      className="input"
                      placeholder="320"
                    />
                  </div>
                  <div>
                    <label className="block text-white font-medium mb-2">Sample Rate (Hz)</label>
                    <input
                      type="number"
                      value={editForm.sampleRate}
                      onChange={(e) => setEditForm({ ...editForm, sampleRate: parseInt(e.target.value) || 0 })}
                      className="input"
                      placeholder="44100"
                    />
                  </div>
                  <div>
                    <label className="block text-white font-medium mb-2">Pitch (Hz)</label>
                    <input
                      type="number"
                      step="1"
                      value={editForm.pitch}
                      onChange={(e) => setEditForm({ ...editForm, pitch: parseInt(e.target.value) || 440 })}
                      className="input"
                      placeholder="440"
                    />
                  </div>
                </div>


              {/* BPM and Key */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">BPM</label>
                  <input
                    type="number"
                    value={editForm.bpm}
                    onChange={(e) => setEditForm({ ...editForm, bpm: parseInt(e.target.value) || 0 })}
                    className="input"
                    placeholder="Beats per minute"
                  />
                </div>
                <div>
                  <label className="block text-white font-medium mb-2">Key</label>
                  <input
                    type="text"
                    value={editForm.key}
                    onChange={(e) => setEditForm({ ...editForm, key: e.target.value })}
                    className="input"
                    placeholder="Musical key (e.g., C Major)"
                  />
                </div>
              </div>

                {/* Time Signature and Language */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-white font-medium mb-2">Time Signature</label>
                    <input
                      type="text"
                      value={editForm.timeSignature}
                      onChange={(e) => setEditForm({ ...editForm, timeSignature: e.target.value })}
                      className="input"
                      placeholder="4/4"
                    />
                  </div>
                  <div>
                    <label className="block text-white font-medium mb-2">Language</label>
                    <input
                      type="text"
                      value={editForm.language}
                      onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                      className="input"
                      placeholder="en"
                    />
                  </div>
                </div>
                 {/* ISRC and UPC */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">ISRC</label>
                  <input
                    type="text"
                    value={editForm.isrc}
                    onChange={(e) => setEditForm({ ...editForm, isrc: e.target.value })}
                    className="input"
                    placeholder="ISRC code"
                  />
                </div>
                <div>
                  <label className="block text-white font-medium mb-2">UPC</label>
                  <input
                    type="text"
                    value={editForm.upc}
                    onChange={(e) => setEditForm({ ...editForm, upc: e.target.value })}
                    className="input"
                    placeholder="UPC code"
                  />
                </div>
              </div>

                {/* Cover Art URL */}
                <div>
                  <label className="block text-white font-medium mb-2">Cover Art URL</label>
                  <input
                    type="url"
                    value={editForm.coverArt}
                    onChange={(e) => setEditForm({ ...editForm, coverArt: e.target.value })}
                    className="input"
                    placeholder="https://example.com/cover.jpg"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleSaveTune}
                className="btn-primary flex-1 flex items-center justify-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>Save Changes</span>
              </button>
              <button
                onClick={() => setIsEditingTune(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Link Modal */}
      {showAddLinkModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">
                Add {selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)} Link
              </h2>
              <button
                onClick={() => {
                  setShowAddLinkModal(false);
                  setSelectedPlatform('');
                  setNewLinkUrl('');
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-white font-medium mb-2">
                  {selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)} URL
                </label>
                <input
                  type="url"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  className="input"
                  placeholder={`https://${selectedPlatform}.com/...`}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-2">
                  Enter the full URL to this track on {selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)}
                </p>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleSaveLink}
                disabled={!newLinkUrl.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Link
              </button>
              <button
                onClick={() => {
                  setShowAddLinkModal(false);
                  setSelectedPlatform('');
                  setNewLinkUrl('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {media && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          reportType="media"
          targetId={media._id}
          targetTitle={`${media.title} by ${Array.isArray(media.artist) ? media.artist.map((a: any) => a.name).join(', ') : media.artist}`}
        />
      )}
    </div>
  );
};

export default TuneProfile;
