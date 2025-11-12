import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocketIOParty } from '../hooks/useSocketIOParty';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { usePlayerWarning } from '../hooks/usePlayerWarning';
import { partyAPI, searchAPI } from '../lib/api';
import { toast } from 'react-toastify';
import BidModal from '../components/BidModal';
// import PartyQueueSearch from '../components/PartyQueueSearch'; // Commented out for now
import PlayerWarningModal from '../components/PlayerWarningModal';
import TagInputModal from '../components/TagInputModal';
import MediaValidationModal from '../components/MediaValidationModal';
import QuotaWarningBanner from '../components/QuotaWarningBanner';
import ClickableArtistDisplay from '../components/ClickableArtistDisplay';
// MediaLeaderboard kept in codebase for potential future use
import MiniSupportersBar from '../components/MiniSupportersBar';
import '../types/youtube'; // Import YouTube types
import { Play, CheckCircle, X, Music, Users, Clock, Coins, Loader2, Youtube, Tag } from 'lucide-react';
import TopSupporters from '../components/TopSupporters';
import { DEFAULT_COVER_ART } from '../constants';
import { penceToPoundsNumber, penceToPounds } from '../utils/currency';

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
  type: 'PARTY_CREATED' | 'MEDIA_STARTED' | 'MEDIA_COMPLETED' | 'MEDIA_VETOED' | 'PARTY_ENDED' | 'UPDATE_QUEUE' | 'PLAY' | 'PAUSE' | 'SKIP' | 'PLAY_NEXT';
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
}

