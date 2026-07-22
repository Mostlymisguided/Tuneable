import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import DOMPurify from 'dompurify';
import { DEFAULT_PROFILE_PIC, DEFAULT_COVER_ART, COUNTRIES } from '../constants';
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
  Award,
  Crown,
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
  Instagram,
  Info
} from 'lucide-react';
import { mediaAPI, labelAPI, collectiveAPI, partyAPI, userAPI } from '../lib/api';
import MediaChampions from '../components/MediaChampions';
import ReportModal from '../components/ReportModal';
import ClaimMediaModal, { isRightsPendingClaimable } from '../components/ClaimMediaModal';
import { useAuth } from '../contexts/AuthContext';
import { usePodcastPlayerStore, getEpisodeAudioUrl } from '../stores/podcastPlayerStore';
import { canEditMedia, canDeleteMedia } from '../utils/permissionHelpers';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import MediaOwnershipTab from '../components/ownership/MediaOwnershipTab';
import BidConfirmationModal from '../components/BidConfirmationModal';
import TipStatChips from '../components/TipStatChips';
import TipCtaLabel from '../components/TipCtaLabel';
import { computeChampionTipContext } from '../utils/tipStats';
import MultiArtistInput from '../components/MultiArtistInput';
import type { ArtistEntry } from '../components/MultiArtistInput';
import DeleteMediaSection from '../components/DeleteMediaSection';

interface Media {
  _id: string;
  uuid: string;
  title: string;
  artist?: string | Array<{ name: string; userId?: any; collectiveId?: any; verified?: boolean }>;
  host?: Array<{ name: string; userId?: any; collectiveId?: any; verified?: boolean }>;
  guest?: Array<{ name: string; userId?: any; collectiveId?: any; verified?: boolean }>;
  producer?: string;
  featuring?: string[];
  rightsHolder?: string;
  rightsHolderEmail?: string;
  album?: string;
  EP?: string;
  genre?: string;
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
  episodeNumber?: number;
  seasonNumber?: number;
  podcastSeries?: string | {
    _id: string;
    title: string;
    coverArt?: string;
    description?: string;
    frequency?: string;
  };
  transcript?: string;
  description?: string;
  tags?: string[];
  category?: string;
  genres?: string[];
  language?: string;
  fileSize?: number;
  bitrate?: number;
  sampleRate?: number;
  playCount?: number;
  popularity?: number;
  sources?: { [key: string]: string };
  externalIds?: { [key: string]: string };
  rightsCleared?: boolean;
  rightsStatus?: 'cleared' | 'pending' | 'disputed';
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

const PodcastEpisodeProfile: React.FC = () => {
  const { mediaId } = useParams<{ mediaId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  // Sanitize HTML description for safe rendering
  const sanitizeDescription = (html: string): string => {
    if (!html) return '';
    
    // Configure DOMPurify to allow common HTML elements but remove inline styles
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
      // Remove all inline styles
      FORBID_ATTR: ['style', 'class'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    });
    
    return clean;
  };
  
  const [media, setMedia] = useState<Media | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showEpisodeInfo, setShowEpisodeInfo] = useState(false);
  
  // Claim modal (rights-pending limbo only)
  const [showClaimModal, setShowClaimModal] = useState(false);

