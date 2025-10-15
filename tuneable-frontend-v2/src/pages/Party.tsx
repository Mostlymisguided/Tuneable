import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { usePlayerWarning } from '../hooks/usePlayerWarning';
import { partyAPI, searchAPI } from '../lib/api';
import { toast } from 'react-toastify';
import BidModal from '../components/BidModal';
import PartyQueueSearch from '../components/PartyQueueSearch';
import PlayerWarningModal from '../components/PlayerWarningModal';
import TopBidders from '../components/TopBidders';
import '../types/youtube'; // Import YouTube types
import { Play, CheckCircle, X, Music, Users, Clock, Plus, Copy, Share2, Coins, SkipForward, SkipBack, Loader2, Youtube } from 'lucide-react';

// Define types directly to avoid import issues
interface PartySong {
  _id: string;
  title: string;
  artist: string;
  coverArt?: string;
  duration?: number;
  sources?: {
    youtube?: string;
    spotify?: string;
    spotifyId?: string;
    spotifyUrl?: string;
  };
  globalMediaAggregate?: number; // Updated to schema grammar
  bids?: any[];
  addedBy: string;
  tags?: string[];
  category?: string;
  [key: string]: any; // Allow additional properties
}


interface WebSocketMessage {
  type: 'JOIN' | 'UPDATE_QUEUE' | 'PLAY' | 'PAUSE' | 'SKIP' | 'TRANSITION_SONG' | 'SET_HOST' | 'PLAY_NEXT' | 'SONG_STARTED' | 'SONG_COMPLETED' | 'SONG_VETOED' | 'PARTY_ENDED';
  partyId?: string;
  userId?: string;
  queue?: PartySong[];
  song?: PartySong;
  songId?: string;
  playedAt?: string;
  completedAt?: string;
  vetoedAt?: string;
  vetoedBy?: string;
  endedAt?: string;
}

