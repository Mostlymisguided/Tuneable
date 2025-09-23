import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { usePlayerWarning } from '../hooks/usePlayerWarning';
import { partyAPI } from '../lib/api';
import { toast } from 'react-toastify';
import BidModal from '../components/BidModal';
import PlayerWarningModal from '../components/PlayerWarningModal';
import '../types/youtube'; // Import YouTube types
import { Play, CheckCircle, X, Music, Users, MapPin, Clock, Plus, PoundSterling, Copy, Share2 } from 'lucide-react';

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
  globalBidValue?: number;
  bids?: any[];
  addedBy: string;
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
  const { user } = useAuth();
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

  // Player warning system
  const { showWarning, isWarningOpen, warningAction, onConfirm, onCancel, currentSongTitle, currentSongArtist } = usePlayerWarning();

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
  } = useWebPlayerStore();

  const { isConnected, sendMessage } = useWebSocket({
    partyId: partyId || '',
    userId: user?._id,
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
                  if (songData._id === message.songId) {
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
                  if (songData._id === message.songId) {
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
                  if (songData._id === message.songId) {
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
    }
  }, [partyId]);

  // Set current song and host status when party loads
  useEffect(() => {
    console.log('Party useEffect triggered - party:', !!party, 'songs:', party?.songs?.length, 'currentPartyId:', currentPartyId, 'partyId:', partyId);
    
    if (party && party.songs.length > 0) {
      // Always update the global player queue when party data loads
      // This ensures the queue is updated even if it's the "same" party (e.g., on page reload)
      console.log('Updating global player queue for party:', partyId);
        
        // Filter to only include queued songs for the WebPlayer
        const queuedSongs = party.songs.filter((song: any) => song.status === 'queued');
        console.log('Queued songs for WebPlayer:', queuedSongs.length);
        console.log('All party songs statuses:', party.songs.map((s: any) => ({ title: s.songId?.title, status: s.status })));
        
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
                  sources.youtube = source.url;
                } else if (source && source.platform === 'spotify' && source.url) {
                  sources.spotify = source.url;
                } else if (source?.youtube) {
                  sources.youtube = source.youtube;
                } else if (source?.spotify) {
                  sources.spotify = source.spotify;
                }
              }
            } else if (typeof actualSong.sources === 'object') {
              // Preserve the original sources object
              sources = actualSong.sources;
            }
          }
          
          return {
            _id: actualSong._id,
            title: actualSong.title,
            artist: actualSong.artist,
            duration: actualSong.duration,
            coverArt: actualSong.coverArt,
            sources: sources,
            globalBidValue: typeof actualSong.globalBidValue === 'number' ? actualSong.globalBidValue : 0,
            bids: actualSong.bids,
            addedBy: typeof actualSong.addedBy === 'object' ? actualSong.addedBy?.username || 'Unknown' : actualSong.addedBy,
            totalBidValue: typeof actualSong.totalBidValue === 'number' ? actualSong.totalBidValue : 0
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
      const hostId = typeof party.host === 'string' ? party.host : party.host._id;
      setIsHost(user._id === hostId);
    }
  }, [party, user, partyId, currentPartyId, setQueue, setCurrentSong, setIsHost, setCurrentPartyId, setGlobalPlayerActive]);


  const fetchPartyDetails = async () => {
    try {
      // First update party statuses based on current time
      await partyAPI.updateStatuses();
      
      // Then fetch the updated party details
      const response = await partyAPI.getPartyDetails(partyId!);
      setParty(response.party);
      
      // Check if current user is the host
      const hostId = typeof response.party.host === 'object' ? response.party.host._id : response.party.host;
      setIsHost(user?._id === hostId);
      
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
  const fetchParty = fetchPartyDetails;

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

  // Bid handling functions
  const handleBidClick = (song: any) => {
    const songData = song.songId || song;
    setSelectedSong(songData);
    setBidModalOpen(true);
  };

  const handleVetoClick = async (song: any) => {
    if (!isHost) {
      toast.error('Only the host can veto songs');
      return;
    }

    const songData = song.songId || song;
    const confirmed = window.confirm(`Are you sure you want to veto "${songData.title}" by ${songData.artist}?`);
    
    if (!confirmed) return;

    try {
      await partyAPI.vetoSong(partyId!, songData._id);
      toast.success('Song vetoed successfully');
      // Refresh party data
      fetchParty();
    } catch (error: any) {
      console.error('Error vetoing song:', error);
      toast.error(error.response?.data?.error || 'Failed to veto song');
    }
  };

  const handleResetSongs = async () => {
    if (!isHost) {
      toast.error('Only the host can reset songs');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to reset all songs to queued status? This will clear all play history.');
    
    if (!confirmed) return;

    try {
      await partyAPI.resetSongs(partyId!);
      toast.success('All songs reset to queued status');
      // Refresh party data
      fetchParty();
    } catch (error: any) {
      console.error('Error resetting songs:', error);
      toast.error(error.response?.data?.error || 'Failed to reset songs');
    }
  };

  const handleBidConfirm = async (bidAmount: number) => {
    if (!selectedSong || !partyId) return;

    setIsBidding(true);
    try {
      await partyAPI.placeBid(partyId, selectedSong, bidAmount);
      toast.success(`Bid of £${bidAmount.toFixed(2)} placed successfully!`);
      
      // Refresh party data to get updated bid information
      await fetchPartyDetails();
      
      setBidModalOpen(false);
      setSelectedSong(null);
    } catch (error: any) {
      console.error('Error placing bid:', error);
      toast.error(error.response?.data?.error || 'Failed to place bid');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'ended':
        return 'bg-gray-100 text-gray-800';
      case 'canceled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{party.name}</h1>
            <div className="flex items-center space-x-4 mt-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(party.status)}`}>
                {party.status}
              </span>
              <div className="flex items-center text-sm text-gray-600">
                <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={copyPartyCode}
              className="flex items-center space-x-1 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Copy className="h-4 w-4" />
              <span>{party.partyCode}</span>
            </button>
            <button
              onClick={shareParty}
              className="flex items-center space-x-1 px-3 py-2 text-sm bg-primary-100 hover:bg-primary-200 text-primary-700 rounded-lg transition-colors"
            >
              <Share2 className="h-4 w-4" />
              <span>Share</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center text-gray-600">
            <MapPin className="h-5 w-5 mr-2" />
            <span>{party.location}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <Clock className="h-5 w-5 mr-2" />
            <span>{formatDate(party.startTime)}</span>
          </div>
          <div className="flex items-center text-gray-600">
            <Users className="h-5 w-5 mr-2" />
            <span>{party.attendees.length} attendees</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Song Management */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Music Queue</h2>
              <div className="flex items-center space-x-3">
                {isHost && (
                  <>
                    <button
                      onClick={handleResetSongs}
                      className="flex items-center space-x-2 px-3 py-2 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 transition-colors"
                    >
                      <Clock className="h-4 w-4" />
                      <span>Reset Songs</span>
                    </button>
                    <button
                      onClick={() => setEndPartyModalOpen(true)}
                      className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                    >
                      <X className="h-4 w-4" />
                      <span>End Party</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleNavigateWithWarning(`/search?partyId=${partyId}`, 'navigate to search page')}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Song</span>
                </button>
              </div>
            </div>
            
            {party.songs.length > 0 ? (
              <div className="space-y-6">
                {/* Currently Playing */}
                {party.songs.filter((song: any) => song.status === 'playing').length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-purple-400 mb-3 flex items-center">
                      <Play className="h-5 w-5 mr-2" />
                      Currently Playing
                    </h3>
                    <div className="space-y-3">
                      {party.songs
                        .filter((song: any) => song.status === 'playing')
                        .map((song: any, index: number) => {
                          const songData = song.songId || song;
                          return (
                            <div
                              key={songData._id || `playing-${index}`}
                              className="flex items-center space-x-4 p-4 rounded-lg bg-purple-900 border border-purple-400"
                            >
                              <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                                <Play className="h-6 w-6 text-white" />
                              </div>
                              <img
                                src={songData.coverArt || '/default-cover.jpg'}
                                alt={songData.title || 'Unknown Song'}
                                className="w-16 h-16 rounded object-cover"
                                width="64"
                                height="64"
                              />
                              <div className="flex-1">
                                <h4 className="font-medium text-white text-lg">{songData.title || 'Unknown Song'}</h4>
                                <p className="text-sm text-gray-400">{songData.artist || 'Unknown Artist'}</p>
                                <p className="text-xs text-purple-300">
                                  Started: {song.playedAt ? new Date(song.playedAt).toLocaleTimeString() : 'Now'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium text-white">
                                  £{typeof songData.partyBidValue === 'number' ? songData.partyBidValue.toFixed(2) : '0.00'}
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

                {/* Queue */}
                {party.songs.filter((song: any) => song.status === 'queued').length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-white mb-3 flex items-center">
                      <Music className="h-5 w-5 mr-2" />
                      Queue ({party.songs.filter((song: any) => song.status === 'queued').length})
                    </h3>
                    <div className="space-y-2">
                      {party.songs
                        .filter((song: any) => song.status === 'queued')
                        .map((song: any, index: number) => {
                          const songData = song.songId || song;
                          return (
                            <div
                              key={songData._id || `queued-${index}`}
                              className="flex items-center space-x-4 p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                            >
                              <span className="text-sm font-medium text-gray-400 w-8">
                                {index + 1}
                              </span>
                              <img
                                src={songData.coverArt || '/default-cover.jpg'}
                                alt={songData.title || 'Unknown Song'}
                                className="w-12 h-12 rounded object-cover"
                                width="48"
                                height="48"
                              />
                              <div className="flex-1">
                                <h4 className="font-medium text-white">{songData.title || 'Unknown Song'}</h4>
                                <p className="text-sm text-gray-400">{songData.artist || 'Unknown Artist'}</p>
                              </div>
                              <div className="flex items-center space-x-3">
                                <div className="text-right min-w-[100px]">
                                  <p className="text-sm font-medium text-white">
                                    £{typeof songData.partyBidValue === 'number' ? songData.partyBidValue.toFixed(2) : '0.00'}
                                  </p>
                                  <p className="text-xs text-gray-400">
                                    {Array.isArray(songData.bids) ? songData.bids.length : 0} bids
                                  </p>
                                </div>
                                <button
                                  onClick={() => handleBidClick(song)}
                                  className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-gradient-button text-white rounded-md transition-colors hover:opacity-90"
                                  disabled={isBidding}
                                >
                                  <PoundSterling className="h-3 w-3" />
                                  <span>Bid</span>
                                </button>
                                {isHost && (
                                  <button
                                    onClick={() => handleVetoClick(song)}
                                    className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md transition-colors hover:bg-red-700"
                                  >
                                    <X className="h-3 w-3" />
                                    <span>Veto</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Previously Played */}
                {party.songs.filter((song: any) => song.status === 'played').length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-400 mb-3 flex items-center">
                      <CheckCircle className="h-5 w-5 mr-2" />
                      Previously Played ({party.songs.filter((song: any) => song.status === 'played').length})
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {party.songs
                        .filter((song: any) => song.status === 'played')
                        .map((song: any, index: number) => {
                          const songData = song.songId || song;
                          return (
                            <div
                              key={songData._id || `played-${index}`}
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
                                <p className="text-xs text-gray-500 truncate">{songData.artist || 'Unknown Artist'}</p>
                                <p className="text-xs text-gray-600">
                                  {song.completedAt ? new Date(song.completedAt).toLocaleTimeString() : 'Completed'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-medium text-gray-400">
                                  £{typeof songData.partyBidValue === 'number' ? songData.partyBidValue.toFixed(2) : '0.00'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Vetoed Songs */}
                {party.songs.filter((song: any) => song.status === 'vetoed').length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-red-400 mb-3 flex items-center">
                      <X className="h-5 w-5 mr-2" />
                      Vetoed ({party.songs.filter((song: any) => song.status === 'vetoed').length})
                    </h3>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {party.songs
                        .filter((song: any) => song.status === 'vetoed')
                        .map((song: any, index: number) => {
                          const songData = song.songId || song;
                          return (
                            <div
                              key={songData._id || `vetoed-${index}`}
                              className="flex items-center space-x-3 p-2 rounded-lg bg-red-900/20 border border-red-800/30"
                            >
                              <X className="h-4 w-4 text-red-400 flex-shrink-0" />
                              <img
                                src={songData.coverArt || '/default-cover.jpg'}
                                alt={songData.title || 'Unknown Song'}
                                className="w-10 h-10 rounded object-cover"
                                width="40"
                                height="40"
                              />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-300 text-sm truncate">{songData.title || 'Unknown Song'}</h4>
                                <p className="text-xs text-gray-500 truncate">{songData.artist || 'Unknown Artist'}</p>
                                <p className="text-xs text-red-400">
                                  Vetoed {song.vetoedAt ? new Date(song.vetoedAt).toLocaleTimeString() : 'recently'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Music className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No songs in queue</p>
                <button
                  onClick={() => handleNavigateWithWarning(`/search?partyId=${partyId}`, 'navigate to search page')}
                  className="btn-primary mt-4"
                >
                  Add First Song
                </button>
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
              {party.attendees.map((attendee: any) => {
                const hostId = typeof party.host === 'string' ? party.host : party.host?._id;
                return (
                  <div key={attendee._id} className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-primary-600">
                        {attendee.username?.charAt(0).toUpperCase() || '?'}
                      </span>
                    </div>
                    <span className="text-sm text-gray-900">{attendee.username || 'Unknown User'}</span>
                    {attendee._id === hostId && (
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
              <div>
                <span className="text-gray-600">Type:</span>
                <span className="ml-2 capitalize">{party.type}</span>
              </div>
              <div>
                <span className="text-gray-600">Content:</span>
                <span className="ml-2">{party.watershed ? '18+' : 'All ages'}</span>
              </div>
              <div>
                <span className="text-gray-600">Created:</span>
                <span className="ml-2">{formatDate(party.createdAt)}</span>
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
        songArtist={selectedSong?.artist || ''}
        currentBid={selectedSong?.globalBidValue || 0}
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
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
    </div>
  );
};

export default Party;
