import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
  Users,
  Upload,
  Minus,
  Plus,
  Share2,
  Copy,
  Check,
  ChevronDown,
  Twitter,
  Facebook,
  Linkedin,
  Instagram
} from 'lucide-react';
import { mediaAPI, claimAPI, labelAPI, collectiveAPI, partyAPI, userAPI } from '../lib/api';
import TopBidders from '../components/TopBidders';
import TopSupporters from '../components/TopSupporters';
import ReportModal from '../components/ReportModal';
import { useAuth } from '../contexts/AuthContext';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { canEditMedia } from '../utils/permissionHelpers';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import MediaOwnershipTab from '../components/ownership/MediaOwnershipTab';
import BidConfirmationModal from '../components/BidConfirmationModal';
import MultiArtistInput from '../components/MultiArtistInput';
import type { ArtistEntry } from '../components/MultiArtistInput';
import ClickableArtistDisplay from '../components/ClickableArtistDisplay';

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

const createArtistEntry = (name: string = '', overrides: Partial<ArtistEntry> = {}): ArtistEntry => ({
  id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
  name,
  relationToNext: null,
  ...overrides
});

const TuneProfile: React.FC = () => {
  const { mediaId: mediaId } = useParams<{ mediaId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // Edit mode - controlled by query params (similar to UserProfile settings mode)
  const isEditMode = searchParams.get('edit') === 'true';
  const editTab = (searchParams.get('tab') as 'info' | 'edit' | 'ownership') || 'info';
  const [tagInput, setTagInput] = useState(''); // Separate state for tag input
  const [genresInput, setGenresInput] = useState(''); // Separate state for genres input
  const [elementsInput, setElementsInput] = useState(''); // Separate state for elements input
  const [featuringInput, setFeaturingInput] = useState(''); // Separate state for featuring input
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
  
  // Creator/Artist autocomplete state
  const [artistSearchResults, setArtistSearchResults] = useState<any[]>([]);
  const [isSearchingArtists, setIsSearchingArtists] = useState(false);
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<{ _id: string; artistName: string; username: string; uuid: string } | null>(null);
  const artistSearchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
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
    releaseYear: null as number | null,
    releaseYearOnly: false, // Toggle for year-only mode
    duration: '0:00', // Store as MM:SS string
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
  const [useMultipleArtists, setUseMultipleArtists] = useState(false);
  const [artistEntries, setArtistEntries] = useState<ArtistEntry[]>([]);
  const [artistEntriesInitialized, setArtistEntriesInitialized] = useState(false);

  // Add Link modal state
  const [showAddLinkModal, setShowAddLinkModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // Global bidding state
  const [minimumBid, setMinimumBid] = useState<number>(0.01);
  const [globalBidInput, setGlobalBidInput] = useState<string>('');
  const [isPlacingGlobalBid, setIsPlacingGlobalBid] = useState(false);
  const [showBidConfirmationModal, setShowBidConfirmationModal] = useState(false);
  const [topParties, setTopParties] = useState<any[]>([]);
  const [tagRankings, setTagRankings] = useState<any[]>([]);
  const [hasInitializedBidInput, setHasInitializedBidInput] = useState(false);

  // Add to Other Party modal state
  const [showAddToPartyModal, setShowAddToPartyModal] = useState(false);
  const [availableParties, setAvailableParties] = useState<any[]>([]);
  const [isLoadingParties, setIsLoadingParties] = useState(false);
  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [selectedPartyForAdd, setSelectedPartyForAdd] = useState<any | null>(null);
  const [addToPartyTipAmount, setAddToPartyTipAmount] = useState<string>('');
  const [isAddingToParty, setIsAddingToParty] = useState(false);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);

  // Share functionality state
  const [isMobile, setIsMobile] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);

  // Cover art upload state
  const coverArtFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCoverArt, setIsUploadingCoverArt] = useState(false);

  // WebPlayer integration
  const { setCurrentMedia, setQueue, setGlobalPlayerActive, setCurrentPartyId } = useWebPlayerStore();

  const parsedGlobalBidAmount = useMemo(() => {
    const parsed = parseFloat(globalBidInput);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [globalBidInput]);
  const isGlobalBidValid = Number.isFinite(parsedGlobalBidAmount) && parsedGlobalBidAmount >= minimumBid;

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

  // Fetch global party minimum bid
  useEffect(() => {
    const fetchGlobalPartyMinimumBid = async () => {
      try {
        const response = await partyAPI.getParties();
        const globalParty = response.parties.find((p: any) => p.type === 'global');
        if (globalParty && globalParty.minimumBid) {
          setMinimumBid(globalParty.minimumBid);
          if (!hasInitializedBidInput && media) {
            const avgBid = calculateGlobalMediaBidAvg(media);
            const initialBid = Math.max(0.33, avgBid || 0, globalParty.minimumBid);
            setGlobalBidInput(initialBid.toFixed(2));
            setHasInitializedBidInput(true);
          }
        } else if (!hasInitializedBidInput && media) {
          const avgBid = calculateGlobalMediaBidAvg(media);
          const initialBid = Math.max(0.33, avgBid || 0);
          setGlobalBidInput(initialBid.toFixed(2));
          setHasInitializedBidInput(true);
        }
      } catch (error) {
        console.error('Error fetching global party minimum bid:', error);
        // Keep default 0.01 if fetch fails
      }
    };
    fetchGlobalPartyMinimumBid();
  }, [hasInitializedBidInput, media]);

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

  // Calculate GlobalMediaBidAvg (average individual bid amount, returns in pounds)
  const calculateGlobalMediaBidAvg = (mediaData: Media) => {
    const bids = mediaData.bids || [];
    if (bids.length === 0) return 0;
    const total = bids.reduce((sum, bid) => sum + bid.amount, 0);
    const avgPence = total / bids.length;
    return penceToPoundsNumber(avgPence); // Convert pence to pounds
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

  // Detect mobile device for share functionality
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Search creators/artists by artistName
  const searchArtists = async (query: string) => {
    if (!query || query.trim().length < 2) {
      setArtistSearchResults([]);
      setShowArtistDropdown(false);
      return;
    }
    
    // Clear previous debounce
    if (artistSearchDebounceRef.current) {
      clearTimeout(artistSearchDebounceRef.current);
    }
    
    artistSearchDebounceRef.current = setTimeout(async () => {
      setIsSearchingArtists(true);
      try {
        const response = await userAPI.searchUsers({ search: query.trim(), limit: 10 });
        // Filter to only show users with artistName (creators)
        const creators = (response.users || []).filter((user: any) => user.artistName);
        setArtistSearchResults(creators);
        setShowArtistDropdown(creators.length > 0);
      } catch (error) {
        console.error('Error searching artists:', error);
        setArtistSearchResults([]);
        setShowArtistDropdown(false);
      } finally {
        setIsSearchingArtists(false);
      }
    }, 300);
  };

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

  // Handlers for edit mode navigation
  const handleEditClick = () => {
    setSearchParams({ edit: 'true', tab: 'edit' });
  };

  const handleEditTabChange = (tab: 'info' | 'edit' | 'ownership') => {
    setSearchParams({ edit: 'true', tab });
  };

  const exitEditMode = () => {
    setSearchParams({});
  };

  // Populate edit form when media loads (always populate, not just in edit mode)
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
      
      // Check if we have releaseYear but no releaseDate (year-only mode)
      const releaseYear = (media as any).releaseYear || null;
      const releaseYearOnly = !media.releaseDate && releaseYear !== null;
      
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
        releaseYear: releaseYear,
        releaseYearOnly: releaseYearOnly,
        duration: media.duration ? secondsToMMSS(media.duration) : '0:00',
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
        coverArt: media.coverArt || DEFAULT_COVER_ART // Always show the URL that's actually stored (or default)
      });
      // Set tag input as comma-separated string
      setTagInput(media.tags?.join(', ') || '');
      // Set other comma-separated inputs
      setGenresInput(genresArray.join(', ') || '');
      setElementsInput((media.elements || []).join(', ') || '');
      setFeaturingInput(featuringNames.join(', ') || '');
      
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
      
      // Set selected artist/creator if artist has userId
      const existingArtist = (media as any).artist?.[0];
      if (existingArtist && existingArtist.userId) {
        // If userId is an object (populated), use it directly
        const user = existingArtist.userId;
        if (typeof user === 'object' && user._id) {
          setSelectedArtist({
            _id: user._id,
            artistName: user.creatorProfile?.artistName || existingArtist.name || '',
            username: user.username || '',
            uuid: user.uuid || ''
          });
        } else if (typeof user === 'string') {
          // If it's just an ID, we'd need to fetch it, but for now just set the name
          // The userId will be preserved when saving
        }
      } else {
        setSelectedArtist(null);
      }
      
      // Set selected collective if artist has collectiveId
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

  useEffect(() => {
    if (!media || artistEntriesInitialized) return;
    
    const rawArtistArray = Array.isArray((media as any)?.artists)
      ? (media as any).artists
      : Array.isArray((media as any)?.artist)
      ? (media as any).artist
      : [];
    
    if (rawArtistArray.length > 0) {
      const entries = rawArtistArray.map((artist: any, index: number, arr: any[]) => {
        const name = typeof artist === 'string' ? artist : artist?.name || '';
        const userId =
          typeof artist?.userId === 'object'
            ? artist.userId?._id
            : artist?.userId || null;
        const userUuid =
          typeof artist?.userId === 'object'
            ? artist.userId?.uuid
            : (artist as any)?.userUuid || null;
        return createArtistEntry(name, {
          userId,
          userUuid,
          relationToNext:
            artist?.relationToNext !== undefined
              ? artist.relationToNext
              : index === arr.length - 1
              ? null
              : artist?.relationToNext || null
        });
      });
      setArtistEntries(entries);
      setUseMultipleArtists(entries.length > 1);
    } else {
      const fallbackName =
        typeof (media as any)?.artist === 'string'
          ? (media as any).artist
          : getCreatorDisplay(media);
      setArtistEntries([createArtistEntry(fallbackName || '')]);
      setUseMultipleArtists(false);
    }
    
    setArtistEntriesInitialized(true);
  }, [media, artistEntriesInitialized]);

  useEffect(() => {
    if (useMultipleArtists) {
      const joined = artistEntries.map(entry => entry.name?.trim()).filter(Boolean).join(' & ');
      setEditForm(prev => ({ ...prev, artist: joined }));
    }
  }, [artistEntries, useMultipleArtists]);

  const handleMultipleArtistsToggle = (checked: boolean) => {
    setUseMultipleArtists(checked);
    if (checked) {
      if (artistEntries.length === 0) {
        const fallback = editForm.artist || getCreatorDisplay(media) || '';
        setArtistEntries([
          createArtistEntry(fallback || ''),
          createArtistEntry('') // Add second empty entry
        ]);
      } else if (artistEntries.length === 1) {
        // Add a second empty entry if we only have one
        setArtistEntries([...artistEntries, createArtistEntry('')]);
      }
      // If already has 2+ entries, keep them
    } else if (artistEntries.length > 0) {
      setEditForm(prev => ({ ...prev, artist: artistEntries[0].name || '' }));
    }
  };

  // Save media updates
  const handleSaveTune = async () => {
    if (!mediaId) return;
    
    try {
      // Convert input strings to arrays before saving
      const tags = tagInput.split(',').map(t => t.trim()).filter(t => t);
      const genres = genresInput.split(',').map(g => g.trim()).filter(g => g.length > 0);
      const elements = elementsInput.split(',').map(el => el.trim()).filter(el => el.length > 0);
      const featuring = featuringInput.split(',').map(f => f.trim()).filter(f => f.length > 0);
      
      // Convert duration from MM:SS to seconds
      const durationInSeconds = mmssToSeconds(editForm.duration);
      
      // Handle releaseDate and releaseYear
      let releaseDateValue = editForm.releaseDate || null;
      let releaseYearValue = editForm.releaseYear || null;
      
      // If year-only mode, clear releaseDate and use releaseYear
      if (editForm.releaseYearOnly && releaseYearValue) {
        releaseDateValue = null;
      } else if (releaseDateValue) {
        // If full date is provided, releaseYear will be extracted on backend
        releaseYearValue = null; // Let backend extract from date
      }
      
      const updateData: any = {
        ...editForm,
        duration: durationInSeconds,
        tags,
        genres,
        elements,
        featuring,
        labelId: selectedLabel?._id || null, // Send labelId if selected
        releaseDate: releaseDateValue,
        releaseYear: releaseYearValue
      };
      
      // Add collectiveId for artist if collective is selected
      if (collectiveSearchField === 'artist' && selectedCollective) {
        updateData.artistCollectiveId = selectedCollective._id;
      } else {
        updateData.artistCollectiveId = null;
      }
      
      if (useMultipleArtists) {
        const formattedArtists = artistEntries
          .map((entry, index) => ({
            name: entry.name?.trim(),
            userId: entry.userId || null,
            relationToNext:
              index === artistEntries.length - 1 ? null : (entry.relationToNext || '&'),
            verified: false
          }))
          .filter(artist => artist.name && artist.name.length > 0);
        
        if (formattedArtists.length > 0) {
          updateData.artist = formattedArtists;
        }
      } else if (selectedArtist) {
        updateData.artistUserId = selectedArtist._id;
        // Format artist as array with userId
        updateData.artist = [{
          name: editForm.artist,
          userId: selectedArtist._id,
          collectiveId: null,
          verified: false
        }];
      } else if (editForm.artist) {
        // If no creator selected, just send the name
        updateData.artist = [{
          name: editForm.artist,
          userId: null,
          collectiveId: collectiveSearchField === 'artist' && selectedCollective ? selectedCollective._id : null,
          verified: false
        }];
      }
      
      await mediaAPI.updateMedia(media?._id || mediaId, updateData);
      toast.success('Media updated successfully!');
      // Exit edit mode after successful save
      exitEditMode();
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

  // Process genres from input string
  const handleGenresInputBlur = () => {
    const genres = genresInput.split(',').map(g => g.trim()).filter(g => g.length > 0);
    setEditForm({ ...editForm, genres });
  };

  // Process elements from input string
  const handleElementsInputBlur = () => {
    const elements = elementsInput.split(',').map(el => el.trim()).filter(el => el.length > 0);
    setEditForm({ ...editForm, elements });
  };

  // Process featuring from input string
  const handleFeaturingInputBlur = () => {
    const featuring = featuringInput.split(',').map(f => f.trim()).filter(f => f.length > 0);
    setEditForm({ ...editForm, featuring });
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

  // Handle cover art file upload
  const handleCoverArtUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Cover art file size must be less than 5MB');
      return;
    }

    if (!mediaId) {
      toast.error('Media ID not found');
      return;
    }

    setIsUploadingCoverArt(true);
    try {
      const response = await mediaAPI.uploadCoverArt(media?._id || mediaId, file);
      toast.success('Cover art uploaded successfully!');
      // Update the form with the new URL
      setEditForm({ ...editForm, coverArt: response.coverArt });
      // Refresh media data
      await fetchMediaProfile();
    } catch (err: any) {
      console.error('Error uploading cover art:', err);
      toast.error(err.response?.data?.error || 'Failed to upload cover art');
    } finally {
      setIsUploadingCoverArt(false);
      // Reset file input
      if (coverArtFileInputRef.current) {
        coverArtFileInputRef.current.value = '';
      }
    }
  };

  // Handle cover art upload button click
  const handleCoverArtUploadClick = () => {
    coverArtFileInputRef.current?.click();
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

  // Helper functions to convert between MM:SS format and seconds
  const secondsToMMSS = (seconds: number): string => {
    if (!seconds || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const mmssToSeconds = (mmss: string): number => {
    if (!mmss || !mmss.trim()) return 0;
    const parts = mmss.trim().split(':');
    if (parts.length !== 2) return 0;
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    return mins * 60 + secs;
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

  // Load available parties for adding media
  const loadAvailableParties = async () => {
    if (!user) {
      toast.info('Please log in to add tunes to parties');
      navigate('/login');
      return;
    }

    setIsLoadingParties(true);
    try {
      const response = await partyAPI.getParties();
      // Filter out parties where this media is already added (check topParties list)
      // Prefer _id over uuid for comparison
      const topPartyIds = new Set(topParties.map((p: any) => p._id || p.uuid));
      const filteredParties = (response.parties || []).filter((party: any) => {
        // Exclude parties already in the top parties list (media already added there)
        const partyId = party._id || party.uuid;
        return !topPartyIds.has(partyId);
      });
      setAvailableParties(filteredParties);
    } catch (err: any) {
      console.error('Error loading available parties:', err);
      toast.error('Failed to load parties');
    } finally {
      setIsLoadingParties(false);
    }
  };

  // Handle opening Add to Party modal
  const handleOpenAddToPartyModal = () => {
    if (!user) {
      toast.info('Please log in to add tunes to parties');
      navigate('/login');
      return;
    }
    setShowAddToPartyModal(true);
    loadAvailableParties();
    // Initialize tip amount with minimum bid or average bid
    const avgBid = media?.globalMediaAggregate ? (media.globalMediaAggregate / (media.bids?.length || 1)) / 100 : 0;
    const minBid = minimumBid;
    const defaultBid = Math.max(0.33, avgBid || 0, minBid);
    setAddToPartyTipAmount(defaultBid.toFixed(2));
  };

  // Handle adding media to party with tip
  const handleAddToParty = async () => {
    if (!selectedPartyForAdd || !media) {
      toast.error('Please select a party');
      return;
    }

    const tipAmount = parseFloat(addToPartyTipAmount);
    if (!Number.isFinite(tipAmount) || tipAmount < minimumBid) {
      toast.error(`Minimum tip is £${minimumBid.toFixed(2)}`);
      return;
    }

    setIsAddingToParty(true);
    try {
      // Get media URL - prefer YouTube, fallback to first available source
      const mediaSource = selectedPartyForAdd.mediaSource || 'youtube';
      let url = '';
      
      if (mediaSource === 'youtube' && media.sources?.youtube) {
        url = media.sources.youtube;
      } else if (media.sources) {
        // Fallback to first available source
        url = Object.values(media.sources)[0] as string;
      }

      if (!url) {
        toast.error('Media source URL not found. Cannot add to party.');
        setIsAddingToParty(false);
        return;
      }

      // Get artist name (handle both string and array formats)
      const artistName = Array.isArray(media.artist) 
        ? media.artist.map((a: any) => a.name || a).join(', ')
        : media.artist || 'Unknown Artist';

      // Use addMediaToParty which handles adding media and placing bid in one operation
      // Prefer _id (ObjectId) over uuid - resolvePartyId middleware handles both
      const partyIdToUse = selectedPartyForAdd._id || selectedPartyForAdd.uuid;
      if (!partyIdToUse) {
        toast.error('Invalid party ID');
        setIsAddingToParty(false);
        return;
      }
      
      await partyAPI.addMediaToParty(partyIdToUse, {
        url,
        title: media.title,
        artist: artistName,
        bidAmount: tipAmount,
        platform: mediaSource,
        duration: media.duration || 180,
        category: media.category || 'Music'
      });

      toast.success(`Added to ${selectedPartyForAdd.name} with £${tipAmount.toFixed(2)} tip!`);
      
      // Refresh top parties to show the newly added party
      await loadTopParties();
      
      // Close modal and reset state
      setShowAddToPartyModal(false);
      setSelectedPartyForAdd(null);
      setAddToPartyTipAmount('');
    } catch (err: any) {
      console.error('Error adding media to party:', err);
      const errorMessage = err.response?.data?.error || 'Failed to add tune to party';
      toast.error(errorMessage);
    } finally {
      setIsAddingToParty(false);
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
  const handleGlobalBid = () => {
    if (!user) {
      toast.info('Please log in to support this tune');
      const returnUrl = `/tune/${mediaId || media?._id}`;
      navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }

    if (!Number.isFinite(parsedGlobalBidAmount) || parsedGlobalBidAmount < minimumBid) {
      toast.error(`Minimum bid is £${minimumBid.toFixed(2)}`);
      return;
    }

    // Convert balance from pence to pounds for comparison
    const balanceInPounds = penceToPoundsNumber((user as any)?.balance);
    if (balanceInPounds < parsedGlobalBidAmount) {
      toast.error('Insufficient balance. Please top up your wallet.');
      navigate('/wallet');
      return;
    }

    // Show confirmation modal
    setShowBidConfirmationModal(true);
  };

  const handleConfirmGlobalBid = async (_tags: string[]) => {
    if (!user || !mediaId) return;

    setShowBidConfirmationModal(false);
    setIsPlacingGlobalBid(true);

    try {
      // For now, tags are only supported for external media
      // TODO: Update backend to accept tags for existing media bids
      await mediaAPI.placeGlobalBid(mediaId, parsedGlobalBidAmount);
      
      toast.success(`Placed £${parsedGlobalBidAmount.toFixed(2)} tip on "${media?.title}"!`);
      
      // Refresh media data to show updated metrics
      await fetchMediaProfile();
      await loadTopParties();
      
    } catch (err: any) {
      console.error('Error placing global tip:', err);
      toast.error(err.response?.data?.error || 'Failed to place tip');
    } finally {
      setIsPlacingGlobalBid(false);
    }
  };

  // Share functionality
  // Use frontend URL for sharing (canonical URL that users will see)
  // Backend route /api/media/share/:id is for Facebook's crawler to get meta tags
  // Use _id instead of uuid for shorter URLs
  const shareUrl = media?._id 
    ? `${window.location.origin}/tune/${media._id}`
    : window.location.href;
  const creatorDisplay = media ? getCreatorDisplay(media) : null;
  const shareText = `Support your Favourite Tunes and Artists on Tuneable! Check out "${media?.title || 'this tune'}"${creatorDisplay ? ` by ${creatorDisplay}` : ''} and contribute.`;

  // Update Open Graph meta tags for better Facebook sharing
  useEffect(() => {
    if (!media) return;

    // Helper function to get absolute image URL
    const getAbsoluteImageUrl = (imageUrl: string | undefined): string => {
      if (!imageUrl) return `${window.location.origin}${DEFAULT_COVER_ART}`;
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
      }
      if (imageUrl.startsWith('/')) {
        return `${window.location.origin}${imageUrl}`;
      }
      return `${window.location.origin}/${imageUrl}`;
    };

    const ogImage = getAbsoluteImageUrl(media.coverArt);
    const ogTitle = `${media.title}${media.artist ? ` by ${media.artist}` : ''} | Tuneable`;
    const ogDescription = shareText; // Already includes the new caption
    const ogUrl = media?._id 
      ? `${window.location.origin}/tune/${media._id}`
      : window.location.href;

    // Create or update meta tags
    const updateMetaTag = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    // Update Open Graph tags
    updateMetaTag('og:title', ogTitle);
    updateMetaTag('og:description', ogDescription);
    updateMetaTag('og:image', ogImage);
    updateMetaTag('og:url', ogUrl);
    updateMetaTag('og:type', 'music.song');
    updateMetaTag('og:site_name', 'Tuneable');

    // Update Twitter Card tags for better cross-platform sharing
    const updateTwitterTag = (name: string, content: string) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    updateTwitterTag('twitter:card', 'summary_large_image');
    updateTwitterTag('twitter:title', ogTitle);
    updateTwitterTag('twitter:description', ogDescription);
    updateTwitterTag('twitter:image', ogImage);

    // Cleanup function to restore default meta tags when component unmounts
    return () => {
      // Optionally restore default tags here if needed
    };
  }, [media, shareUrl, shareText]);

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: media?.title || 'Tuneable Tune',
          text: shareText,
          url: shareUrl,
        });
      } catch (err: any) {
        // User cancelled or error occurred
        if (err.name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      // Fallback to copy link if native share not available
      handleCopyLink();
    }
  };

  const handleShare = async (platform: string) => {
    try {
      const encodedUrl = encodeURIComponent(shareUrl);
      const encodedText = encodeURIComponent(shareText);

      // For Facebook, use the backend share route so Facebook's crawler can get meta tags
      // The backend route sets og:url to the frontend URL, so users will be redirected there
      // For other platforms, use the frontend URL directly
      // Use _id instead of uuid for shorter URLs
      const facebookShareUrl = media?._id 
        ? `${window.location.origin}/api/media/share/${media._id}`
        : shareUrl;
      const encodedFacebookUrl = encodeURIComponent(facebookShareUrl);
      
      const shareUrls: Record<string, string> = {
        twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedFacebookUrl}&quote=${encodedText}&hashtag=Tuneable`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      };

      // Handle Instagram sharing (copy link to clipboard)
      if (platform === 'instagram') {
        try {
          await navigator.clipboard.writeText(shareUrl);
          setCopySuccess(true);
          toast.success('Link copied! Paste it in your Instagram Story or post.');
          setTimeout(() => setCopySuccess(false), 2000);
          console.log('Instagram share tracked:', { mediaId: media?._id, url: shareUrl });
          return;
        } catch (err) {
          console.error('Failed to copy link:', err);
          toast.error('Failed to copy link. Please copy it manually.');
          return;
        }
      }
      
      if (shareUrls[platform]) {
        const shareWindow = window.open(
          shareUrls[platform], 
          '_blank', 
          'width=600,height=400,menubar=no,toolbar=no,resizable=yes,scrollbars=yes'
        );
        
        // Check if popup was blocked
        if (!shareWindow || shareWindow.closed || typeof shareWindow.closed === 'undefined') {
          toast.warning('Popup blocked. Please allow popups for this site to share.');
        } else {
          // Track share event (placeholder for analytics)
          if (platform === 'facebook' && media?._id) {
            // Example: analytics.track('Share', { platform: 'facebook', mediaId: media._id });
            console.log('Facebook share tracked:', { mediaId: media._id, url: shareUrl });
          }
        }
      }
    } catch (error) {
      console.error(`Error sharing to ${platform}:`, error);
      toast.error(`Failed to open ${platform} share. Please try again.`);
    } finally {
      setShowShareDropdown(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopySuccess(false), 2000);
      setShowShareDropdown(false);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy link');
    }
  };

  // Ref for share dropdown to handle click outside
  const shareDropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside share dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareDropdownRef.current && !shareDropdownRef.current.contains(event.target as Node)) {
        setShowShareDropdown(false);
      }
    };

    if (showShareDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showShareDropdown]);

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
    { 
      label: 'Release Date', 
      value: media.releaseDate 
        ? new Date(media.releaseDate).toLocaleDateString()
        : (media as any).releaseYear 
          ? `${(media as any).releaseYear}`
          : null,
      icon: Calendar 
    },
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
        {/* Tune Profile Header */}
        <div className="mb-6">  
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <button
              onClick={() => navigate(-1)}
              className="px-3 md:px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30 text-sm md:text-base"
            >
              Back
            </button>
            
            {/* Edit Tune & Report Buttons */}
            <div className="flex flex-wrap justify-end gap-2 md:flex-nowrap md:items-center">
            
              {/* Report Button - Always visible */}
              <button
                onClick={() => setShowReportModal(true)}
                className="px-3 md:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
              >
                <Flag className="h-4 w-4" />
                <span className="hidden sm:inline">Report</span>
              </button>
              
              {/* Claim Tune Button - show only when user cannot edit */}
              {!canEditTune() && (
                <button
                  onClick={handleClaimTune}
                  className="px-3 md:px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-1 md:space-x-2 text-sm md:text-base"
                >
                  <Award className="h-4 w-4" />
                  <span className="hidden sm:inline">Claim Tune</span>
                  <span className="sm:hidden">Claim</span>
                </button>
              )}
              
              {/* Edit Tune Button - Only show if user can edit and not in edit mode */}
              {canEditTune() && !isEditMode && (
                <button
                  onClick={handleEditClick}
                  className="px-3 md:px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
                >
                  <span className="hidden sm:inline">Edit Tune</span>
                  <span className="sm:hidden">Edit</span>
                </button>
              )}
              {/* Exit Edit Mode Button - Only show if in edit mode */}
              {canEditTune() && isEditMode && (
                <button
                  onClick={exitEditMode}
                  className="px-3 md:px-4 py-2 bg-gray-600/40 hover:bg-gray-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">Cancel</span>
                </button>
              )}
            </div>
          </div>
          
          <div className="card p-4 md:p-6 flex flex-col md:flex-row items-start relative">
            {/* Album Art with Play Button Overlay */}
            <div className="w-full md:w-auto flex justify-center md:justify-start mb-2 md:mr-6 relative group">
              <img
                src={media.coverArt || DEFAULT_COVER_ART}
                alt={`${media.title} cover`}
                className="w-56 h-56 sm:w-64 sm:h-64 md:w-auto md:h-auto md:max-w-sm rounded-lg shadow-xl object-cover"
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
              <h1 className="text-2xl md:text-4xl font-bold text-center md:text-left px-2">{media.title}</h1>
              <div className="text-lg md:text-3xl text-purple-300 mb-2 text-center md:text-left px-2
              ">
                <ClickableArtistDisplay media={media} />
              </div>
              
              {/* Tip Metrics Grid */}
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-3 md:grid-cols-3 gap-y-2 md:gap-4 px-2 md:px-0">
                {/* Tip Total */}
                <div className="card bg-black/20 rounded-lg p-3 md:p-4 border-l-4 border-green-500/50">
                  <div className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wide mb-1">Tip Total</div>
                  <div className="text-base md:text-2xl font-bold text-green-400">
                    {penceToPounds(media.globalMediaAggregate)}
                  </div>
                </div>
                
                {/* Total Tips Count */}
                <div className="card bg-black/20 rounded-lg p-3 md:p-4 border-l-4 border-cyan-500/50">
                  <div className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wide mb-1">Total Tips</div>
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
                
                {/* Top Tip - Hidden on mobile */}
                <div className="hidden md:block card bg-black/20 rounded-lg p-4 border-l-4 border-yellow-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Top Tip</div>
                  <div className="text-2xl font-bold text-yellow-400">
                    {penceToPounds(media.globalMediaBidTop)}
                  </div>
                </div>
                
                {/* Average Tip - Hidden on mobile */}
                <div className="hidden md:block card bg-black/20 rounded-lg p-4 border-l-4 border-blue-500/50">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Avg Tip</div>
                  <div className="text-2xl font-bold text-blue-400">
                    £{calculateGlobalMediaBidAvg(media).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* External Source Links - Desktop only */}
              {getExternalLinks().length > 0 && (
                <div className="hidden md:block my-4">
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
                <div className="my-4">
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

        {/* Share Button - Centered below header */}
        <div className="flex justify-center mb-6" ref={shareDropdownRef}>
            {isMobile ? (
              <button
                onClick={handleNativeShare}
                className="px-3 md:px-4 py-2 bg-gray-900/80 hover:bg-gray-800/80 text-white font-semibold rounded-lg border-2 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)] transition-all flex items-center space-x-2 text-sm md:text-base"
              >
                <Share2 className="h-4 w-4" />
                <span className="inline">Share</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setShowShareDropdown(!showShareDropdown)}
                  className="px-3 md:px-4 py-2 bg-gray-900/80 hover:bg-gray-800/80 text-white font-semibold rounded-lg border-2 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)] transition-all flex items-center space-x-2 text-sm md:text-base"
                >
                  <Share2 className="h-4 w-4" />
                  <span className="inline">Share</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showShareDropdown ? 'rotate-180' : ''}`} />
                </button>
                
                {showShareDropdown && (
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 bg-gray-900/95 border-2 border-purple-500/50 rounded-lg shadow-xl z-50 overflow-hidden">
                    <button
                      onClick={() => handleShare('twitter')}
                      className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white"
                    >
                      <Twitter className="h-5 w-5 text-blue-400" />
                      <span>Twitter/X</span>
                    </button>
                    <button
                      onClick={() => handleShare('facebook')}
                      className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white"
                    >
                      <Facebook className="h-5 w-5 text-blue-500" />
                      <span>Facebook</span>
                    </button>
                    <button
                      onClick={() => handleShare('linkedin')}
                      className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white"
                    >
                      <Linkedin className="h-5 w-5 text-blue-600" />
                      <span>LinkedIn</span>
                    </button>
                    <button
                      onClick={() => handleShare('whatsapp')}
                      className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white"
                    >
                      <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      <span>WhatsApp</span>
                    </button>
                    <button
                      onClick={() => handleShare('instagram')}
                      className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white"
                    >
                      <Instagram className="h-5 w-5 text-pink-500" />
                      <span>Instagram</span>
                    </button>
                    <button
                      onClick={handleCopyLink}
                      className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white border-t border-gray-700/50"
                    >
                      {copySuccess ? (
                        <>
                          <Check className="h-5 w-5 text-green-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-5 w-5 text-gray-400" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        {/* Tab Navigation - Only show when in edit mode */}
        {isEditMode && canEditTune() && (
          <div className="mb-6 border-b border-gray-700">
            <nav className="flex space-x-8">
              <button
                onClick={() => handleEditTabChange('info')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  editTab === 'info'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Tune Info
              </button>
              <button
                onClick={() => handleEditTabChange('edit')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  editTab === 'edit'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Edit Tune
              </button>
              <button
                onClick={() => handleEditTabChange('ownership')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  editTab === 'ownership'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Ownership
              </button>
            </nav>
          </div>
        )}

        {/* Tab Content */}
        {!isEditMode ? (
          /* NORMAL VIEW - All existing content */
          <>
        {/* Global Tip Section - Support This Tune */}
        <div className="mb-6 px-2 md:px-0">
          <div className="max-w-2xl mx-auto">
            <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 border-2 border-purple-500/30 rounded-lg p-4 md:p-8 text-center">
              <h3 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center justify-center">
                <Coins className="h-5 w-5 md:h-7 md:w-7 mr-2 md:mr-3 text-yellow-400" />
                Support This Tune
              </h3>
              <p className="text-gray-300 text-sm md:text-base mb-4 md:mb-6">
                Boost this tune's global ranking and support the artist
              </p>
              
              <div className="flex flex-row items-center justify-center mb-4">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(globalBidInput) || minimumBid;
                    const newAmount = Math.max(minimumBid, current - 0.01);
                    setGlobalBidInput(newAmount.toFixed(2));
                    setHasInitializedBidInput(true);
                  }}
                  disabled={isPlacingGlobalBid || parseFloat(globalBidInput) <= minimumBid}
                  className="px-2 md:px-3 py-3 md:py-4 bg-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-tl-xl rounded-bl-xl transition-colors flex items-center justify-center"
                >
                  <Minus className="h-4 w-4 md:h-5 md:w-5 text-white" />
                </button>
                <div className="flex items-center bg-gray-800 overflow-hidden">
                  <input
                    type="number"
                    step="0.01"
                    min={minimumBid}
                    value={globalBidInput}
                    onChange={(e) => {
                      setHasInitializedBidInput(true);
                      setGlobalBidInput(e.target.value);
                    }}
                    className="w-24 bg-gray-800 p-2 md:p-3 text-white text-xl md:text-2xl font-bold text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const current = parseFloat(globalBidInput) || minimumBid;
                    const balanceInPounds = user ? penceToPoundsNumber((user as any)?.balance) : 999999;
                    const newAmount = Math.min(balanceInPounds || 999999, current + 0.01);
                    setGlobalBidInput(newAmount.toFixed(2));
                    setHasInitializedBidInput(true);
                  }}
                  disabled={isPlacingGlobalBid || (user ? (() => {
                    const balanceInPounds = penceToPoundsNumber((user as any)?.balance);
                    return balanceInPounds > 0 && parseFloat(globalBidInput) >= balanceInPounds;
                  })() : false)}
                  className="px-2 md:px-3 py-3 md:py-4 bg-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-tr-xl rounded-br-xl transition-colors flex items-center justify-center"
                >
                  <Plus className="h-4 w-4 md:h-5 md:w-5 text-white" />
                </button>
                <button
                  onClick={handleGlobalBid}
                  disabled={isPlacingGlobalBid || !isGlobalBidValid}
                  className="w-auto px-6 md:px-8 ml-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all flex items-center justify-center space-x-2 text-base md:text-lg"
                >
                  {isPlacingGlobalBid ? (
                    <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Placing Bid...</span>
                  ) : (
                    <span>
                      {!user ? 'Sign in to Tip' : (isGlobalBidValid ? `Tip £${globalBidInput}` : 'Enter Tip')}
                    </span>
                  )}
                </button>
              </div>
                
                {/* Quick amounts */}
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {[0.01, 1.11, 5.55, 11.11, 22.22].map(amount => (
                    <button
                      key={amount}
                      onClick={() => setGlobalBidInput(amount.toFixed(2))}
                      className="px-3 md:px-4 py-1.5 md:py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs md:text-sm rounded-full transition-colors font-medium"
                    >
                      £{amount.toFixed(2)}
                    </button>
                  ))}
                </div>
                
                {user && (
                  <p className="text-xs md:text-sm text-gray-400">
                    Your balance: {penceToPounds((user as any)?.balance)}
                  </p>
                )}
                {!user && (
                  <p className="text-xs md:text-sm text-gray-400">
                    Sign in to tip and support this tune
                  </p>
                )}
              </div>
            </div>
          </div>

        {/* Top Supporters */}
        {media.bids && media.bids.length > 0 && (
          <div className="mb-6 px-2 md:px-0">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-4 flex items-center justify-center md:text-left">
              <Heart className="h-5 w-5 md:h-6 md:w-6 mr-2 text-pink-400" />
              Top Supporters
            </h2>
            <div className="card bg-black/20 rounded-lg p-4 md:p-6">
              <TopSupporters bids={media.bids} maxDisplay={10} />
            </div>
          </div>
        )}

        {/* Top Tips */}
        {media.bids && media.bids.length > 0 && (
          <div className="mb-6 px-2 md:px-0">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-4 flex items-center justify-center md:text-left">
              <Coins className="h-5 w-5 md:h-6 md:w-6 mr-2 text-yellow-400" />
              Top Tips
            </h2>
            <div className="card bg-black/20 rounded-lg p-4 md:p-6">
              <TopBidders bids={media.bids} maxDisplay={5} />
            </div>
          </div>
        )}

        {/* Top Parties */}
        <div className="mb-6 px-2 md:px-0">
          <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-4 flex items-center justify-center md:text-left">
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
                          {penceToPounds(party.partyMediaAggregate || 0)}
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
            
            {/* Add to Other Party Button */}
            {user && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <button
                  onClick={handleOpenAddToPartyModal}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add to Other Party</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tag Rankings */}
        {tagRankings.length > 0 && (
          <div className="mb-8 px-2 md:px-0">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-1 md:mb-4 flex items-center justify-center md:text-left">
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
                // Special handling for Artist field to use ClickableArtistDisplay
                const isArtistField = field.label === 'Artist';
                
                return (
                  <div key={index} className="flex items-start space-x-3">
                    <IconComponent className="w-5 h-5 text-purple-400 mt-1 flex-shrink-0" />
                    <div>
                      <div className="text-sm text-gray-300">{field.label}</div>
                      <div className="text-white font-medium">
                        {isArtistField ? (
                          <ClickableArtistDisplay media={media} />
                        ) : (
                          getFieldValue(field.value, (field as any).fieldName)
                        )}
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
          <div className="mb-8 hidden px-2">
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
          </>
        ) : (
          /* EDIT MODE - Tab Content */
          <>
            {editTab === 'info' && (
              /* Tune Info Tab - Show normal content when viewing info tab in edit mode */
              <div className="space-y-8">
                {/* Global Bid Section - Support This Tune */}
                <div className="mb-6 px-2 md:px-0">
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
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseFloat(globalBidInput) || minimumBid;
                            const newAmount = Math.max(minimumBid, current - 0.01);
                            setGlobalBidInput(newAmount.toFixed(2));
                            setHasInitializedBidInput(true);
                          }}
                          disabled={isPlacingGlobalBid || parseFloat(globalBidInput) <= minimumBid}
                          className="px-2 md:px-3 py-2 md:py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center"
                        >
                          <Minus className="h-4 w-4 md:h-5 md:w-5 text-white" />
                        </button>
                        <div className="flex items-center bg-gray-800 border border-gray-600 rounded-lg overflow-hidden">
                          <span className="px-2 md:px-3 text-gray-400 text-lg md:text-xl">£</span>
                          <input
                            type="number"
                            step="0.01"
                            min={minimumBid}
                            value={globalBidInput}
                            onChange={(e) => {
                              setHasInitializedBidInput(true);
                              setGlobalBidInput(e.target.value);
                            }}
                            className="w-24 md:w-28 bg-gray-800 p-2 md:p-3 text-white text-xl md:text-2xl font-bold text-center focus:outline-none border-l border-gray-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const current = parseFloat(globalBidInput) || minimumBid;
                            const balanceInPounds = user ? penceToPoundsNumber((user as any)?.balance) : 999999;
                            const newAmount = Math.min(balanceInPounds || 999999, current + 0.01);
                            setGlobalBidInput(newAmount.toFixed(2));
                            setHasInitializedBidInput(true);
                          }}
                          disabled={isPlacingGlobalBid || (user ? (() => {
                            const balanceInPounds = penceToPoundsNumber((user as any)?.balance);
                            return balanceInPounds > 0 && parseFloat(globalBidInput) >= balanceInPounds;
                          })() : false)}
                          className="px-2 md:px-3 py-2 md:py-3 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center"
                        >
                          <Plus className="h-4 w-4 md:h-5 md:w-5 text-white" />
                        </button>
                        <button
                          onClick={handleGlobalBid}
                          disabled={isPlacingGlobalBid || !isGlobalBidValid}
                          className="px-6 md:px-8 py-2 md:py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                        >
                          {isPlacingGlobalBid ? (
                            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Placing...</span>
                          ) : (
                            <span>
                              {!user ? 'Sign in to Tip' : (isGlobalBidValid ? `Bid £${globalBidInput}` : 'Enter Bid')}
                            </span>
                          )}
                        </button>
                      </div>
                      
                      {/* Quick amounts */}
                      <div className="flex flex-wrap justify-center gap-2 mb-4">
                        {[0.01, 1.11, 5.55, 11.11, 22.22].map(amount => (
                          <button
                            key={amount}
                            onClick={() => setGlobalBidInput(amount.toFixed(2))}
                            className="px-3 md:px-4 py-1.5 md:py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs md:text-sm rounded-full transition-colors font-medium"
                          >
                            £{amount.toFixed(2)}
                          </button>
                        ))}
                      </div>
                      
                      <p className="text-xs md:text-sm text-gray-400">
                        Minimum bid: £{minimumBid.toFixed(2)}
                      </p>
                      {user && (
                        <p className="text-xs md:text-sm text-gray-400 mt-2">
                          Your balance: {penceToPounds((user as any)?.balance)}
                        </p>
                      )}
                      {!user && (
                        <p className="text-xs md:text-sm text-gray-400 mt-2">
                          Sign in to tip and support this tune
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* All other normal content sections would go here - comments, top bidders, etc. */}
                {/* For now, showing a message that user can switch to edit tab */}
                <div className="card p-6 text-center">
                  <p className="text-gray-300">Switch to the "Edit Tune" tab to modify tune details.</p>
          </div>
        </div>
      )}

            {editTab === 'edit' && (
              /* Edit Tune Tab - Edit Form */
              <div className="card p-6">
                <h2 className="text-2xl font-bold text-white mb-6">Edit Tune</h2>

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
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-white font-medium">Artist *</label>
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        className="accent-purple-600"
                        checked={useMultipleArtists}
                        onChange={(e) => handleMultipleArtistsToggle(e.target.checked)}
                      />
                      Multiple artists
                    </label>
                  </div>
                  {useMultipleArtists ? (
                    <MultiArtistInput
                      value={artistEntries}
                      onChange={setArtistEntries}
                      description="Search and link each primary artist. Choose how their names connect."
                    />
                  ) : (
                    <>
                  <div className="relative">
                    <input
                      type="text"
                      value={editForm.artist}
                      onChange={(e) => {
                        const value = e.target.value;
                        setEditForm({ ...editForm, artist: value });
                        // Clear selections when user types
                        if (collectiveSearchField === 'artist') {
                          setSelectedCollective(null);
                          setCollectiveSearchQuery('');
                          setShowCollectiveDropdown(false);
                        }
                        if (selectedArtist) {
                          setSelectedArtist(null);
                        }
                        // Search for creators/artists
                        if (value.length >= 2) {
                          searchArtists(value);
                        } else {
                          setArtistSearchResults([]);
                          setShowArtistDropdown(false);
                        }
                      }}
                      onFocus={() => {
                        // Show artist dropdown if there are results
                        if (artistSearchResults.length > 0) {
                          setShowArtistDropdown(true);
                        }
                        // Optionally show collective search if query exists
                        if (collectiveSearchField === 'artist' && collectiveSearchQuery) {
                          setShowCollectiveDropdown(true);
                        }
                      }}
                      className="input pr-20"
                      placeholder="Artist name (autocomplete by artist name)"
                    />
                    {/* Artist autocomplete dropdown */}
                    {showArtistDropdown && artistSearchResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto" style={{ top: '100%', left: 0 }}>
                        {artistSearchResults.map((creator) => (
                          <button
                            key={creator._id}
                            type="button"
                            onClick={() => {
                              setSelectedArtist({
                                _id: creator._id,
                                artistName: creator.artistName || '',
                                username: creator.username,
                                uuid: creator.uuid
                              });
                              setEditForm({ ...editForm, artist: creator.artistName || creator.username });
                              setShowArtistDropdown(false);
                              setArtistSearchResults([]);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-gray-700 text-white flex items-center gap-3 transition-colors"
                          >
                            <img
                              src={creator.profilePic || DEFAULT_PROFILE_PIC}
                              alt={creator.username}
                              className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = DEFAULT_PROFILE_PIC;
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{creator.artistName || creator.username}</div>
                              {creator.artistName && creator.username !== creator.artistName && (
                                <div className="text-sm text-gray-400 truncate">@{creator.username}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {isSearchingArtists && (
                      <div className="absolute right-12 top-1/2 transform -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      </div>
                    )}
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
                  {selectedArtist && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span>Linked to: {selectedArtist.artistName} (@{selectedArtist.username})</span>
                    </div>
                  )}
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
                  <button
                    type="button"
                    className="text-xs text-purple-300 hover:text-white"
                    onClick={() => handleMultipleArtistsToggle(true)}
                  >
                    Multiple Artists? Enable Advanced Mode
                  </button>
                    </>
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
                      value={featuringInput}
                      onChange={(e) => setFeaturingInput(e.target.value)}
                      onBlur={handleFeaturingInputBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleFeaturingInputBlur();
                        }
                      }}
                  className="input"
                  placeholder="Artist 1, Artist 2, Artist 3"
                />
                    <p className="text-xs text-gray-400 mt-1">
                      Type artists separated by commas. Press Enter or click away to save.
                    </p>
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
                      value={elementsInput}
                      onChange={(e) => setElementsInput(e.target.value)}
                      onBlur={handleElementsInputBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleElementsInputBlur();
                        }
                      }}
                  className="input"
                  placeholder="guitar, drums, bass, synthesizer, vocals"
                />
                <p className="text-xs text-gray-400 mt-1">
                      Enter musical elements/instruments separated by commas. Press Enter or click away to save.
                </p>
              </div>

              {/* Genres and Release Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">Genres (comma-separated)</label>
                  <input
                    type="text"
                        value={genresInput}
                        onChange={(e) => setGenresInput(e.target.value)}
                        onBlur={handleGenresInputBlur}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleGenresInputBlur();
                          }
                        }}
                    className="input"
                    placeholder="pop, indie, rock, electronic"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                        Enter multiple genres separated by commas. Press Enter or click away to save.
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-white font-medium">Release Date</label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.releaseYearOnly}
                        onChange={(e) => {
                          setEditForm({ 
                            ...editForm, 
                            releaseYearOnly: e.target.checked,
                            releaseDate: e.target.checked ? '' : editForm.releaseDate
                          });
                        }}
                        className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-400">Year only</span>
                    </label>
                  </div>
                  {editForm.releaseYearOnly ? (
                    <input
                      type="number"
                      min="1900"
                      max="2100"
                      value={editForm.releaseYear || ''}
                      onChange={(e) => {
                        const year = e.target.value ? parseInt(e.target.value) : null;
                        setEditForm({ ...editForm, releaseYear: year });
                      }}
                      placeholder="e.g., 2024"
                      className="input"
                    />
                  ) : (
                    <input
                      type="date"
                      value={editForm.releaseDate}
                      onChange={(e) => setEditForm({ ...editForm, releaseDate: e.target.value })}
                      className="input"
                    />
                  )}
                </div>
              </div>

              {/* Duration and Explicit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white font-medium mb-2">Duration (MM:SS)</label>
                  <input
                    type="text"
                    value={editForm.duration}
                    onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                    className="input"
                    placeholder="3:00"
                    pattern="[0-9]+:[0-5][0-9]"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Format: minutes:seconds (e.g., 3:45 for 3 minutes 45 seconds)
                  </p>
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
                  </div>
                
    {/* EP */}
                    <div className="mb-4">
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
                    <select
                      value={editForm.language}
                      onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                      className="input"
                    >
                      <option value="">Select language (optional)</option>
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="it">Italian</option>
                      <option value="pt">Portuguese</option>
                      <option value="ru">Russian</option>
                      <option value="ja">Japanese</option>
                      <option value="ko">Korean</option>
                      <option value="zh">Chinese</option>
                      <option value="ar">Arabic</option>
                      <option value="hi">Hindi</option>
                      <option value="tr">Turkish</option>
                      <option value="pl">Polish</option>
                      <option value="nl">Dutch</option>
                      <option value="sv">Swedish</option>
                      <option value="no">Norwegian</option>
                      <option value="da">Danish</option>
                      <option value="fi">Finnish</option>
                      <option value="el">Greek</option>
                      <option value="he">Hebrew</option>
                      <option value="th">Thai</option>
                      <option value="vi">Vietnamese</option>
                      <option value="id">Indonesian</option>
                      <option value="ms">Malay</option>
                      <option value="cs">Czech</option>
                      <option value="hu">Hungarian</option>
                      <option value="ro">Romanian</option>
                      <option value="uk">Ukrainian</option>
                      <option value="bg">Bulgarian</option>
                      <option value="hr">Croatian</option>
                      <option value="sr">Serbian</option>
                      <option value="sk">Slovak</option>
                      <option value="sl">Slovenian</option>
                      <option value="et">Estonian</option>
                      <option value="lv">Latvian</option>
                      <option value="lt">Lithuanian</option>
                      <option value="ga">Irish</option>
                      <option value="cy">Welsh</option>
                      <option value="mt">Maltese</option>
                      <option value="sw">Swahili</option>
                      <option value="af">Afrikaans</option>
                      <option value="sq">Albanian</option>
                      <option value="az">Azerbaijani</option>
                      <option value="be">Belarusian</option>
                      <option value="bn">Bengali</option>
                      <option value="bs">Bosnian</option>
                      <option value="ca">Catalan</option>
                      <option value="eu">Basque</option>
                      <option value="fa">Persian</option>
                      <option value="gl">Galician</option>
                      <option value="is">Icelandic</option>
                      <option value="mk">Macedonian</option>
                      <option value="ml">Malayalam</option>
                      <option value="mr">Marathi</option>
                      <option value="ne">Nepali</option>
                      <option value="pa">Punjabi</option>
                      <option value="si">Sinhala</option>
                      <option value="ta">Tamil</option>
                      <option value="te">Telugu</option>
                      <option value="ur">Urdu</option>
                      <option value="zu">Zulu</option>
                    </select>
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
                  <div className="flex space-x-2">
                    <input
                      type="url"
                      value={editForm.coverArt}
                      onChange={(e) => setEditForm({ ...editForm, coverArt: e.target.value })}
                      className="input flex-1"
                      placeholder="https://example.com/cover.jpg"
                    />
                    <button
                      type="button"
                      onClick={handleCoverArtUploadClick}
                      disabled={isUploadingCoverArt}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors flex items-center space-x-2"
                    >
                      {isUploadingCoverArt ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          <span>Upload</span>
                        </>
                      )}
                    </button>
                    <input
                      ref={coverArtFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCoverArtUpload}
                      className="hidden"
                  />
                </div>
                  {editForm.coverArt && (
                    <div className="mt-2 text-sm text-gray-400">
                      Current: {editForm.coverArt}
                    </div>
                  )}
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
                    onClick={exitEditMode}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {editTab === 'ownership' && mediaId && (
              <div className="card p-6">
                <MediaOwnershipTab
                  mediaId={mediaId}
                  canEdit={canEditTune()}
                  currentUser={user as any}
                  mediaTitle={media?.title}
                />
              </div>
            )}
          </>
        )}

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

      {/* Bid Confirmation Modal */}
      <BidConfirmationModal
        isOpen={showBidConfirmationModal}
        onClose={() => setShowBidConfirmationModal(false)}
        onConfirm={handleConfirmGlobalBid}
        bidAmount={parsedGlobalBidAmount}
        mediaTitle={media?.title || 'Unknown'}
        mediaArtist={media?.artist}
        userBalance={penceToPoundsNumber((user as any)?.balance)}
        isLoading={isPlacingGlobalBid}
      />

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

      {/* Add to Other Party Modal */}
      {showAddToPartyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" style={{ zIndex: 10000 }}>
          <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-700">
              <div className="flex items-center space-x-2">
                <Plus className="h-5 w-5 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Add to Party</h3>
              </div>
              <button
                onClick={() => {
                  setShowAddToPartyModal(false);
                  setSelectedPartyForAdd(null);
                  setPartySearchQuery('');
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Media Info */}
              {media && (
                <div className="mb-4 p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    {media.coverArt && (
                      <img 
                        src={media.coverArt} 
                        alt={media.title}
                        className="w-12 h-12 rounded object-cover"
                      />
                    )}
                    <div>
                      <p className="text-white font-medium">{media.title}</p>
                      <p className="text-gray-400 text-sm">{media.artist}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Party Search */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2">
                  Search Parties
                </label>
                <input
                  type="text"
                  value={partySearchQuery}
                  onChange={(e) => setPartySearchQuery(e.target.value)}
                  placeholder="Search by party name or location..."
                  className="input w-full"
                />
              </div>

              {/* Party List */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2">
                  Select Party
                </label>
                {isLoadingParties ? (
                  <div className="text-center py-8 text-gray-400">
                    <Loader2 className="h-8 w-8 mx-auto animate-spin mb-2" />
                    <p>Loading parties...</p>
                  </div>
                ) : availableParties.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Music className="h-12 w-12 mx-auto mb-3 text-gray-500" />
                    <p>No available parties found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {availableParties
                      .filter((party: any) => {
                        if (!partySearchQuery) return true;
                        const query = partySearchQuery.toLowerCase();
                        return (
                          party.name?.toLowerCase().includes(query) ||
                          party.location?.toLowerCase().includes(query)
                        );
                      })
                      .map((party: any) => {
                        // Prefer _id over uuid
                        const partyId = party._id || party.uuid;
                        const selectedPartyId = selectedPartyForAdd?._id || selectedPartyForAdd?.uuid;
                        return (
                        <div
                          key={partyId}
                          onClick={() => setSelectedPartyForAdd(party)}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedPartyId === partyId
                              ? 'bg-purple-600 border-purple-500'
                              : 'bg-gray-800 border-gray-700 hover:border-purple-500/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-white font-medium">{party.name}</h4>
                              <p className="text-gray-400 text-sm">{party.location}</p>
                            </div>
                            {selectedPartyId === partyId && (
                              <CheckCircle className="h-5 w-5 text-white" />
                            )}
                          </div>
                        </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Tip Amount Input */}
              {selectedPartyForAdd && (
                <div className="mb-4">
                  <label className="block text-white font-medium mb-2">
                    Tip Amount (£)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={addToPartyTipAmount}
                    onChange={(e) => {
                      setAddToPartyTipAmount(e.target.value);
                    }}
                    placeholder={`Minimum: £${minimumBid.toFixed(2)}`}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Minimum tip: £{minimumBid.toFixed(2)}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end space-x-3 p-6 border-t border-gray-700">
              <button
                onClick={() => {
                  setShowAddToPartyModal(false);
                  setSelectedPartyForAdd(null);
                  setPartySearchQuery('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToParty}
                disabled={!selectedPartyForAdd || isAddingToParty || parseFloat(addToPartyTipAmount) < minimumBid}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                {isAddingToParty ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <span>Add to Party</span>
                )}
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
    </div>
  );
};

export default TuneProfile;
