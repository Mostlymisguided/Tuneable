import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocketIOParty } from '../hooks/useSocketIOParty';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { usePodcastPlayerStore } from '../stores/podcastPlayerStore';
import { usePlayerWarning } from '../hooks/usePlayerWarning';
import { partyAPI, searchAPI } from '../lib/api';
import { toast } from 'react-toastify';
import BidModal from '../components/BidModal';
// import PartyQueueSearch from '../components/PartyQueueSearch'; // Commented out for now
import PlayerWarningModal from '../components/PlayerWarningModal';
import TagInputModal from '../components/TagInputModal';
import MediaValidationModal from '../components/MediaValidationModal';
import BidConfirmationModal from '../components/BidConfirmationModal';
import QuotaWarningBanner from '../components/QuotaWarningBanner';
import ClickableArtistDisplay from '../components/ClickableArtistDisplay';
// MediaLeaderboard kept in codebase for potential future use
import MiniSupportersBar from '../components/MiniSupportersBar';
import '../types/youtube'; // Import YouTube types
import { Play, CheckCircle, X, Music, Users, Clock, Coins, Loader2, Youtube, Tag, Minus, Plus, TrendingUp, RefreshCw, Share2, Copy, Check, ChevronDown, Twitter, Facebook, Linkedin, Flag } from 'lucide-react';
import TopSupporters from '../components/TopSupporters';
import { DEFAULT_COVER_ART } from '../constants';
import { penceToPoundsNumber, penceToPounds } from '../utils/currency';
import { isLocationMatch, formatLocation } from '../utils/locationHelpers';
import { getCanonicalTag } from '../utils/tagNormalizer';

// Define types directly to avoid import issues
interface PartyMedia {
  _id: string;
  title: string;
  artist: string;
  coverArt?: string;
  duration?: number;
  sources?: {
    youtube?: string;
    upload?: string;
  };
  globalMediaAggregate?: number; // Updated to schema grammar
  bids?: any[];
  addedBy: string;
  tags?: string[];
  category?: string;
  [key: string]: any; // Allow additional properties
}


interface PartyUpdateMessage {
  type: 'PARTY_CREATED' | 'MEDIA_STARTED' | 'MEDIA_COMPLETED' | 'MEDIA_VETOED' | 'PARTY_ENDED' | 'UPDATE_QUEUE' | 'PLAY' | 'PAUSE' | 'SKIP' | 'PLAY_NEXT' | 'USER_KICKED';
  partyId?: string;
  mediaId?: string;
  playedAt?: string;
  completedAt?: string;
  vetoedAt?: string;
  vetoedBy?: string;
  vetoedBy_uuid?: string;
  reason?: string;
  queue?: PartyMedia[];
  media?: PartyMedia;
  party?: any;
  userId?: string;
  kickedBy?: string;
}

const VALID_TIME_PERIODS = ['all-time', 'today', 'this-week', 'this-month', 'this-year'] as const;

/** Parse ?tag= or ?tags= from URL into #canonical tag terms for queueSearchTerms (global party only). */
function getTagTermsFromSearchParams(params: URLSearchParams, isGlobal: boolean): string[] {
  if (!isGlobal) return [];
  const tag = params.get('tag');
  const tagsParam = params.get('tags');
  const list: string[] = [];
  if (tag) list.push(tag.trim());
  if (tagsParam) tagsParam.split(',').forEach((t: string) => { const x = t.trim(); if (x) list.push(x); });
  return [...new Set(list)]
    .map((t: string) => getCanonicalTag(t))
    .filter((c: string) => c)
    .map((c: string) => '#' + c);
}