const Party: React.FC = () => {
  const { partyId } = useParams<{ partyId: string }>();
  const { user, updateBalance } = useAuth();
  const navigate = useNavigate();
  const [party, setParty] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Bid modal state
  const [bidModalOpen, setBidModalOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [isBidding, setIsBidding] = useState(false);

  // End party modal state
  const [endPartyModalOpen, setEndPartyModalOpen] = useState(false);
  const [isEndingParty, setIsEndingParty] = useState(false);

  // Sorting state
  const [selectedTimePeriod, setSelectedTimePeriod] = useState('all-time');
  const [sortedMedia, setSortedMedia] = useState<any[]>([]);
  const [isLoadingSortedMedia, setIsLoadingSortedMedia] = useState(false);
  
  // Search state
  const [queueSearchTerms, setQueueSearchTerms] = useState<string[]>([]);
  
  // Inline add media search state
  // const [showAddMediaPanel, setShowAddMediaPanel] = useState(false); // Removed - search panel now always visible
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
  
  // Tag modal state
  const [showTagModal, setShowTagModal] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<any>(null);
  
  // Validation modal state
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<{category?: boolean; duration?: boolean}>({});
  const [validationCategory, setValidationCategory] = useState<string>('');
  const [validationDuration, setValidationDuration] = useState<number>(0);
  
  const [showVetoed] = useState(false);

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
            setParty((prev: any) => prev ? { ...prev, media: message.queue! } : null);
            
            // Note: Socket.IO UPDATE_QUEUE messages don't contain media status information,
            // so we don't update the global player queue here. The queue is managed
            // by the party data from the API calls which include proper status information.
            console.log('Socket.IO UPDATE_QUEUE received but not updating global queue (no status info)');
          }
          break;
        case 'PLAY':
        case 'PAUSE':
        case 'SKIP':
        case 'PLAY_NEXT':
          // Global store will handle these
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
      fetchSortedMedia(selectedTimePeriod);
    }
  }, [partyId]);

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
            duration: actualMedia.duration,
            coverArt: actualMedia.coverArt,
            sources: sources,
            globalMediaAggregate: typeof actualMedia.globalMediaAggregate === 'number' ? actualMedia.globalMediaAggregate : 0,
            partyMediaAggregate: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0,
            totalBidValue: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0, // Use partyMediaAggregate as totalBidValue
            bids: actualMedia.bids,
            addedBy: typeof actualMedia.addedBy === 'object' ? actualMedia.addedBy?.username || 'Unknown' : actualMedia.addedBy
          };
        });
        
        setQueue(cleanedQueue);
        setCurrentPartyId(partyId!);
        setGlobalPlayerActive(true);
        
      // Only autoplay if web player is empty (no current media)
      // This preserves playback across page loads/navigation
      if (cleanedQueue.length > 0) {
        if (!currentMedia) {
          // Web player is empty - safe to autoplay
          console.log('Web player is empty, setting current media to:', cleanedQueue[0].title);
          setCurrentMedia(cleanedQueue[0], 0, true); // Auto-play for jukebox experience
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

  // Update WebPlayer queue when sorting changes
  useEffect(() => {
    if (party && selectedTimePeriod !== 'all-time' && sortedMedia.length > 0) {
      // Update the global player queue with sorted media
      const queuedSortedMedia = sortedMedia.filter((media: any) => media.status === 'active');
      console.log('Updating WebPlayer queue with sorted media:', queuedSortedMedia.length);
      
      // Clean and set the queue in global store
      const cleanedQueue = queuedSortedMedia.map((item: any) => {
        let sources = {};
        
        if (item.sources) {
          if (Array.isArray(item.sources)) {
            for (const source of item.sources) {
              if (source && source.platform === 'youtube' && source.url) {
                (sources as any).youtube = source.url;
              }
            }
          } else if (typeof item.sources === 'object') {
            sources = item.sources;
          }
        }
        
        return {
          id: item._id || item.id || item.uuid, // Prefer ObjectId first
          title: item.title,
          artist: Array.isArray(item.artist) ? item.artist[0]?.name || 'Unknown Artist' : item.artist,
          artists: Array.isArray(item.artist) ? item.artist : (item.artists || []), // Preserve full artist array with userIds
          featuring: item.featuring || [],
          creatorDisplay: item.creatorDisplay,
          duration: item.duration,
          coverArt: item.coverArt,
          sources: sources,
          globalMediaAggregate: typeof item.globalMediaAggregate === 'number' ? item.globalMediaAggregate : 0,
          partyMediaAggregate: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0,
          totalBidValue: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0, // Use partyMediaAggregate as totalBidValue
          bids: item.bids,
          addedBy: typeof item.addedBy === 'object' ? item.addedBy?.username || 'Unknown' : item.addedBy
        };
      });
      
      setQueue(cleanedQueue);
      
      // If there is media and no current media, set the first one
      if (cleanedQueue.length > 0 && !currentMedia) {
        setCurrentMedia(cleanedQueue[0], 0, true);
      }
    }
  }, [sortedMedia, selectedTimePeriod, party, setQueue, setCurrentMedia, currentMedia]);

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
    } catch (error) {
      console.error('Error fetching party details:', error);
      toast.error('Failed to load party details');
    } finally {
      setIsLoading(false);
    }
  };

  // Alias for consistency
  // const fetchParty = fetchPartyDetails; // OLD - no longer used

  // Share and copy party code features removed

  // Sorting functions
  const fetchSortedMedia = async (timePeriod: string) => {
    if (!partyId) return;
    
    setIsLoadingSortedMedia(true);
    try {
      const response = await partyAPI.getMediaSortedByTime(partyId, timePeriod);
      setSortedMedia(response.media || []);
    } catch (error) {
      console.error('Error fetching sorted media:', error);
      toast.error('Failed to load sorted media');
    } finally {
      setIsLoadingSortedMedia(false);
    }
  };

  const handleTimePeriodChange = (timePeriod: string) => {
    setSelectedTimePeriod(timePeriod);
    fetchSortedMedia(timePeriod);
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
        
        // Initialize bid amounts for results (default to 0.33 to encourage higher bids)
        const defaultBid = 0.33;
        const minBid = party?.minimumBid || 0.01;
        const newBidAmounts: Record<string, string> = {};
        [...databaseResults, ...youtubeResults].forEach(media => {
          newBidAmounts[media._id || media.id] = Math.max(defaultBid, minBid).toFixed(2);
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
      
      // Initialize bid amounts for results
      const defaultBid = 0.33;
      const minBid = party?.minimumBid || 0.01;
      const newBidAmounts: Record<string, string> = {};
      [...databaseResults, ...youtubeResults].forEach(media => {
        newBidAmounts[media._id || media.id] = Math.max(defaultBid, minBid).toFixed(2);
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
        const minBid = party?.minimumBid || 0.01;
        const newBidAmounts: Record<string, string> = { ...newMediaBidAmounts };
        response.videos.forEach((media: any) => {
          if (!newBidAmounts[media._id || media.id]) {
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

  const handleAddMediaToParty = async (media: any) => {
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
      setShowValidationModal(true);
      return;
    }
    
    // No warnings, proceed directly to tag modal
    setPendingMedia(media);
    setShowTagModal(true);
  };

  // Handler for validation modal confirm
  const handleValidationConfirm = () => {
    setShowValidationModal(false);
    if (pendingMedia) {
      setShowTagModal(true);
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

  const handleTagSubmit = async (tags: string[]) => {
    if (!partyId || !pendingMedia) return;
    
    const rawNewMediaBid = newMediaBidAmounts[pendingMedia._id || pendingMedia.id] ?? '';
    const bidAmount = parseFloat(rawNewMediaBid);
    const minBid = party?.minimumBid || 0.01;

    if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
      toast.error(`Minimum bid is £${minBid.toFixed(2)}`);
      return;
    }
    
    try {
      // Get the appropriate URL based on media source
      const mediaSource = party?.mediaSource || 'youtube';
      let url = '';
      
      if (mediaSource === 'youtube' && pendingMedia.sources?.youtube) {
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
      
      toast.success(`Added ${pendingMedia.title} to party with £${bidAmount.toFixed(2)} bid!`);
      
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
      .slice(0, 15);
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
    
    // Normalize tag function (matching queue filtering logic)
    const normalizeTag = (tag: string) => {
      return tag.toLowerCase()
        .replace(/[\s\-_\.]+/g, '') // Remove spaces, hyphens, underscores, dots
        .replace(/[^\w]/g, ''); // Remove any other non-word characters
    };
    
    for (const item of media) {
      const m = item.mediaId || item;
      const tags: string[] = Array.isArray(m.tags) 
        ? m.tags.map((t: string) => normalizeTag(t || ''))
        : [];
      
      if (selectedTagFilters.length > 0) {
        // Use OR logic (.some()) to match queue filtering behavior
        // Media should be included if it has ANY of the selected tags
        const normalizedSelectedTags = selectedTagFilters.map(t => normalizeTag(t));
        const ok = normalizedSelectedTags.some((selectedTag) => 
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
      // Show regular party media
      media = getPartyMedia().filter((item: any) => item.status === 'active');
    } else {
      // Show sorted media from the selected time period
      media = sortedMedia.filter((item: any) => item.status === 'active');
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
        
        // Check if ANY tag search term matches tags (case-insensitive with fuzzy matching)
        const matchesTagSearch = tagTerms.length === 0 || tagTerms.some(tagTerm => {
          // Normalize search term
          const normalizeTag = (tag: string) => {
            return tag.toLowerCase()
              .replace(/[\s\-_\.]+/g, '') // Remove spaces, hyphens, underscores, dots
              .replace(/[^\w]/g, ''); // Remove any other non-word characters
          };
          
          const normalizedSearchTag = normalizeTag(tagTerm);
          const tags = Array.isArray(mediaItem.tags) 
            ? mediaItem.tags.map((tag: any) => normalizeTag(tag))
            : [];
          
          return tags.some((tag: string) => tag === normalizedSearchTag);
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

  // Helper function to calculate average bid for media
  const calculateAverageBid = (mediaData: any) => {
    const bids = mediaData.bids || [];
    if (bids.length === 0) return 0;
    const total = bids.reduce((sum: number, bid: any) => sum + (bid.amount || 0), 0);
    return total / bids.length;
  };

  // Bid handling functions (OLD - using bid modal, now replaced with inline bidding)
  // const handleBidClick = (media: any) => {
  //   const mediaData = media.mediaId || media;
  //   setSelectedMedia(mediaData);
  //   setBidModalOpen(true);
  // };

  const handleInlineBid = async (media: any) => {
    if (!partyId) return;
    
    const mediaData = media.mediaId || media;
    const mediaId = mediaData._id || mediaData.id;
    const rawQueueBid = queueBidAmounts[mediaId] ?? '';
    const minBid = party?.minimumBid || 0.01;
    const bidAmount = parseFloat(rawQueueBid);

    if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
      toast.error(`Minimum bid is £${minBid.toFixed(2)}`);
      return;
    }
    
    setIsBidding(true);
    try {
      await partyAPI.placeBid(partyId, mediaId, bidAmount);
      toast.success(`Bid £${bidAmount.toFixed(2)} placed on ${mediaData.title}!`);
      
      // Refresh party to show updated bid values
      await fetchPartyDetails();
      
      // Reset bid amount for this media back to minimum
      setQueueBidAmounts(prev => ({
        ...prev,
        [mediaId]: Math.max(0.33, party?.minimumBid || 0.01).toFixed(2)
      }));
      
    } catch (error: any) {
      console.error('Bid error:', error);
      toast.error(error.response?.data?.error || 'Failed to place bid');
    } finally {
      setIsBidding(false);
    }
  };

  const handleVetoClick = async (media: any) => {
    const mediaData = media.mediaId || media;
    const mediaId = mediaData._id || mediaData.id || mediaData.uuid;
    const isAdmin = user?.role?.includes('admin');
    
    if (!isHost && !isAdmin) {
      toast.error('Only the host or admin can veto media');
      return;
    }

    try {
      const confirmationMessage = `Are you sure you want to veto "${mediaData.title || 'this media'}"? All bids will be refunded to users.`;
      if (!window.confirm(confirmationMessage)) return;

      const vetoReason = window.prompt('Optional: provide a reason for the veto (leave blank to skip).')?.trim();

      // Veto the media (sets status to 'vetoed' and refunds bids)
      await partyAPI.vetoMedia(partyId!, mediaId, vetoReason || undefined);
      toast.success('Media vetoed and bids refunded');
      
      // Refresh party data
      await fetchPartyDetails();
    } catch (error: any) {
      console.error('Error vetoing media:', error);
      toast.error(error.response?.data?.error || 'Failed to veto media');
    }
  };
  
  const handleUnvetoClick = async (media: any) => {
    if (!isHost) {
      toast.error('Only the host can restore media');
      return;
    }

    try {
      // Un-veto the media (restore to 'active' status)
      await partyAPI.unvetoMedia(partyId!, media._id || media.id);
      toast.success('Media restored to queue');
      
      // Refresh party data
      await fetchPartyDetails();
    } catch (error) {
      console.error('Error restoring media:', error);
      toast.error('Failed to restore media');
    }
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
      toast.success(`Bid of £${bidAmount.toFixed(2)} placed successfully!`);
      
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
      if (error.response?.data?.error === 'Insufficient funds') {
        toast.error(`Insufficient funds. You have £${error.response.data.currentBalance.toFixed(2)} but need £${error.response.data.requiredAmount.toFixed(2)}`);
      } else {
        toast.error(error.response?.data?.error || 'Failed to place bid');
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
    const mediaData = selectedTimePeriod === 'all-time' ? (item.mediaId || item) : item;
    
    // Clean and format the media for the webplayer
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
    
    const cleanedMedia = {
      id: mediaData._id || mediaData.id || mediaData.uuid,
      title: mediaData.title,
      artist: Array.isArray(mediaData.artist) ? mediaData.artist[0]?.name || 'Unknown Artist' : mediaData.artist,
      duration: mediaData.duration,
      coverArt: mediaData.coverArt,
      sources: sources,
      globalMediaAggregate: typeof mediaData.globalMediaAggregate === 'number' ? mediaData.globalMediaAggregate : 0,
      partyMediaAggregate: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0,
      totalBidValue: typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0,
      bids: mediaData.bids,
      addedBy: typeof mediaData.addedBy === 'object' ? mediaData.addedBy?.username || 'Unknown' : mediaData.addedBy
    };
    
    // Set the media in the webplayer and start playing
    setCurrentMedia(cleanedMedia, index, true); // true = autoplay
    
    toast.success(`Now playing: ${cleanedMedia.title}`);
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
    
    return media.reduce((total: number, item: any) => {
                        const mediaData = item.mediaId || item;
      const bidValue = mediaData.partyMediaAggregate || 0;
      return total + (typeof bidValue === 'number' ? bidValue : 0);
    }, 0);
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
      <div className=" justify-center text-center px-3 sm:px-6 py-4 sm:py-6">
       
                <h1 className="text-xl sm:text-3xl font-bold text-white">{party.name}</h1>
         
      </div>

      {/* Metrics Cards */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4">
        <div className="justify-center flex flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-purple-800/50 px-3 py-2 rounded-lg backdrop-blur-sm">
            <div className="flex items-center space-x-2">
              <Music className="h-6 w-6 text-white" />
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {getDisplayMedia().length}
                </div>
                <div className="text-xs sm:text-sm text-gray-300">
                  {selectedTimePeriod === 'all-time' ? 'Tunes' : `${selectedTimePeriod.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Queue`}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-purple-800/50 px-3 py-2 rounded-lg backdrop-blur-sm">
            <div className="flex items-center space-x-2">
              <Users className="h-6 w-6 text-white" />
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{party.partiers.length}</div>
                <div className="text-xs sm:text-sm text-gray-300">Partiers</div>
              </div>
            </div>
          </div>
          <div className="bg-purple-800/50 px-3 py-2 rounded-lg backdrop-blur-sm">
            <div className="flex items-center space-x-2">
              <Coins className="h-6 w-6 text-yellow-400" />
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{penceToPounds(calculateTotalBids())}</div>
                <div className="text-xs sm:text-sm text-gray-300">Total Bids</div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Tags + Top Supporters (two columns on desktop) */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Tags Cloud */}
          {topTags.length > 0 && (
            <div className="card p-3 md:p-6">
              <div className="flex items-center justify-between mb-1 md:mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Tag className="h-4 w-4 mr-2 text-purple-400" />
                  Top Tags
                </h3>
                {queueSearchTerms.some((t) => t.startsWith('#')) && (
                  <button
                    onClick={() => setQueueSearchTerms(queueSearchTerms.filter((t) => !t.startsWith('#')))}
                    className="text-sm text-purple-300 hover:text-white"
                  >
                    Clear tags
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {topTags.map(({ tag, total }) => {
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
                          : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                      }`}
                      title={`${penceToPounds(total)} total across queued tunes`}
                    >
                      #{tag}
                      <span className="ml-2 text-[10px] opacity-70">{penceToPounds(total)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Supporters */}
          <div className="card p-3 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2 md:mb-3">
              <h3 className="text-base md:text-lg font-semibold text-white">Top Supporters</h3>
              {selectedTagFilters.length > 0 ? (
                <span className="text-xs text-purple-300">Filtered by {selectedTagFilters.map((t) => `#${t}`).join(', ')}</span>
              ) : (
                <span className="text-xs text-gray-400">Showing global support</span>
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
          {/* Host Controls */}
         {isHost && (
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                {/* <button
                  onClick={() => setEndPartyModalOpen(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                >
                  <X className="h-4 w-4" />
                  <span>End Party</span>
                </button> */}
              </div>
            </div>
          )}
          
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

                {/* Inline Add Media Search Panel - Now Always Visible */}
                {!showVetoed && party && (
                  <div className="mb-6">
                    <div className="justify-center text-center rounded-lg p-3 sm:p-4 shadow-xl">
                      <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Search for Tunes to Add</h3>
                        
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
                            className="flex-1 bg-gray-900 border border-gray-600 rounded-xl p-2 sm:p-3 text-slate placeholder-gray-400 focus:outline-none focus:border-purple-500 text-sm sm:text-base"
                          />
                         
                        </div>
                        <div className="flex justify-center">
                        <button
                            onClick={handleAddMediaSearch}
                            disabled={isSearchingNewMedia || !addMediaSearchQuery.trim()}
                            className="flex p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
                          >
                            {isSearchingNewMedia ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              'Search'
                            )}
                          </button>
                          </div>

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
                                const mediaData = selectedTimePeriod === 'all-time' ? (item.mediaId || item) : item;
                                const isAdmin = user?.role?.includes('admin');
                                return (
                                  <div
                                    key={`queue-search-${mediaData.id || mediaData._id}-${index}`}
                                    className="card flex flex-col md:flex-row md:items-center hover:border-white relative p-1.5 md:p-4 pt-8 md:pt-4"
                                  >
                                    {/* Admin Veto Button - Top Right */}
                                    {isAdmin && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleVetoClick(item);
                                        }}
                                        className="absolute top-2 right-2 z-20 p-1 md:p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-md transition-colors shadow-lg"
                                        title="Veto this tune (Admin Only)"
                                      >
                                        <X className="h-3 w-3 md:h-4 md:w-4" />
                                      </button>
                                    )}
                                    
                                    {/* Mobile-only wrapper for thumbnail + details side by side */}
                                    <div className="flex flex-row md:contents items-start gap-2 mb-1 md:mb-0">
                                      {/* Media Thumbnail with Overlays */}
                                      <div 
                                        className="relative w-32 h-32 md:w-48 md:h-48 cursor-pointer group flex-shrink-0"
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
                                            {Array.isArray(mediaData.artist) ? mediaData.artist[0]?.name || 'Unknown Artist' : mediaData.artist || 'Unknown Artist'}
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
                                                  className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-full transition-colors no-underline"
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
                                            <div className="text-xs text-gray-300 tracking-wide">Total</div>
                                            <div className="text-xs md:text-lg text-gray-300">
                                              {penceToPounds(typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0)}
                                            </div>
                                          </div>
                                          <div className="text-center p-1 md:p-2">
                                            <div className="text-xs text-gray-300 tracking-wide">Avg Bid</div>
                                            <div className="text-xs md:text-lg text-gray-300">
                                              {penceToPounds(calculateAverageBid(mediaData))}
                                            </div>
                                          </div>
                                        </div>
                                        {/* Inline Bidding */}
                                        <div className="flex items-center space-x-1 md:space-x-2">
                                          <input
                                            type="number"
                                            step="0.01"
                                            min={party?.minimumBid || 0.01}
                                            value={queueBidAmounts[mediaData._id || mediaData.id] ?? (Math.max(0.33, party?.minimumBid || 0.01).toFixed(2))}
                                            onChange={(e) => setQueueBidAmounts({
                                              ...queueBidAmounts,
                                              [mediaData._id || mediaData.id]: e.target.value
                                            })}
                                            className="w-16 md:w-20 bg-gray-800 border border-gray-600 rounded px-1.5 md:px-2 py-1.5 md:py-2 text-gray text-xs md:text-sm"
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                          <button
                                            onClick={() => handleInlineBid(item)}
                                            disabled={isBidding}
                                            className="px-2 md:px-4 py-1.5 md:py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap"
                                          >
                                            {(() => {
                                              const defaultBid = Math.max(0.33, party?.minimumBid || 0.01);
                                              const raw = queueBidAmounts[mediaData._id || mediaData.id] ?? defaultBid.toFixed(2);
                                              const parsed = parseFloat(raw);
                                              if (!Number.isFinite(parsed)) {
                                                return 'Place Bid';
                                              }
                                              return `Bid £${parsed.toFixed(2)}`;
                                            })()}
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
                              {addMediaResults.database.map((media: any) => (
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
                                        <div className="flex items-center space-x-1 mt-1">
                                          <Clock className="h-3 w-3 text-gray-500" />
                                          <span className="text-gray-500 text-xs">{formatDuration(media.duration)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2 md:flex-shrink-0">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min={party?.minimumBid || 0.01}
                                      value={newMediaBidAmounts[media._id || media.id] ?? (Math.max(0.33, party?.minimumBid || 0.01).toFixed(2))}
                                      onChange={(e) => setNewMediaBidAmounts(prev => ({
                                        ...prev,
                                        [media._id || media.id]: e.target.value
                                      }))}
                                      className="w-20 md:w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray text-sm"
                                    />
                                    <button
                                      onClick={() => handleAddMediaToParty(media)}
                                      className="z-999 px-3 md:px-4 py-2 bg-purple-600 text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap"
                                    >
                                      {(() => {
                                        const defaultBid = Math.max(0.33, party?.minimumBid || 0.01);
                                        const raw = newMediaBidAmounts[media._id || media.id] ?? defaultBid.toFixed(2);
                                        const parsed = parseFloat(raw);
                                        if (!Number.isFinite(parsed)) {
                                          return 'Add';
                                        }
                                        return `Add £${parsed.toFixed(2)}`;
                                      })()}
                                    </button>
                                  </div>
                                </div>
                              ))}
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
                              {addMediaResults.youtube.map((media: any) => (
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
                                        <div className="flex items-center space-x-1 mt-1">
                                          <Clock className="h-3 w-3 text-gray-500" />
                                          <span className="text-gray-500 text-xs">{formatDuration(media.duration)}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2 md:flex-shrink-0">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min={party?.minimumBid || 0.01}
                                      value={newMediaBidAmounts[media._id || media.id] ?? (Math.max(0.33, party?.minimumBid || 0.01).toFixed(2))}
                                      onChange={(e) => setNewMediaBidAmounts(prev => ({
                                        ...prev,
                                        [media._id || media.id]: e.target.value
                                      }))}
                                      className="w-20 md:w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray text-sm"
                                    />
                                    <button
                                      onClick={() => handleAddMediaToParty(media)}
                                      className="flex px-3 md:px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap"
                                    >
                                      {(() => {
                                        const defaultBid = Math.max(0.33, party?.minimumBid || 0.01);
                                        const raw = newMediaBidAmounts[media._id || media.id] ?? defaultBid.toFixed(2);
                                        const parsed = parseFloat(raw);
                                        if (!Number.isFinite(parsed)) {
                                          return 'Add';
                                        }
                                        return `Add £${parsed.toFixed(2)}`;
                                      })()}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            {/* Show More Button for YouTube */}
                            {youtubeNextPageToken && (
                              <div className="mt-8 text-center">
                                <button
                                  onClick={handleLoadMoreYouTube}
                                  disabled={isLoadingMoreYouTube}
                                  className="p-3 bg-red-700 hover:bg-red-800 disabled:bg-gray-600 disabled:cursor-not-allowed text-gray rounded-lg font-medium transition-colors"
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
                      </div>
                  </div>
                )}

                {/* Sorting Tabs - Only show for Queue, not Vetoed */}
                {!showVetoed && (
                  <div className="mb-6">
                    <h3 className="text-base sm:text-lg font-semibold text-white text-center mb-3 p-2">Sort by Time</h3>
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
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {period.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
                        const mediaData = selectedTimePeriod === 'all-time' ? (item.mediaId || item) : item;
                        const isAdmin = user?.role?.includes('admin');
                        return (
                          <div
                            key={`queued-${mediaData.id}-${index}`}
                            className="card flex flex-col md:flex-row md:items-center hover:border-white relative p-1.5 md:p-4 pt-8"
                          >
                            {/* Admin Veto Button - Top Right */}
                            {isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleVetoClick(item);
                                }}
                                className="absolute top-2 right-2 z-20 p-1 md:p-1.5 border hover:bg-red-600 text-white rounded-md transition-colors shadow-lg"
                                title="Veto this tune (Admin Only)"
                              >
                                <X className="h-2 w-2 md:h-4 md:w-4" />
                              </button>
                            )}
                            
                            {/* Queue Number Badge - Centered at top on mobile, Left Gutter on desktop */}
                            <div className="absolute left-1/2 -translate-x-1/2 md:-left-12 md:translate-x-0 md:-left-12 top-2 md:top-1/2 md:-translate-y-1/2 w-5 h-5 md:w-8 md:h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-lg z-10">
                              <span className="text-white font-bold text-[10px] md:text-sm">{index + 1}</span>
                            </div>
                            
                            {/* Mobile-only wrapper for thumbnail + details side by side */}
                            <div className="flex flex-row md:contents items-start gap-2 mb-1 md:mb-0">
                              {/* Media Thumbnail with Overlays */}
                              <div 
                                className="relative w-32 h-32 md:w-48 md:h-48 cursor-pointer group flex-shrink-0"
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
                                    {Array.isArray(mediaData.artist) ? mediaData.artist[0]?.name || 'Unknown Artist' : mediaData.artist || 'Unknown Artist'}
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
                                          className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] md:text-sm rounded-full transition-colors no-underline"
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
                                <div className="flex flex-row md:flex-col items-center md:items-end space-x-2 md:space-x-0 md:space-y-1 bg-slate-900/20 px-1 py-1 md:px-2 md:py-2 rounded-lg">
                                  <div className="text-center p-1 md:p-2">
                                    <div className="text-[9px] md:text-xs text-gray-300 tracking-wide">Total</div>
                                    <div className="text-[9px] md:text-xs md:text-lg text-gray-300">
                                      {penceToPounds(typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0)}
                                    </div>
                                  </div>
                                  <div className="text-center p-1 md:p-2">
                                    <div className="text-[9px] md:text-xs text-gray-300 tracking-wide">Avg Bid</div>
                                    <div className="text-[9px] md:text-xs md:text-lg text-gray-300">
                                      {penceToPounds(calculateAverageBid(mediaData))}
                                    </div>
                                  </div>
                                </div>
                                {/* Inline Bidding */}
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={party?.minimumBid || 0.01}
                                    value={queueBidAmounts[mediaData._id || mediaData.id] ?? (Math.max(0.33, party?.minimumBid || 0.01).toFixed(2))}
                                    onChange={(e) => setQueueBidAmounts({
                                      ...queueBidAmounts,
                                      [mediaData._id || mediaData.id]: e.target.value
                                    })}
                                    className="w-16 md:w-20 bg-gray-800 border border-gray-600 rounded px-1.5 md:px-2 py-1.5 md:py-2 text-gray text-xs md:text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    onClick={() => handleInlineBid(item)}
                                    disabled={isBidding}
                                    className="px-2 md:px-4 py-1.5 md:py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap"
                                  >
                                    {(() => {
                                      const defaultBid = Math.max(0.33, party?.minimumBid || 0.01);
                                      const raw = queueBidAmounts[mediaData._id || mediaData.id] ?? defaultBid.toFixed(2);
                                      const parsed = parseFloat(raw);
                                      if (!Number.isFinite(parsed)) {
                                        return 'Place Bid';
                                      }
                                      return `Bid £${parsed.toFixed(2)}`;
                                    })()}
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
                    {getPartyMedia().filter((item: any) => item.status === 'vetoed').length === 0 ? (
                      <div className="text-center py-8">
                        <X className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No vetoed songs</p>
                      </div>
                    ) : (
                      getPartyMedia()
                        .filter((item: any) => item.status === 'vetoed')
                        .map((item: any, index: number) => {
                          const mediaData = item.mediaId || item;
                          return (
                            <div
                              key={`vetoed-${mediaData.id}-${index}`}
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
                                    {Array.isArray(mediaData.artist) ? mediaData.artist[0]?.name || 'Unknown Artist' : mediaData.artist || 'Unknown Artist'}
                                  </span>
                                  <div className="flex items-center space-x-1 ml-2">
                                    <Clock className="h-4 w-4 text-gray-400" />
                                    <span className="text-sm text-gray-300">{formatDuration(mediaData.duration)}</span>
                                  </div>
                                </div>
                                <div className="mt-2">
                                  <p className="text-xs text-red-400">
                                    Vetoed {item.vetoedAt ? new Date(item.vetoedAt).toLocaleString() : 'recently'}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Restore Button - Host only */}
                              {isHost && (
                                <div className="flex flex-col space-y-2">
                                  <button
                                    onClick={() => handleUnvetoClick(item)}
                                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
                                  >
                                    <span>Restore</span>
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
                            src={mediaData.coverArt || '/default-cover.jpg'}
                            alt={mediaData.title || 'Unknown Media'}
                            className="w-10 h-10 rounded object-cover"
                            width="40"
                            height="40"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-300 text-sm truncate">{mediaData.title || 'Unknown Media'}</h4>
                            <p className="text-xs text-gray-500 truncate">{Array.isArray(mediaData.artist) ? mediaData.artist[0]?.name || 'Unknown Artist' : mediaData.artist || 'Unknown Artist'}</p>
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
          {/* Partiers - COMMENTED OUT FOR NOW */}
          {/* 
          <div className="card">
            <h3 className="text-lg font-semibold text-white mb-4">Partiers</h3>
            <div className="space-y-2">
              {party.partiers.map((partier: any, index: number) => {
                const hostId = typeof party.host === 'string' ? party.host : party.host?.uuid;
                const partierId = partier.uuid || partier.id;
                return (
                  <div key={`${partierId}-${index}`} className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-primary-600">
                        {partier.username?.charAt(0).toUpperCase() || '?'}
                      </span>
                    </div>
                    <span className="p-2 text-sm text-white">{partier.username || 'Unknown User'}</span>
                    {partierId === hostId && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        Host
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          */}

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

      {/* Footer */}
      <div className="bg-gray-800 border-t border-gray-700 mt-12">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4">
          <div className="flex items-center justify-center text-gray-400 text-xs sm:text-sm">
            <span>6,968 songs • 35.5 days • 105.72 GB</span>
          </div>
        </div>
      </div>

      {/* Tag Input Modal */}
      <TagInputModal
        isOpen={showTagModal}
        onClose={() => {
          setShowTagModal(false);
          setPendingMedia(null);
        }}
        onSubmit={handleTagSubmit}
        mediaTitle={pendingMedia?.title}
        mediaArtist={pendingMedia?.artist}
      />

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
    </div>
  );
};

export default Party;