  // Edit mode - controlled by query params (similar to UserProfile settings mode)
  const isEditMode = searchParams.get('edit') === 'true';
  const editTab = (searchParams.get('tab') as 'info' | 'edit' | 'ownership') || 'info';
  const [tagInput, setTagInput] = useState(''); // Separate state for tag input
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
    coverArt: '',
    minimumBid: null as number | null,
    primaryLocation: null as {
      city?: string;
      region?: string;
      country?: string;
      countryCode?: string;
      coordinates?: { lat?: number; lng?: number };
      detectedFromIP?: boolean;
    } | null,
    secondaryLocation: null as {
      city?: string;
      region?: string;
      country?: string;
      countryCode?: string;
      coordinates?: { lat?: number; lng?: number };
    } | null
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
  const [tagRankings, setTagRankings] = useState<any[]>([]);
  const [hasInitializedBidInput, setHasInitializedBidInput] = useState(false);
  const [seriesEpisodes, setSeriesEpisodes] = useState<any[]>([]);
  const [isLoadingSeriesEpisodes, setIsLoadingSeriesEpisodes] = useState(false);

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false);

  // Collapsible sections
  const [showTopFans, setShowTopFans] = useState(false);
  const [showTagRankings, setShowTagRankings] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Share functionality state
  const [isMobile, setIsMobile] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);

  // Cover art upload state
  const coverArtFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCoverArt, setIsUploadingCoverArt] = useState(false);
  const [isRemovingCoverArt, setIsRemovingCoverArt] = useState(false);

  // Podcast player integration (separate from music web player)
  const { setCurrentEpisode, play } = usePodcastPlayerStore();

  const parsedGlobalBidAmount = useMemo(() => {
    const parsed = parseFloat(globalBidInput);
    return Number.isFinite(parsed) ? parsed : NaN;
  }, [globalBidInput]);
  const isGlobalBidValid = Number.isFinite(parsedGlobalBidAmount) && parsedGlobalBidAmount >= minimumBid;

  const defaultTipAmount = useMemo(() => {
    if (isGlobalBidValid) return parsedGlobalBidAmount;
    const userDefaultTip = user?.preferences?.defaultTip || 1.11;
    const bids = media?.bids || [];
    const avgBid =
      bids.length === 0
        ? 0
        : penceToPoundsNumber(bids.reduce((sum, bid) => sum + bid.amount, 0) / bids.length);
    return Math.max(minimumBid, userDefaultTip, avgBid || 0);
  }, [isGlobalBidValid, parsedGlobalBidAmount, user?.preferences?.defaultTip, media, minimumBid]);

  useEffect(() => {
    console.log('🔍 PodcastEpisodeProfile useEffect triggered with mediaId:', mediaId);
    if (mediaId) {
      console.log('✅ mediaId exists, calling fetchMediaProfile');
      fetchMediaProfile().then((loadedMedia) => {
        loadTagRankings();
        if (loadedMedia) {
          loadSeriesEpisodes(loadedMedia);
        }
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
            const userDefaultTip = user?.preferences?.defaultTip || 1.11;
            const initialBid = Math.max(globalParty.minimumBid, userDefaultTip, avgBid || 0);
            setGlobalBidInput(initialBid.toFixed(2));
            setHasInitializedBidInput(true);
          }
        } else if (!hasInitializedBidInput && media) {
          const avgBid = calculateGlobalMediaBidAvg(media);
          const userDefaultTip = user?.preferences?.defaultTip || 1.11;
          const initialBid = Math.max(userDefaultTip, avgBid || 0);
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

  const fetchMediaProfile = async (): Promise<Media | null> => {
    try {
      console.log('🔍 Fetching podcast episode profile for mediaId:', mediaId);
      setLoading(true);
      const response = await mediaAPI.getProfile(mediaId!);
      console.log('📥 Podcast episode profile response:', response);
      setMedia(response.media);
      setComments(response.media.comments || []);
      console.log('✅ Podcast episode profile loaded successfully');
      return response.media;
    } catch (err: any) {
      console.error('❌ Error fetching podcast episode profile:', err);
      console.error('❌ Error details:', err.response?.data);
      setError(err.response?.data?.error || 'Failed to load podcast episode profile');
      toast.error('Failed to load podcast episode profile');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadSeriesEpisodes = async (episodeMedia?: Media | null) => {
    const source = episodeMedia || media;
    const seriesId =
      source?.podcastSeries && typeof source.podcastSeries === 'object'
        ? source.podcastSeries._id
        : null;
    if (!seriesId) {
      setSeriesEpisodes([]);
      return;
    }

    setIsLoadingSeriesEpisodes(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(
        `${backendUrl}/api/podcasts/series/${seriesId}?autoImport=false`
      );
      if (!response.ok) throw new Error('Failed to load series episodes');
      const data = await response.json();
      const currentId = String(source?._id || mediaId || '');
      const episodes = (data.episodes || [])
        .filter((ep: any) => String(ep._id || ep.uuid) !== currentId)
        .slice(0, 12);
      setSeriesEpisodes(episodes);
    } catch (err) {
      console.error('Error loading series episodes:', err);
      setSeriesEpisodes([]);
    } finally {
      setIsLoadingSeriesEpisodes(false);
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

  const mediaChampionTip = useMemo(
    () =>
      computeChampionTipContext(media?.bids, user, {
        fallbackChampionAggregatePence: media?.globalMediaAggregateTop,
        fallbackChampionUser: (media as any)?.globalMediaAggregateTopUser,
      }),
    [media, user]
  );

  // Check if user can edit this tune
  const canEditTune = () => {
    return canEditMedia(user, media);
  };

  const canDeleteEpisode = () => {
    return canDeleteMedia(user, media);
  };

  const getEpisodeDeleteRedirect = () => {
    if (media?.podcastSeries && typeof media.podcastSeries === 'object' && media.podcastSeries._id) {
      return `/podcast/${media.podcastSeries._id}`;
    }
    return '/podcasts';
  };

  // Helper function to get country code from country name
  const getCountryCode = (countryName: string): string => {
    const countryMap: Record<string, string> = {
      'United Kingdom': 'GB',
      'Afghanistan': 'AF',
      'Albania': 'AL',
      'Algeria': 'DZ',
      'Andorra': 'AD',
      'Angola': 'AO',
      'Antigua and Barbuda': 'AG',
      'Argentina': 'AR',
      'Armenia': 'AM',
      'Australia': 'AU',
      'Austria': 'AT',
      'Azerbaijan': 'AZ',
      'Bahamas': 'BS',
      'Bahrain': 'BH',
      'Bangladesh': 'BD',
      'Barbados': 'BB',
      'Belarus': 'BY',
      'Belgium': 'BE',
      'Belize': 'BZ',
      'Benin': 'BJ',
      'Bhutan': 'BT',
      'Bolivia': 'BO',
      'Bosnia and Herzegovina': 'BA',
      'Botswana': 'BW',
      'Brazil': 'BR',
      'Brunei': 'BN',
      'Bulgaria': 'BG',
      'Burkina Faso': 'BF',
      'Burundi': 'BI',
      'Cambodia': 'KH',
      'Cameroon': 'CM',
      'Canada': 'CA',
      'Cape Verde': 'CV',
      'Central African Republic': 'CF',
      'Chad': 'TD',
      'Chile': 'CL',
      'China': 'CN',
      'Colombia': 'CO',
      'Comoros': 'KM',
      'Congo': 'CG',
      'Costa Rica': 'CR',
      'Croatia': 'HR',
      'Cuba': 'CU',
      'Cyprus': 'CY',
      'Czech Republic': 'CZ',
      'Democratic Republic of the Congo': 'CD',
      'Denmark': 'DK',
      'Djibouti': 'DJ',
      'Dominica': 'DM',
      'Dominican Republic': 'DO',
      'East Timor': 'TL',
      'Ecuador': 'EC',
      'Egypt': 'EG',
      'El Salvador': 'SV',
      'England': 'GB-ENG',
      'Equatorial Guinea': 'GQ',
      'Eritrea': 'ER',
      'Estonia': 'EE',
      'Ethiopia': 'ET',
      'Fiji': 'FJ',
      'Finland': 'FI',
      'France': 'FR',
      'Gabon': 'GA',
      'Gambia': 'GM',
      'Georgia': 'GE',
      'Germany': 'DE',
      'Ghana': 'GH',
      'Greece': 'GR',
      'Grenada': 'GD',
      'Guatemala': 'GT',
      'Guinea': 'GN',
      'Guinea-Bissau': 'GW',
      'Guyana': 'GY',
      'Haiti': 'HT',
      'Honduras': 'HN',
      'Hungary': 'HU',
      'Iceland': 'IS',
      'India': 'IN',
      'Indonesia': 'ID',
      'Iran': 'IR',
      'Iraq': 'IQ',
      'Ireland': 'IE',
      'Israel': 'IL',
      'Italy': 'IT',
      'Ivory Coast': 'CI',
      'Jamaica': 'JM',
      'Japan': 'JP',
      'Jordan': 'JO',
      'Kazakhstan': 'KZ',
      'Kenya': 'KE',
      'Kiribati': 'KI',
      'Kosovo': 'XK',
      'Kuwait': 'KW',
      'Kyrgyzstan': 'KG',
      'Laos': 'LA',
      'Latvia': 'LV',
      'Lebanon': 'LB',
      'Lesotho': 'LS',
      'Liberia': 'LR',
      'Libya': 'LY',
      'Liechtenstein': 'LI',
      'Lithuania': 'LT',
      'Luxembourg': 'LU',
      'Macau': 'MO',
      'Madagascar': 'MG',
      'Malawi': 'MW',
      'Malaysia': 'MY',
      'Maldives': 'MV',
      'Mali': 'ML',
      'Malta': 'MT',
      'Marshall Islands': 'MH',
      'Mauritania': 'MR',
      'Mauritius': 'MU',
      'Mexico': 'MX',
      'Micronesia': 'FM',
      'Moldova': 'MD',
      'Monaco': 'MC',
      'Mongolia': 'MN',
      'Montenegro': 'ME',
      'Morocco': 'MA',
      'Mozambique': 'MZ',
      'Myanmar': 'MM',
      'Namibia': 'NA',
      'Nauru': 'NR',
      'Nepal': 'NP',
      'Netherlands': 'NL',
      'New Zealand': 'NZ',
      'Nicaragua': 'NI',
      'Niger': 'NE',
      'Nigeria': 'NG',
      'North Korea': 'KP',
      'North Macedonia': 'MK',
      'Norway': 'NO',
      'Oman': 'OM',
      'Pakistan': 'PK',
      'Palau': 'PW',
      'Palestine': 'PS',
      'Panama': 'PA',
      'Papua New Guinea': 'PG',
      'Paraguay': 'PY',
      'Peru': 'PE',
      'Philippines': 'PH',
      'Poland': 'PL',
      'Portugal': 'PT',
      'Qatar': 'QA',
      'Republic of the Congo': 'CG',
      'Romania': 'RO',
      'Russia': 'RU',
      'Rwanda': 'RW',
      'Saint Kitts and Nevis': 'KN',
      'Saint Lucia': 'LC',
      'Saint Vincent and the Grenadines': 'VC',
      'Samoa': 'WS',
      'San Marino': 'SM',
      'Sao Tome and Principe': 'ST',
      'Saudi Arabia': 'SA',
      'Scotland': 'GB-SCT',
      'Senegal': 'SN',
      'Serbia': 'RS',
      'Seychelles': 'SC',
      'Sierra Leone': 'SL',
      'Singapore': 'SG',
      'Slovakia': 'SK',
      'Slovenia': 'SI',
      'Solomon Islands': 'SB',
      'Somalia': 'SO',
      'South Africa': 'ZA',
      'South Korea': 'KR',
      'South Sudan': 'SS',
      'Spain': 'ES',
      'Sri Lanka': 'LK',
      'Sudan': 'SD',
      'Suriname': 'SR',
      'Swaziland': 'SZ',
      'Sweden': 'SE',
      'Switzerland': 'CH',
      'Syria': 'SY',
      'Taiwan': 'TW',
      'Tajikistan': 'TJ',
      'Tanzania': 'TZ',
      'Thailand': 'TH',
      'Togo': 'TG',
      'Tonga': 'TO',
      'Trinidad and Tobago': 'TT',
      'Tunisia': 'TN',
      'Turkey': 'TR',
      'Turkmenistan': 'TM',
      'Tuvalu': 'TV',
      'Uganda': 'UG',
      'Ukraine': 'UA',
      'United Arab Emirates': 'AE',
      'United States': 'US',
      'Uruguay': 'UY',
      'Uzbekistan': 'UZ',
      'Vanuatu': 'VU',
      'Vatican City': 'VA',
      'Venezuela': 'VE',
      'Vietnam': 'VN',
      'Wales': 'GB-WLS',
      'Yemen': 'YE',
      'Zambia': 'ZM',
      'Zimbabwe': 'ZW',
      'Other': 'XX'
    };
    return countryMap[countryName] || '';
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
        bpm: (media as any).bpm || 0,
        key: (media as any).key || '',
        tags: media.tags || [],
        lyrics: (media as any).lyrics || '',
        description: (media as any).description || '',
        // Enhanced metadata fields
        composer: (media as any).composer?.[0]?.name || (media as any).composer || '',
        mediawriter: (media as any).mediawriter?.[0]?.name || (media as any).mediawriter || '',
        label: (media as any).label?.[0]?.name || (media as any).label || '',
        language: (media as any).language || '',
        bitrate: media.bitrate || 0,
        sampleRate: media.sampleRate || 0,
        pitch: (media as any).pitch || 440,
        timeSignature: (media as any).timeSignature || '',
        elements: (media as any).elements || [],
        coverArt: media.coverArt || DEFAULT_COVER_ART, // Always show the URL that's actually stored (or default)
        minimumBid: (media as any).minimumBid ?? null,
        primaryLocation: (() => {
          const loc = (media as any).primaryLocation || null;
          if (loc && loc.country && !loc.countryCode) {
            return { ...loc, countryCode: getCountryCode(loc.country) };
          }
          return loc;
        })(),
        secondaryLocation: (() => {
          const loc = (media as any).secondaryLocation || null;
          if (loc && loc.country && !loc.countryCode) {
            return { ...loc, countryCode: getCountryCode(loc.country) };
          }
          return loc;
        })()
      });
      // Set tag input as comma-separated string
      setTagInput(media.tags?.join(', ') || '');
      // Set other comma-separated inputs
      setElementsInput(((media as any).elements || []).join(', ') || '');
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
      // Handle comma-separated input consistently across all fields
      // Filters out empty strings from multiple commas or trailing commas
      const tags = tagInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0); // Explicitly filter empty strings
      const elements = elementsInput
        .split(',')
        .map(el => el.trim())
        .filter(el => el.length > 0);
      const featuring = featuringInput
        .split(',')
        .map(f => f.trim())
        .filter(f => f.length > 0);
      
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
      
      // Process location fields - send null if empty, otherwise send the object
      // Auto-populate countryCode if country is set but countryCode is missing
      let primaryLocation = editForm.primaryLocation && (
        editForm.primaryLocation.city || 
        editForm.primaryLocation.region || 
        editForm.primaryLocation.country
      ) ? { ...editForm.primaryLocation } : null;
      
      if (primaryLocation && primaryLocation.country && !primaryLocation.countryCode) {
        primaryLocation.countryCode = getCountryCode(primaryLocation.country);
      }
      
      let secondaryLocation = editForm.secondaryLocation && (
        editForm.secondaryLocation.city || 
        editForm.secondaryLocation.region || 
        editForm.secondaryLocation.country
      ) ? { ...editForm.secondaryLocation } : null;
      
      if (secondaryLocation && secondaryLocation.country && !secondaryLocation.countryCode) {
        secondaryLocation.countryCode = getCountryCode(secondaryLocation.country);
      }
      
      const updateData: any = {
        ...editForm,
        duration: durationInSeconds,
        tags,
        elements,
        featuring,
        labelId: selectedLabel?._id || null, // Send labelId if selected
        releaseDate: releaseDateValue,
        releaseYear: releaseYearValue,
        primaryLocation,
        secondaryLocation
      };
      
      // Remove genres from updateData since it's no longer editable
      delete updateData.genres;
      delete updateData.genre;
      
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
  // Handles comma-separated input: "tag1, tag2, tag3" or "tag1,tag2,tag3"
  // Filters out empty strings from multiple commas or trailing commas
  const handleTagInputBlur = () => {
    const tags = tagInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0); // Explicitly filter empty strings
    setEditForm({ ...editForm, tags });
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTagInputBlur();
    }
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
      case 'audio_direct':
        return { icon: Headphones, color: 'hover:bg-amber-600/30 hover:border-amber-500', bgColor: 'bg-amber-600/20' };
      case 'rss':
        return { icon: Mic, color: 'hover:bg-green-600/30 hover:border-green-500', bgColor: 'bg-green-600/20' };
      default:
        return { icon: ExternalLink, color: 'hover:bg-purple-600/30 hover:border-purple-500', bgColor: 'bg-purple-600/20' };
    }
  };

  // Get available external links
  // @ts-ignore - unused but kept for future use
  const _getExternalLinks = () => {
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
        const displayName =
          platform === 'audio_direct'
            ? 'Audio Direct'
            : platform === 'rss'
              ? 'RSS Feed'
              : platform.charAt(0).toUpperCase() + platform.slice(1);
        links.push({
          platform,
          url,
          icon,
          color,
          bgColor,
          displayName
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
  // @ts-ignore - unused but kept for future use
  const _getMissingPlatforms = () => {
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

  const handleRemoveCoverArt = async () => {
    if (!mediaId) {
      toast.error('Media ID not found');
      return;
    }

    if (!editForm.coverArt || editForm.coverArt === DEFAULT_COVER_ART) {
      return;
    }

    if (!window.confirm('Remove cover art and use the default image? This cannot be undone.')) {
      return;
    }

    setIsRemovingCoverArt(true);
    try {
      const response = await mediaAPI.removeCoverArt(media?._id || mediaId);
      toast.success('Cover art removed');
      setEditForm({ ...editForm, coverArt: response.coverArt || DEFAULT_COVER_ART });
      await fetchMediaProfile();
    } catch (err: any) {
      console.error('Error removing cover art:', err);
      toast.error(err.response?.data?.error || 'Failed to remove cover art');
    } finally {
      setIsRemovingCoverArt(false);
    }
  };

  // Handle adding a new link
  // @ts-ignore - unused but kept for future use
  const _handleAddLink = (platform: string) => {
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

  // Handle claim podcast button click — intent tree lives in ClaimMediaModal
  const handleClaimPodcast = () => {
    if (!isRightsPendingClaimable(media)) {
      toast.info('This episode is not awaiting rights clearance');
      return;
    }
    setShowClaimModal(true);
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

  // Handle play button click – use podcast player (not music web player)
  const handlePlaySong = () => {
    if (!media) return;

    const episode = {
      _id: media._id,
      id: media.uuid,
      title: media.title,
      duration: media.duration,
      coverArt: media.coverArt,
      podcastSeries: typeof media.podcastSeries === 'object' ? media.podcastSeries : undefined,
      sources: media.sources,
    };
    if (!getEpisodeAudioUrl(episode)) {
      toast.error('No playable audio for this episode');
      return;
    }
    setCurrentEpisode(episode);
    play();
    toast.success(`Now playing: ${media.title}`);
  };

  // Heart / quick-tip: open confirmation modal with a default amount
  const handleOpenTipModal = () => {
    if (!user) {
      toast.info('Please log in to support this episode');
      const returnUrl = `/podcasts/${mediaId || media?._id}`;
      navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }
    setShowBidConfirmationModal(true);
  };

  // Handle global bid from the Support This Episode amount field
  const handleGlobalBid = () => {
    if (!user) {
      toast.info('Please log in to support this episode');
      const returnUrl = `/podcasts/${mediaId || media?._id}`;
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

  const handleConfirmGlobalBid = async (tags: string[], amount: number) => {
    if (!user || !mediaId) return;

    const bidAmount = Number.isFinite(amount) && amount > 0 ? amount : defaultTipAmount;

    setShowBidConfirmationModal(false);
    setIsPlacingGlobalBid(true);

    try {
      await mediaAPI.placeGlobalBid(mediaId, bidAmount, undefined, tags);
      
      toast.success(`Placed £${bidAmount.toFixed(2)} tip on "${media?.title}"!`);
      
      // Refresh media data to show updated metrics
      await fetchMediaProfile();
      
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
    ? `${window.location.origin}/podcasts/${media._id}`
    : window.location.href;
  const creatorDisplay = media ? getCreatorDisplay(media) : null;
  const shareText = `Support your Favourite Creators on Tuneable! Check out "${media?.title || 'this tune'}"${creatorDisplay ? ` by ${creatorDisplay}` : ''} and show it some love.`;

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
    const artistDisplay = Array.isArray(media.artist) 
      ? media.artist.map((a: any) => a.name || a).join(', ')
      : media.artist || '';
    const ogTitle = `${media.title}${artistDisplay ? ` by ${artistDisplay}` : ''} | Tuneable`;
    const ogDescription = shareText; // Already includes the new caption
    const ogUrl = media?._id 
      ? `${window.location.origin}/podcasts/${media._id}`
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
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedFacebookUrl}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      };

      // Handle Instagram sharing (copy text + link to clipboard)
      if (platform === 'instagram') {
        try {
          const textToCopy = `${shareText}\n\n${shareUrl}`;
          await navigator.clipboard.writeText(textToCopy);
          setCopySuccess(true);
          toast.success('Link and message copied! Paste it in your Instagram Story or post.');
          setTimeout(() => setCopySuccess(false), 2000);
          console.log('Instagram share tracked:', { mediaId: media?._id, url: shareUrl });
          return;
        } catch (err) {
          console.error('Failed to copy link:', err);
          toast.error('Failed to copy link. Please copy it manually.');
          return;
        }
      }

      // Handle Facebook sharing (copy text + link to clipboard for better UX)
      // Facebook's sharer.php doesn't support pre-filling text, so we copy to clipboard instead
      if (platform === 'facebook') {
        try {
          const textToCopy = `${shareText}\n\n${facebookShareUrl}`;
          await navigator.clipboard.writeText(textToCopy);
          setCopySuccess(true);
          toast.success('Message and link copied! Paste it into Facebook to share with the text included.');
          setTimeout(() => setCopySuccess(false), 2000);
          
          // Also open Facebook share dialog as fallback (user can paste the text there)
          const shareWindow = window.open(
            shareUrls[platform], 
            '_blank', 
            'width=600,height=400,menubar=no,toolbar=no,resizable=yes,scrollbars=yes'
          );
          
          if (!shareWindow || shareWindow.closed || typeof shareWindow.closed === 'undefined') {
            // Popup blocked - that's okay, we already copied to clipboard
          } else {
            console.log('Facebook share tracked:', { mediaId: media?._id, url: shareUrl });
          }
          return;
        } catch (err) {
          console.error('Failed to copy:', err);
          // Fall through to regular share dialog if clipboard fails
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
      // Copy both the share text and URL so users can paste a complete message
      const textToCopy = `${shareText}\n\n${shareUrl}`;
      await navigator.clipboard.writeText(textToCopy);
      setCopySuccess(true);
      toast.success('Link and message copied to clipboard!');
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
        <div className="text-white text-xl">Loading Podcast Episode Profile...</div>
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

  // Format frequency for display
  const formatFrequency = (freq: string | null | undefined): string | null => {
    if (!freq) return null;
    const frequencyMap: Record<string, string> = {
      'daily': 'Daily',
      'weekly': 'Weekly',
      'biweekly': 'Bi-weekly',
      'monthly': 'Monthly',
      'bimonthly': 'Bi-monthly',
      'quarterly': 'Quarterly',
      'irregular': 'Irregular'
    };
    return frequencyMap[freq] || freq.charAt(0).toUpperCase() + freq.slice(1);
  };

  // Format file size for display
  const formatFileSize = (bytes: number | null | undefined): string | null => {
    if (!bytes || bytes === 0) return null;
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(2)} MB`;
  };

  // Format language code for display
  const formatLanguage = (lang: string | null | undefined): string | null => {
    if (!lang) return null;
    const languageMap: Record<string, string> = {
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'nl': 'Dutch',
      'sv': 'Swedish',
      'no': 'Norwegian',
      'da': 'Danish',
      'fi': 'Finnish',
      'pl': 'Polish',
      'tr': 'Turkish'
    };
    return languageMap[lang.toLowerCase()] || lang.toUpperCase();
  };

  const mediaFields = [
    { label: 'Title', value: media.title, icon: Music },
    { label: 'Podcast Series', value: typeof media.podcastSeries === 'object' ? media.podcastSeries?.title : null, icon: Mic },
    { label: 'Episode Number', value: media.episodeNumber, icon: Calendar },
    { label: 'Season Number', value: media.seasonNumber ?? null, icon: Calendar },
    { label: 'Host', value: Array.isArray(media.host) ? media.host.map((h: any) => h.name).join(', ') : null, icon: Mic },
    { label: 'Guest', value: Array.isArray(media.guest) ? media.guest.map((g: any) => g.name).join(', ') : null, icon: User },
    { label: 'Duration', value: media.duration ? formatDuration(media.duration) : null, icon: Clock },
    { label: 'File Size', value: formatFileSize(media.fileSize), icon: Disc },
    { label: 'Language', value: formatLanguage(media.language), icon: Globe },
    { label: 'Tags', value: (() => {
      // Combine tags and genres (genres are already in tags, but include any additional genres)
      const allTags = new Set<string>();
      if (Array.isArray(media.tags)) {
        media.tags.forEach(tag => allTags.add(tag));
      }
      if (Array.isArray(media.genres)) {
        media.genres.forEach(genre => allTags.add(genre));
      }
      return Array.from(allTags).length > 0 ? Array.from(allTags).join(', ') : null;
    })(), icon: Tag },
    { 
      label: 'Release Date', 
      value: media.releaseDate 
        ? new Date(media.releaseDate).toLocaleDateString()
        : (media as any).releaseYear 
          ? `${(media as any).releaseYear}`
          : null,
      icon: Calendar 
    },
    { 
      label: 'Rating', 
      value: media.explicit ? 'Explicit' : 'Clean', 
      icon: Globe 
    },
    { 
      label: 'Frequency', 
      value: typeof media.podcastSeries === 'object' && media.podcastSeries?.frequency 
        ? formatFrequency(media.podcastSeries.frequency)
        : null, 
      icon: Calendar 
    },
    { label: 'Bitrate', value: media.bitrate ? `${media.bitrate} kbps` : null, icon: Headphones },
    { label: 'Sample Rate', value: media.sampleRate ? `${media.sampleRate} Hz` : null, icon: Headphones },
  ];

  // Filter out fields with null values to avoid showing "Not specified"
  const filteredFields = mediaFields.filter(field => {
    // Allow fields with explicit null check - don't show "Not specified" for optional fields
    if (field.value === null || field.value === undefined) return false;
    if (Array.isArray(field.value) && field.value.length === 0) return false;
    return true;
  });

  const HEADER_DETAIL_LABELS = new Set([
    'Title',
    'Podcast Series',
    'Episode Number',
    'Season Number',
    'Duration',
    'Release Date',
    'Host',
    'Guest',
    'Rating',
  ]);

  // Exclude hero-duplicated labels; show remaining populated fields in Info panel
  const detailFields = filteredFields.filter((field) => !HEADER_DETAIL_LABELS.has(field.label));
  const hasEpisodeInfoContent = Boolean(
    media.description || detailFields.length > 0 || media.transcript
  );

  const formatPeopleNames = (people?: Array<{ name: string }> | string) => {
    if (!people) return null;
    if (typeof people === 'string') return people;
    if (!Array.isArray(people) || people.length === 0) return null;
    return people.map((p: any) => p.name || p).filter(Boolean).join(', ');
  };

  const hostNames = formatPeopleNames(media.host);
  const guestNames = formatPeopleNames(media.guest);

  const seasonEpisodeLabel = [
    media.seasonNumber != null ? `S${media.seasonNumber}` : null,
    media.episodeNumber != null ? `E${media.episodeNumber}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const heroMetadata = [
    seasonEpisodeLabel || null,
    media.releaseDate
      ? new Date(media.releaseDate).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null,
    media.duration ? formatDuration(media.duration) : null,
    media.explicit ? 'Explicit' : null,
  ].filter((part): part is string => Boolean(part));

  const topTagRankings = tagRankings.slice(0, 3);

  const avgTipPounds = media ? calculateGlobalMediaBidAvg(media) || undefined : undefined;

  const applyTipShortcut = (amount: number) => {
    setHasInitializedBidInput(true);
    setGlobalBidInput(amount.toFixed(2));
  };

  const renderTipStatShortcuts = (className?: string) => (
    <TipStatChips
      className={className}
      minTip={minimumBid}
      avgTip={avgTipPounds}
      championAggregate={mediaChampionTip?.championAggregate}
      viewerAggregate={mediaChampionTip?.viewerAggregate}
      viewerIsChampion={mediaChampionTip?.viewerIsChampion}
      disabled={isPlacingGlobalBid}
      onSelect={applyTipShortcut}
    />
  );

  const seriesTitle =
    media.podcastSeries && typeof media.podcastSeries === 'object'
      ? media.podcastSeries.title
      : null;
  const seriesId =
    media.podcastSeries && typeof media.podcastSeries === 'object'
      ? media.podcastSeries._id
      : null;

  const externalLinks = (() => {
    const links: Array<{
      platform: string;
      url: string;
      icon: any;
      color: string;
      bgColor: string;
      displayName: string;
    }> = [];
    if (media?.sources) {
      Object.entries(media.sources).forEach(([platform, url]) => {
        if (platform.toLowerCase() === 'upload') return;
        const { icon, color, bgColor } = getPlatformIcon(platform);
        const displayName =
          platform === 'audio_direct'
            ? 'Audio Direct'
            : platform === 'rss'
              ? 'RSS Feed'
              : platform.charAt(0).toUpperCase() + platform.slice(1);
        links.push({ platform, url: url as string, icon, color, bgColor, displayName });
      });
    }
    return links;
  })();

  const renderShareButton = () => (
    isMobile ? (
      <button
        onClick={handleNativeShare}
        className="px-3 py-2 bg-gray-900/80 hover:bg-gray-800/80 text-white font-semibold rounded-lg border border-purple-500/50 transition-all flex items-center gap-2 text-sm"
      >
        <Share2 className="h-4 w-4" />
        <span>Share</span>
      </button>
    ) : (
      <div className="relative">
        <button
          onClick={() => setShowShareDropdown(!showShareDropdown)}
          className="px-3 py-2 bg-gray-900/80 hover:bg-gray-800/80 text-white font-semibold rounded-lg border border-purple-500/50 transition-all flex items-center gap-2 text-sm"
        >
          <Share2 className="h-4 w-4" />
          <span>Share</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${showShareDropdown ? 'rotate-180' : ''}`} />
        </button>
        {showShareDropdown && (
          <div className="absolute top-full left-0 mt-2 w-48 bg-gray-900/95 border-2 border-purple-500/50 rounded-lg shadow-xl z-50 overflow-hidden">
            <button onClick={() => handleShare('twitter')} className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white">
              <Twitter className="h-5 w-5 text-blue-400" /><span>Twitter/X</span>
            </button>
            <button onClick={() => handleShare('facebook')} className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white">
              <Facebook className="h-5 w-5 text-blue-600" /><span>Facebook</span>
            </button>
            <button onClick={() => handleShare('linkedin')} className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white">
              <Linkedin className="h-5 w-5 text-blue-500" /><span>LinkedIn</span>
            </button>
            <button onClick={() => handleShare('whatsapp')} className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white">
              <Share2 className="h-5 w-5 text-green-500" /><span>WhatsApp</span>
            </button>
            <button onClick={() => handleShare('instagram')} className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white">
              <Instagram className="h-5 w-5 text-pink-500" /><span>Instagram</span>
            </button>
            <button onClick={() => handleShare('copy')} className="w-full px-4 py-3 text-left hover:bg-gray-800/80 transition-colors flex items-center space-x-3 text-white border-t border-gray-700">
              {copySuccess ? <Check className="h-5 w-5 text-green-400" /> : <Copy className="h-5 w-5 text-gray-400" />}
              <span>{copySuccess ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        )}
      </div>
    )
  );

  const renderSlimSupportSection = () => (
    <div id="support-episode" className="mb-6 px-2 md:px-0">
      <div className="max-w-2xl mx-auto">
        <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 border border-purple-500/30 rounded-lg p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="text-center sm:text-left">
              <h3 className="text-lg md:text-xl font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                <Coins className="h-5 w-5 text-yellow-400" />
                Support This Episode
              </h3>
              <p className="text-gray-300 text-sm mt-1">
                Boost global ranking and support the creators
              </p>
            </div>
            {user && (
              <p className="text-xs text-gray-400 text-center sm:text-right shrink-0">
                Balance: {penceToPounds((user as any)?.balance)}
              </p>
            )}
          </div>

          <div className="flex flex-row items-center justify-center">
            <button
              type="button"
              onClick={() => {
                const current = parseFloat(globalBidInput) || minimumBid;
                setGlobalBidInput(Math.max(minimumBid, current - 0.01).toFixed(2));
                setHasInitializedBidInput(true);
              }}
              disabled={isPlacingGlobalBid || parseFloat(globalBidInput) <= minimumBid}
              className="px-2 py-2.5 bg-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-tl-lg rounded-bl-lg transition-colors flex items-center justify-center"
            >
              <Minus className="h-4 w-4 text-white" />
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
                className="w-20 sm:w-24 bg-gray-800 p-2 text-white text-lg font-bold text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const current = parseFloat(globalBidInput) || minimumBid;
                const balanceInPounds = user ? penceToPoundsNumber((user as any)?.balance) : 999999;
                setGlobalBidInput(Math.min(balanceInPounds || 999999, current + 0.01).toFixed(2));
                setHasInitializedBidInput(true);
              }}
              disabled={isPlacingGlobalBid || (user ? (() => {
                const balanceInPounds = penceToPoundsNumber((user as any)?.balance);
                return balanceInPounds > 0 && parseFloat(globalBidInput) >= balanceInPounds;
              })() : false)}
              className="px-2 py-2.5 bg-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-tr-lg rounded-br-lg transition-colors flex items-center justify-center"
            >
              <Plus className="h-4 w-4 text-white" />
            </button>
            <button
              onClick={handleGlobalBid}
              disabled={isPlacingGlobalBid || (Boolean(user) && !isGlobalBidValid)}
              className="ml-3 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all flex items-center justify-center text-sm md:text-base"
            >
              <TipCtaLabel
                amount={globalBidInput}
                signedIn={Boolean(user)}
                loading={isPlacingGlobalBid}
                fallback="Tip"
              />
            </button>
          </div>

          {renderTipStatShortcuts('flex flex-wrap justify-center gap-2 mt-3')}
        </div>
      </div>
    </div>
  );

  const handlePlaySeriesEpisode = (episode: any) => {
    const playable = {
      _id: episode._id,
      id: episode.uuid,
      title: episode.title,
      duration: episode.duration,
      coverArt: episode.coverArt || media.coverArt,
      podcastSeries: typeof media.podcastSeries === 'object' ? media.podcastSeries : undefined,
      sources: episode.sources,
    };
    if (!getEpisodeAudioUrl(playable)) {
      toast.error('No playable audio for this episode');
      return;
    }
    setCurrentEpisode(playable);
    play();
    toast.success(`Now playing: ${episode.title}`);
  };

  const renderSeriesEpisodesRail = (episodes: any[]) => (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
      {episodes.map((episode) => (
        <div
          key={`series-rail-${episode._id}`}
          className="flex-shrink-0 w-[132px] sm:w-[148px] snap-start group"
        >
          <div className="relative mb-2">
            <Link
              to={`/podcasts/${episode._id || episode.uuid}`}
              className="block w-full"
            >
              <img
                src={episode.coverArt || media.coverArt || DEFAULT_COVER_ART}
                alt={episode.title}
                className="w-full aspect-square rounded-lg object-cover bg-black/30 shadow-md group-hover:ring-2 group-hover:ring-purple-500/50 transition-all"
              />
            </Link>
            <button
              type="button"
              onClick={() => handlePlaySeriesEpisode(episode)}
              className="absolute bottom-2 right-2 inline-flex items-center justify-center rounded-full bg-purple-600 hover:bg-purple-700 text-white h-8 w-8 shadow-lg transition-colors opacity-90 group-hover:opacity-100"
              aria-label={`Play ${episode.title}`}
            >
              <Play className="h-3.5 w-3.5" fill="currentColor" />
            </button>
          </div>
          <Link
            to={`/podcasts/${episode._id || episode.uuid}`}
            className="block w-full text-left"
          >
            <div className="text-sm font-semibold text-white truncate hover:text-purple-300 transition-colors">{episode.title}</div>
            <div className="text-xs text-gray-400 truncate">
              {[
                episode.seasonNumber != null || episode.episodeNumber != null
                  ? [episode.seasonNumber != null ? `S${episode.seasonNumber}` : null, episode.episodeNumber != null ? `E${episode.episodeNumber}` : null].filter(Boolean).join(' ')
                  : null,
                episode.duration ? formatDuration(episode.duration) : null,
              ].filter(Boolean).join(' · ') || seriesTitle || 'Episode'}
            </div>
          </Link>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pb-24 md:pb-8">
      <div className="container mx-auto px-2 md:px-4 py-4 md:py-8">
        {/* Podcast Episode Profile Header */}
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
              
              {/* Claim — rights-pending limbo only */}
              {!canEditTune() && isRightsPendingClaimable(media) && (
                <button
                  onClick={handleClaimPodcast}
                  className="px-3 md:px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-1 md:space-x-2 text-sm md:text-base"
                >
                  <Award className="h-4 w-4" />
                  <span className="hidden sm:inline">Claim Podcast</span>
                  <span className="sm:hidden">Claim</span>
                </button>
              )}
              
              {/* Edit Episode Button - Only show if user can edit and not in edit mode */}
              {canEditTune() && !isEditMode && (
                <button
                  onClick={handleEditClick}
                  className="px-3 md:px-4 py-2 bg-purple-600/40 hover:bg-purple-500 text-white font-semibold rounded-lg shadow-lg transition-all flex items-center space-x-2 text-sm md:text-base"
                >
                  <span className="hidden sm:inline">Edit Episode</span>
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
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={handlePlaySong}
              >
                <div className="w-16 h-16 md:w-20 md:h-20 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 hover:scale-110 transition-all shadow-2xl">
                  <Play className="h-8 w-8 md:h-10 md:w-10 text-white ml-1" fill="currentColor" />
                </div>
              </div>
            </div>

            {/* Episode Info */}
            <div className="flex-1 w-full text-white">
              <h1 className="text-2xl md:text-4xl font-bold text-center md:text-left px-2">{media.title}</h1>
              <div className="text-lg md:text-3xl text-purple-300 mb-2 text-center md:text-left px-2">
                {seriesId ? (
                  <a
                    href={`/podcast/${seriesId}`}
                    className="hover:text-purple-200 hover:underline transition-colors"
                  >
                    {seriesTitle}
                  </a>
                ) : (
                  <span>{seriesTitle || 'No Series'}</span>
                )}
              </div>

              {(hostNames || guestNames) && (
                <div className="text-sm text-gray-300 text-center md:text-left px-2 mb-2 space-y-0.5">
                  {hostNames && (
                    <p>
                      <span className="text-gray-500">Hosted by </span>
                      <span className="text-white">{hostNames}</span>
                    </p>
                  )}
                  {guestNames && (
                    <p>
                      <span className="text-gray-500">Featuring </span>
                      <span className="text-white">{guestNames}</span>
                    </p>
                  )}
                </div>
              )}

              {heroMetadata.length > 0 && (
                <p className="text-sm text-gray-400 text-center md:text-left px-2 mb-2">
                  {heroMetadata.join(' · ')}
                </p>
              )}

              {topTagRankings.length > 0 && (
                <div className="flex flex-wrap justify-center md:justify-start gap-1.5 px-2 mb-3">
                  {topTagRankings.map((ranking, index) => (
                    <span
                      key={`${ranking.tag}-${index}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs font-medium"
                    >
                      <Tag className="h-3 w-3 text-purple-400" />
                      #{ranking.rank} {ranking.tag}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-sm text-center md:text-left px-2 mb-3">
                <span className="text-green-400 font-semibold">{penceToPounds(media.globalMediaAggregate)}</span>
                <span className="text-gray-500 mx-2">·</span>
                <span className="text-pink-300 font-medium">#{media.globalMediaAggregateTopRank || '—'} global</span>
                <span className="text-gray-500 mx-2">·</span>
                <span className="text-cyan-300">{media.bids?.length || 0} tips</span>
              </p>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 px-2" ref={shareDropdownRef}>
                <button
                  type="button"
                  onClick={handlePlaySong}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-all flex items-center gap-2 text-sm"
                >
                  <Play className="h-4 w-4" fill="currentColor" />
                  Play
                </button>
                {renderShareButton()}
                {!isEditMode && hasEpisodeInfoContent && (
                  <button
                    type="button"
                    onClick={() => setShowEpisodeInfo((prev) => !prev)}
                    aria-expanded={showEpisodeInfo}
                    aria-controls="episode-info"
                    className="px-3 py-2 bg-gray-900/80 hover:bg-gray-800/80 text-white font-semibold rounded-lg border border-purple-500/50 transition-all flex items-center gap-2 text-sm"
                  >
                    <Info className="h-4 w-4" />
                    <span>Info</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showEpisodeInfo ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenTipModal}
                  disabled={isPlacingGlobalBid}
                  title="Send a tip"
                  aria-label="Send a tip"
                  className="group flex items-center justify-center w-10 h-10 rounded-full bg-purple-900/40 border border-purple-500/40 text-purple-300 hover:bg-purple-600 hover:text-white hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isPlacingGlobalBid ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Heart className="h-5 w-5 transition-transform group-hover:scale-110" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Episode details — expanded from Info control */}
        {!isEditMode && showEpisodeInfo && hasEpisodeInfoContent && (
          <div id="episode-info" className="mb-8 px-2 md:px-0">
            <div className="card bg-black/20 rounded-lg p-4 md:p-6">
              {media.description && (
                <div
                  className="text-gray-300 text-sm md:text-base leading-relaxed prose prose-invert prose-sm max-w-none mb-6
                    [&_p]:mb-3 [&_p:last-child]:mb-0 [&_p:first-child]:mt-0
                    [&_a]:text-purple-400 [&_a]:hover:text-purple-300 [&_a]:underline [&_a]:break-words
                    [&_strong]:text-white [&_strong]:font-semibold
                    [&_em]:italic
                    [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-3
                    [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-3
                    [&_li]:mb-1
                    [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4 [&_h1]:text-white
                    [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-white
                    [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-white
                    [&_blockquote]:border-l-4 [&_blockquote]:border-purple-500/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-3"
                  dangerouslySetInnerHTML={{ __html: sanitizeDescription(media.description) }}
                />
              )}

              {detailFields.length > 0 && (
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 ${media.description ? 'pt-6 border-t border-gray-700' : ''}`}>
                  {detailFields.map((field, index) => {
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
              )}

              {media.transcript && (
                <div className={`mt-6 ${media.description || detailFields.length > 0 ? 'pt-6 border-t border-gray-700' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="inline-flex items-center gap-2 text-lg font-semibold text-white hover:text-purple-300 transition-colors"
                  >
                    Transcript
                    {showTranscript ? <Minus className="h-4 w-4 text-gray-400" /> : <Plus className="h-4 w-4 text-gray-400" />}
                  </button>
                  {showTranscript && (
                    <div className="mt-3 text-gray-300 whitespace-pre-wrap bg-black/10 rounded-lg p-4 max-h-96 overflow-y-auto">
                      {media.transcript}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* More from this series — discovery rail directly below header */}
        {!isEditMode && (isLoadingSeriesEpisodes || seriesEpisodes.length > 0) && (
          <div className="mb-8 px-2 md:px-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <Mic className="h-5 w-5 text-cyan-300" />
                More from this series
              </h2>
              {seriesId && (
                <Link
                  to={`/podcast/${seriesId}`}
                  className="text-sm text-purple-300 hover:text-purple-200 transition-colors"
                >
                  View series
                </Link>
              )}
            </div>
            <div className="card bg-black/20 rounded-lg p-4">
              {isLoadingSeriesEpisodes ? (
                <div className="text-gray-400 text-sm">Loading episodes...</div>
              ) : (
                renderSeriesEpisodesRail(seriesEpisodes)
              )}
            </div>
          </div>
        )}

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
                Episode Info
              </button>
              <button
                onClick={() => handleEditTabChange('edit')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  editTab === 'edit'
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Edit Episode
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
        {renderSlimSupportSection()}

        {/* Champions - collapsible */}
        {media.bids && media.bids.length > 0 && (
          <div className="mb-6 px-2 md:px-0 flex flex-col items-center">
            <button
              onClick={() => setShowTopFans(!showTopFans)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-black/20 hover:bg-black/30 transition-colors"
            >
              <span className="flex items-center text-xl md:text-2xl font-bold text-white">
                <Crown className="h-5 w-5 md:h-6 md:w-6 mr-2 text-amber-400 flex-shrink-0" />
                {showTopFans ? 'Champions' : 'Show Champions'}
              </span>
              {showTopFans ? <Minus className="h-5 w-5 text-gray-400" /> : <Plus className="h-5 w-5 text-gray-400" />}
            </button>
            {showTopFans && (
              <div className="mt-3 w-full card bg-black/20 rounded-lg p-4 md:p-6">
                <MediaChampions mediaId={media.uuid || media._id} maxDisplay={10} />
              </div>
            )}
          </div>
        )}

        {/* Tag Rankings - collapsible */}
        {tagRankings.length > 0 && (
          <div className="mb-8 px-2 md:px-0 flex flex-col items-center">
            <button
              onClick={() => setShowTagRankings(!showTagRankings)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-black/20 hover:bg-black/30 transition-colors"
            >
              <span className="flex items-center text-xl md:text-2xl font-bold text-white">
                <Tag className="h-5 w-5 md:h-6 md:w-6 mr-2 text-purple-400 flex-shrink-0" />
                {showTagRankings ? 'Tag Rankings' : 'Show Tag Rankings'}
              </span>
              {showTagRankings ? <Minus className="h-5 w-5 text-gray-400" /> : <Plus className="h-5 w-5 text-gray-400" />}
            </button>
            {showTagRankings && (
              <div className="mt-3 w-full card bg-black/20 rounded-lg p-4 md:p-6">
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
            )}
          </div>
        )}

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
        {externalLinks.length > 0 && (
          <div className="mb-8 px-2 md:px-0">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-3 md:mb-4">Links</h2>
            <div className="card bg-black/20 rounded-lg p-4 md:p-6">
              <div className="flex flex-wrap gap-3">
                {externalLinks.map((link) => (
                  <a
                    key={link.platform}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-4 py-2.5 bg-black/20 border border-white/20 rounded-lg text-gray-200 transition-all hover:bg-black/30 ${link.color}`}
                  >
                    <link.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{link.displayName}</span>
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
                {/* Global Bid Section - Support This Episode */}
                <div className="mb-6 px-2 md:px-0">
                  <div className="max-w-2xl mx-auto">
                    <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 border-2 border-purple-500/30 rounded-lg p-4 md:p-8 text-center">
                      <h3 className="text-xl md:text-2xl font-bold text-white mb-2 flex items-center justify-center">
                        <Coins className="h-5 w-5 md:h-7 md:w-7 mr-2 md:mr-3 text-yellow-400" />
                        Support This Episode
                      </h3>
                      <p className="text-gray-300 text-sm md:text-base mb-4 md:mb-6">
                        Boost this episode's global ranking and support the creators
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
                          disabled={isPlacingGlobalBid || (Boolean(user) && !isGlobalBidValid)}
                          className="px-6 md:px-8 py-2 md:py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                        >
                          <TipCtaLabel
                            amount={globalBidInput}
                            signedIn={Boolean(user)}
                            loading={isPlacingGlobalBid}
                            fallback="Enter Tip"
                          />
                        </button>
                      </div>
                      
                      {renderTipStatShortcuts('flex flex-wrap justify-center gap-2 mb-4')}
                      
                      <p className="text-xs md:text-sm text-gray-400">
                        Minimum tip: £{minimumBid.toFixed(2)}
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

              {/* Release Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                {/* Location Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-white font-medium mb-2">Primary Location</label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editForm.primaryLocation?.city || ''}
                        onChange={(e) => setEditForm({ 
                          ...editForm, 
                          primaryLocation: { 
                            ...(editForm.primaryLocation || {}), 
                            city: e.target.value 
                          } 
                        })}
                        className="input"
                        placeholder="Town/City/Village"
                      />
                      <input
                        type="text"
                        value={editForm.primaryLocation?.region || ''}
                        onChange={(e) => setEditForm({ 
                          ...editForm, 
                          primaryLocation: { 
                            ...(editForm.primaryLocation || {}), 
                            region: e.target.value 
                          } 
                        })}
                        className="input"
                        placeholder="Region/State"
                      />
                      <select
                        value={editForm.primaryLocation?.country || ''}
                        onChange={(e) => {
                          const country = e.target.value;
                          const countryCode = getCountryCode(country);
                          setEditForm({ 
                            ...editForm, 
                            primaryLocation: { 
                              ...(editForm.primaryLocation || {}), 
                              country: country,
                              countryCode: countryCode
                            } 
                          });
                        }}
                        className="input"
                      >
                        <option value="">Select Country</option>
                        {COUNTRIES.map(country => (
                          <option key={country} value={country}>{country}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-white font-medium mb-2">Secondary Location</label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editForm.secondaryLocation?.city || ''}
                        onChange={(e) => setEditForm({ 
                          ...editForm, 
                          secondaryLocation: { 
                            ...(editForm.secondaryLocation || {}), 
                            city: e.target.value 
                          } 
                        })}
                        className="input"
                        placeholder="Town/City/Village"
                      />
                      <input
                        type="text"
                        value={editForm.secondaryLocation?.region || ''}
                        onChange={(e) => setEditForm({ 
                          ...editForm, 
                          secondaryLocation: { 
                            ...(editForm.secondaryLocation || {}), 
                            region: e.target.value 
                          } 
                        })}
                        className="input"
                        placeholder="Region/State"
                      />
                      <select
                        value={editForm.secondaryLocation?.country || ''}
                        onChange={(e) => {
                          const country = e.target.value;
                          const countryCode = getCountryCode(country);
                          setEditForm({ 
                            ...editForm, 
                            secondaryLocation: { 
                              ...(editForm.secondaryLocation || {}), 
                              country: country,
                              countryCode: countryCode
                            } 
                          });
                        }}
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

              {/* Minimum Tip/Bid */}
              <div className="mb-4">
                <label className="block text-white font-medium mb-2">
                  Minimum Tip Amount (Optional)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-400">£</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editForm.minimumBid ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setEditForm({ 
                          ...editForm, 
                          minimumBid: value === '' ? null : parseFloat(value) || null 
                        });
                      }}
                      className="input pl-8"
                      placeholder="Leave empty to use party default"
                    />
                  </div>
                  {editForm.minimumBid !== null && (
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, minimumBid: null })}
                      className="px-3 py-2 text-sm text-gray-400 hover:text-white border border-gray-600 hover:border-gray-500 rounded transition-colors"
                      title="Clear to use party default"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Set a custom minimum tip amount for this media. If not set, the party's minimum tip will be used.
                </p>
              </div>

                {/* Cover Art URL */}
                <div>
                  <label className="block text-white font-medium mb-2">Cover Art URL</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="url"
                      value={editForm.coverArt}
                      onChange={(e) => setEditForm({ ...editForm, coverArt: e.target.value })}
                      className="input flex-1 min-w-[200px]"
                      placeholder="https://example.com/cover.jpg"
                    />
                    <button
                      type="button"
                      onClick={handleCoverArtUploadClick}
                      disabled={isUploadingCoverArt || isRemovingCoverArt}
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
                    {editForm.coverArt && editForm.coverArt !== DEFAULT_COVER_ART && (
                      <button
                        type="button"
                        onClick={handleRemoveCoverArt}
                        disabled={isRemovingCoverArt || isUploadingCoverArt}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors flex items-center space-x-2"
                      >
                        {isRemovingCoverArt ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Removing...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            <span>Remove</span>
                          </>
                        )}
                      </button>
                    )}
                    <input
                      ref={coverArtFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCoverArtUpload}
                      className="hidden"
                    />
                  </div>
                  {editForm.coverArt && (
                    <div className="mt-2 flex items-start gap-3">
                      <img
                        src={editForm.coverArt}
                        alt="Cover art preview"
                        className="w-16 h-16 rounded object-cover border border-gray-600"
                      />
                      <p className="text-sm text-gray-400 break-all flex-1">
                        Current: {editForm.coverArt}
                        {editForm.coverArt === DEFAULT_COVER_ART && (
                          <span className="block text-gray-500 mt-1">Using default cover art</span>
                        )}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Remove cover art if it has rights issues — the tune will use the default fallback image.
                  </p>
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
                {canDeleteEpisode() && mediaId && media?.title && (
                  <DeleteMediaSection
                    mediaId={media._id || mediaId}
                    mediaTitle={media.title}
                    contentLabel="Episode"
                    redirectTo={getEpisodeDeleteRedirect()}
                  />
                )}
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

      {showClaimModal && media && (
        <ClaimMediaModal
          mediaId={media._id}
          mediaTitle={media.title}
          contentLabel="Episode"
          onClose={() => setShowClaimModal(false)}
        />
      )}

      {/* Bid Confirmation Modal */}
      <BidConfirmationModal
        isOpen={showBidConfirmationModal}
        onClose={() => setShowBidConfirmationModal(false)}
        onConfirm={handleConfirmGlobalBid}
        bidAmount={defaultTipAmount}
        minTip={minimumBid}
        avgTip={media ? calculateGlobalMediaBidAvg(media) || undefined : undefined}
        championAggregate={mediaChampionTip?.championAggregate}
        viewerAggregate={mediaChampionTip?.viewerAggregate}
        viewerIsChampion={mediaChampionTip?.viewerIsChampion}
        mediaTitle={media?.title || 'Unknown'}
        mediaArtist={
          seriesTitle
          || (Array.isArray(media?.host) ? media.host.map((h: any) => h.name || h).join(', ') : null)
          || (Array.isArray(media?.artist)
            ? media.artist.map((a: any) => a.name || a).join(', ')
            : (media?.artist as string))
          || 'Unknown'
        }
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

      {/* Mobile sticky tip bar — sits above the podcast player */}
      {!isEditMode && (
        <div className="md:hidden fixed bottom-[4.5rem] left-0 right-0 z-[9998] px-4 pointer-events-none">
          <button
            type="button"
            onClick={handleGlobalBid}
            disabled={isPlacingGlobalBid || (Boolean(user) && !isGlobalBidValid)}
            className="pointer-events-auto w-full max-w-md mx-auto flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-bold rounded-full shadow-2xl border border-purple-400/30 transition-all"
          >
            <TipCtaLabel
              amount={globalBidInput}
              signedIn={Boolean(user)}
              loading={isPlacingGlobalBid}
              fallback="Tip"
            />
          </button>
        </div>
      )}
      </div>
    </div>
  );
};

export default PodcastEpisodeProfile;