const Party: React.FC = () => {
  const { partyId } = useParams<{ partyId: string }>();
  const { user, updateBalance } = useAuth();
  const navigate = useNavigate();
  const [party, setParty] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Bid modal state
  const [bidModalOpen, setBidModalOpen] = useState(false);
  const [selectedSong, setSelectedSong] = useState<any>(null);
  const [isBidding, setIsBidding] = useState(false);

  // End party modal state
  const [endPartyModalOpen, setEndPartyModalOpen] = useState(false);
  const [isEndingParty, setIsEndingParty] = useState(false);

  // Sorting state
  const [selectedTimePeriod, setSelectedTimePeriod] = useState('all-time');
  const [sortedSongs, setSortedSongs] = useState<any[]>([]);
  const [isLoadingSortedSongs, setIsLoadingSortedSongs] = useState(false);
  
  // Search state
  const [queueSearchTerms, setQueueSearchTerms] = useState<string[]>([]);
  
  // Inline add song search state
  const [showAddSongPanel, setShowAddSongPanel] = useState(false);
  const [addSongSearchQuery, setAddSongSearchQuery] = useState('');
  const [addSongResults, setAddSongResults] = useState<{
    database: any[];
    youtube: any[];
  }>({ database: [], youtube: [] });
  const [isSearchingNewSongs, setIsSearchingNewSongs] = useState(false);
  const [isLoadingMoreYouTube, setIsLoadingMoreYouTube] = useState(false);
  const [youtubeNextPageToken, setYoutubeNextPageToken] = useState<string | null>(null);
  const [newSongBidAmounts, setNewSongBidAmounts] = useState<Record<string, number>>({});
  
  // Queue bidding state (for inline bidding on queue items)
  const [queueBidAmounts, setQueueBidAmounts] = useState<Record<string, number>>({});
  
  const [showVetoed, setShowVetoed] = useState(false);

  // Player warning system
  const { showWarning, isWarningOpen, warningAction, onConfirm, onCancel, currentSongTitle, currentSongArtist } = usePlayerWarning();

  // Function to scroll to webplayer
  const scrollToWebPlayer = () => {
    // Scroll to the bottom of the page where the webplayer is located
    window.scrollTo({ 
      top: document.documentElement.scrollHeight, 
      behavior: 'smooth' 
    });
  };

  // Use global WebPlayer store
  const {
    setCurrentSong,
    isHost,
    setIsHost,
    setQueue,
    setWebSocketSender,
    setCurrentPartyId,
    setGlobalPlayerActive,
    currentPartyId,
    currentSong,
  } = useWebPlayerStore();

  // Only use WebSocket for live parties
  // NOTE: WebSocket functionality is for future live jukebox feature
  // MVP focuses on remote parties only, so this is disabled (shouldUseWebSocket = false)
  const shouldUseWebSocket = party?.type === 'live';
  
  const { sendMessage } = useWebSocket({
    partyId: partyId || '',
    userId: user?.id,
    enabled: shouldUseWebSocket,
    onMessage: (message: WebSocketMessage) => {
      console.log('WebSocket message received:', message);
      
      switch (message.type) {
        case 'UPDATE_QUEUE':
          if (message.queue) {
            setParty((prev: any) => prev ? { ...prev, songs: message.queue! } : null);
            
            // Note: WebSocket UPDATE_QUEUE messages don't contain song status information,
            // so we don't update the global player queue here. The queue is managed
            // by the party data from the API calls which include proper status information.
            console.log('WebSocket UPDATE_QUEUE received but not updating global queue (no status info)');
          }
          break;
        case 'PLAY':
        case 'PAUSE':
        case 'SKIP':
        case 'PLAY_NEXT':
          // Global store will handle these
          break;
          
        case 'SONG_STARTED':
          console.log('WebSocket SONG_STARTED received');
          if (message.songId) {
            setParty((prev: any) => {
              if (!prev) return null;
              return {
                ...prev,
                songs: prev.songs.map((song: any) => {
                  const songData = song.songId || song;
                  if (songData.id === message.songId) {
                    return {
                      ...song,
                      status: 'playing',
                      playedAt: message.playedAt || new Date()
                    };
                  }
                  // Mark other playing songs as queued
                  if (song.status === 'playing') {
                    return { ...song, status: 'queued' };
                  }
                  return song;
                })
              };
            });
          }
          break;
          
        case 'SONG_COMPLETED':
          console.log('WebSocket SONG_COMPLETED received for songId:', message.songId);
          if (message.songId) {
            setParty((prev: any) => {
              if (!prev) return null;
              console.log('Updating party state for completed song:', message.songId);
              return {
                ...prev,
                songs: prev.songs.map((song: any) => {
                  const songData = song.songId || song;
                  if (songData.id === message.songId) {
                    console.log('Found song to mark as played:', songData.title);
                    return {
                      ...song,
                      status: 'played',
                      completedAt: message.completedAt || new Date()
                    };
                  }
                  return song;
                })
              };
            });
          }
          break;
          
        case 'SONG_VETOED':
          console.log('WebSocket SONG_VETOED received');
          if (message.songId) {
            setParty((prev: any) => {
              if (!prev) return null;
              return {
                ...prev,
                songs: prev.songs.map((song: any) => {
                  const songData = song.songId || song;
                  if (songData.id === message.songId) {
                    return {
                      ...song,
                      status: 'vetoed',
                      vetoedAt: message.vetoedAt || new Date(),
                      vetoedBy: message.vetoedBy
                    };
                  }
                  return song;
                })
              };
            });
          }
          break;
          
        case 'PARTY_ENDED':
          console.log('WebSocket PARTY_ENDED received');
          toast.info('This party has been ended by the host');
          // Redirect to parties list after a short delay
          setTimeout(() => {
            navigate('/parties');
          }, 2000);
          break;
      }
    },
    onConnect: () => {
      console.log('WebSocket connected');
      // Set up WebSocket sender in global store
      setWebSocketSender(sendMessage);
    },
    onDisconnect: () => {
      console.log('WebSocket disconnected');
    }
  });

  useEffect(() => {
    if (partyId) {
      fetchPartyDetails();
      fetchSortedSongs(selectedTimePeriod);
    }
  }, [partyId]);

  // Manual refresh only for remote parties (no automatic polling)
  // Remote parties will refresh on user actions (bids, adds, skips) and manual refresh button

  // Set current song and host status when party loads
  useEffect(() => {
    console.log('Party useEffect triggered - party:', !!party, 'songs:', party?.songs?.length, 'currentPartyId:', currentPartyId, 'partyId:', partyId);
    
    if (party && getPartyMedia().length > 0) {
      // Always update the global player queue when party data loads
      // This ensures the queue is updated even if it's the "same" party (e.g., on page reload)
      console.log('Updating global player queue for party:', partyId);
        
        // Filter to only include queued songs for the WebPlayer
        const queuedSongs = getPartyMedia().filter((song: any) => song.status === 'queued');
        console.log('Queued songs for WebPlayer:', queuedSongs.length);
        console.log('All party songs statuses:', getPartyMedia().map((s: any) => ({ title: s.songId?.title || s.mediaId?.title, status: s.status })));
        
        // Clean and set the queue in global store
        const cleanedQueue = queuedSongs.map((song: any) => {
          const actualSong = song.songId || song;
          let sources = {};
          
          if (actualSong.sources) {
            if (Array.isArray(actualSong.sources)) {
              for (const source of actualSong.sources) {
                if (source && source.platform === '$__parent' && source.url && source.url.sources) {
                  // Handle Mongoose metadata corruption
                  sources = source.url.sources;
                  break;
                } else if (source && source.platform === 'youtube' && source.url) {
                  (sources as any).youtube = source.url;
                } else if (source && source.platform === 'spotify' && source.url) {
                  (sources as any).spotify = source.url;
                } else if (source?.youtube) {
                  (sources as any).youtube = source.youtube;
                } else if (source?.spotify) {
                  (sources as any).spotify = source.spotify;
                }
              }
            } else if (typeof actualSong.sources === 'object') {
              // Preserve the original sources object
              sources = actualSong.sources;
            }
          }
          
          return {
            id: actualSong.id || actualSong.uuid || actualSong._id, // Prefer UUID for external API
            title: actualSong.title,
            artist: Array.isArray(actualSong.artist) ? actualSong.artist[0]?.name || 'Unknown Artist' : actualSong.artist,
            duration: actualSong.duration,
            coverArt: actualSong.coverArt,
            sources: sources,
            globalMediaAggregate: typeof actualSong.globalMediaAggregate === 'number' ? actualSong.globalMediaAggregate : 0,
            partyMediaAggregate: typeof song.partyMediaAggregate === 'number' ? song.partyMediaAggregate : 0,
            totalBidValue: typeof song.partyMediaAggregate === 'number' ? song.partyMediaAggregate : 0, // Use partyMediaAggregate as totalBidValue
            bids: actualSong.bids,
            addedBy: typeof actualSong.addedBy === 'object' ? actualSong.addedBy?.username || 'Unknown' : actualSong.addedBy
          };
        });
        
        setQueue(cleanedQueue);
        setCurrentPartyId(partyId!);
        setGlobalPlayerActive(true);
        
      if (cleanedQueue.length > 0) {
        console.log('Setting current song to:', cleanedQueue[0].title);
        setCurrentSong(cleanedQueue[0], 0, true); // Auto-play for jukebox experience
      } else {
        // If no queued songs, clear the current song to stop the WebPlayer
        console.log('No queued songs, clearing WebPlayer');
        setCurrentSong(null, 0);
      }
    }
    
    if (user && party) {
      // Use UUID comparison for consistency
      // Now that backend populates host.uuid, we can directly access it
      const hostUuid = typeof party.host === 'object' && party.host.uuid 
                       ? party.host.uuid 
                       : party.host;
      const userUuid = user.id || (user as any).uuid;
      const checkIsHost = userUuid === hostUuid;
      setIsHost(checkIsHost);
      console.log('🔍 isHost check:', { userUuid, hostUuid, isHost: checkIsHost, partyHost: party.host });
    }
  }, [party, user, partyId, currentPartyId, setQueue, setCurrentSong, setIsHost, setCurrentPartyId, setGlobalPlayerActive]);

  // Update WebPlayer queue when sorting changes
  useEffect(() => {
    if (party && selectedTimePeriod !== 'all-time' && sortedSongs.length > 0) {
      // Update the global player queue with sorted songs
      const queuedSortedSongs = sortedSongs.filter((song: any) => song.status === 'queued');
      console.log('Updating WebPlayer queue with sorted songs:', queuedSortedSongs.length);
      
      // Clean and set the queue in global store
      const cleanedQueue = queuedSortedSongs.map((song: any) => {
        let sources = {};
        
        if (song.sources) {
          if (Array.isArray(song.sources)) {
            for (const source of song.sources) {
              if (source && source.platform === 'youtube' && source.url) {
                (sources as any).youtube = source.url;
              } else if (source && source.platform === 'spotify' && source.url) {
                (sources as any).spotify = source.url;
              }
            }
          } else if (typeof song.sources === 'object') {
            sources = song.sources;
          }
        }
        
        return {
          id: song.id || song.uuid || song._id, // Prefer UUID for external API
          title: song.title,
          artist: Array.isArray(song.artist) ? song.artist[0]?.name || 'Unknown Artist' : song.artist,
          duration: song.duration,
          coverArt: song.coverArt,
          sources: sources,
          globalMediaAggregate: typeof song.globalMediaAggregate === 'number' ? song.globalMediaAggregate : 0,
          partyMediaAggregate: typeof song.partyMediaAggregate === 'number' ? song.partyMediaAggregate : 0,
          totalBidValue: typeof song.partyMediaAggregate === 'number' ? song.partyMediaAggregate : 0, // Use partyMediaAggregate as totalBidValue
          bids: song.bids,
          addedBy: typeof song.addedBy === 'object' ? song.addedBy?.username || 'Unknown' : song.addedBy
        };
      });
      
      setQueue(cleanedQueue);
      
      // If there are songs and no current song, set the first one
      if (cleanedQueue.length > 0 && !currentSong) {
        setCurrentSong(cleanedQueue[0], 0, true);
      }
    }
  }, [sortedSongs, selectedTimePeriod, party, setQueue, setCurrentSong, currentSong]);

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
      
      // Note: Song setting is now handled by the useEffect hook
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

  const copyPartyCode = () => {
    if (party?.partyCode) {
      navigator.clipboard.writeText(party.partyCode);
      toast.success('Party code copied to clipboard!');
    }
  };

  const shareParty = () => {
    if (navigator.share) {
      navigator.share({
        title: party?.name,
        text: `Join my party: ${party?.name}`,
        url: window.location.href,
      });
    } else {
      copyPartyCode();
    }
  };

  // Sorting functions
  const fetchSortedSongs = async (timePeriod: string) => {
    if (!partyId) return;
    
    setIsLoadingSortedSongs(true);
    try {
      const response = await partyAPI.getSongsSortedByTime(partyId, timePeriod);
      setSortedSongs(response.songs);
    } catch (error) {
      console.error('Error fetching sorted songs:', error);
      toast.error('Failed to load sorted songs');
    } finally {
      setIsLoadingSortedSongs(false);
    }
  };

  const handleTimePeriodChange = (timePeriod: string) => {
    setSelectedTimePeriod(timePeriod);
    fetchSortedSongs(timePeriod);
  };

  // Inline add song search functions
  const handleAddSongSearch = async () => {
    if (!addSongSearchQuery.trim()) return;
    
    setIsSearchingNewSongs(true);
    try {
      const musicSource = party?.musicSource || 'youtube';
      
      // Search local database first
      console.log('🔍 Searching for new songs:', addSongSearchQuery);
      const response = await searchAPI.search(addSongSearchQuery, musicSource);
      
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
        const youtubeResponse = await searchAPI.search(addSongSearchQuery, musicSource, undefined, undefined, true);
        if (youtubeResponse.videos) {
          youtubeResults = youtubeResponse.videos;
          setYoutubeNextPageToken(youtubeResponse.nextPageToken || null);
          console.log(`🎥 Found ${youtubeResults.length} YouTube results`);
        }
      } else if (response.source === 'external') {
        // Track next page token for YouTube results
        setYoutubeNextPageToken(response.nextPageToken || null);
      }
      
      setAddSongResults({ database: databaseResults, youtube: youtubeResults });
      
      // Initialize bid amounts for results
      const minBid = party?.minimumBid || 0.33;
      const newBidAmounts: Record<string, number> = {};
      [...databaseResults, ...youtubeResults].forEach(song => {
        newBidAmounts[song.id] = minBid;
      });
      setNewSongBidAmounts(newBidAmounts);
      
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed. Please try again.');
    } finally {
      setIsSearchingNewSongs(false);
    }
  };

  const handleLoadMoreYouTube = async () => {
    if (!youtubeNextPageToken || !addSongSearchQuery) return;
    
    setIsLoadingMoreYouTube(true);
    try {
      const musicSource = party?.musicSource || 'youtube';
      const response = await searchAPI.search(addSongSearchQuery, musicSource, youtubeNextPageToken, undefined, true);
      
      if (response.videos) {
        // Append new results to existing YouTube results
        setAddSongResults(prev => ({
          ...prev,
          youtube: [...prev.youtube, ...response.videos]
        }));
        
        setYoutubeNextPageToken(response.nextPageToken || null);
        
        // Initialize bid amounts for new results
        const minBid = party?.minimumBid || 0.33;
        const newBidAmounts: Record<string, number> = { ...newSongBidAmounts };
        response.videos.forEach((song: any) => {
          if (!newBidAmounts[song.id]) {
            newBidAmounts[song.id] = minBid;
          }
        });
        setNewSongBidAmounts(newBidAmounts);
        
        console.log(`✅ Loaded ${response.videos.length} more YouTube results`);
      }
    } catch (error) {
      console.error('Error loading more YouTube results:', error);
      toast.error('Failed to load more results');
    } finally {
      setIsLoadingMoreYouTube(false);
    }
  };

  const handleAddSongToParty = async (song: any) => {
    if (!partyId) return;
    
    const bidAmount = newSongBidAmounts[song.id] || party?.minimumBid || 0.33;
    
    try {
      // Get the appropriate URL based on music source
      const musicSource = party?.musicSource || 'youtube';
      let url = '';
      
      if (musicSource === 'youtube' && song.sources?.youtube) {
        url = song.sources.youtube;
      } else if (musicSource === 'spotify' && song.sources?.spotify) {
        url = song.sources.spotify;
      } else if (song.sources) {
        // Fallback to first available source
        url = Object.values(song.sources)[0] as string;
      }
      
      await partyAPI.addMediaToParty(partyId, {
        url,
        title: song.title,
        artist: song.artist,
        bidAmount,
        platform: musicSource,
        duration: song.duration,
        tags: song.tags || [],
        category: song.category || 'Music'
      });
      
      toast.success(`Added ${song.title} to party with £${bidAmount.toFixed(2)} bid!`);
      
      // Close search panel and refresh party
      setShowAddSongPanel(false);
      setAddSongSearchQuery('');
      setAddSongResults({ database: [], youtube: [] });
      fetchPartyDetails();
      
    } catch (error: any) {
      console.error('Error adding song:', error);
      toast.error(error.response?.data?.error || 'Failed to add song to party');
    }
  };

  // Helper to get media items (support both old songs and new media)
  const getPartyMedia = () => {
    // Use media if available, fall back to songs for backward compatibility
    return party.media || party.songs || [];
  };

  // Get songs to display based on selected time period and search terms
  const getDisplaySongs = () => {
    let songs;
    if (selectedTimePeriod === 'all-time') {
      // Show regular party media
      songs = getPartyMedia().filter((item: any) => item.status === 'queued');
    } else {
      // Show sorted songs from the selected time period
      songs = sortedSongs.filter((song: any) => song.status === 'queued');
    }
    
    // Apply search filter if search terms exist
    if (queueSearchTerms.length > 0) {
      songs = songs.filter((item: any) => {
        const media = item.mediaId || item.songId || item;
        
        // Check if ANY search term matches title, artist, tags, or category
        return queueSearchTerms.some(term => {
          const lowerTerm = term.toLowerCase();
          const title = (media.title || '').toLowerCase();
          const artist = Array.isArray(media.artist) 
            ? media.artist.map((a: any) => a.name || a).join(' ').toLowerCase()
            : (media.artist || '').toLowerCase();
          const tags = Array.isArray(media.tags) 
            ? media.tags.join(' ').toLowerCase() 
            : '';
          const category = (media.category || '').toLowerCase();
          
          return title.includes(lowerTerm) || 
                 artist.includes(lowerTerm) || 
                 tags.includes(lowerTerm) ||
                 category.includes(lowerTerm);
        });
      });
      
      console.log(`🔍 Filtered queue: ${songs.length} songs match search terms:`, queueSearchTerms);
    }
    
    return songs;
  };

  // Helper function to calculate average bid for a song
  const calculateAverageBid = (songData: any) => {
    const bids = songData.bids || [];
    if (bids.length === 0) return 0;
    const total = bids.reduce((sum: number, bid: any) => sum + (bid.amount || 0), 0);
    return total / bids.length;
  };

  // Bid handling functions (OLD - using bid modal, now replaced with inline bidding)
  // const handleBidClick = (song: any) => {
  //   const songData = song.mediaId || song.songId || song;
  //   setSelectedSong(songData);
  //   setBidModalOpen(true);
  // };

  const handleInlineBid = async (song: any) => {
    if (!partyId) return;
    
    const songData = song.mediaId || song.songId || song;
    const songId = songData._id || songData.id;
    const bidAmount = queueBidAmounts[songId] || party?.minimumBid || 0.33;
    
    setIsBidding(true);
    try {
      await partyAPI.placeBid(partyId, songId, bidAmount);
      toast.success(`Bid £${bidAmount.toFixed(2)} placed on ${songData.title}!`);
      
      // Refresh party to show updated bid values
      await fetchPartyDetails();
      
      // Reset bid amount for this song back to minimum
      setQueueBidAmounts(prev => ({
        ...prev,
        [songId]: party?.minimumBid || 0.33
      }));
      
    } catch (error: any) {
      console.error('Bid error:', error);
      toast.error(error.response?.data?.error || 'Failed to place bid');
    } finally {
      setIsBidding(false);
    }
  };

  const handleVetoClick = async (song: any) => {
    if (!isHost) {
      toast.error('Only the host can veto songs');
      return;
    }

    try {
      // Veto the song (sets status to 'vetoed')
      await partyAPI.vetoSong(partyId!, song.id);
      toast.success('Song vetoed');
      
      // Refresh party data
      await fetchPartyDetails();
    } catch (error) {
      console.error('Error vetoing song:', error);
      toast.error('Failed to veto song');
    }
  };
  
  const handleUnvetoClick = async (song: any) => {
    if (!isHost) {
      toast.error('Only the host can restore songs');
      return;
    }

    try {
      // Un-veto the song (restore to 'queued' status)
      await partyAPI.unvetoSong(partyId!, song.id);
      toast.success('Song restored to queue');
      
      // Refresh party data
      await fetchPartyDetails();
    } catch (error) {
      console.error('Error restoring song:', error);
      toast.error('Failed to restore song');
    }
  };


  // OLD - Reset Songs function (commented out as button was removed)
  // const handleResetSongs = async () => {
  //   if (!isHost) {
  //     toast.error('Only the host can reset songs');
  //     return;
  //   }
  //   const confirmed = window.confirm('Are you sure you want to reset all songs to queued status? This will clear all play history.');
  //   if (!confirmed) return;
  //   try {
  //     await partyAPI.resetSongs(partyId!);
  //     toast.success('All songs reset to queued status');
  //     fetchParty();
  //   } catch (error: any) {
  //     console.error('Error resetting songs:', error);
  //     toast.error(error.response?.data?.error || 'Failed to reset songs');
  //   }
  // };

  const handleBidConfirm = async (bidAmount: number) => {
    if (!selectedSong || !partyId) return;

    setIsBidding(true);
    try {
      // Get the media/song ID - try various ID fields
      const mediaId = selectedSong.uuid || selectedSong.id || selectedSong._id;
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
      
      // Refresh sorted songs if viewing a time-filtered period
      if (selectedTimePeriod !== 'all-time') {
        await fetchSortedSongs(selectedTimePeriod);
      }
      
      setBidModalOpen(false);
      setSelectedSong(null);
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
    setSelectedSong(null);
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

  const handleSkipNext = async () => {
    if (!partyId) return;
    
    try {
      await partyAPI.skipNext(partyId);
      toast.success('Skipped to next song');
      // Refresh party data to show updated queue
      await fetchPartyDetails();
    } catch (error: any) {
      console.error('Error skipping to next song:', error);
      toast.error(error.response?.data?.error || 'Failed to skip to next song');
    }
  };

  const handleSkipPrevious = async () => {
    if (!partyId) return;
    
    try {
      await partyAPI.skipPrevious(partyId);
      toast.success('Skipped to previous song');
      // Refresh party data to show updated queue
      await fetchPartyDetails();
    } catch (error: any) {
      console.error('Error skipping to previous song:', error);
      toast.error(error.response?.data?.error || 'Failed to skip to previous song');
    }
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
      const mediaData = item.mediaId || item.songId || item;
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
    <div className="min-h-screen">
      {/* Party Header */}
      <div className="px-3 sm:px-6 py-4 sm:py-6">
        <div className="card max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="flex items-center space-x-4 mb-4 sm:mb-0">
              <div>
                <h1 className="mb-2 text-xl sm:text-3xl font-bold text-white">{party.name}</h1>
                <div className="p-1 flex items-center space-x-4 mt-1">
                  <span className="text-gray-300 text-sm sm:text-xl">
                    {party.location}
                  </span>
                </div>
                <div className="mt-2 mb-2">
                  <span className="text-gray-400 text-sm sm:text-lg">
                    Host: {typeof party.host === 'object' && party.host.username ? party.host.username : 'Unknown Host'}
                  </span>
                </div>
                <div className="mt-4">
                  <span className="px-2 py-2 text-white text-xs font-medium rounded-full" style={{backgroundColor: 'rgba(5, 150, 105, 0.5)'}}>
                    {party.status}
                  </span>
                  </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <button
                onClick={copyPartyCode}
                className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition-colors"
              >
                <Copy className="h-4 w-4" />
                <span className="text-sm sm:text-base">{party.partyCode}</span>
              </button>
              <button
                onClick={shareParty}
                className="flex items-center justify-center space-x-2 px-3 sm:px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition-colors"
              >
                <Share2 className="h-4 w-4" />
                <span className="text-sm sm:text-base">Share</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <div className="justify-center flex flex-wrap gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-purple-800/50 border border-gray-600 p-3 sm:p-4 rounded-lg backdrop-blur-sm">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <Music className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {getDisplaySongs().length}
                </div>
                <div className="text-xs sm:text-sm text-gray-300">
                  {selectedTimePeriod === 'all-time' ? 'Tunes' : `${selectedTimePeriod.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} Queue`}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-purple-800/50 border border-gray-600 p-3 sm:p-4 rounded-lg backdrop-blur-sm">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {getPartyMedia().filter((song: any) => song.status === 'played').length}
                </div>
                <div className="text-xs sm:text-sm text-gray-300">Played</div>
              </div>
            </div>
          </div>
          <div className="bg-purple-800/50 border border-gray-600 p-3 sm:p-4 rounded-lg backdrop-blur-sm">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{party.attendees.length}</div>
                <div className="text-xs sm:text-sm text-gray-300">Partiers</div>
              </div>
            </div>
          </div>
          <div className="bg-purple-800/50 border border-gray-600 p-3 sm:p-4 rounded-lg backdrop-blur-sm">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <Coins className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-400" />
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">£{calculateTotalBids().toFixed(2)}</div>
                <div className="text-xs sm:text-sm text-gray-300">Total Bids</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="justify-center flex space-x-1 mb-6">
          <button 
            onClick={scrollToWebPlayer}
            className="px-4 py-2 shadow-sm bg-black/20 border-white/20 border border-gray-500 text-white rounded-lg font-medium hover:bg-gray-700/30 transition-colors" 
            style={{backgroundColor: 'rgba(55, 65, 81, 0.2)'}}
          >
            Now Playing
          </button>
          <button 
            onClick={() => setShowVetoed(false)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${!showVetoed ? 'bg-purple-600 text-white' : 'bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30'}`}
            style={!showVetoed ? {backgroundColor: '#9333EA'} : {backgroundColor: 'rgba(55, 65, 81, 0.2)'}}
          >
            {selectedTimePeriod === 'all-time' 
              ? `Queue (${getPartyMedia().filter((song: any) => song.status === 'queued').length})`
              : `Queue - ${selectedTimePeriod.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())} (${getDisplaySongs().length})`
            }
          </button>
          <button 
            onClick={() => setShowVetoed(true)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${showVetoed ? 'bg-red-600 text-white' : 'bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30'}`}
            style={showVetoed ? {backgroundColor: '#DC2626'} : {backgroundColor: 'rgba(55, 65, 81, 0.2)'}}
          >
            Vetoed ({getPartyMedia().filter((song: any) => song.status === 'vetoed').length})
          </button>
          
          {/* Manual refresh button for remote parties */}
          {/*{party.type === 'remote' && (
            <button 
              onClick={handleManualRefresh}
              className="px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30 flex items-center space-x-2"
              style={{backgroundColor: 'rgba(55, 65, 81, 0.2)'}}
              title="Refresh queue"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          )}*/}
          {party.type === 'live' && (
            <button 
              onClick={() => {
                const element = document.getElementById('previously-played');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-4 py-2 shadow-sm bg-gray-700 border border-gray-500 text-white rounded-lg font-medium" 
              style={{backgroundColor: 'rgba(55, 65, 81, 0.2)'}}
            >
              Previously Played
            </button>
          )}
        </div>

        {/* Wallet Balance */}
        <div className=" mt-4 rounded-lg mb-6">
          <div className="relative items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-white font-medium">Wallet Balance: £{user?.balance?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="mt-2 block">
            <button 
              onClick={() => navigate('/wallet')}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Top Up</span>
            </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Song Queue */}
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
                {/* Currently Playing */}
                {getPartyMedia().filter((song: any) => song.status === 'playing').length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-purple-400 mb-3 flex items-center">
                      <Play className="h-5 w-5 mr-2" />
                      Currently Playing
                    </h3>
                    <div className="space-y-3">
                      {getPartyMedia()
                        .filter((song: any) => song.status === 'playing')
                        .map((song: any, index: number) => {
                          const songData = song.songId || song;
                          return (
                            <div
                              key={`playing-${songData.id}-${index}`}
                              className="flex items-center space-x-4 p-4 rounded-lg bg-purple-900 border border-purple-400"
                            >
                              {/* Album Artwork with Play Icon Overlay */}
                              <div className="relative w-16 h-16 flex-shrink-0">
                                <img
                                  src={songData.coverArt || '/default-cover.jpg'}
                                  alt={songData.title || 'Unknown Song'}
                                  className="w-full h-full rounded object-cover"
                                  width="64"
                                  height="64"
                                />
                                {/* Play Icon Overlay */}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                                    <Play className="h-4 w-4 text-white" fill="currentColor" />
                                  </div>
                                </div>
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium text-white text-lg">{songData.title || 'Unknown Song'}</h4>
                                <p className="text-sm text-gray-400">{Array.isArray(songData.artist) ? songData.artist[0]?.name || 'Unknown Artist' : songData.artist || 'Unknown Artist'}</p>
                                <p className="text-xs text-purple-300">
                                  Started: {song.playedAt ? new Date(song.playedAt).toLocaleTimeString() : 'Now'}
                                </p>
                                
                                {/* Tags Display for Currently Playing */}
                                {songData.tags && songData.tags.length > 0 && (
                                  <div className="mt-2">
                                    <div className="flex flex-wrap gap-1">
                                      {songData.tags.slice(0, 3).map((tag: string, tagIndex: number) => (
                                        <span
                                          key={tagIndex}
                                          className="px-2 py-1 bg-purple-600 text-white text-xs rounded-full"
                                        >
                                          #{tag}
                                        </span>
                                      ))}
                                      {songData.tags.length > 3 && (
                                        <span className="px-2 py-1 bg-gray-600 text-white text-xs rounded-full">
                                          +{songData.tags.length - 3} more
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                
                              {/* Category Display for Currently Playing */}
                              {songData.category && songData.category !== 'Unknown' && (
                                <div className="mt-1">
                                  <span className="inline-block px-2 py-1 bg-pink-600 text-white text-xs rounded-full">
                                    {songData.category}
                                  </span>
                                </div>
                              )}
                              
                              {/* Top Bidders Display for Currently Playing */}
                              {songData.bids && songData.bids.length > 0 && (
                                <TopBidders bids={songData.bids} maxDisplay={5} />
                              )}
                            </div>
                              
                              {/* Skip buttons for remote parties */}
                              {party.type === 'remote' && (
                                <div className="flex flex-col space-y-2">
                                  <button
                                    onClick={handleSkipPrevious}
                                    className="p-2 bg-purple-700 hover:bg-purple-600 rounded-lg transition-colors"
                                    title="Skip to previous song"
                                  >
                                    <SkipBack className="h-4 w-4 text-white" />
                                  </button>
                                  <button
                                    onClick={handleSkipNext}
                                    className="p-2 bg-purple-700 hover:bg-purple-600 rounded-lg transition-colors"
                                    title="Skip to next song"
                                  >
                                    <SkipForward className="h-4 w-4 text-white" />
                                  </button>
                                </div>
                              )}
                              
                              <div className="text-right">
                                <p className="text-sm font-medium text-white">
                                  £{typeof songData.partyMediaAggregate === 'number' ? songData.partyMediaAggregate.toFixed(2) : '0.00'}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {Array.isArray(songData.bids) ? songData.bids.length : 0} bids
                                </p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Sorting Tabs - Only show for Queue, not Vetoed */}
                {!showVetoed && (
                  <div className="mb-6">
                    <h3 className="text-base sm:text-lg font-semibold text-white text-center mb-3 p-2">Sort by Time</h3>
                    <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
                      {[
                        { key: 'all-time', label: 'All Time' },
                        { key: 'this-year', label: 'This Year' },
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

                {/* Party Queue Search */}
                {!showVetoed && party && (
                  <div className="mb-6">
                    <PartyQueueSearch
                      onSearchTermsChange={setQueueSearchTerms}
                    />
                    
                    {/* Add Song Button - Centered */}
                    <div className="flex justify-center mt-4">
                      <button
                        onClick={() => setShowAddSongPanel(!showAddSongPanel)}
                        className={`flex items-center space-x-2 p-2 rounded-lg font-medium transition-all shadow-lg ${
                          showAddSongPanel 
                            ? 'bg-gray-600 hover:bg-gray-700 text-slate' 
                            : 'bg-purple-600 hover:bg-purple-700 text-white' 
                        }`} 
                      >
                        {showAddSongPanel ? (
                          <>
                            <X className="h-4 w-4" />
                            <span>Close Search</span>
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            <span>Add Tune</span>
                          </>
                        )}
                      </button>
                    </div>
                    
                    {/* Inline Add Song Search Panel */}
                    {showAddSongPanel && (
                      <div className="justify-center text-center rounded-lg p-3 sm:p-4 shadow-xl">
                        <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Search for Tunes to Add</h3>
                        
                        {/* Search Input */}
                        <div className="flex flex-col sm:flex-row justify-center gap-2 mb-4">
                          <input
                            type="text"
                            value={addSongSearchQuery}
                            onChange={(e) => setAddSongSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddSongSearch();
                              }
                            }}
                            placeholder="Search for Tunes on YouTube or in our library..."
                            className="flex-1 bg-gray-900 border border-gray-600 rounded-xl p-2 sm:p-3 text-slate placeholder-gray-400 focus:outline-none focus:border-purple-500 text-sm sm:text-base"
                          />
                         
                        </div>
                        <div className="flex justify-center">
                        <button
                            onClick={handleAddSongSearch}
                            disabled={isSearchingNewSongs || !addSongSearchQuery.trim()}
                            className="flex p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
                          >
                            {isSearchingNewSongs ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              'Search'
                            )}
                          </button>
                          </div>

                        {/* Database Results */}
                        {addSongResults.database.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center mb-2">
                              <Music className="h-4 w-4 text-green-400 mr-2" />
                              <h4 className="text-sm font-semibold text-green-300">From Tuneable Library ({addSongResults.database.length})</h4>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {addSongResults.database.map((song: any) => (
                                <div key={song.id} className="bg-gray-900 rounded-lg p-3 flex items-center justify-between">
                                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                                    <img
                                      src={song.coverArt || '/default-cover.jpg'}
                                      alt={song.title}
                                      className="h-12 w-12 rounded object-cover flex-shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-white font-medium truncate">{song.title}</p>
                                      <p className="text-gray-400 text-sm truncate">{song.artist}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min={party?.minimumBid || 0.33}
                                      value={newSongBidAmounts[song.id] || party?.minimumBid || 0.33}
                                      onChange={(e) => setNewSongBidAmounts({
                                        ...newSongBidAmounts,
                                        [song.id]: parseFloat(e.target.value) || party?.minimumBid || 0.33
                                      })}
                                      className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray text-sm"
                                    />
                                    <button
                                      onClick={() => handleAddSongToParty(song)}
                                      className="z-999 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium transition-colors text-sm"
                                    >
                                      Add £{(newSongBidAmounts[song.id] || party?.minimumBid || 0.33).toFixed(2)}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* YouTube Results */}
                        {addSongResults.youtube.length > 0 && (
                          <div>
                            <div className="flex items-center mb-2">
                              <Youtube className="h-4 w-4 text-red-400 mr-2" />
                              <h4 className="text-sm font-semibold text-red-300">From YouTube ({addSongResults.youtube.length})</h4>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {addSongResults.youtube.map((song: any) => (
                                <div key={song.id} className="bg-gray-900 rounded-lg p-3 flex items-center justify-between">
                                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                                    <img
                                      src={song.coverArt || '/default-cover.jpg'}
                                      alt={song.title}
                                      className="h-12 w-12 rounded object-cover flex-shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-white font-medium truncate">{song.title}</p>
                                      <p className="text-gray-400 text-sm truncate">{song.artist}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min={party?.minimumBid || 0.33}
                                      value={newSongBidAmounts[song.id] || party?.minimumBid || 0.33}
                                      onChange={(e) => setNewSongBidAmounts({
                                        ...newSongBidAmounts,
                                        [song.id]: parseFloat(e.target.value) || party?.minimumBid || 0.33
                                      })}
                                      className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray text-sm"
                                    />
                                    <button
                                      onClick={() => handleAddSongToParty(song)}
                                      className="flex px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
                                    >
                                      Add £{(newSongBidAmounts[song.id] || party?.minimumBid || 0.33).toFixed(2)}
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

                        {/* No Results Message */}
                        {!isSearchingNewSongs && addSongSearchQuery && addSongResults.database.length === 0 && addSongResults.youtube.length === 0 && (
                          <div className="text-center py-8">
                            <Music className="h-12 w-12 text-gray-500 mx-auto mb-3" />
                            <p className="text-gray-400">No songs found for "{addSongSearchQuery}"</p>
                            <p className="text-gray-500 text-sm mt-1">Try a different search term</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Song Queue - Show when NOT viewing vetoed */}
                {!showVetoed && getDisplaySongs().length > 0 && (
                  <div className="space-y-3">
                    {isLoadingSortedSongs && selectedTimePeriod !== 'all-time' ? (
                      <div className="text-center py-8">
                        <div className="text-gray-400">Loading sorted songs...</div>
                      </div>
                    ) : (
                      getDisplaySongs().map((song: any, index: number) => {
                        // For sorted songs, the data is already flattened, for regular party songs it's nested under songId
                        const songData = selectedTimePeriod === 'all-time' ? (song.songId || song) : song;
                        return (
                          <div
                            key={`queued-${songData.id}-${index}`}
                            className="card bg-purple-800 p-4 rounded-lg flex items-center space-x-4"
                          >
                            {/* Number Badge */}
                            <div className="w-4 h-4 md:w-8 md:h-8 bg-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-xs md:text-sm">{index + 1}</span>
                            </div>
                            
                            {/* Song Thumbnail */}
                            <div 
                              className="relative w-8 h-8 md:w-32 md:h-32 cursor-pointer group"
                              onClick={() => songData.uuid && navigate(`/tune/${songData.uuid}`)}
                            >
                              <img
                                src={songData.coverArt || '/default-cover.jpg'}
                                alt={songData.title || 'Unknown Song'}
                                className="w-full h-full rounded object-cover"
                                width="128"
                                height="128"
                              />
                            </div>
                            
                            {/* Song Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <h4 
                                  className="font-medium text-white text-lg truncate cursor-pointer hover:text-purple-300 transition-colors"
                                  onClick={() => songData.uuid && navigate(`/tune/${songData.uuid}`)}
                                >
                                  {songData.title || 'Unknown Song'}
                                </h4>
                                <span className="text-gray-400">•</span>
                                <span className="text-gray-300 text-lg truncate font-light">
                                  {Array.isArray(songData.artist) ? songData.artist[0]?.name || 'Unknown Artist' : songData.artist || 'Unknown Artist'}
                                </span>
                                <div className="flex items-center space-x-1 ml-2">
                                  <Clock className="h-4 w-4 text-gray-400" />
                                  <span className="p-2 text-sm text-gray-300">{formatDuration(songData.duration)}</span>
                                </div>
                              </div>
                              
                              {/* Top Bidders Display */}
                              {songData.bids && songData.bids.length > 0 && (
                                <TopBidders bids={songData.bids} maxDisplay={5} />
                              )}
                              
                              {/* Tags Display */}
                              {songData.tags && songData.tags.length > 0 && (
                                <div className="hidden md:mt-2">
                                  <div className="flex flex-wrap gap-1">
                                    {songData.tags.slice(0, 5).map((tag: string, tagIndex: number) => (
                                      <span
                                        key={tagIndex}
                                        className="px-2 py-1 bg-purple-600 text-white text-xs rounded-full"
                                      >
                                        #{tag}
                                      </span>
                                    ))}
                                    {songData.tags.length > 5 && (
                                      <span className="px-2 py-1 bg-gray-600 text-white text-xs rounded-full">
                                        +{songData.tags.length - 5} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Category Display */}
                              {songData.category && songData.category !== 'Unknown' && (
                                <div className="mt-1">
                                  <span className="inline-block px-2 py-1 bg-pink-600 text-white text-xs rounded-full">
                                    {songData.category}
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex flex-col space-y-2">
                              <div className="flex items-center space-x-2">
                                {/* Metrics Display */}
                                <div className="flex flex-col items-end space-y-1 bg-gray-700 px-3 py-2 rounded-lg">
                                  <div className="text-center p-2">
                                    <div className="text-xs text-gray-600 tracking-wide">Tune Total</div>
                                    <div className="text-xs md:text-lg text-gray-300">
                                      £{(typeof song.partyMediaAggregate === 'number' ? song.partyMediaAggregate.toFixed(2) : '0.00')}
                                    </div>
                                  </div>
                                  <div className="text-center p-2">
                                    <div className="text-xs text-gray-600 tracking-wide">Avg Bid</div>
                                    <div className="text-xs md:text-lg text-gray-300">
                                      £{calculateAverageBid(songData).toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Top Bid Metrics 
                                <div className="mt-2 p-2 bg-gray-800 rounded-lg">
                                  <div className="text-xs text-gray-400 mb-1">Top Bids</div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <div className="text-gray-500">Party Top:</div>
                                      <div className="text-yellow-400 font-medium">
                                        £{songData.partyMediaBidTop?.toFixed(2) || '0.00'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-gray-500">Party Fan:</div>
                                      <div className="text-green-400 font-medium">
                                        £{songData.partyMediaAggregateTop?.toFixed(2) || '0.00'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-gray-500">Global Top:</div>
                                      <div className="text-yellow-400 font-medium">
                                        £{songData.globalMediaBidTop?.toFixed(2) || '0.00'}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-gray-500">Global Fan:</div>
                                      <div className="text-green-400 font-medium">
                                        £{songData.globalMediaAggregateTop?.toFixed(2) || '0.00'}
                                      </div>
                                    </div>
                                  </div>
                                </div> */}
                                {/* Inline Bidding */}
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={party?.minimumBid || 0.33}
                                    value={queueBidAmounts[songData._id || songData.id] || party?.minimumBid || 0.33}
                                    onChange={(e) => setQueueBidAmounts({
                                      ...queueBidAmounts,
                                      [songData._id || songData.id]: parseFloat(e.target.value) || party?.minimumBid || 0.33
                                    })}
                                    className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray text-sm"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    onClick={() => handleInlineBid(song)}
                                    disabled={isBidding}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-sm"
                                  >
                                    Bid £{(queueBidAmounts[songData._id || songData.id] || party?.minimumBid || 0.33).toFixed(2)}
                                  </button>
                                </div>
                                {isHost && (
                                  <button
                                    onClick={() => handleVetoClick(song)}
                                    className="w-5 h-5 bg-red-500/20 bg-slate-600 rounded-md"
                                    title="Veto this song"
                                  >
                                    <X className="h-5 w-5" />
                                  </button>
                                )}
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
                    {getPartyMedia().filter((song: any) => song.status === 'vetoed').length === 0 ? (
                      <div className="text-center py-8">
                        <X className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No vetoed songs</p>
                      </div>
                    ) : (
                      getPartyMedia()
                        .filter((song: any) => song.status === 'vetoed')
                        .map((song: any, index: number) => {
                          const songData = song.songId || song;
                          return (
                            <div
                              key={`vetoed-${songData.id}-${index}`}
                              className="bg-red-900/20 border border-red-800/30 p-4 rounded-lg flex items-center space-x-4"
                            >
                              <img
                                src={songData.coverArt || '/default-cover.jpg'}
                                alt={songData.title || 'Unknown Song'}
                                className="w-32 h-32 rounded object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                width="128"
                                height="128"
                                onClick={() => songData.uuid && navigate(`/tune/${songData.uuid}`)}
                              />
                              
                              {/* Song Details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2">
                                  <h4 
                                    className="font-medium text-white text-lg truncate cursor-pointer hover:text-purple-300 transition-colors"
                                    onClick={() => songData.uuid && navigate(`/tune/${songData.uuid}`)}
                                  >
                                    {songData.title || 'Unknown Song'}
                                  </h4>
                                  <span className="text-gray-400">•</span>
                                  <span className="text-gray-300 text-lg truncate font-light">
                                    {Array.isArray(songData.artist) ? songData.artist[0]?.name || 'Unknown Artist' : songData.artist || 'Unknown Artist'}
                                  </span>
                                  <div className="flex items-center space-x-1 ml-2">
                                    <Clock className="h-4 w-4 text-gray-400" />
                                    <span className="text-sm text-gray-300">{formatDuration(songData.duration)}</span>
                                  </div>
                                </div>
                                <div className="mt-2">
                                  <p className="text-xs text-red-400">
                                    Vetoed {song.vetoedAt ? new Date(song.vetoedAt).toLocaleString() : 'recently'}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Restore Button - Host only */}
                              {isHost && (
                                <div className="flex flex-col space-y-2">
                                  <button
                                    onClick={() => handleUnvetoClick(song)}
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
                  Add First Song
                </button>
              </div>
            )}

            {/* Previously Played Songs - Only show for live parties */}
            {/* NOTE: This section is for future live jukebox feature. MVP uses remote parties only. */}
            {party.type === 'live' && getPartyMedia().filter((song: any) => song.status === 'played').length > 0 && (
              <div id="previously-played" className="mt-8">
                <h3 className="text-lg font-medium text-gray-400 mb-3 flex items-center">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  Previously Played ({getPartyMedia().filter((song: any) => song.status === 'played').length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {party.songs
                    .filter((song: any) => song.status === 'played')
                    .map((song: any, index: number) => {
                      const songData = song.songId || song;
                      return (
                        <div
                          key={`played-${songData.id}-${index}`}
                          className="flex items-center space-x-3 p-2 rounded-lg bg-gray-700"
                        >
                          <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
                          <img
                            src={songData.coverArt || '/default-cover.jpg'}
                            alt={songData.title || 'Unknown Song'}
                            className="w-10 h-10 rounded object-cover"
                            width="40"
                            height="40"
                          />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-300 text-sm truncate">{songData.title || 'Unknown Song'}</h4>
                            <p className="text-xs text-gray-500 truncate">{Array.isArray(songData.artist) ? songData.artist[0]?.name || 'Unknown Artist' : songData.artist || 'Unknown Artist'}</p>
                            <p className="text-xs text-gray-600">
                              {song.completedAt ? new Date(song.completedAt).toLocaleTimeString() : 'Completed'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-gray-400">
                              £{typeof songData.partyMediaAggregate === 'number' ? songData.partyMediaAggregate.toFixed(2) : '0.00'}
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
          {/* Attendees */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Attendees</h3>
            <div className="space-y-2">
              {party.attendees.map((attendee: any, index: number) => {
                const hostId = typeof party.host === 'string' ? party.host : party.host?.uuid;
                const attendeeId = attendee.uuid || attendee.id;
                return (
                  <div key={`${attendeeId}-${index}`} className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-primary-600">
                        {attendee.username?.charAt(0).toUpperCase() || '?'}
                      </span>
                    </div>
                    <span className="p-2 text-sm text-gray-900">{attendee.username || 'Unknown User'}</span>
                    {attendeeId === hostId && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                        Host
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Party Info */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Party Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex  items-center">
                <span className="text-gray-600 mr-2">Type:</span>
                <span className="px-2 text-gray-900 capitalize">{party.type}</span>
              </div>
              <div className="flex items-center">
                <span className="text-gray-600 mr-2">Location:</span>
                <span className="px-2 text-gray-900">{party.location}</span>
              </div>
              <div className="flex items-center">
                <span className="text-gray-600 mr-2">Created:</span>
                <span className="px-2 text-gray-900">{formatDate(party.createdAt)}</span>
              </div>
              <div className="flex items-center">
                <span className="text-gray-600 mr-2">Status:</span>
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
        songTitle={selectedSong?.title || ''}
        songArtist={Array.isArray(selectedSong?.artist) ? selectedSong.artist[0]?.name || 'Unknown Artist' : selectedSong?.artist || 'Unknown Artist'}
        currentBid={selectedSong?.partyMediaAggregate || 0}
        userBalance={user?.balance || 0}
        isLoading={isBidding}
      />

      {/* Player Warning Modal */}
      <PlayerWarningModal
        isOpen={isWarningOpen}
        onConfirm={onConfirm}
        onCancel={onCancel}
        action={warningAction}
        currentSongTitle={currentSongTitle}
        currentSongArtist={currentSongArtist}
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
              Are you sure you want to end this party? This action cannot be undone and all attendees will be notified.
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
    </div>
  );
};

export default Party;