const Party: React.FC = () => {
  const { partyId } = useParams<{ partyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, updateBalance } = useAuth();
  const navigate = useNavigate();
  const [party, setParty] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const periodParam = searchParams.get('period');
  const initialPeriod = periodParam && VALID_TIME_PERIODS.includes(periodParam as any) ? periodParam : 'today';
  const isGlobalParty = partyId === 'global';
  
  // Helper function to get effective minimum bid (media-level override takes precedence)
  const getEffectiveMinimumBid = (media?: any): number => {
    return media?.minimumBid ?? party?.minimumBid ?? 0.01;
  };

  // Helper function to get default bid amount (uses user's defaultTip preference, respects minimum)
  const getDefaultBidAmount = (media?: any): number => {
    const minBid = getEffectiveMinimumBid(media);
    const userDefaultTip = user?.preferences?.defaultTip || 0.11;
    // Use the higher of minimum bid or user's default tip
    return Math.max(minBid, userDefaultTip);
  };
  
  // Bid modal state
  const [bidModalOpen, setBidModalOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [isBidding, setIsBidding] = useState(false);

  // End party modal state
  const [endPartyModalOpen, setEndPartyModalOpen] = useState(false);
  const [isEndingParty, setIsEndingParty] = useState(false);

  // Sorting state: default from ?period= query, else "today"
  const [selectedTimePeriod, setSelectedTimePeriod] = useState(initialPeriod);
  const [sortedMedia, setSortedMedia] = useState<any[]>([]);
  const [isLoadingSortedMedia, setIsLoadingSortedMedia] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Search state (initial tag terms from URL for global party: ?tag= or ?tags=)
  const [queueSearchTerms, setQueueSearchTerms] = useState<string[]>(() =>
    getTagTermsFromSearchParams(searchParams, partyId === 'global')
  );
  
  // Inline add media search state
  const [showAddTunesPanel, setShowAddTunesPanel] = useState(false);
  const [addMediaSearchQuery, setAddMediaSearchQuery] = useState('');
  const [addMediaResults, setAddMediaResults] = useState<{
    database: any[];
    youtube: any[];
  }>({ database: [], youtube: [] });
  const [isSearchingNewMedia, setIsSearchingNewMedia] = useState(false);
  const [isLoadingMoreYouTube, setIsLoadingMoreYouTube] = useState(false);
  const [youtubeNextPageToken, setYoutubeNextPageToken] = useState<string | null>(null);
  const [newMediaBidAmounts, setNewMediaBidAmounts] = useState<Record<string, string>>({});
  const [hasSearchedDatabase, setHasSearchedDatabase] = useState(false);
  
  // Queue bidding state (for inline bidding on queue items)
  const [queueBidAmounts, setQueueBidAmounts] = useState<Record<string, string>>({});
  // NOTE: UI copy intentionally references "tips" while backend models/API
  // still use "bid" terminology. Keep code-level naming until contracts change.
  
  // Tag modal state (keeping for backward compatibility, but using confirmation modal now)
  const [showTagModal, setShowTagModal] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<any>(null);
  const [showBidConfirmationModal, setShowBidConfirmationModal] = useState(false);
  const [isInlineBid, setIsInlineBid] = useState(false); // Track if this is an inline bid on existing media
  
  // Use ref to track pending media during async operations to avoid state update issues
  const pendingMediaRef = useRef<any>(null);
  const isInlineBidRef = useRef<boolean>(false);
  
  // Validation modal state
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<{category?: boolean; duration?: boolean}>({});
  const [validationCategory, setValidationCategory] = useState<string>('');
  const [validationDuration, setValidationDuration] = useState<number>(0);
  
  const [showVetoed, setShowVetoed] = useState(false);

  // Share functionality state
  const [isMobile, setIsMobile] = useState(false);
  const [topTagsExpanded, setTopTagsExpanded] = useState(false);
  const [showTagFilterCloud, setShowTagFilterCloud] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);

  // Player warning system
  const { showWarning, isWarningOpen, warningAction, onConfirm, onCancel, currentMediaTitle, currentMediaArtist } = usePlayerWarning();

  // Scroll helper removed (no longer used)

  // Use global WebPlayer store
  const {
    setCurrentMedia,
    isHost,
    setIsHost,
    setQueue,
    setWebSocketSender,
    setCurrentPartyId,
    setGlobalPlayerActive,
    currentPartyId,
    currentMedia,
    play,
  } = useWebPlayerStore();

  // Use Socket.IO for real-time party updates
  const { sendMessage } = useSocketIOParty({
    partyId: partyId || '',
    enabled: !!partyId,
    onMessage: (message: PartyUpdateMessage) => {
      console.log('Party update received:', message);
      
      switch (message.type) {
        case 'UPDATE_QUEUE':
          if (message.queue) {
            // Preserve existing status fields (especially 'vetoed') when updating queue
            setParty((prev: any) => {
              if (!prev) return null;
              // Merge new queue with existing status information to preserve vetoed status
              const updatedMedia = message.queue!.map((newItem: any) => {
                // Find existing item to preserve status
                const existingItem = prev.media.find((existing: any) => {
                  const existingMediaId = existing.mediaId?._id || existing.mediaId?.id || existing.mediaId || existing._id;
                  const newMediaId = newItem.mediaId?._id || newItem.mediaId?.id || newItem.mediaId || newItem.id || newItem._id;
                  return existingMediaId?.toString() === newMediaId?.toString();
                });
                // Preserve status if it exists (especially 'vetoed'), otherwise use newItem's status or default to 'active'
                return {
                  ...newItem,
                  status: existingItem?.status || newItem.status || 'active',
                  // Also preserve vetoed-related fields
                  vetoedAt: existingItem?.vetoedAt || newItem.vetoedAt,
                  vetoedBy: existingItem?.vetoedBy || newItem.vetoedBy,
                  vetoedBy_uuid: existingItem?.vetoedBy_uuid || newItem.vetoedBy_uuid
                };
              });
              return { ...prev, media: updatedMedia };
            });
            
            // Note: Socket.IO UPDATE_QUEUE messages don't contain media status information,
            // so we don't update the global player queue here. The queue is managed
            // by the party data from the API calls which include proper status information.
            console.log('Socket.IO UPDATE_QUEUE received - preserved existing status fields');
          }
          break;
        case 'PLAY':
        case 'PAUSE':
        case 'SKIP':
        case 'PLAY_NEXT':
          // Global store will handle these
          break;
          
        case 'USER_KICKED':
          console.log('Socket.IO USER_KICKED received');
          // Refresh party details to update partiers and kickedUsers lists
          fetchPartyDetails();
          break;
          
        case 'MEDIA_STARTED':
          console.log('Socket.IO MEDIA_STARTED received');
          if (message.mediaId) {
            setParty((prev: any) => {
              if (!prev) return null;
              return {
                ...prev,
                media: prev.media.map((item: any) => {
                  const mediaData = item.mediaId || item;
                  if (mediaData.id === message.mediaId) {
                    return {
                      ...item,
                      playedAt: message.playedAt || new Date()
                    };
                  }
                  return item;
                })
              };
            });
          }
          break;
          
        case 'MEDIA_COMPLETED':
          console.log('Socket.IO MEDIA_COMPLETED received for mediaId:', message.mediaId);
          if (message.mediaId) {
            setParty((prev: any) => {
              if (!prev) return null;
              console.log('Updating party state for completed media:', message.mediaId);
              return {
                ...prev,
                media: prev.media.map((item: any) => {
                  const mediaData = item.mediaId || item;
                  if (mediaData.id === message.mediaId) {
                    console.log('Found media to mark as completed:', mediaData.title);
                    return {
                      ...item,
                      completedAt: message.completedAt || new Date()
                    };
                  }
                  return item;
                })
              };
            });
          }
          break;
          
        case 'MEDIA_VETOED':
          console.log('Socket.IO MEDIA_VETOED received');
          if (message.mediaId) {
            setParty((prev: any) => {
              if (!prev) return null;
              return {
                ...prev,
                media: prev.media.map((item: any) => {
                  const mediaData = item.mediaId || item;
                  if (mediaData.id === message.mediaId) {
                    return {
                      ...item,
                      status: 'vetoed',
                      vetoedAt: message.vetoedAt || new Date(),
                      vetoedBy: message.vetoedBy
                    };
                  }
                  return item;
                })
              };
            });
          }
          break;
          
        case 'PARTY_ENDED':
          console.log('Socket.IO PARTY_ENDED received');
          toast.info('This party has been ended by the host');
          // Redirect to parties list after a short delay
          setTimeout(() => {
            navigate('/parties');
          }, 2000);
          break;
      }
    },
    onConnect: () => {
      console.log('Socket.IO connected for party updates');
      // Set up Socket.IO sender in global store
      setWebSocketSender(sendMessage);
    },
    onDisconnect: () => {
      console.log('Socket.IO disconnected from party updates');
    }
  });

  useEffect(() => {
    if (partyId) {
      fetchPartyDetails();
      if (selectedTimePeriod !== 'all-time') {
        fetchSortedMedia(selectedTimePeriod);
      }
    }
  }, [partyId]);

  // Sync period from URL when it changes (e.g. /explore redirect, back/forward)
  useEffect(() => {
    const p = searchParams.get('period');
    if (p && VALID_TIME_PERIODS.includes(p as any) && p !== selectedTimePeriod) {
      setSelectedTimePeriod(p);
      if (p !== 'all-time' && partyId) fetchSortedMedia(p);
    }
  }, [searchParams]);

  // Sync tag param(s) from URL when it changes (global party: back/forward or shared link)
  useEffect(() => {
    if (!isGlobalParty) return;
    const tagTermsFromUrl = getTagTermsFromSearchParams(searchParams, true);
    setQueueSearchTerms((prev) => {
      const currentTagTerms = prev.filter((t) => t.startsWith('#'));
      const same = currentTagTerms.length === tagTermsFromUrl.length &&
        currentTagTerms.every((t, i) => t.toLowerCase() === tagTermsFromUrl[i].toLowerCase());
      if (same) return prev;
      const nonTagTerms = prev.filter((t) => !t.startsWith('#'));
      return [...tagTermsFromUrl, ...nonTagTerms];
    });
  }, [searchParams, isGlobalParty]);

  // Sync tag filters to URL when user toggles tags (global party only; preserve period)
  useEffect(() => {
    if (!isGlobalParty) return;
    const tagTerms = queueSearchTerms.filter((t) => t.startsWith('#')).map((t) => t.slice(1).toLowerCase());
    const currentTag = searchParams.get('tag');
    const currentTags = searchParams.get('tags');
    const currentTagTerms = currentTag ? [currentTag.toLowerCase()] : (currentTags ? currentTags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean) : []);
    const same = tagTerms.length === currentTagTerms.length && tagTerms.every((t, i) => t === currentTagTerms[i]);
    if (same) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('tag');
      next.delete('tags');
      if (tagTerms.length === 1) next.set('tag', tagTerms[0]);
      else if (tagTerms.length > 1) next.set('tags', tagTerms.join(','));
      return next;
    }, { replace: true });
  }, [isGlobalParty, queueSearchTerms, searchParams]);

  // Manual refresh only for remote parties (no automatic polling)
  // Remote parties will refresh on user actions (bids, adds, skips) and manual refresh button

  // Set current media and host status when party loads
  useEffect(() => {
    console.log('Party useEffect triggered - party:', !!party, 'media:', party?.media?.length, 'currentPartyId:', currentPartyId, 'partyId:', partyId);
    
    if (party && getPartyMedia().length > 0) {
      // Always update the global player queue when party data loads
      // This ensures the queue is updated even if it's the "same" party (e.g., on page reload)
      console.log('Updating global player queue for party:', partyId);
        
        // Filter to only include active media for the WebPlayer
        const queuedMedia = getPartyMedia().filter((item: any) => item.status === 'active');
        console.log('Queued media for WebPlayer:', queuedMedia.length);
        console.log('All party media statuses:', getPartyMedia().map((s: any) => ({ title: s.mediaId?.title, status: s.status })));
        
        // Clean and set the queue in global store
        const cleanedQueue = queuedMedia.map((item: any) => {
          const actualMedia = item.mediaId || item;
          let sources = {};
          
          if (actualMedia.sources) {
            if (Array.isArray(actualMedia.sources)) {
              for (const source of actualMedia.sources) {
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
            } else if (typeof actualMedia.sources === 'object') {
              // Preserve the original sources object
              sources = actualMedia.sources;
            }
          }
          
          return {
            id: actualMedia._id || actualMedia.id || actualMedia.uuid, // Prefer ObjectId first
            title: actualMedia.title,
            artist: Array.isArray(actualMedia.artist) ? actualMedia.artist[0]?.name || 'Unknown Artist' : actualMedia.artist,
            artists: Array.isArray(actualMedia.artist) ? actualMedia.artist : (actualMedia.artists || []), // Preserve full artist array with userIds for ClickableArtistDisplay
            featuring: actualMedia.featuring || [],
            creatorDisplay: actualMedia.creatorDisplay,
            duration: actualMedia.duration,
            coverArt: actualMedia.coverArt,
            sources: sources,
            globalMediaAggregate: typeof actualMedia.globalMediaAggregate === 'number' ? actualMedia.globalMediaAggregate : 0,
            partyMediaAggregate: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0,
            totalBidValue: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0, // Use partyMediaAggregate as totalBidValue
            bids: item.partyBids || item.bids || actualMedia.bids || [], // Use party-specific bids (PartyUserMediaAggregate) if available, fallback to global bids
            addedBy: typeof actualMedia.addedBy === 'object' ? actualMedia.addedBy?.username || 'Unknown' : actualMedia.addedBy
          };
        });
        
        setQueue(cleanedQueue);
        setCurrentPartyId(partyId!);
        setGlobalPlayerActive(true);
        
      // Only set media if web player is empty (no current media)
      // This preserves playback across page loads/navigation
      // No autoplay - user must manually start playback
      if (cleanedQueue.length > 0) {
        if (!currentMedia) {
          // Web player is empty - set media but don't autoplay
          console.log('Web player is empty, setting current media to:', cleanedQueue[0].title);
          setCurrentMedia(cleanedQueue[0], 0); // No autoplay - user starts manually
        } else {
          // Web player already has media - preserve it, don't interrupt
          console.log('Web player already has media, preserving playback:', currentMedia.title);
          // Queue is still updated above, so when current media ends, party queue will continue
        }
      } else {
        // If no queued media, only clear if web player is empty
        // Don't interrupt existing playback from other parties/sources
        if (!currentMedia) {
          console.log('No queued media and web player is empty, clearing WebPlayer');
          setCurrentMedia(null, 0);
        } else {
          console.log('No queued media but web player is active, preserving playback:', currentMedia.title);
        }
      }
    }
    
    if (user && party) {
      // Use UUID comparison for consistency
      // Now that backend populates host.uuid, we can directly access it
      const hostUuid = typeof party.host === 'object' && party.host.uuid 
                       ? party.host.uuid 
                       : party.host;
      const userUuid = user._id || user.id || (user as any).uuid;
      const checkIsHost = userUuid === hostUuid;
      setIsHost(checkIsHost);
      console.log('🔍 isHost check:', { userUuid, hostUuid, isHost: checkIsHost, partyHost: party.host });
    }
  }, [party, user, partyId, currentPartyId, currentMedia, setQueue, setCurrentMedia, setIsHost, setCurrentPartyId, setGlobalPlayerActive]);

  // Clear database search flag and results when search query is cleared
  useEffect(() => {
    if (!addMediaSearchQuery.trim()) {
      setHasSearchedDatabase(false);
      setAddMediaResults({ database: [], youtube: [] });
      setYoutubeNextPageToken(null);
    }
  }, [addMediaSearchQuery]);

  // Update WebPlayer queue when sorting or tag filtering changes
  useEffect(() => {
    if (party) {
      // Use getDisplayMedia() to respect both time sorting AND tag filtering
      const displayMedia = getDisplayMedia();
      
      if (displayMedia.length > 0) {
        console.log('Updating WebPlayer queue with filtered display media:', displayMedia.length);
        
        // Clean and set the queue in global store
        const cleanedQueue = displayMedia.map((item: any) => {
          // For sorted media, the data is already flattened, for regular party media it's nested under mediaId
          const mediaData = selectedTimePeriod === 'all-time' ? (item.mediaId || item) : item;
          
          // Clean and format sources
          let sources = {};
          
          if (mediaData.sources) {
            if (Array.isArray(mediaData.sources)) {
              for (const source of mediaData.sources) {
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
            } else if (typeof mediaData.sources === 'object') {
              sources = mediaData.sources;
            }
          }
          
          return {
            id: mediaData._id || mediaData.id || mediaData.uuid,
            _id: mediaData._id || mediaData.id || mediaData.uuid,
            title: mediaData.title,
            artist: Array.isArray(mediaData.artist) ? mediaData.artist[0]?.name || 'Unknown Artist' : mediaData.artist,
            artists: Array.isArray(mediaData.artist) ? mediaData.artist : (mediaData.artists || []),
            featuring: mediaData.featuring || [],
            creatorDisplay: mediaData.creatorDisplay,
            duration: mediaData.duration,
            coverArt: mediaData.coverArt,
            sources: sources,
            globalMediaAggregate: typeof mediaData.globalMediaAggregate === 'number' ? mediaData.globalMediaAggregate : 0,
            partyMediaAggregate: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0,
            totalBidValue: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0,
            bids: item.partyBids || item.bids || mediaData.bids || [],
            addedBy: typeof mediaData.addedBy === 'object' ? mediaData.addedBy?.username || 'Unknown' : mediaData.addedBy
          };
        });
        
        setQueue(cleanedQueue);
        
        // If there is media and no current media, set the first one
        if (cleanedQueue.length > 0 && !currentMedia) {
          setCurrentMedia(cleanedQueue[0], 0);
        }
      } else {
        // If no display media, clear queue only if web player is empty
        if (!currentMedia) {
          setQueue([]);
        }
      }
    }
  }, [sortedMedia, selectedTimePeriod, party, queueSearchTerms, setQueue, setCurrentMedia, currentMedia]);

  const fetchPartyDetails = async () => {
    try {
      // First update party statuses based on current time
      await partyAPI.updateStatuses();
      
      // Then fetch the updated party details
      const response = await partyAPI.getPartyDetails(partyId!);
      setParty(response.party);
      
      // Check if current user is the host (use UUID)
      // Backend now populates host.uuid, so we can access it directly
      const hostUuid = typeof response.party.host === 'object' && response.party.host.uuid 
                       ? response.party.host.uuid 
                       : response.party.host;
      const userUuid = user?.id || (user as any)?.uuid;
      const checkIsHost = userUuid === hostUuid;
      setIsHost(checkIsHost);
      console.log('🔍 fetchPartyDetails isHost check:', { userUuid, hostUuid, isHost: checkIsHost, partyHost: response.party.host });
      
      // Note: Media setting is now handled by the useEffect hook
      // to prevent interference with global player state
    } catch (error: any) {
      console.error('Error fetching party details:', error);
      // Check if it's an authentication error
      if (error?.response?.status === 401) {
        toast.error('Please log in to view party details', {
          onClick: () => navigate('/login'),
          style: { cursor: 'pointer' }
        });
      } else {
        toast.error('Failed to load party details');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Alias for consistency
  // const fetchParty = fetchPartyDetails; // OLD - no longer used


  // Sorting functions
  const fetchSortedMedia = async (timePeriod: string) => {
    if (!partyId) return;
    
    setIsLoadingSortedMedia(true);
    try {
      const response = await partyAPI.getMediaSortedByTime(partyId, timePeriod);
      setSortedMedia(response.media || []);
    } catch (error: any) {
      console.error('Error fetching sorted media:', error);
      // Check if it's an authentication error
      if (error?.response?.status === 401) {
        toast.error('Please log in to view sorted media', {
          onClick: () => navigate('/login'),
          style: { cursor: 'pointer' }
        });
      } else {
        toast.error('Failed to load sorted media');
      }
    } finally {
      setIsLoadingSortedMedia(false);
    }
  };

  const handleTimePeriodChange = (timePeriod: string) => {
    setSelectedTimePeriod(timePeriod);
    setSearchParams({ period: timePeriod });
    if (timePeriod !== 'all-time') {
      fetchSortedMedia(timePeriod);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Refresh party data (includes all bids)
      await fetchPartyDetails();
      
      // If viewing a time-filtered period, also refresh sorted media
      if (selectedTimePeriod !== 'all-time') {
        await fetchSortedMedia(selectedTimePeriod);
      }
      
      toast.success('Party data refreshed');
    } catch (error: any) {
      console.error('Error refreshing party:', error);
      // Check if it's an authentication error
      if (error?.response?.status === 401) {
        toast.error('Please log in to refresh party data', {
          onClick: () => navigate('/login'),
          style: { cursor: 'pointer' }
        });
      } else {
        toast.error('Failed to refresh party data');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Helper function to detect YouTube URLs
  const isYouTubeUrl = (query: string) => {
    const youtubePatterns = [
      /youtube\.com\/watch\?v=/,
      /youtu\.be\//,
      /youtube\.com\/embed\//
    ];
    return youtubePatterns.some(pattern => pattern.test(query));
  };

  // Inline add media search functions
  const handleAddMediaSearch = async () => {
    if (!addMediaSearchQuery.trim()) return;
    
    // Check if user is logged in - redirect to registration if not
    if (!user) {
      const redirectUrl = getRegistrationUrl();
      toast.info('Please sign up to search for tunes');
      navigate(redirectUrl);
      return;
    }
    
    setIsSearchingNewMedia(true);
    setHasSearchedDatabase(true); // Mark that we've performed a database/YouTube search
    try {
      let response;
      
      // Check if it's a YouTube URL
      if (isYouTubeUrl(addMediaSearchQuery)) {
        console.log('🎥 Detected YouTube URL, processing...');
        response = await searchAPI.searchByYouTubeUrl(addMediaSearchQuery);
        console.log('🎥 YouTube URL response:', response);
        
        // Handle YouTube URL response
        let databaseResults = [];
        let youtubeResults = [];
        
        if (response.source === 'local' && response.videos) {
          databaseResults = response.videos;
          console.log(`📚 Found existing media in database: ${response.videos[0]?.title}`);
        } else if (response.source === 'external' && response.videos) {
          youtubeResults = response.videos;
          console.log(`🎥 Found new media from YouTube: ${response.videos[0]?.title}`);
        }
        
        setAddMediaResults({
          database: databaseResults,
          youtube: youtubeResults
        });
        
        // Initialize bid amounts for results (use average bid or default tip, whichever is higher)
        const newBidAmounts: Record<string, string> = {};
        [...databaseResults, ...youtubeResults].forEach(media => {
          const avgBid = calculateAverageBid(media);
          newBidAmounts[media._id || media.id] = Math.max(getDefaultBidAmount(media), avgBid || 0).toFixed(2);
        });
        setNewMediaBidAmounts(newBidAmounts);
        
        // Show user feedback
        if (response.videos && response.videos.length > 0) {
          if (response.source === 'local') {
            toast.success(`Found "${response.videos[0]?.title}" in our database`);
          } else if (response.source === 'external') {
            toast.success(`Found "${response.videos[0]?.title}" from YouTube`);
          }
        }
      } else {
        // Regular search logic
        const mediaSource = party?.mediaSource || 'youtube';
        
        // Search local database first
        console.log('🔍 Searching for new media:', addMediaSearchQuery);
        response = await searchAPI.search(addMediaSearchQuery, mediaSource);
      
      let databaseResults = [];
      let youtubeResults = [];
      
      if (response.source === 'local' && response.videos) {
        databaseResults = response.videos;
        console.log(`📚 Found ${databaseResults.length} results in database`);
      } else if (response.source === 'external' && response.videos) {
        youtubeResults = response.videos;
        console.log(`🎥 Found ${youtubeResults.length} results from YouTube`);
      }
      
      // If we got local results but want to show YouTube too, fetch YouTube
      if (databaseResults.length > 0 && response.hasMoreExternal) {
        console.log('🎥 Also fetching YouTube results...');
        const youtubeResponse = await searchAPI.search(addMediaSearchQuery, mediaSource, undefined, undefined, true);
        if (youtubeResponse.videos) {
          youtubeResults = youtubeResponse.videos;
          setYoutubeNextPageToken(youtubeResponse.nextPageToken || null);
          console.log(`🎥 Found ${youtubeResults.length} YouTube results`);
        }
      } else if (response.source === 'external') {
        // Track next page token for YouTube results
        setYoutubeNextPageToken(response.nextPageToken || null);
      }
      
      setAddMediaResults({ database: databaseResults, youtube: youtubeResults });
      
      // Initialize bid amounts for results (use average bid or default tip, whichever is higher)
      const newBidAmounts: Record<string, string> = {};
      [...databaseResults, ...youtubeResults].forEach(media => {
        const avgBid = calculateAverageBid(media);
        newBidAmounts[media._id || media.id] = Math.max(getDefaultBidAmount(media), avgBid || 0).toFixed(2);
      });
      setNewMediaBidAmounts(newBidAmounts);
      }
      
    } catch (error: any) {
      console.error('Search error:', error);
      
      // Check if search is disabled due to quota
      if (error?.response?.status === 429) {
        const errorData = error.response?.data;
        toast.error(
          <div>
            <div className="font-semibold">{errorData?.error || 'YouTube search is temporarily disabled'}</div>
            <div className="text-sm mt-1">{errorData?.message}</div>
            {errorData?.suggestion && (
              <div className="text-sm mt-1 text-blue-300">{errorData.suggestion}</div>
            )}
          </div>,
          { autoClose: 8000 }
        );
      } else {
        toast.error('Search failed. Please try again.');
      }
    } finally {
      setIsSearchingNewMedia(false);
    }
  };

  const handleLoadMoreYouTube = async () => {
    if (!youtubeNextPageToken || !addMediaSearchQuery) return;
    
    setIsLoadingMoreYouTube(true);
    try {
      const mediaSource = party?.mediaSource || 'youtube';
      const response = await searchAPI.search(addMediaSearchQuery, mediaSource, youtubeNextPageToken, undefined, true);
      
      if (response.videos) {
        // Append new results to existing YouTube results
        setAddMediaResults(prev => ({
          ...prev,
          youtube: [...prev.youtube, ...response.videos]
        }));
        
        setYoutubeNextPageToken(response.nextPageToken || null);
        
        // Initialize bid amounts for new results
        const newBidAmounts: Record<string, string> = { ...newMediaBidAmounts };
        response.videos.forEach((media: any) => {
          if (!newBidAmounts[media._id || media.id]) {
            const minBid = getEffectiveMinimumBid(media);
            newBidAmounts[media._id || media.id] = minBid.toFixed(2);
          }
        });
        setNewMediaBidAmounts(newBidAmounts);
        
        console.log(`✅ Loaded ${response.videos.length} more YouTube results`);
      }
    } catch (error: any) {
      console.error('Error loading more YouTube results:', error);
      
      // Check if search is disabled due to quota
      if (error?.response?.status === 429) {
        const errorData = error.response?.data;
        toast.error(
          <div>
            <div className="font-semibold">{errorData?.error || 'YouTube search is temporarily disabled'}</div>
            <div className="text-sm mt-1">{errorData?.message}</div>
            {errorData?.suggestion && (
              <div className="text-sm mt-1 text-blue-300">{errorData.suggestion}</div>
            )}
          </div>,
          { autoClose: 8000 }
        );
      } else {
        toast.error('Failed to load more results');
      }
    } finally {
      setIsLoadingMoreYouTube(false);
    }
  };

  // Helper to extract YouTube video ID from URL
  const extractYouTubeVideoId = (url: string): string | null => {
    if (!url) return null;
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
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const response = await searchAPI.searchByYouTubeUrl(url);
      if (response.videos && response.videos.length > 0) {
        return response.videos[0].category || 'Unknown';
      }
    } catch (error) {
      console.error('Error fetching video category:', error);
    }
    return 'Unknown';
  };

  // Helper function to get registration URL with invite code for private parties
  const getRegistrationUrl = () => {
    if (party?.privacy === 'private' && party?.host) {
      const hostInviteCode = typeof party.host === 'object' && (party.host.primaryInviteCode || party.host.personalInviteCode)
        ? (party.host.primaryInviteCode || party.host.personalInviteCode)
        : null;
      if (hostInviteCode) {
        return `/register?invite=${hostInviteCode}`;
      }
    }
    return '/register';
  };

  const handleAddMediaToParty = async (media: any) => {
    if (!user) {
      const redirectUrl = getRegistrationUrl();
      toast.info('Please sign up to add media to parties');
      navigate(redirectUrl);
      return;
    }
    if (!partyId) return;
    
    let category = media.category || 'Unknown';
    const duration = media.duration || 0;
    
    // If category is Unknown and it's a YouTube video, fetch it
    if (category === 'Unknown' && media.sources?.youtube) {
      const videoId = extractYouTubeVideoId(media.sources.youtube);
      if (videoId) {
        category = await fetchVideoCategory(videoId);
        // Update media object with fetched category
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
      setIsInlineBid(false); // This is new media, not an inline bid
      setShowValidationModal(true);
      return;
    }
    
    // No warnings, proceed directly to confirmation modal
    setPendingMedia(media);
    setIsInlineBid(false); // This is new media, not an inline bid
    setShowBidConfirmationModal(true);
  };

  // Handler for validation modal confirm
  const handleValidationConfirm = () => {
    setShowValidationModal(false);
    if (pendingMedia) {
      setShowBidConfirmationModal(true);
    }
  };

  // Handler for validation modal cancel
  const handleValidationCancel = () => {
    setShowValidationModal(false);
    setPendingMedia(null);
    setValidationWarnings({});
    setValidationCategory('');
    setValidationDuration(0);
  };

  const handleBidConfirmation = async (tags: string[], setProgress?: (step: 'placing' | 'processing' | 'updating' | null) => void) => {
    // ✅ Early return if already bidding - prevent double-clicks
    if (isBidding) {
      console.log('Already processing a tip, please wait...');
      return;
    }
    
    // ✅ Set loading state IMMEDIATELY to disable button
    setIsBidding(true);
    setProgress?.('placing');
    
    // Check if user is logged in
    if (!user) {
      const redirectUrl = getRegistrationUrl();
      toast.info('Please sign up to place tips');
      navigate(redirectUrl);
      setIsBidding(false); // Reset on early return
      return;
    }
    
    // Use ref values to avoid state update race conditions
    const currentPendingMedia = pendingMediaRef.current || pendingMedia;
    const currentIsInlineBid = isInlineBidRef.current || isInlineBid;
    
    if (!partyId || !currentPendingMedia) {
      console.error('handleBidConfirmation: Missing partyId or pendingMedia', { partyId, pendingMedia: currentPendingMedia });
      setIsBidding(false); // Reset on early return
      return;
    }
    
    // Store only the properties we need to avoid potential circular reference issues
    const safePendingMedia = {
      _id: currentPendingMedia?._id || currentPendingMedia?.id || null,
      id: currentPendingMedia?.id || currentPendingMedia?._id || null,
      _queueItemId: (currentPendingMedia as any)?._queueItemId || null,
      title: currentPendingMedia?.title || 'Unknown',
      artist: currentPendingMedia?.artist || null,
      sources: currentPendingMedia?.sources || null,
      duration: currentPendingMedia?.duration || null,
      category: currentPendingMedia?.category || 'Music',
      bids: currentPendingMedia?.bids || []
    };
    const currentParty = party;
    
    // Don't close modal immediately - let it close after async operation completes
    // This prevents React from trying to re-render with inconsistent state
    
    try {
      // Handle inline bid on existing media in queue
      if (currentIsInlineBid && safePendingMedia) {
        // For inline bids, use the queue item ID (party media ID), not the media's ID
        const queueItemId = safePendingMedia._queueItemId || safePendingMedia._id || safePendingMedia.id;
        const mediaId = safePendingMedia._id || safePendingMedia.id; // For bid amount lookup
        
        // Validate we have required IDs
        if (!queueItemId || !mediaId) {
          console.error('Missing required IDs:', { queueItemId, mediaId, safePendingMedia });
          toast.error('Unable to identify media item');
          setIsBidding(false); // Reset on validation error
          setIsInlineBid(false);
          isInlineBidRef.current = false;
          setPendingMedia(null);
          pendingMediaRef.current = null;
          return;
        }
        
        // Calculate bid amount (UI presents this as a tip)
        let bidAmount = getDefaultBidAmount();
        const minBid = getEffectiveMinimumBid(safePendingMedia);
        
        try {
          const rawQueueBid = queueBidAmounts[mediaId];
          if (rawQueueBid && typeof rawQueueBid === 'string') {
            const parsed = parseFloat(rawQueueBid);
            if (Number.isFinite(parsed) && parsed > 0) {
              bidAmount = parsed;
            } else {
              // Calculate default
              const avgBid = calculateAverageBid(safePendingMedia);
              bidAmount = Math.max(getDefaultBidAmount(safePendingMedia), avgBid || 0);
            }
          } else {
            // Calculate default
            const avgBid = calculateAverageBid(safePendingMedia);
            bidAmount = Math.max(getDefaultBidAmount(safePendingMedia), avgBid || 0);
          }
        } catch (e) {
          console.error('Error calculating bid amount:', e);
          bidAmount = getDefaultBidAmount(safePendingMedia);
        }

        if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
          toast.error(`Minimum tip is £${minBid.toFixed(2)}`);
          setIsBidding(false); // Reset on validation error
          setIsInlineBid(false);
          isInlineBidRef.current = false;
          setPendingMedia(null);
          pendingMediaRef.current = null;
          return;
        }
        
        try {
          setProgress?.('processing');
          const response = await partyAPI.placeBid(partyId, queueItemId, bidAmount, tags);
          const mediaTitle = safePendingMedia?.title || 'media';
          
          // Optimistically update user balance from response
          if (response.updatedBalance !== undefined && updateBalance) {
            updateBalance(response.updatedBalance);
          }
          
          // Optimistically update party state if response includes updated media
          if (response.media) {
            setParty((prev: any) => {
              if (!prev) return prev;
              // Update the specific media item's aggregate
              return {
                ...prev,
                media: prev.media.map((item: any) => {
                  const itemMediaId = item.mediaId?._id || item.mediaId?.id || item.mediaId;
                  const responseMediaId = response.media._id || response.media.id;
                  if (itemMediaId && responseMediaId && itemMediaId.toString() === responseMediaId.toString()) {
                    return {
                      ...item,
                      partyMediaAggregate: response.media.globalMediaAggregate || item.partyMediaAggregate
                    };
                  }
                  return item;
                })
              };
            });
          }
          
          // Show success message immediately
          toast.success(`Tip £${bidAmount.toFixed(2)} sent for ${mediaTitle}!`);
          
          // Check location mismatch in background (non-blocking)
          if (party?.type === 'location' && 
              party?.locationFilter && 
              user?.homeLocation && 
              !isLocationMatch(party.locationFilter, user.homeLocation)) {
            // Don't await - do in background
            partyAPI.findLocationParty(
              user.homeLocation.countryCode!,
              user.homeLocation.city
            ).then(({ party: userLocationParty }) => {
              if (userLocationParty) {
                toast.success(`Tip placed! View it in your ${formatLocation(user.homeLocation)} party.`);
              }
            }).catch(() => {
              // Silently fail - not critical
            });
          }
          
          // Refresh party in background (don't block UI)
          setProgress?.('updating');
          fetchPartyDetails().catch(error => {
            console.error('Background party refresh error:', error);
          });
          
          // If viewing a time-filtered period, also refresh sorted media
          if (selectedTimePeriod !== 'all-time') {
            fetchSortedMedia(selectedTimePeriod).catch(error => {
              console.error('Background sorted media refresh error:', error);
            });
          }
          
          // Reset bid amount for this media back to minimum
          if (mediaId) {
            setQueueBidAmounts(prev => ({
              ...prev,
              [mediaId]: getDefaultBidAmount().toFixed(2)
            }));
          }
          
        } catch (error: any) {
          console.error('Bid error:', error);
          const errorMessage = error?.response?.data?.error || error?.message || 'Failed to send tip';
          toast.error(errorMessage);
          // On error, refresh to get correct state
          fetchPartyDetails().catch(console.error);
          // Also refresh sorted media if viewing time-filtered period
          if (selectedTimePeriod !== 'all-time') {
            fetchSortedMedia(selectedTimePeriod).catch(console.error);
          }
        } finally {
          setIsBidding(false);
          setIsInlineBid(false);
          isInlineBidRef.current = false;
          setPendingMedia(null);
          pendingMediaRef.current = null;
          setProgress?.(null);
          // Close modal after operation completes
          setShowBidConfirmationModal(false);
        }
        return;
      }
      
      // Handle adding new media to party
      if (!currentIsInlineBid && safePendingMedia) {
        const rawNewMediaBid = newMediaBidAmounts[safePendingMedia._id || safePendingMedia.id] ?? '';
        const bidAmount = parseFloat(rawNewMediaBid);
        const minBid = getEffectiveMinimumBid(safePendingMedia);

        if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
          toast.error(`Minimum tip is £${minBid.toFixed(2)}`);
          setIsBidding(false); // Reset on validation error
          setPendingMedia(null);
          pendingMediaRef.current = null;
          return;
        }
        
        try {
          setProgress?.('processing');
          // Get the appropriate URL based on media source
          const mediaSource = currentParty?.mediaSource || 'youtube';
          let url = '';
          
          if ((mediaSource === 'youtube' || mediaSource === 'mixed') && safePendingMedia.sources?.youtube) {
            url = safePendingMedia.sources.youtube;
          } else if (safePendingMedia.sources) {
            // Fallback to first available source
            url = Object.values(safePendingMedia.sources)[0] as string;
          }
          
          const response = await partyAPI.addMediaToParty(partyId, {
            url,
            title: safePendingMedia.title,
            artist: safePendingMedia.artist,
            bidAmount,
            platform: mediaSource,
            duration: safePendingMedia.duration,
            tags: tags, // Use user-provided tags from modal
            category: safePendingMedia.category || 'Music'
          });
          
          // Optimistically update user balance from response
          if (response.updatedBalance !== undefined && updateBalance) {
            updateBalance(response.updatedBalance);
          }
          
          // Show success message immediately
          toast.success(`Added ${safePendingMedia.title} to party with a £${bidAmount.toFixed(2)} tip!`);
          
          // Check location mismatch in background (non-blocking)
          if (party?.type === 'location' && 
              party?.locationFilter && 
              user?.homeLocation && 
              !isLocationMatch(party.locationFilter, user.homeLocation)) {
            // Don't await - do in background
            partyAPI.findLocationParty(
              user.homeLocation.countryCode!,
              user.homeLocation.city
            ).then(({ party: userLocationParty }) => {
              if (userLocationParty) {
                toast.success(`Tip placed! View it in your ${formatLocation(user.homeLocation)} party.`);
              }
            }).catch(() => {
              // Silently fail - not critical
            });
          }
          
          // Clear search immediately
          setAddMediaSearchQuery('');
          setAddMediaResults({ database: [], youtube: [] });
          
          // Refresh party in background (don't block UI)
          setProgress?.('updating');
          fetchPartyDetails().catch(error => {
            console.error('Background party refresh error:', error);
          });
          
          // If viewing a time-filtered period, also refresh sorted media
          if (selectedTimePeriod !== 'all-time') {
            fetchSortedMedia(selectedTimePeriod).catch(error => {
              console.error('Background sorted media refresh error:', error);
            });
          }
          
        } catch (error: any) {
          console.error('Error adding media:', error);
          toast.error(error.response?.data?.error || 'Failed to add media to party');
          // On error, refresh to get correct state
          fetchPartyDetails().catch(console.error);
          // Also refresh sorted media if viewing time-filtered period
          if (selectedTimePeriod !== 'all-time') {
            fetchSortedMedia(selectedTimePeriod).catch(console.error);
          }
        } finally {
          setIsBidding(false); // Reset bidding state
          setPendingMedia(null);
          pendingMediaRef.current = null;
          setProgress?.(null);
          // Close modal after operation completes
          setShowBidConfirmationModal(false);
        }
      }
    } catch (error: any) {
      console.error('Error in handleBidConfirmation:', error);
      toast.error(error?.response?.data?.error || error?.message || 'An error occurred while processing your tip');
      setIsBidding(false);
      setIsInlineBid(false);
      isInlineBidRef.current = false;
      setPendingMedia(null);
      pendingMediaRef.current = null;
      setProgress?.(null);
      // Close modal on error
      setShowBidConfirmationModal(false);
    }
  };

  // Keep handleTagSubmit for backward compatibility (if TagInputModal is still used elsewhere)
  const handleTagSubmit = async (tags: string[]) => {
    if (!partyId || !pendingMedia) return;
    
    const rawNewMediaBid = newMediaBidAmounts[pendingMedia._id || pendingMedia.id] ?? '';
    const bidAmount = parseFloat(rawNewMediaBid);
    const minBid = getEffectiveMinimumBid(pendingMedia);

    if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
      toast.error(`Minimum tip is £${minBid.toFixed(2)}`);
      return;
    }
    
    try {
      // Get the appropriate URL based on media source
      const mediaSource = party?.mediaSource || 'youtube';
      let url = '';
      
      if ((mediaSource === 'youtube' || mediaSource === 'mixed') && pendingMedia.sources?.youtube) {
        url = pendingMedia.sources.youtube;
      } else if (pendingMedia.sources) {
        // Fallback to first available source
        url = Object.values(pendingMedia.sources)[0] as string;
      }
      
      await partyAPI.addMediaToParty(partyId, {
        url,
        title: pendingMedia.title,
        artist: pendingMedia.artist,
        bidAmount,
        platform: mediaSource,
        duration: pendingMedia.duration,
        tags: tags, // Use user-provided tags from modal
        category: pendingMedia.category || 'Music'
      });
      
      toast.success(`Added ${pendingMedia.title} to party with a £${bidAmount.toFixed(2)} tip!`);
      
      // Clear search and refresh party
      setAddMediaSearchQuery('');
      setAddMediaResults({ database: [], youtube: [] });
      setShowTagModal(false);
      setPendingMedia(null);
      fetchPartyDetails();
      
    } catch (error: any) {
      console.error('Error adding media:', error);
      toast.error(error.response?.data?.error || 'Failed to add media to party');
      setShowTagModal(false);
      setPendingMedia(null);
    }
  };

  // Helper to get media items
  const getPartyMedia = () => {
    return (party && party.media) ? party.media : [];
  };

  // Top Tags cloud (proxy for GlobalTagAggregate using party/global aggregates)
  const topTags = useMemo(() => {
    if (!party) return [] as Array<{ tag: string; total: number; count: number }>;
    const counts: Record<string, { total: number; count: number }> = {};
    const media = getPartyMedia().filter((it: any) => it.status === 'active');

    for (const item of media) {
      const m = item.mediaId || item;
      const tags: string[] = Array.isArray(m.tags) ? m.tags : [];
      const value =
        (typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0) ||
        (typeof m.globalMediaAggregate === 'number' ? m.globalMediaAggregate : 0);

      for (const raw of tags) {
        const t = (raw || '').trim().toLowerCase();
        if (!t) continue;
        if (!counts[t]) counts[t] = { total: 0, count: 0 };
        counts[t].total += value;
        counts[t].count += 1;
      }
    }

    return Object.entries(counts)
      .map(([tag, v]) => ({ tag, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total || b.count - a.count)
      .slice(0, 30);
  }, [party]);

  // Selected tag filters derived from queueSearchTerms
  const selectedTagFilters = useMemo(() => {
    return queueSearchTerms
      .filter((t) => t.startsWith('#'))
      .map((t) => t.slice(1).toLowerCase());
  }, [queueSearchTerms]);

  // Aggregate bids across queued media filtered by selected tags
  const topSupporterBids = useMemo(() => {
    if (!party) return [] as any[];
    const out: any[] = [];
    const media = getPartyMedia().filter((it: any) => it.status === 'active');
    
    for (const item of media) {
      const m = item.mediaId || item;
      // Get canonical forms of tags for matching (handles aliases like D&b -> dnb)
      const tags: string[] = Array.isArray(m.tags) 
        ? m.tags.map((t: string) => t && typeof t === 'string' ? getCanonicalTag(t) : '').filter((t: string) => t)
        : [];
      
      if (selectedTagFilters.length > 0) {
        // Use OR logic (.some()) to match queue filtering behavior
        // Media should be included if it has ANY of the selected tags
        const canonicalSelectedTags = selectedTagFilters
          .map(t => t && typeof t === 'string' ? getCanonicalTag(t) : '')
          .filter(t => t);
        const ok = canonicalSelectedTags.some((selectedTag) => 
          tags.some((tag) => tag === selectedTag)
        );
        if (!ok) continue;
      }
      (m.bids || []).forEach((b: any) => out.push(b));
    }
    return out;
  }, [party, selectedTagFilters]);

  // Removed TuneBytes/user profile fetch for simplicity and performance

  // Get media to display based on selected time period and search terms
  const getDisplayMedia = () => {
    let media;
    if (selectedTimePeriod === 'all-time') {
      // Show regular party media - explicitly filter out vetoed items
      const allMedia = getPartyMedia();
      media = allMedia.filter((item: any) => {
        // Only show items with status 'active', explicitly exclude 'vetoed' and undefined/null
        const isActive = item.status === 'active';
        if (!isActive && item.status === 'vetoed') {
          // Debug: log if we're filtering out vetoed items
          console.log('🚫 Filtering out vetoed media:', (item.mediaId || item)?.title, 'status:', item.status);
        }
        return isActive;
      });
    } else {
      // Show sorted media from the selected time period
      media = sortedMedia.filter((item: any) => {
        const isActive = item.status === 'active';
        if (!isActive && item.status === 'vetoed') {
          console.log('🚫 Filtering out vetoed sorted media:', item.title, 'status:', item.status);
        }
        return isActive;
      });
    }
    
    // REMOVED: Real-time search filter from addMediaSearchQuery
    // Queue now remains whole, matching items appear in search results
    
    // Apply search filter if search terms exist (from PartyQueueSearch component)
    if (queueSearchTerms.length > 0) {
      media = media.filter((item: any) => {
        const mediaItem = item.mediaId || item;
        
        // Separate regular search terms and tag search terms
        const regularTerms = queueSearchTerms.filter(term => !term.startsWith('#'));
        const tagTerms = queueSearchTerms.filter(term => term.startsWith('#')).map(term => term.substring(1));
        
        // Check if ANY regular search term matches title, artist, or category
        const matchesRegularSearch = regularTerms.length === 0 || regularTerms.some(term => {
          const lowerTerm = term.toLowerCase();
          const title = (mediaItem.title || '').toLowerCase();
          const artist = Array.isArray(mediaItem.artist) 
            ? mediaItem.artist.map((a: any) => a.name || a).join(' ').toLowerCase()
            : (mediaItem.artist || '').toLowerCase();
          const category = (mediaItem.category || '').toLowerCase();
          
          return title.includes(lowerTerm) || 
                 artist.includes(lowerTerm) || 
                 category.includes(lowerTerm);
        });
        
        // Check if ANY tag search term matches tags (using canonical tag matching)
        const matchesTagSearch = tagTerms.length === 0 || tagTerms.some(tagTerm => {
          const canonicalSearchTag = getCanonicalTag(tagTerm);
          const tags = Array.isArray(mediaItem.tags) 
            ? mediaItem.tags.map((tag: any) => tag && typeof tag === 'string' ? getCanonicalTag(tag) : '').filter((t: string) => t)
            : [];
          
          return tags.some((tag: string) => tag === canonicalSearchTag);
        });
        
        // Both regular search and tag search must match (if they exist)
        return matchesRegularSearch && matchesTagSearch;
      });
      
      console.log(`🔍 Filtered queue: ${media.length} media items match search terms:`, queueSearchTerms);
    }
    
    return media;
  };

  // Get filtered queue items for search results (real-time search)
  const getFilteredQueueForSearch = () => {
    if (!addMediaSearchQuery.trim()) return [];
    
    let media;
    if (selectedTimePeriod === 'all-time') {
      media = getPartyMedia().filter((item: any) => item.status === 'active');
    } else {
      media = sortedMedia.filter((item: any) => item.status === 'active');
    }
    
    const searchQuery = addMediaSearchQuery.toLowerCase();
    return media.filter((item: any) => {
      const mediaItem = item.mediaId || item;
      const title = (mediaItem.title || '').toLowerCase();
      const artist = Array.isArray(mediaItem.artist) 
        ? mediaItem.artist.map((a: any) => a.name || a).join(' ').toLowerCase()
        : (mediaItem.artist || '').toLowerCase();
      const category = (mediaItem.category || '').toLowerCase();
      
      return title.includes(searchQuery) || 
             artist.includes(searchQuery) || 
             category.includes(searchQuery);
    });
  };

  // Helper function to calculate average bid for media (returns in pounds)
  // Uses PartyMediaBidAvg (party-specific average) when partyMediaEntry is provided
  const calculateAverageBid = useCallback((mediaData: any, partyMediaEntry?: any) => {
    try {
      // If we have party-specific data, use that for PartyMediaBidAvg
      if (partyMediaEntry) {
        const partyBids = partyMediaEntry.partyBids || [];
        const partyMediaAggregate = typeof partyMediaEntry.partyMediaAggregate === 'number' 
          ? partyMediaEntry.partyMediaAggregate 
          : 0;
        
        if (partyBids.length > 0 && partyMediaAggregate > 0) {
          // Calculate average from party-specific data (both in pence)
          const avgPence = partyMediaAggregate / partyBids.length;
          return penceToPoundsNumber(avgPence);
        }
      }
      
      // Fallback: Handle both media objects and queue items (global average)
      const bids = mediaData?.bids || [];
      if (!Array.isArray(bids) || bids.length === 0) return 0;
      const total = bids.reduce((sum: number, bid: any) => {
        const amount = bid?.amount || 0;
        return sum + (typeof amount === 'number' ? amount : 0);
      }, 0);
      if (total === 0) return 0;
      const avgPence = total / bids.length;
      return penceToPoundsNumber(avgPence); // Convert pence to pounds
    } catch (error) {
      console.error('Error in calculateAverageBid:', error, mediaData);
      return 0;
    }
  }, []);

  // Calculate bid amount for confirmation modal using useMemo
  const confirmationBidAmount = useMemo(() => {
    // Early return if modal shouldn't be shown or data is invalid
    if (!showBidConfirmationModal || !party) {
      return getDefaultBidAmount();
    }
    
    // If pendingMedia is null/undefined, return default
    if (!pendingMedia || typeof pendingMedia !== 'object') {
      return getDefaultBidAmount();
    }
    
    try {
      if (isInlineBid && pendingMedia) {
        // For inline bids, use queueBidAmounts
        const mediaId = pendingMedia?._id || pendingMedia?.id;
        if (mediaId && typeof mediaId === 'string') {
          const rawQueueBid = queueBidAmounts[mediaId];
          if (rawQueueBid && typeof rawQueueBid === 'string') {
            const bidAmount = parseFloat(rawQueueBid);
            if (Number.isFinite(bidAmount) && bidAmount > 0) {
              return bidAmount;
            }
          }
          // Calculate default if not in queueBidAmounts
          try {
            const avgBid = calculateAverageBid(pendingMedia);
            return Math.max(getDefaultBidAmount(pendingMedia), avgBid || 0);
          } catch (e) {
            console.error('Error calculating average bid:', e);
            return getDefaultBidAmount(pendingMedia);
          }
        }
        return getDefaultBidAmount();
      } else {
        // For new media, use newMediaBidAmounts
        const mediaId = pendingMedia?._id || pendingMedia?.id;
        if (mediaId && typeof mediaId === 'string') {
          const rawNewMediaBid = newMediaBidAmounts[mediaId] ?? '';
          if (rawNewMediaBid && typeof rawNewMediaBid === 'string') {
            const bidAmount = parseFloat(rawNewMediaBid);
            if (Number.isFinite(bidAmount) && bidAmount > 0) {
              return bidAmount;
            }
          }
        }
        const defaultBid = getDefaultBidAmount(pendingMedia);
        return defaultBid;
      }
    } catch (e) {
      console.error('Error calculating bid amount:', e);
      return getDefaultBidAmount(pendingMedia);
    }
  }, [pendingMedia, isInlineBid, party, queueBidAmounts, newMediaBidAmounts, calculateAverageBid, showBidConfirmationModal]);

  // Calculate user balance safely
  const confirmationUserBalance = useMemo(() => {
    try {
      const balance = (user as any)?.balance;
      if (typeof balance === 'number' && Number.isFinite(balance)) {
        return penceToPoundsNumber(balance);
      }
      return 0;
    } catch (e) {
      console.error('Error getting user balance:', e);
      return 0;
    }
  }, [user]);

  // Bid handling functions (OLD - using bid modal, now replaced with inline bidding)
  // const handleBidClick = (media: any) => {
  //   const mediaData = media.mediaId || media;
  //   setSelectedMedia(mediaData);
  //   setBidModalOpen(true);
  // };

  const handleInlineBid = async (media: any) => {
    if (!partyId) return;
    
    // Check if user is logged in - redirect to registration if not
    if (!user) {
      const redirectUrl = getRegistrationUrl();
      toast.info('Please sign up to place tips');
      navigate(redirectUrl);
      return;
    }
    
    const mediaData = media.mediaId || media;
    // For queue items, use the queue item's _id (party media ID), not the media's _id
    const queueItemId = media._id || media.id; // This is the party media ID
    const mediaId = mediaData._id || mediaData.id; // This is for the bid amount lookup
    
    // Calculate default bid if not in queueBidAmounts (same logic as input field)
    const minBid = getEffectiveMinimumBid(mediaData);
    const rawQueueBid = queueBidAmounts[mediaId] ?? (() => {
      const avgBid = calculateAverageBid(mediaData);
      return Math.max(getDefaultBidAmount(mediaData), avgBid || 0).toFixed(2);
    })();
    const bidAmount = parseFloat(rawQueueBid);

    if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
      toast.error(`Minimum tip is £${minBid.toFixed(2)}`);
      return;
    }
    
    // Show confirmation modal instead of placing bid directly
    // Store both the media data and the queue item ID
    const mediaWithQueueId = { ...mediaData, _queueItemId: queueItemId };
    setPendingMedia(mediaWithQueueId);
    pendingMediaRef.current = mediaWithQueueId;
    setIsInlineBid(true);
    isInlineBidRef.current = true;
    setShowBidConfirmationModal(true);
  };

  // Action modal state (for X button - veto/remove tip/request refund/report)
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedMediaForAction, setSelectedMediaForAction] = useState<any>(null);
  const [selectedBidForAction, setSelectedBidForAction] = useState<any>(null);
  const [refundReason, setRefundReason] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const handleActionButtonClick = (media: any) => {
    const userBid = getUserBid(media);
    setSelectedMediaForAction(media);
    setSelectedBidForAction(userBid);
    setShowActionModal(true);
  };

  const handleRemoveTip = async () => {
    if (!partyId || !selectedBidForAction?._id) return;
    
    try {
      setIsProcessingAction(true);
      const response = await partyAPI.removeTip(partyId, selectedBidForAction._id);
      toast.success(`Tip of £${(selectedBidForAction.amount / 100).toFixed(2)} removed and refunded`);
      
      // Update user balance from API response
      if (updateBalance && response.newBalance !== undefined) {
        updateBalance(response.newBalance);
      }
      
      // Refresh party data
      await fetchPartyDetails();
      
      setShowActionModal(false);
      setSelectedMediaForAction(null);
      setSelectedBidForAction(null);
    } catch (error: any) {
      console.error('Error removing tip:', error);
      
      if (error.response?.status === 401) {
        toast.error('Your session has expired. Please log in again.');
        return;
      }
      
      // If instant removal window expired, show error and keep modal open
      if (error.response?.data?.useRefundRequest) {
        toast.error('Instant removal window has expired. Please use the refund request option below.');
        return;
      }
      
      toast.error(error.response?.data?.error || 'Failed to remove tip');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleRequestRefund = async () => {
    if (!refundReason.trim()) {
      toast.error('Please provide a reason for the refund request');
      return;
    }

    if (!partyId || !selectedBidForAction?._id) return;

    try {
      setIsProcessingAction(true);
      await partyAPI.requestRefund(partyId, selectedBidForAction._id, refundReason.trim());
      toast.success('Refund request submitted. You will be notified when it is processed.');
      
      setShowActionModal(false);
      setSelectedMediaForAction(null);
      setSelectedBidForAction(null);
      setRefundReason('');
      
      // Refresh party data
      await fetchPartyDetails();
    } catch (error: any) {
      console.error('Error requesting refund:', error);
      
      if (error.response?.status === 401) {
        toast.error('Your session has expired. Please log in again.');
        return;
      }
      
      toast.error(error.response?.data?.error || 'Failed to request refund');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleVetoFromModal = async () => {
    if (!selectedMediaForAction) return;
    
    const mediaData = selectedMediaForAction.mediaId || selectedMediaForAction;
    const mediaId = mediaData._id || mediaData.id || mediaData.uuid;
    
    try {
      setIsProcessingAction(true);
      const vetoReason = window.prompt('Optional: provide a reason for the veto (leave blank to skip).')?.trim();

      await partyAPI.vetoMedia(partyId!, mediaId, vetoReason || undefined);
      toast.success('Media vetoed and tips refunded');
      
      setShowActionModal(false);
      setSelectedMediaForAction(null);
      setSelectedBidForAction(null);
      
      // Refresh party data
      await fetchPartyDetails();
    } catch (error: any) {
      console.error('Error vetoing media:', error);
      
      if (error.response?.status === 401) {
        toast.error('Your session has expired. Please log in again.');
        return;
      }
      
      toast.error(error.response?.data?.error || 'Failed to veto media');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Helper function to get user's bid on a media item
  const getUserBid = (media: any) => {
    if (!user?._id) return null;
    const bids = media.bids || media.mediaId?.bids || [];
    return bids.find((bid: any) => {
      const bidUserId = bid.userId?._id || bid.userId;
      return bidUserId === user._id && bid.status === 'active';
    });
  };

  // Helper function to check if bid is within 10-minute window
  const isWithinRemovalWindow = (bid: any) => {
    if (!bid?.createdAt) return false;
    const timeSinceBid = Date.now() - new Date(bid.createdAt).getTime();
    const INSTANT_REMOVAL_WINDOW = 10 * 60 * 1000; // 10 minutes
    return timeSinceBid <= INSTANT_REMOVAL_WINDOW;
  };
  
  const handleUnvetoClick = async (media: any) => {
    const mediaData = media.mediaId || media;
    const mediaId = mediaData._id || mediaData.id || mediaData.uuid;
    const isAdmin = user?.role?.includes('admin');
    
    if (!isHost && !isAdmin) {
      toast.error('Only the host or admin can unveto media');
      return;
    }

    try {
      const confirmationMessage = `Are you sure you want to unveto "${mediaData.title || 'this media'}"? Users who tipped on it will be notified and can tip again.`;
      if (!window.confirm(confirmationMessage)) return;

      await partyAPI.unvetoMedia(partyId!, mediaId);
      toast.success('Media unvetoed successfully. Users have been notified.');
      
      // Refresh party data
      await fetchPartyDetails();
    } catch (error: any) {
      console.error('Error unvetoing media:', error);
      toast.error(error.response?.data?.error || 'Failed to unveto media');
    }
  };

  const handleKickUser = async (userId: string, username: string) => {
    const isAdmin = user?.role?.includes('admin');
    
    if (!isHost && !isAdmin) {
      toast.error('Only the host or admin can kick users');
      return;
    }

    try {
      const reason = window.prompt(`Kick ${username} from party? (Optional reason):`);
      if (reason === null) return; // User cancelled

      await partyAPI.kickUser(partyId!, userId, reason || undefined);
      toast.success(`${username} has been removed from the party`);
      await fetchPartyDetails();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to kick user');
    }
  };

  const handleUnkickUser = async (userId: string, username: string) => {
    const isAdmin = user?.role?.includes('admin');
    
    if (!isHost && !isAdmin) {
      toast.error('Only the host or admin can unkick users');
      return;
    }

    try {
      const confirmationMessage = `Are you sure you want to allow ${username} to rejoin this party?`;
      if (!window.confirm(confirmationMessage)) return;

      await partyAPI.unkickUser(partyId!, userId);
      toast.success(`${username} can now rejoin the party`);
      await fetchPartyDetails();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to unkick user');
    }
  };

  // Get vetoed media for display
  const getVetoedMedia = () => {
    const allMedia = getPartyMedia();
    return allMedia.filter((item: any) => item.status === 'vetoed');
  };


  // OLD - Reset Media function (commented out as button was removed)
  // const handleResetMedia = async () => {
  //   if (!isHost) {
  //     toast.error('Only the host can reset media');
  //     return;
  //   }
  //   const confirmed = window.confirm('Are you sure you want to reset all media to queued status? This will clear all play history.');
  //   if (!confirmed) return;
  //   try {
  //     await partyAPI.resetMedia(partyId!);
  //     toast.success('All media reset to queued status');
  //     fetchParty();
  //   } catch (error: any) {
  //     console.error('Error resetting media:', error);
  //     toast.error(error.response?.data?.error || 'Failed to reset media');
  //   }
  // };

  const handleBidConfirm = async (bidAmount: number) => {
    if (!selectedMedia || !partyId) return;

    setIsBidding(true);
    try {
      // Get the media ID - try various ID fields
      const mediaId = selectedMedia._id || selectedMedia.id || selectedMedia.uuid;
      if (!mediaId) {
        toast.error('Unable to identify media item');
        setIsBidding(false);
        return;
      }
      
      const response = await partyAPI.placeBid(partyId, mediaId, bidAmount);
      toast.success(`Tip of £${bidAmount.toFixed(2)} sent successfully!`);
      
      // Update user balance if provided in response
      if (response.updatedBalance !== undefined) {
        updateBalance(response.updatedBalance);
      }
      
      // Refresh party data to get updated bid information
      await fetchPartyDetails();
      
      // Refresh sorted media if viewing a time-filtered period
      if (selectedTimePeriod !== 'all-time') {
        await fetchSortedMedia(selectedTimePeriod);
      }
      
      setBidModalOpen(false);
      setSelectedMedia(null);
    } catch (error: any) {
      console.error('Error placing bid:', error);
      
      // Handle authentication errors - redirect to registration with invite code for private parties
      if (error.response?.status === 401) {
        const redirectUrl = getRegistrationUrl();
        toast.info('Please sign up to place tips');
        navigate(redirectUrl);
        setBidModalOpen(false);
        setSelectedMedia(null);
        return;
      }
      
      if (error.response?.data?.error === 'Insufficient funds') {
        toast.error(`Insufficient funds. You have £${error.response.data.currentBalance.toFixed(2)} but need £${error.response.data.requiredAmount.toFixed(2)}`);
      } else {
        toast.error(error.response?.data?.error || 'Failed to send tip');
      }
    } finally {
      setIsBidding(false);
    }
  };

  const handleBidModalClose = () => {
    setBidModalOpen(false);
    setSelectedMedia(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleNavigateWithWarning = (path: string, action: string) => {
    showWarning(
      action,
      () => navigate(path)
    );
  };

  const handleEndParty = async () => {
    if (!party || !isHost) return;
    
    setIsEndingParty(true);
    try {
      // Call API to end the party
      await partyAPI.endParty(partyId!);
      toast.success('Party ended successfully');
      navigate('/parties');
    } catch (error: any) {
      console.error('Error ending party:', error);
      toast.error(error.response?.data?.error || 'Failed to end party');
    } finally {
      setIsEndingParty(false);
      setEndPartyModalOpen(false);
    }
  };


  // Handle clicking play button on media in the queue
  const handlePlayMedia = (item: any, index: number) => {
    // Get the filtered display media to set as the queue
    const displayMedia = getDisplayMedia();
    
    if (displayMedia.length === 0) {
      toast.error('No tracks to play');
      return;
    }
    
    // Format all displayed media into queue format (same as handlePlayQueue)
    const cleanedQueue = displayMedia.map((displayItem: any) => {
      // For sorted media, the data is already flattened, for regular party media it's nested under mediaId
      const mediaData = selectedTimePeriod === 'all-time' ? (displayItem.mediaId || displayItem) : displayItem;
      
      // Clean and format sources
      let sources = {};
      
      if (mediaData.sources) {
        if (Array.isArray(mediaData.sources)) {
          for (const source of mediaData.sources) {
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
        } else if (typeof mediaData.sources === 'object') {
          sources = mediaData.sources;
        }
      }
      
      return {
        id: mediaData._id || mediaData.id || mediaData.uuid,
        _id: mediaData._id || mediaData.id || mediaData.uuid,
        title: mediaData.title,
        artist: Array.isArray(mediaData.artist) ? mediaData.artist[0]?.name || 'Unknown Artist' : mediaData.artist,
        artists: Array.isArray(mediaData.artist) ? mediaData.artist : (mediaData.artists || []),
        featuring: mediaData.featuring || [],
        creatorDisplay: mediaData.creatorDisplay,
        duration: mediaData.duration,
        coverArt: mediaData.coverArt,
        sources: sources,
        globalMediaAggregate: typeof mediaData.globalMediaAggregate === 'number' ? mediaData.globalMediaAggregate : 0,
        partyMediaAggregate: typeof displayItem.partyMediaAggregate === 'number' ? displayItem.partyMediaAggregate : 0,
        totalBidValue: typeof displayItem.partyMediaAggregate === 'number' ? displayItem.partyMediaAggregate : 0,
        bids: displayItem.partyBids || displayItem.bids || mediaData.bids || [],
        addedBy: typeof mediaData.addedBy === 'object' ? mediaData.addedBy?.username || 'Unknown' : mediaData.addedBy
      };
    });
    
    // Clear podcast player so PlayerRenderer switches to web player
    usePodcastPlayerStore.getState().clear();
    // Set the queue to the filtered display media
    setQueue(cleanedQueue);
    
    // Find the correct index in the cleaned queue for the clicked item
    const mediaData = selectedTimePeriod === 'all-time' ? (item.mediaId || item) : item;
    const itemId = mediaData._id || mediaData.id || mediaData.uuid;
    const queueIndex = cleanedQueue.findIndex((q: any) => (q.id || q._id) === itemId);
    const finalIndex = queueIndex !== -1 ? queueIndex : index;
    
    // Set the media in the webplayer and start playback
    setCurrentMedia(cleanedQueue[finalIndex], finalIndex);
    play(); // Explicitly start playback when user clicks play button
    
    toast.success(`Now playing: ${cleanedQueue[finalIndex].title}`);
  };

  // Handle playing the entire displayed queue from the top
  const handlePlayQueue = () => {
    const displayMedia = getDisplayMedia();
    
    if (displayMedia.length === 0) {
      toast.error('No tracks to play');
      return;
    }
    
    // Format all displayed media into queue format
    const cleanedQueue = displayMedia.map((item: any) => {
      // For sorted media, the data is already flattened, for regular party media it's nested under mediaId
      const mediaData = selectedTimePeriod === 'all-time' ? (item.mediaId || item) : item;
      
      // Clean and format sources
      let sources = {};
      
      if (mediaData.sources) {
        if (Array.isArray(mediaData.sources)) {
          for (const source of mediaData.sources) {
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
        } else if (typeof mediaData.sources === 'object') {
          sources = mediaData.sources;
        }
      }
      
      return {
        id: mediaData._id || mediaData.id || mediaData.uuid,
        _id: mediaData._id || mediaData.id || mediaData.uuid,
        title: mediaData.title,
        artist: Array.isArray(mediaData.artist) ? mediaData.artist[0]?.name || 'Unknown Artist' : mediaData.artist,
        artists: Array.isArray(mediaData.artist) ? mediaData.artist : (mediaData.artists || []),
        featuring: mediaData.featuring || [],
        creatorDisplay: mediaData.creatorDisplay,
        duration: mediaData.duration,
        coverArt: mediaData.coverArt,
        sources: sources,
        globalMediaAggregate: typeof mediaData.globalMediaAggregate === 'number' ? mediaData.globalMediaAggregate : 0,
        partyMediaAggregate: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0,
        totalBidValue: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0,
        bids: item.partyBids || item.bids || mediaData.bids || [],
        addedBy: typeof mediaData.addedBy === 'object' ? mediaData.addedBy?.username || 'Unknown' : mediaData.addedBy
      };
    });
    
    // Clear podcast player so PlayerRenderer switches to web player
    usePodcastPlayerStore.getState().clear();
    // Set the queue and start playing from the top
    setQueue(cleanedQueue);
    setCurrentMedia(cleanedQueue[0], 0);
    setGlobalPlayerActive(true);
    play(); // Start playback immediately
    
    toast.success(`Playing queue: ${cleanedQueue.length} track${cleanedQueue.length !== 1 ? 's' : ''}`);
  };

  const formatDuration = (duration: number | string | undefined) => {
    if (!duration) return '3:00';
    
    // If it's already in MM:SS format, return as is
    if (typeof duration === 'string' && duration.includes(':')) {
      return duration;
    }
    
    // Convert seconds to MM:SS format
    const totalSeconds = typeof duration === 'string' ? parseInt(duration) : duration;
    if (isNaN(totalSeconds)) return '3:00';
    
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const calculateTotalBids = () => {
    const media = getPartyMedia();
    if (!media) return 0;
    
    // Sum partyMediaAggregate from all active media entries
    // partyMediaAggregate is stored directly on the party media entry (item), not on item.mediaId
    return media
      .filter((item: any) => item.status === 'active') // Only count active media
      .reduce((total: number, item: any) => {
        // partyMediaAggregate is stored on item itself, not on item.mediaId
        const bidValue = typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0;
        return total + bidValue;
      }, 0);
  };

  const calculateAverageTip = () => {
    const media = getPartyMedia();
    if (!media || media.length === 0) return 0;
    
    // Get all active media entries
    const activeMedia = media.filter((item: any) => item.status === 'active');
    
    // Sum total amounts and count media items with tips
    let totalAmount = 0;
    let mediaWithTips = 0;
    
    activeMedia.forEach((item: any) => {
      // Use partyMediaAggregate if available (most accurate for party-specific aggregates)
      const aggregate = item.partyMediaAggregate;
      if (typeof aggregate === 'number' && aggregate > 0) {
        totalAmount += aggregate;
        mediaWithTips++;
      } else {
        // Fallback: calculate from bids if aggregate not available
        const bids = item.partyBids || item.bids || [];
        if (Array.isArray(bids) && bids.length > 0) {
          const mediaTotal = bids.reduce((sum: number, bid: any) => {
            if (bid && bid.status !== 'vetoed') {
              const amount = typeof bid.amount === 'number' ? bid.amount : 0;
              return sum + amount;
            }
            return sum;
          }, 0);
          if (mediaTotal > 0) {
            totalAmount += mediaTotal;
            mediaWithTips++;
          }
        }
      }
    });
    
    // Calculate average tip per media item (return in pence for consistency)
    if (mediaWithTips === 0) return 0;
    return totalAmount / mediaWithTips;
  };

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Share functionality
  const shareUrl = window.location.href;
  const partyName = party?.name || 'this party';
  const shareText = `You have been invited to join ${partyName} party on Tuneable. Get involved...`;

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: party?.name || 'Tuneable Party',
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

  const handleShare = (platform: string) => {
    try {
      const encodedUrl = encodeURIComponent(shareUrl);
      const encodedText = encodeURIComponent(shareText);

      const shareUrls: Record<string, string> = {
        twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}&hashtag=Tuneable`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      };

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
          if (platform === 'facebook' && party?._id) {
            // Example: analytics.track('Share', { platform: 'facebook', partyId: party._id });
            console.log('Facebook share tracked:', { partyId: party._id, url: shareUrl });
          }
        }
      }
    } catch (error) {
      console.error(`Error sharing to ${platform}:`, error);
      toast.error(`Failed to open ${platform} share. Please try again.`);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy link');
    }
  };


  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Party not found</h1>
          <p className="text-gray-600 mb-6">The party you're looking for doesn't exist or has been removed.</p>
          <button onClick={() => handleNavigateWithWarning('/parties', 'navigate to parties list')} className="btn-primary">
            Back to Parties
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen ">
      

      {/* Party Header */}
      <div className="justify-center text-center px-3 sm:px-6 py-4 sm:py-6">
        <h1 className="inline-block text-xl sm:text-3xl font-bold text-white px-6 sm:px-8 py-2 sm:py-3 rounded-full bg-gradient-to-r from-purple-600 to-purple-800 shadow-lg">
          {party.name}
        </h1>
      </div>

      {/* Share Button - Dropdown Menu (admin only) */}
      {user?.role?.includes('admin') && (
      <div className="max-w-7xl mx-auto px-3 sm:px-6 p-2">
        <div className="flex justify-center">
          <div className="relative">
            {isMobile && 'share' in navigator ? (
              <button
                onClick={handleNativeShare}
                className="px-4 py-2 rounded-lg bg-gray-900/80 hover:bg-gray-800 border border-purple-500/50 shadow-[0_0_8px_rgba(168,85,247,0.3)] flex items-center gap-2 transition-colors"
              >
                <Share2 className="h-4 w-4 text-white" />
                <span className="text-sm font-semibold text-white">Share</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowShareDropdown(!showShareDropdown)}
                  className="px-4 py-2 rounded-lg bg-gray-900/80 hover:bg-gray-800 border border-purple-500/50 shadow-[0_0_8px_rgba(168,85,247,0.3)] flex items-center gap-2 transition-colors"
                >
                  <Share2 className="h-4 w-4 text-purple-300" />
                  <span className="text-sm font-semibold text-white">Share</span>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showShareDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showShareDropdown && (
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
                    <div className="py-2">
                      <button
                        onClick={() => { handleShare('twitter'); setShowShareDropdown(false); }}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors"
                      >
                        <Twitter className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-white">Twitter/X</span>
                      </button>
                      <button
                        onClick={() => { handleShare('facebook'); setShowShareDropdown(false); }}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors"
                      >
                        <Facebook className="h-4 w-4 text-blue-500" />
                        <span className="text-sm text-white">Facebook</span>
                      </button>
                      <button
                        onClick={() => { handleShare('linkedin'); setShowShareDropdown(false); }}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors"
                      >
                        <Linkedin className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-white">LinkedIn</span>
                      </button>
                      <button
                        onClick={() => { handleShare('whatsapp'); setShowShareDropdown(false); }}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors"
                      >
                        <svg className="h-4 w-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        <span className="text-sm text-white">WhatsApp</span>
                      </button>
                      <div className="border-t border-gray-700 my-1"></div>
                      <button
                        onClick={() => { handleCopyLink(); setShowShareDropdown(false); }}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors"
                      >
                        {copySuccess ? (
                          <>
                            <Check className="h-4 w-4 text-green-400" />
                            <span className="text-sm text-green-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 text-purple-300" />
                            <span className="text-sm text-white">Copy Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
                {showShareDropdown && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowShareDropdown(false)}
                  ></div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      )}
      
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4">
        <div className="justify-center flex flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-gray-900/80 px-4 py-3 rounded-lg border-2 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-600/30 rounded-lg">
                <Music className="h-5 w-5 text-purple-300" />
                </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{getDisplayMedia().length}</div>
                <div className="text-xs text-gray-400">
                  {selectedTimePeriod === 'all-time' ? 'Tunes' : `${selectedTimePeriod.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Queue`}
                </div>
              </div>
            </div>
          </div>
          {/* Partiers stat hidden for now */}
          {false && (
          <div className="bg-gray-900/80 px-4 py-3 rounded-lg border-2 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-600/30 rounded-lg">
                <Users className="h-5 w-5 text-purple-300" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{party.partiers.length}</div>
                <div className="text-xs text-gray-400">Partiers</div>
              </div>
            </div>
          </div>
          )}
          <div className="bg-gray-900/80 px-4 py-3 rounded-lg border-2 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-yellow-600/30 rounded-lg">
                <Coins className="h-5 w-5 text-yellow-300" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{penceToPounds(calculateTotalBids())}</div>
                <div className="text-xs text-gray-400">Total Tips</div>
              </div>
            </div>
          </div>
          <div className="bg-gray-900/80 px-4 py-3 rounded-lg border-2 border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.3)]">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-600/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-300" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{penceToPounds(calculateAverageTip())}</div>
                <div className="text-xs text-gray-400">Avg Tip</div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Supporters - centered */}
        <div className="max-w-7xl mx-auto flex justify-center">
          <div className="card p-3 md:p-6 w-full max-w-xl">
            <div className="text-center mb-2 md:mb-3">
              <h3 className="text-base md:text-lg font-semibold text-white">Top Supporters</h3>
              {selectedTagFilters.length > 0 && (
                <p className="text-xs text-purple-300 mt-1">Filtered by {selectedTagFilters.map((t) => `#${t}`).join(', ')}</p>
              )}
            </div>
            <div className="max-h-48 md:max-h-64 overflow-y-auto pr-1">
              <TopSupporters bids={topSupporterBids} maxDisplay={10} />
            </div>
          </div>
        </div>


        {/* Wallet Balance removed per product update */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Media Queue */}
        <div className="lg:col-span-2">
          
          <div className="space-y-3">
            {getPartyMedia().length > 0 ? (
              <div className="space-y-6">
                {/* Party Queue Search - MOVED ABOVE SORT BY TIME AND COMMENTED OUT */}
                {!showVetoed && party && (
                  <div className="mb-6">
                    {/* COMMENTED OUT FOR NOW
                    <PartyQueueSearch
                      onSearchTermsChange={setQueueSearchTerms}
                    />
                    */}
                  </div>
                )}

                {/* Inline Add Media Search Panel - Collapsed by default, expand with "Add Tunes" */}
                {!showVetoed && party && (
                  <div className="mb-4 md:mb-6">
                    <div className="justify-center text-center rounded-lg">
                        {!showAddTunesPanel ? (
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => setShowAddTunesPanel(true)}
                              className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors text-sm sm:text-base flex items-center gap-2"
                            >
                              <Plus className="h-4 w-4 text-purple-400" />
                              Add Tunes
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
                            value={addMediaSearchQuery}
                            onChange={(e) => setAddMediaSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddMediaSearch();
                              }
                            }}
                            placeholder="Paste a YouTube URL or Search for Tunes in our Library..."
                            className="flex-1 bg-gray-900 rounded-xl p-2 sm:p-3 text-slate placeholder-gray-400 focus:outline-none focus:border-purple-500 text-sm sm:text-base"
                          />
                         
                        </div>
                        <div className="flex justify-center">
                          <button
                            onClick={handleAddMediaSearch}
                            disabled={isSearchingNewMedia || !addMediaSearchQuery.trim()}
                            className="flex py-2 px-4 bg-purple-800 hover:bg-purple-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
                          >
                            {isSearchingNewMedia ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              'Search'
                            )}
                          </button>
                        </div>
                          </>
                        )}

                        {/* Queue Results and search results - only when Add Tunes panel is expanded */}
                        {showAddTunesPanel && (
                        <>
                        {/* Queue Results - Real-time search from party queue */}
                        {addMediaSearchQuery.trim() && getFilteredQueueForSearch().length > 0 && (
                          <div className="mb-6">
                            <div className="flex items-center mb-4">
                              <Music className="h-4 w-4 text-purple-400 mr-2" />
                              <h4 className="text-sm font-semibold text-purple-300">From Party Queue ({getFilteredQueueForSearch().length})</h4>
                            </div>
                            <div className="space-y-3">
                              {getFilteredQueueForSearch().map((item: any, index: number) => {
                                // For sorted media, the data is already flattened, for regular party media it's nested under mediaId
                                const rawMediaData = selectedTimePeriod === 'all-time' ? (item.mediaId || item) : item;
                                // Ensure artists array is set for ClickableArtistDisplay
                                // Backend sends both 'artist' (string for backward compat) and 'artists' (array with userIds)
                                const mediaData = {
                                  ...rawMediaData,
                                  // Prioritize 'artists' from backend (full array with userIds)
                                  artists: Array.isArray(rawMediaData.artists) ? rawMediaData.artists : 
                                          // Fallback: if 'artist' is an array (Mongoose document), use it
                                          (Array.isArray(rawMediaData.artist) ? rawMediaData.artist : []),
                                  // Keep 'artist' for backward compatibility (may be string or array)
                                  artist: rawMediaData.artist,
                                  featuring: Array.isArray(rawMediaData.featuring) ? rawMediaData.featuring : [],
                                  creatorDisplay: rawMediaData.creatorDisplay
                                };
                                const isAdmin = user?.role?.includes('admin');
                                return (
                                  <div
                                    key={`queue-search-${mediaData.id || mediaData._id}-${index}`}
                                    className="card flex flex-col md:flex-row md:items-center hover:border-white relative p-1.5 md:p-4 md:pt-4"
                                  >
                                    {/* Action Button - Top Right (opens modal with available actions) */}
                                    {(isHost || isAdmin || getUserBid(item)) && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleActionButtonClick(item);
                                        }}
                                        className="absolute top-2 right-2 z-20 p-1 md:p-1.5 bg-gray-700/80 hover:bg-gray-600 text-white rounded-md transition-colors shadow-lg"
                                        title="Actions"
                                      >
                                        <X className="h-3 w-3 md:h-4 md:w-4" />
                                      </button>
                                    )}
                                    
                                    {/* Mobile-only wrapper for thumbnail + details side by side */}
                                    <div className="flex flex-row md:contents items-start gap-2 mb-1 md:mb-0">
                                      {/* Media Thumbnail with Overlays */}
                                      <div 
                                        className="relative w-32 h-32 cursor-pointer group flex-shrink-0"
                                        onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
                                      >
                                        <img
                                          src={mediaData.coverArt || DEFAULT_COVER_ART}
                                          alt={mediaData.title || 'Unknown Media'}
                                          className="w-full h-full rounded object-cover"
                                          width="192"
                                          height="192"
                                        />
                                        
                                        {/* Play Icon Overlay */}
                                        <div 
                                          className="absolute inset-0 flex items-center justify-center bg-black/30 md:bg-black/40 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            // Find the actual index in the full queue for playing
                                            const queueIndex = getDisplayMedia().findIndex((queueItem: any) => {
                                              const queueMediaData = selectedTimePeriod === 'all-time' ? (queueItem.mediaId || queueItem) : queueItem;
                                              return (queueMediaData.id || queueMediaData._id) === (mediaData.id || mediaData._id);
                                            });
                                            if (queueIndex !== -1) {
                                              handlePlayMedia(getDisplayMedia()[queueIndex], queueIndex);
                                            }
                                          }}
                                        >
                                          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center border border-white bg-transparent md:border-0 md:bg-purple-600 md:hover:bg-purple-700 transition-all">
                                            <Play className="h-5 w-5 md:h-6 md:w-6 text-white" />
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Media Details */}
                                      <div className="flex-1 min-w-0 md:ml-4">
                                        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 md:space-x-2">
                                          <h4 
                                            className="font-medium text-white text-sm md:text-lg truncate cursor-pointer hover:text-purple-300 transition-colors"
                                            onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
                                          >
                                            {mediaData.title || 'Unknown Media'}
                                          </h4>
                                          <span className="hidden md:inline text-gray-400">•</span>
                                          <span className="text-gray-300 text-sm md:text-lg truncate font-light">
                                            <ClickableArtistDisplay media={mediaData} />
                                          </span>
                                          <div className="flex items-center space-x-1 md:ml-2">
                                            <Clock className="h-3 w-3 md:h-4 md:w-4 text-gray-400" />
                                            <span className="text-xs md:text-sm text-gray-300">{formatDuration(mediaData.duration)}</span>
                                          </div>
                                        </div>
                                        
                                        {/* Mini Supporters Bar - shows top supporters for this media */}
                                        <div className="md:mt-0">
                                          <MiniSupportersBar bids={mediaData.bids || []} maxVisible={5} scrollable={true} />
                                        </div>
                                        
                                        {/* Tags Display */}
                                        {mediaData.tags && mediaData.tags.length > 0 && (
                                          <div className="mt-2 flex">
                                            <div className="flex flex-wrap gap-1">
                                              {mediaData.tags.slice(0, window.innerWidth < 640 ? 3 : 5).map((tag: string, tagIndex: number) => (
                                                <Link
                                                  key={tagIndex}
                                                  to={`/tune/${mediaData._id || mediaData.id}`}
                                                  className="px-2 py-1 bg-purple-800 hover:bg-purple-500 text-white text-xs rounded-full transition-colors no-underline"
                                                >
                                                  #{tag}
                                                </Link>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    {/* Action Buttons */}
                                    <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-2">
                                      <div className="flex items-center justify-center space-x-2">
                                        {/* Metrics Display */}
                                        <div className="flex flex-row md:flex-col items-center md:items-end space-x-2 md:space-x-0 md:space-y-1 bg-slate-900/20 px-2 py-2 rounded-lg">
                                          <div className="text-center p-1 md:p-2">
                                            <div className="flex items-center justify-center text-xs text-gray-300 tracking-wide" title="Tip Total">
                                              <Coins className="h-3 w-3 md:h-4 md:w-4" />
                                            </div>
                                            <div className="text-xs md:text-lg text-gray-300">
                                              {penceToPounds(typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0)}
                                            </div>
                                          </div>
                                          <div className="text-center p-1 md:p-2">
                                            <div className="flex items-center justify-center text-xs text-gray-300 tracking-wide" title="Average Tip">
                                              <TrendingUp className="h-3 w-3 md:h-4 md:w-4" />
                                            </div>
                                            <div className="text-xs md:text-lg text-gray-300">
                                              £{calculateAverageBid(mediaData, item).toFixed(2)}
                                            </div>
                                          </div>
                                        </div>
                                        {/* Inline tipping controls (API still expects bid terminology) */}
                                        <div className="flex flex-row items-center space-x-1 md:space-x-2">
                                          {/* Input group with +/- buttons */}
                                          <div className="flex-col flex justify-center items-center space-x-1">
                                          <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const mediaId = mediaData._id || mediaData.id;
                                                const avgBid = calculateAverageBid(mediaData, item);
                                                const defaultBid = Math.max(getDefaultBidAmount(mediaData), avgBid || 0);
                                                const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                                const newAmount = current + 0.01;
                                                setQueueBidAmounts({
                                                  ...queueBidAmounts,
                                                  [mediaId]: newAmount.toFixed(2)
                                                });
                                              }}
                                              disabled={isBidding}
                                              className="px-5 py-1 md:px-5 md:py-1.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-tl-xl rounded-tr-xl text-white transition-colors flex items-center justify-center"
                                            >
                                              <Plus className="h-3 w-3 md:h-4 md:w-4" />
                                            </button>
                                            <input
                                              type="number"
                                              step="0.01"
                                              min={getEffectiveMinimumBid(mediaData)}
                                              value={queueBidAmounts[mediaData._id || mediaData.id] ?? (() => {
                                                const avgBid = calculateAverageBid(mediaData, item);
                                                return Math.max(getDefaultBidAmount(mediaData), avgBid || 0).toFixed(2);
                                              })()}
                                              onChange={(e) => setQueueBidAmounts({
                                                ...queueBidAmounts,
                                                [mediaData._id || mediaData.id]: e.target.value
                                              })}
                                              className="w-16 md:w-20 bg-gray-900 rounded px-1.5 md:px-2 py-1 md:py-2 text-gray text-center text-xs md:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                              onClick={(e) => e.stopPropagation()}
                                            />
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const mediaId = mediaData._id || mediaData.id;
                                                const avgBid = calculateAverageBid(mediaData, item);
                                                const minBid = getEffectiveMinimumBid(mediaData);
                                                const defaultBid = Math.max(getDefaultBidAmount(mediaData), avgBid || 0);
                                                const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                                const newAmount = Math.max(minBid, current - 0.01);
                                                setQueueBidAmounts({
                                                  ...queueBidAmounts,
                                                  [mediaId]: newAmount.toFixed(2)
                                                });
                                              }}
                                              disabled={isBidding || (() => {
                                                const mediaId = mediaData._id || mediaData.id;
                                                const minBid = getEffectiveMinimumBid(mediaData);
                                                const defaultBid = getDefaultBidAmount(mediaData);
                                                const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                                return current <= minBid;
                                              })()}
                                              className="px-5 py-1 md:px-5 md:py-1.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-bl-xl rounded-br-xl text-white transition-colors flex items-center justify-center"
                                            >
                                              <Minus className="h-3 w-3 md:h-4 md:w-4 text-gray-300" />
                                            </button>
                                          </div>
                                          {/* Tip Button */}
                                          <button
                                            onClick={() => handleInlineBid(item)}
                                            disabled={isBidding}
                                            className="px-2 md:px-4 py-1.5 md:py-2 bg-purple-800 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap flex items-center justify-center gap-2"
                                          >
                                            {isBidding ? (
                                              <>
                                                <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                                                <span>Placing Tip...</span>
                                              </>
                                            ) : (
                                              (() => {
                                                const mediaId = mediaData._id || mediaData.id;
                                                // Use same calculation logic as input field
                                                const avgBid = calculateAverageBid(mediaData, item);
                                                const defaultBid = Math.max(getDefaultBidAmount(mediaData), avgBid || 0);
                                                const raw = queueBidAmounts[mediaId] ?? defaultBid.toFixed(2);
                                                const parsed = parseFloat(raw);
                                                if (!Number.isFinite(parsed)) {
                                                  return 'Send Tip';
                                                }
                                                return `Tip £${parsed.toFixed(2)}`;
                                              })()
                                            )}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Database Results */}
                        {addMediaResults.database.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center mb-2">
                              <Music className="h-4 w-4 text-green-400 mr-2" />
                              <h4 className="text-sm font-semibold text-green-300">From Tuneable Library ({addMediaResults.database.length})</h4>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {addMediaResults.database.map((mediaItem: any) => {
                                // Ensure artists array is set for ClickableArtistDisplay
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
                                        const current = parseFloat(newMediaBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const newAmount = Math.max(minBid, current - 0.01);
                                        setNewMediaBidAmounts(prev => ({
                                          ...prev,
                                          [mediaId]: newAmount.toFixed(2)
                                        }));
                                      }}
                                      className="px-1.5 py-2 bg-gray-700 hover:bg-gray-800 rounded-tl-xl rounded-bl-xl text-white transition-colors flex items-center justify-center"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <input
                                      type="number"
                                      step="0.01"
                                              min={getEffectiveMinimumBid(media)}
                                      value={newMediaBidAmounts[media._id || media.id] ?? (() => {
                                        const avgBid = calculateAverageBid(media);
                                        return Math.max(getDefaultBidAmount(media), avgBid || 0).toFixed(2);
                                      })()}
                                      onChange={(e) => setNewMediaBidAmounts(prev => ({
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
                                        const current = parseFloat(newMediaBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const newAmount = current + 0.01;
                                        setNewMediaBidAmounts(prev => ({
                                          ...prev,
                                          [mediaId]: newAmount.toFixed(2)
                                        }));
                                      }}
                                      className="px-1.5 py-2 bg-gray-700 hover:bg-gray-800 rounded-tr-xl rounded-br-xl text-white transition-colors flex items-center justify-center"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                    </div>
                                    <button
                                      onClick={() => handleAddMediaToParty(media)}
                                      className="z-999 px-3 md:px-4 py-2 bg-purple-800 text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap"
                                    >
                                      {(() => {
                                                const defaultBid = getDefaultBidAmount(media);
                                        const raw = newMediaBidAmounts[media._id || media.id] ?? defaultBid.toFixed(2);
                                        const parsed = parseFloat(raw);
                                        if (!Number.isFinite(parsed)) {
                                          return 'Tip';
                                        }
                                        return `Tip £${parsed.toFixed(2)}`;
                                      })()}
                                    </button>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* YouTube Results */}
                        {addMediaResults.youtube.length > 0 && (
                          <div>
                            <div className="flex items-center mb-2">
                              <Youtube className="h-4 w-4 text-red-400 mr-2" />
                              <h4 className="text-sm font-semibold text-red-300">From YouTube ({addMediaResults.youtube.length})</h4>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {addMediaResults.youtube.map((mediaItem: any) => {
                                // Ensure artists array is set for ClickableArtistDisplay
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
                                  <div className="flex justify-center items-center space-x-1">
                                    <div className="flex items-center space-x-0 mr-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const mediaId = media._id || media.id;
                                        const avgBid = calculateAverageBid(media);
                                        const minBid = getEffectiveMinimumBid(media);
                                        const defaultBid = Math.max(getDefaultBidAmount(media), avgBid || 0);
                                        const current = parseFloat(newMediaBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const newAmount = Math.max(minBid, current - 0.01);
                                        setNewMediaBidAmounts(prev => ({
                                          ...prev,
                                          [mediaId]: newAmount.toFixed(2)
                                        }));
                                      }}
                                      className="px-1.5 py-2 bg-gray-700 hover:bg-gray-800 rounded-tl-xl rounded-bl-xl text-white transition-colors flex items-center justify-center"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <input
                                      type="number"
                                      step="0.01"
                                              min={getEffectiveMinimumBid(media)}
                                      value={newMediaBidAmounts[media._id || media.id] ?? (() => {
                                        const avgBid = calculateAverageBid(media);
                                        return Math.max(getDefaultBidAmount(media), avgBid || 0).toFixed(2);
                                      })()}
                                      onChange={(e) => setNewMediaBidAmounts(prev => ({
                                        ...prev,
                                        [media._id || media.id]: e.target.value
                                      }))}
                                      className="w-14 md:w-14 bg-gray-800 rounded px-2 py-1 text-center text-gray text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const mediaId = media._id || media.id;
                                        const avgBid = calculateAverageBid(media);
                                        const defaultBid = Math.max(getDefaultBidAmount(media), avgBid || 0);
                                        const current = parseFloat(newMediaBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const newAmount = current + 0.01;
                                        setNewMediaBidAmounts(prev => ({
                                          ...prev,
                                          [mediaId]: newAmount.toFixed(2)
                                        }));
                                      }}
                                      className="px-1.5 py-2 bg-gray-700 hover:bg-gray-800 rounded-tr-xl rounded-br-xl text-white transition-colors flex items-center justify-center"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                    </div>
                                    <button
                                      onClick={() => handleAddMediaToParty(media)}
                                      className="flex px-3 md:px-4 py-2 bg-purple-800 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap"
                                    >
                                      {(() => {
                                                const defaultBid = getDefaultBidAmount(media);
                                        const raw = newMediaBidAmounts[media._id || media.id] ?? defaultBid.toFixed(2);
                                        const parsed = parseFloat(raw);
                                        if (!Number.isFinite(parsed)) {
                                          return 'Tip';
                                        }
                                        return `Tip £${parsed.toFixed(2)}`;
                                      })()}
                                    </button>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                            
                            {/* Show More Button for YouTube */}
                            {youtubeNextPageToken && (
                              <div className="mt-8 text-center">
                                <button
                                  onClick={handleLoadMoreYouTube}
                                  disabled={isLoadingMoreYouTube}
                                  className="p-3 border bg-red-500/20 hover:bg-red-800 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray rounded-lg font-medium transition-colors"
                                >
                                  {isLoadingMoreYouTube ? (
                                    <span className="flex items-center space-x-2">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      <span>Loading...</span>
                                    </span>
                                  ) : (
                                    'Show More YouTube Results'
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* No Results Message - Only show after database/YouTube search has been performed */}
                        {!isSearchingNewMedia && hasSearchedDatabase && addMediaSearchQuery && addMediaResults.database.length === 0 && addMediaResults.youtube.length === 0 && (
                          <div className="text-center py-8">
                            <Music className="h-12 w-12 text-gray-500 mx-auto mb-3" />
                            <p className="text-gray-400">No media found for "{addMediaSearchQuery}"</p>
                            <p className="text-gray-500 text-sm mt-1">Try a different search term</p>
                          </div>
                        )}
                        </>
                        )}
                      </div>
                  </div>
                )}

                {/* Tag filter - hidden by default, "Filter by Tag" reveals tag cloud; directly above time sorting */}
                {!showVetoed && (
                  <div className="mb-4 md:mb-6">
                    {!showTagFilterCloud ? (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowTagFilterCloud(true)}
                          className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors text-sm sm:text-base flex items-center gap-2"
                        >
                          <Tag className="h-4 w-4 text-purple-400" />
                          Filter by Tag
                        </button>
                      </div>
                    ) : (
                      <div className="card p-3 md:p-6 mb-4">
                        <div className="flex items-center justify-between mb-1 md:mb-3">
                          <h3 className="text-lg font-semibold text-white flex items-center">
                            <Tag className="h-4 w-4 mr-2 text-purple-400" />
                            Top Tags
                          </h3>
                          <div className="flex items-center gap-2">
                            {queueSearchTerms.some((t) => t.startsWith('#')) && (
                              <button
                                onClick={() => setQueueSearchTerms(queueSearchTerms.filter((t) => !t.startsWith('#')))}
                                className="text-sm text-purple-300 hover:text-white"
                              >
                                Clear tags
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowTagFilterCloud(false)}
                              className="text-sm text-gray-400 hover:text-white"
                            >
                              Hide
                            </button>
                          </div>
                        </div>
                        {topTags.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {(topTagsExpanded ? topTags : topTags.slice(0, isMobile ? 6 : 10)).map(({ tag, total }) => {
                              const hash = `#${tag}`;
                              const selected = queueSearchTerms.some((t) => t.toLowerCase() === hash);
                              const weight = Math.max(0.75, Math.min(1.25, total / 50));
                              const sizeClass = weight > 1.1 ? 'text-sm' : weight > 0.95 ? 'text-xs' : 'text-[10px]';

                              return (
                                <button
                                  key={tag}
                                  onClick={() =>
                                    setQueueSearchTerms((prev) =>
                                      selected ? prev.filter((t) => t.toLowerCase() !== hash) : [...prev, hash]
                                    )
                                  }
                                  className={`rounded-full px-3 py-1 transition-colors ${sizeClass} ${
                                    selected
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-gray-700 text-gray-200 hover:bg-gray-800'
                                  }`}
                                  title={`${penceToPounds(total)} total across queued tunes`}
                                >
                                  #{tag}
                                  <span className="ml-2 text-[10px] opacity-70">{penceToPounds(total)}</span>
                                </button>
                              );
                            })}
                            {topTags.length > (isMobile ? 6 : 10) && (
                              <button
                                type="button"
                                onClick={() => setTopTagsExpanded((e) => !e)}
                                className="rounded-full px-3 py-1 text-xs bg-gray-600 text-gray-200 hover:bg-gray-500 transition-colors inline-flex items-center gap-1"
                                aria-expanded={topTagsExpanded}
                              >
                                {topTagsExpanded ? (
                                  <>
                                    <Minus className="w-3 h-3" />
                                    Show less
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3 h-3" />
                                    +{topTags.length - (isMobile ? 6 : 10)} more
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-400 text-sm">No tags in this party yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Sorting Tabs - Only show for Queue, not Vetoed */}
                {!showVetoed && (
                  <div className="mb-4 md:mb-6">
                    <div className="flex flex-row flex-wrap gap-2 justify-center">
                      {[
                        { key: 'all-time', label: 'All Time' },
                       /* { key: 'this-year', label: 'This Year' }, */
                        { key: 'this-month', label: 'This Month' },
                        { key: 'this-week', label: 'This Week' },
                        { key: 'today', label: 'Today' }
                      ].map((period) => (
                        <button
                          key={period.key}
                          onClick={() => handleTimePeriodChange(period.key)}
                          className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                            selectedTimePeriod === period.key
                              ? 'bg-purple-700 text-white'
                              : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {period.label}
                        </button>
                      ))}
                    </div>
                    {/* Play Queue Button */}
                    {getDisplayMedia().length > 0 && (
                      <div className="flex justify-center mt-4 md:mt-6">
                        <button
                          onClick={handlePlayQueue}
                          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors shadow-lg"
                          title={`Play ${getDisplayMedia().length} track${getDisplayMedia().length !== 1 ? 's' : ''} from the top`}
                        >
                          <Play className="h-4 w-4" />
                          <span>Play</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Refresh Button - commented out for now */}
                <div className="flex justify-center items-center gap-2">
                  {false && (
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                    title="Refresh party data to see new tips"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                  )}
                  {/* Show Vetoed Media Toggle - Only visible for Host/Admin */}
                  {(isHost || user?.role?.includes('admin')) && (
                    <button
                      onClick={() => setShowVetoed(!showVetoed)}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                        showVetoed
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      <X className="h-4 w-4" />
                      <span>{showVetoed ? 'Hide Vetoed' : 'Show Vetoed'}</span>
                      {getVetoedMedia().length > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                          {getVetoedMedia().length}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                {/* Media Queue - Show when NOT viewing vetoed */}
                {!showVetoed && getDisplayMedia().length > 0 && (
                  <div className="space-y-3">
                    {isLoadingSortedMedia && selectedTimePeriod !== 'all-time' ? (
                      <div className="text-center py-8">
                        <div className="text-gray-400">Loading sorted media...</div>
                      </div>
                    ) : (
                      getDisplayMedia().map((item: any, index: number) => {
                        // For sorted media, the data is already flattened, for regular party media it's nested under mediaId
                        const rawMediaData = selectedTimePeriod === 'all-time' ? (item.mediaId || item) : item;
                        // Ensure artists array is set for ClickableArtistDisplay
                        // Backend sends both 'artist' (string for backward compat) and 'artists' (array with userIds)
                        const mediaData = {
                          ...rawMediaData,
                          // Prioritize 'artists' from backend (full array with userIds)
                          artists: Array.isArray(rawMediaData.artists) ? rawMediaData.artists : 
                                  // Fallback: if 'artist' is an array (Mongoose document), use it
                                  (Array.isArray(rawMediaData.artist) ? rawMediaData.artist : []),
                          // Keep 'artist' for backward compatibility (may be string or array)
                          artist: rawMediaData.artist,
                          featuring: Array.isArray(rawMediaData.featuring) ? rawMediaData.featuring : [],
                          creatorDisplay: rawMediaData.creatorDisplay
                        };
                        const isAdmin = user?.role?.includes('admin');
                        return (
                          <div
                            key={`queued-${mediaData.id}-${index}`}
                            className="card flex flex-col md:flex-row md:items-center hover:shadow-2xl relative p-1.5 md:p-4"
                          >
                            {/* Action Button - Top Right (opens modal with available actions) */}
                            {(isHost || isAdmin || getUserBid(item)) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActionButtonClick(item);
                                }}
                                className="absolute top-2 right-2 z-20 p-1 md:p-1.5 border hover:bg-gray-600 text-white rounded-md transition-colors shadow-lg"
                                title="Actions"
                              >
                                <X className="h-2 w-2 md:h-4 md:w-4" />
                              </button>
                            )}
                            
                            {/* Queue Number Badge - Centered at top on mobile, Left of artwork on desktop */}
                            <div className="flex items-center justify-center md:items-center md:justify-start w-full md:w-auto md:mr-3 mb-1 md:mb-0 order-first">
                              <div className="w-5 h-5 md:w-8 md:h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-lg">
                                <span className="text-white font-bold text-[10px] md:text-sm">{index + 1}</span>
                              </div>
                            </div>
                            
                            {/* Mobile-only wrapper for thumbnail + details side by side */}
                            <div className="flex flex-row md:contents items-start gap-2 mb-1 md:mb-0">
                              {/* Media Thumbnail with Overlays */}
                              <div 
                                className="relative w-32 h-32 cursor-pointer group flex-shrink-0"
                                onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
                              >
                                <img
                                  src={mediaData.coverArt || DEFAULT_COVER_ART}
                                  alt={mediaData.title || 'Unknown Media'}
                                  className="w-full h-full rounded object-cover"
                                  width="192"
                                  height="192"
                                />
                                
                                {/* Play Icon Overlay */}
                                <div 
                                  className="absolute inset-0 flex items-center justify-center bg-black/30 md:bg-black/40 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePlayMedia(item, index);
                                  }}
                                >
                                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center border border-white bg-transparent md:border-0 md:bg-purple-600 md:hover:bg-purple-700 transition-all">
                                    <Play className="h-5 w-5 md:h-6 md:w-6 text-white" />
                                  </div>
                                </div>
                              </div>
                              
                              {/* Media Details */}
                              <div className="flex-1 min-w-0 md:ml-4">
                                <div className="flex flex-col md:flex-row md:items-center gap-0 md:gap-2 md:space-x-2">
                                  <h4 
                                    className="font-medium text-white text-sm md:text-lg truncate cursor-pointer hover:text-purple-300 transition-colors"
                                    onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
                                  >
                                    {mediaData.title || 'Unknown Media'}
                                  </h4>
                                  <span className="hidden md:inline text-gray-400">•</span>
                                  <span className="text-gray-300 text-sm md:text-lg truncate font-light">
                                    <ClickableArtistDisplay media={mediaData} />
                                  </span>
                                  <div className="flex items-center space-x-1 md:ml-2">
                                    <Clock className="h-3 w-3 md:h-4 md:w-4 text-gray-400" />
                                    <span className="text-xs md:text-sm text-gray-300">{formatDuration(mediaData.duration)}</span>
                                  </div>
                                </div>
                                
                                {/* Mini Supporters Bar - shows top supporters for this media */}
                                <div className="md:mt-0">
                                  <MiniSupportersBar bids={mediaData.bids || []} maxVisible={5} scrollable={true} />
                                </div>
                                
                                {/* Tags Display */}
                                {mediaData.tags && mediaData.tags.length > 0 && (
                                  <div className="mt-1 md:mt-2 flex">
                                    <div className="flex flex-wrap gap-1">
                                      {mediaData.tags.slice(0, window.innerWidth < 640 ? 3 : 5).map((tag: string, tagIndex: number) => (
                                        <Link
                                          key={tagIndex}
                                          to={`/tune/${mediaData._id || mediaData.id}`}
                                          className="px-2 py-1 bg-purple-700/60 hover:bg-purple-500 text-white text-[10px] md:text-sm rounded-full transition-colors no-underline"
                                        >
                                          #{tag}
                                        </Link>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Action Buttons */}
                            <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-2">
                              <div className="flex items-center justify-center space-x-2">
                                {/* Metrics Display */}
                                <div className="flex flex-row md:flex-col items-center space-x-2 md:space-x-0 md:space-y-1 bg-slate-900/20 px-1 py-1 md:px-2 md:py-2 rounded-lg">
                                  <div className="text-center p-1 md:p-2">
                                    <div className="flex items-center justify-center text-[9px] md:text-xs text-gray-300 tracking-wide" title="Tip Total">
                                      <Coins className="h-3 w-3 md:h-4 md:w-4" />
                                    </div>
                                    <div className="text-[9px] md:text-xs md:text-lg text-gray-300">
                                      {penceToPounds(typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0)}
                                    </div>
                                  </div>
                                  <div className="text-center p-1 md:p-2">
                                    <div className="flex items-center justify-center text-[9px] md:text-xs text-gray-300 tracking-wide" title="Average Tip">
                                      <TrendingUp className="h-3 w-3 md:h-4 md:w-4" />
                                    </div>
                                    <div className="text-[9px] md:text-xs md:text-lg text-gray-300">
                                      £{calculateAverageBid(mediaData, item).toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                                {/* Inline tipping controls (API still expects bid terminology) */}
                                <div className="flex flex-row items-center space-x-1 md:space-x-2">
                                  {/* Input group with +/- buttons */}
                                  <div className="flex md:flex-col items-center space-x-0">
                                  <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const mediaId = mediaData._id || mediaData.id;
                                        const avgBid = calculateAverageBid(mediaData);
                                        const defaultBid = Math.max(getDefaultBidAmount(mediaData), avgBid || 0);
                                        const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const newAmount = current + 0.01;
                                        setQueueBidAmounts({
                                          ...queueBidAmounts,
                                          [mediaId]: newAmount.toFixed(2)
                                        });
                                      }}
                                      disabled={isBidding}
                                      className="hidden md:inline px-4 md:py-1.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-tr-xl rounded-tl-xl text-white transition-colors flex items-center justify-center"
                                    >
                                      <Plus className="h-3 w-3 md:h-4 md:w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const mediaId = mediaData._id || mediaData.id;
                                        const avgBid = calculateAverageBid(mediaData, item);
                                        const minBid = getEffectiveMinimumBid(mediaData);
                                        const defaultBid = Math.max(getDefaultBidAmount(mediaData), avgBid || 0);
                                        const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const newAmount = Math.max(minBid, current - 0.01);
                                        setQueueBidAmounts({
                                          ...queueBidAmounts,
                                          [mediaId]: newAmount.toFixed(2)
                                        });
                                      }}
                                      disabled={isBidding || (() => {
                                        const mediaId = mediaData._id || mediaData.id;
                                                const defaultBid = getDefaultBidAmount(mediaData);
                                        const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const minBid = getEffectiveMinimumBid(mediaData);
                                        return current <= minBid;
                                      })()}
                                      className="md:hidden px-1.5 py-2 md:px-6
                                       md:py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-tl-xl rounded-bl-xl text-white transition-colors flex items-center justify-center"
                                    >
                                      <Minus className="h-3 w-3 md:h-4 md:w-4" />
                                    </button>
                                    <input
                                      type="number"
                                      step="0.01"
                                              min={getEffectiveMinimumBid(mediaData)}
                                      value={queueBidAmounts[mediaData._id || mediaData.id] ?? (() => {
                                        const avgBid = calculateAverageBid(mediaData, item);
                                        return Math.max(getDefaultBidAmount(mediaData), avgBid || 0).toFixed(2);
                                      })()}
                                      onChange={(e) => setQueueBidAmounts({
                                        ...queueBidAmounts,
                                        [mediaData._id || mediaData.id]: e.target.value
                                      })}
                                      className="w-16 md:w-20 bg-gray-900 rounded px-1.5 md:px-2 py-1.5 md:py-2 text-center text-gray text-xs md:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const mediaId = mediaData._id || mediaData.id;
                                        const avgBid = calculateAverageBid(mediaData, item);
                                        const minBid = getEffectiveMinimumBid(mediaData);
                                        const defaultBid = Math.max(getDefaultBidAmount(mediaData), avgBid || 0);
                                        const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const newAmount = Math.max(minBid, current - 0.01);
                                        setQueueBidAmounts({
                                          ...queueBidAmounts,
                                          [mediaId]: newAmount.toFixed(2)
                                        });
                                      }}
                                      disabled={isBidding || (() => {
                                        const mediaId = mediaData._id || mediaData.id;
                                                const defaultBid = getDefaultBidAmount(mediaData);
                                        const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const minBid = getEffectiveMinimumBid(mediaData);
                                        return current <= minBid;
                                      })()}
                                      className="hidden md:inline px-1.5 py-2 md:px-4
                                       md:py-1.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-bl-xl rounded-br-xl text-white transition-colors flex items-center justify-center"
                                    >
                                      <Minus className="h-3 w-3 md:h-4 md:w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const mediaId = mediaData._id || mediaData.id;
                                        const avgBid = calculateAverageBid(mediaData, item);
                                        const defaultBid = Math.max(getDefaultBidAmount(mediaData), avgBid || 0);
                                        const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
                                        const newAmount = current + 0.01;
                                        setQueueBidAmounts({
                                          ...queueBidAmounts,
                                          [mediaId]: newAmount.toFixed(2)
                                        });
                                      }}
                                      disabled={isBidding}
                                      className="md:hidden px-1.5 py-2 md:px-2 md:py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-tr-xl rounded-br-xl text-white transition-colors flex items-center justify-center"
                                    >
                                      <Plus className="h-3 w-3 md:h-4 md:w-4" />
                                    </button>
                                  </div>
                                  {/* Tip Button */}
                                  <button
                                    onClick={() => handleInlineBid(item)}
                                    disabled={isBidding}
                                    className="px-2 md:px-4 py-1.5 md:py-2 bg-purple-800 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap flex items-center justify-center gap-2"
                                  >
                                    {isBidding ? (
                                      <>
                                        <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                                        <span>Placing Tip...</span>
                                      </>
                                    ) : (
                                      (() => {
                                        const mediaId = mediaData._id || mediaData.id;
                                        // Use same calculation logic as input field
                                        const avgBid = calculateAverageBid(mediaData, item);
                                        const defaultBid = Math.max(getDefaultBidAmount(mediaData), avgBid || 0);
                                        const raw = queueBidAmounts[mediaId] ?? defaultBid.toFixed(2);
                                        const parsed = parseFloat(raw);
                                        if (!Number.isFinite(parsed)) {
                                          return 'Send Tip';
                                        }
                                        return `Tip £${parsed.toFixed(2)}`;
                                      })()
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}


                {/* Vetoed Songs - Show when Vetoed tab is active */}
                {showVetoed && (
                  <div className="space-y-3">
                    {getVetoedMedia().length === 0 ? (
                      <div className="text-center py-8">
                        <X className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No vetoed songs</p>
                      </div>
                    ) : (
                      getVetoedMedia().map((item: any, index: number) => {
                        const rawMediaData = item.mediaId || item;
                        // Ensure artists array is set for ClickableArtistDisplay
                        const mediaData = {
                          ...rawMediaData,
                          artists: Array.isArray(rawMediaData.artists) ? rawMediaData.artists : 
                                  (Array.isArray(rawMediaData.artist) ? rawMediaData.artist : []),
                          artist: rawMediaData.artist,
                          featuring: rawMediaData.featuring || [],
                          creatorDisplay: rawMediaData.creatorDisplay
                        };
                        return (
                          <div
                            key={`vetoed-${mediaData.id || mediaData._id}-${index}`}
                            className="bg-red-900/20 border border-red-800/30 p-4 rounded-lg flex items-center space-x-4"
                          >
                            <img
                              src={mediaData.coverArt || DEFAULT_COVER_ART}
                              alt={mediaData.title || 'Unknown Media'}
                              className="w-32 h-32 rounded object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                              width="128"
                              height="128"
                              onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
                            />
                            
                            {/* Media Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <h4 
                                  className="font-medium text-white text-lg truncate cursor-pointer hover:text-purple-300 transition-colors"
                                  onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
                                >
                                  {mediaData.title || 'Unknown Media'}
                                </h4>
                                <span className="text-gray-400">•</span>
                                <span className="text-gray-300 text-lg truncate font-light">
                                  <ClickableArtistDisplay media={mediaData} />
                                </span>
                                <div className="flex items-center space-x-1 ml-2">
                                  <Clock className="h-4 w-4 text-gray-400" />
                                  <span className="text-sm text-gray-300">{formatDuration(mediaData.duration)}</span>
                                </div>
                              </div>
                              <div className="mt-2">
                                <p className="text-xs text-red-400">
                                  Vetoed {item.vetoedAt ? new Date(item.vetoedAt).toLocaleString() : 'recently'}
                                  {item.vetoedBy && ` by ${item.vetoedBy}`}
                                </p>
                                {item.vetoedReason && (
                                  <p className="text-xs text-gray-400 mt-1">Reason: {item.vetoedReason}</p>
                                )}
                              </div>
                            </div>
                            
                            {/* Unveto Button - Host or Admin */}
                            {(isHost || user?.role?.includes('admin')) && (
                              <div className="flex flex-col space-y-2">
                                <button
                                  onClick={() => handleUnvetoClick(item)}
                                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
                                >
                                  <span>Unveto</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Music className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No Tunes in queue</p>
                <button
                  onClick={() => handleNavigateWithWarning(`/search?partyId=${partyId}`, 'navigate to search page')}
                  className="btn-primary mt-4"
                >
                  Add First Tune
                </button>
              </div>
            )}

            {/* Previously Played Songs - Only show for live parties */}
            {/* NOTE: This section is for future live jukebox feature. MVP uses remote parties only. */}
            {/* Using completedAt timestamp instead of status */}
            {party.type === 'live' && getPartyMedia().filter((item: any) => item.completedAt).length > 0 && (
              <div id="previously-played" className="mt-8">
                <h3 className="text-lg font-medium text-gray-400 mb-3 flex items-center">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Previously Played ({getPartyMedia().filter((item: any) => item.completedAt).length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {getPartyMedia()
                    .filter((item: any) => item.completedAt)
                    .map((item: any, index: number) => {
                      const mediaData = item.mediaId || item;
                      return (
                        <div
                          key={`played-${mediaData.id}-${index}`}
                          className="flex items-center space-x-3 p-2 rounded-lg bg-gray-700"
                        >
                          <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                          <img
                            src={mediaData.coverArt || 'https://uploads.tuneable.stream/cover-art/default-cover.png'}
                            alt={mediaData.title || 'Unknown Media'}
                            className="w-10 h-10 rounded object-cover"
                            width="40"
                            height="40"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-300 text-sm truncate">{mediaData.title || 'Unknown Media'}</h4>
                            <p className="text-xs text-gray-500 truncate">
                              <ClickableArtistDisplay media={mediaData} />
                            </p>
                            <p className="text-xs text-gray-600">
                              {item.completedAt ? new Date(item.completedAt).toLocaleTimeString() : 'Completed'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-gray-400">
                              {penceToPounds(typeof mediaData.partyMediaAggregate === 'number' ? mediaData.partyMediaAggregate : 0)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Partiers List */}
          {party.partiers && party.partiers.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-white mb-4">Partiers ({party.partiers.length})</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {party.partiers.map((partier: any, index: number) => {
                  const hostId = typeof party.host === 'object' && party.host?._id 
                    ? party.host._id.toString() 
                    : typeof party.host === 'string' 
                    ? party.host 
                    : party.host?.uuid || party.host?.id;
                  const partierId = partier._id?.toString() || partier.id?.toString() || partier.uuid || partier;
                  const partierUserId = typeof partier === 'object' && partier._id 
                    ? partier._id.toString() 
                    : typeof partier === 'string' 
                    ? partier 
                    : partier.id || partier.uuid;
                  const isPartierHost = partierUserId === hostId;
                  const canKick = (isHost || user?.role?.includes('admin')) && !isPartierHost && partierUserId !== user?._id?.toString();
                  
                  return (
                    <div key={`${partierId}-${index}`} className="flex items-center justify-between space-x-3 p-2 rounded hover:bg-gray-800/50 transition-colors">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-medium text-white">
                            {typeof partier === 'object' && partier.username 
                              ? partier.username.charAt(0).toUpperCase() 
                              : '?'}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-white truncate">
                              {typeof partier === 'object' && partier.username 
                                ? partier.username 
                                : 'Unknown User'}
                            </span>
                            {isPartierHost && (
                              <span className="text-xs bg-yellow-600 text-white px-2 py-0.5 rounded flex-shrink-0">
                                Host
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {canKick && (
                        <button
                          onClick={() => handleKickUser(
                            partierUserId,
                            typeof partier === 'object' && partier.username ? partier.username : 'this user'
                          )}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors flex-shrink-0"
                          title="Remove user from party"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Kicked Users (Host/Admin Only) */}
          {party.kickedUsers && party.kickedUsers.length > 0 && (isHost || user?.role?.includes('admin')) && (
            <div className="card">
              <h3 className="text-lg font-semibold text-white mb-4">Removed Users ({party.kickedUsers.length})</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {party.kickedUsers.map((kickedUser: any, index: number) => {
                  const kickedUserId = kickedUser.userId?._id?.toString() || kickedUser.userId?.toString() || kickedUser.userId;
                  const kickedUsername = kickedUser.userId?.username || 'Unknown User';
                  const kickedAt = kickedUser.kickedAt ? new Date(kickedUser.kickedAt).toLocaleDateString() : 'Unknown date';
                  
                  return (
                    <div key={`kicked-${kickedUserId}-${index}`} className="flex items-center justify-between space-x-3 p-2 rounded bg-red-900/20 border border-red-800/50">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-medium text-white">
                            {kickedUsername.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{kickedUsername}</div>
                          <div className="text-xs text-gray-400">Removed {kickedAt}</div>
                          {kickedUser.reason && (
                            <div className="text-xs text-gray-500 italic mt-1">Reason: {kickedUser.reason}</div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnkickUser(kickedUserId, kickedUsername)}
                        className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors flex-shrink-0"
                        title="Allow user to rejoin"
                      >
                        Restore
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Party Info */}
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-4">Party Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex  items-center">
                <span className="text-white mr-2">Type:</span>
                <span className="px-2 text-white capitalize">{party.type}</span>
              </div>
              <div className="flex items-center">
                <span className="text-white mr-2">Location:</span>
                <span className="px-2 text-white">{party.location}</span>
              </div>
              <div className="flex items-center">
                <span className="text-white mr-2">Created:</span>
                <span className="px-2 text-white">{formatDate(party.createdAt)}</span>
              </div>
              <div className="flex items-center">
                <span className="text-white mr-2">Status:</span>
                <span className="px-2 text-green-600 capitalize">{party.status}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Bid Modal */}
      <BidModal
        isOpen={bidModalOpen}
        onClose={handleBidModalClose}
        onConfirm={handleBidConfirm}
        songTitle={selectedMedia?.title || ''}
        songArtist={Array.isArray(selectedMedia?.artist) ? selectedMedia.artist[0]?.name || 'Unknown Artist' : selectedMedia?.artist || 'Unknown Artist'}
        currentBid={penceToPoundsNumber(selectedMedia?.partyMediaAggregate || 0)}
        userBalance={penceToPoundsNumber(user?.balance || 0)}
        isLoading={isBidding}
        minimumBid={getEffectiveMinimumBid(selectedMedia)}
      />

      {/* Player Warning Modal */}
      <PlayerWarningModal
        isOpen={isWarningOpen}
        onConfirm={onConfirm}
        onCancel={onCancel}
        action={warningAction}
        currentMediaTitle={currentMediaTitle}
        currentMediaArtist={currentMediaArtist}
      />

      {/* End Party Confirmation Modal */}
      {endPartyModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                <X className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">End Party</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to end this party? This action cannot be undone and all partiers will be notified.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setEndPartyModalOpen(false)}
                className="flex-1 px-4 py-2 text-white bg-transparent rounded-lg hover:bg-gray-100 transition-colors border border-gray-300"
                disabled={isEndingParty}
              >
                Cancel
              </button>
              <button
                onClick={handleEndParty}
                disabled={isEndingParty}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isEndingParty ? 'Ending...' : 'End Party'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* YouTube Player is now integrated back into PersistentWebPlayer component */}

      {/* Bid Confirmation Modal */}
      {pendingMedia && showBidConfirmationModal && party && Number.isFinite(confirmationBidAmount) && confirmationBidAmount > 0 && (
        <BidConfirmationModal
          isOpen={showBidConfirmationModal}
          isLoading={isBidding}
          onClose={() => {
            try {
              if (isBidding) return; // Prevent closing while processing
              setShowBidConfirmationModal(false);
              setPendingMedia(null);
              pendingMediaRef.current = null;
              setIsInlineBid(false);
              isInlineBidRef.current = false;
            } catch (e) {
              console.error('Error closing modal:', e);
            }
          }}
          onConfirm={(tags, setProgress) => {
            try {
              handleBidConfirmation(tags, setProgress);
            } catch (e) {
              console.error('Error in onConfirm:', e);
              toast.error('An error occurred. Please try again.');
              setProgress?.(null);
              setShowBidConfirmationModal(false);
              setPendingMedia(null);
              pendingMediaRef.current = null;
              setIsInlineBid(false);
              isInlineBidRef.current = false;
            }
          }}
          bidAmount={confirmationBidAmount}
          mediaTitle={pendingMedia?.title || 'Unknown'}
          mediaArtist={Array.isArray(pendingMedia?.artist) 
            ? pendingMedia.artist[0]?.name || pendingMedia.artist[0] || 'Unknown Artist'
            : typeof pendingMedia?.artist === 'object' && pendingMedia?.artist?.name
            ? pendingMedia.artist.name
            : pendingMedia?.artist || 'Unknown Artist'}
          party={party}
          user={user}
          userBalance={confirmationUserBalance}
        />
      )}

      {/* Tag Input Modal - kept for backward compatibility */}
      <TagInputModal
        isOpen={showTagModal}
        onClose={() => {
          setShowTagModal(false);
          setPendingMedia(null);
        }}
        onSubmit={handleTagSubmit}
        mediaTitle={pendingMedia?.title}
        mediaArtist={Array.isArray(pendingMedia?.artist) 
          ? pendingMedia.artist[0]?.name || pendingMedia.artist[0] || 'Unknown Artist'
          : typeof pendingMedia?.artist === 'object' && pendingMedia?.artist?.name
          ? pendingMedia.artist.name
          : pendingMedia?.artist || undefined}
      />

      {/* Media Validation Modal */}
      <MediaValidationModal
        isOpen={showValidationModal}
        onConfirm={handleValidationConfirm}
        onCancel={handleValidationCancel}
        mediaTitle={pendingMedia?.title}
        mediaArtist={Array.isArray(pendingMedia?.artist) 
          ? pendingMedia.artist[0]?.name || pendingMedia.artist[0] || 'Unknown Artist'
          : typeof pendingMedia?.artist === 'object' && pendingMedia?.artist?.name
          ? pendingMedia.artist.name
          : pendingMedia?.artist || undefined}
        warnings={validationWarnings}
        category={validationCategory}
        duration={validationDuration}
      />

      {/* Action Modal (Veto/Remove Tip/Request Refund/Report) */}
      {showActionModal && selectedMediaForAction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full border border-gray-700">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">Media Actions</h2>
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    setSelectedMediaForAction(null);
                    setSelectedBidForAction(null);
                    setRefundReason('');
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                  disabled={isProcessingAction}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {(() => {
                const mediaData = selectedMediaForAction.mediaId || selectedMediaForAction;
                const isAdmin = user?.role?.includes('admin');
                const userBid = selectedBidForAction;
                const canRemoveInstantly = userBid && isWithinRemovalWindow(userBid);
                const canRequestRefund = userBid && !canRemoveInstantly;

                return (
                  <div className="space-y-4">
                    {/* Media Info */}
                    <div className="mb-4">
                      <p className="text-gray-300 font-medium">{mediaData.title || 'Unknown Media'}</p>
                      <p className="text-sm text-gray-400">
                        {Array.isArray(mediaData.artist) 
                          ? mediaData.artist[0]?.name || 'Unknown Artist'
                          : mediaData.artist || 'Unknown Artist'}
                      </p>
                    </div>

                    {/* Host/Admin: Veto Option */}
                    {(isHost || isAdmin) && (
                      <div className="border-t border-gray-700 pt-4">
                        <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase">Host/Admin Actions</h3>
                        <button
                          onClick={handleVetoFromModal}
                          disabled={isProcessingAction}
                          className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                        >
                          {isProcessingAction ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <X className="h-5 w-5" />
                              <span>Veto Media</span>
                            </>
                          )}
                        </button>
                        <p className="text-xs text-gray-500 mt-2">
                          Veto this media and refund all tips to users
                        </p>
                      </div>
                    )}

                    {/* User: Remove Tip Option (within 10 minutes) */}
                    {canRemoveInstantly && (
                      <div className="border-t border-gray-700 pt-4">
                        <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase">Your Tip</h3>
                        <div className="mb-3">
                          <p className="text-gray-300 mb-1">
                            Your tip: <span className="font-semibold text-yellow-400">£{(userBid.amount / 100).toFixed(2)}</span>
                          </p>
                          <p className="text-xs text-gray-400">
                            You can remove your tip instantly within 10 minutes
                          </p>
                        </div>
                        <button
                          onClick={handleRemoveTip}
                          disabled={isProcessingAction}
                          className="w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                        >
                          {isProcessingAction ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span>Removing...</span>
                            </>
                          ) : (
                            <>
                              <X className="h-5 w-5" />
                              <span>Remove Tip</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* User: Request Refund Option (after 10 minutes) */}
                    {canRequestRefund && (
                      <div className="border-t border-gray-700 pt-4">
                        <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase">Your Tip</h3>
                        <div className="mb-3">
                          <p className="text-gray-300 mb-1">
                            Your tip: <span className="font-semibold text-yellow-400">£{(userBid.amount / 100).toFixed(2)}</span>
                          </p>
                          <p className="text-xs text-gray-400 mb-3">
                            The 10-minute instant removal window has passed. You can request a refund which will be reviewed by administrators.
                          </p>
                        </div>
                        <div className="mb-3">
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Reason for refund request *
                          </label>
                          <textarea
                            value={refundReason}
                            onChange={(e) => setRefundReason(e.target.value)}
                            placeholder="Please explain why you're requesting a refund..."
                            rows={3}
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                            disabled={isProcessingAction}
                          />
                        </div>
                        <button
                          onClick={handleRequestRefund}
                          disabled={isProcessingAction || !refundReason.trim()}
                          className="w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                        >
                          {isProcessingAction ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span>Submitting...</span>
                            </>
                          ) : (
                            <>
                              <Coins className="h-5 w-5" />
                              <span>Request Refund</span>
                            </>
                          )}
                        </button>
                        <p className="text-xs text-gray-500 mt-2">
                          Refund requests are typically processed within 3-5 business days
                        </p>
                      </div>
                    )}

                    {/* Report Media Option (for all users) */}
                    <div className="border-t border-gray-700 pt-4">
                      <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase">Report</h3>
                      <button
                        onClick={() => {
                          // TODO: Implement report media functionality
                          toast.info('Report functionality coming soon');
                        }}
                        disabled={isProcessingAction}
                        className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                      >
                        <Flag className="h-5 w-5" />
                        <span>Report Media</span>
                      </button>
                      <p className="text-xs text-gray-500 mt-2">
                        Report inappropriate content or copyright issues
                      </p>
                    </div>

                    {/* Cancel Button */}
                    <div className="border-t border-gray-700 pt-4">
                      <button
                        onClick={() => {
                          setShowActionModal(false);
                          setSelectedMediaForAction(null);
                          setSelectedBidForAction(null);
                          setRefundReason('');
                        }}
                        disabled={isProcessingAction}
                        className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Party;
