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

// Define types directly to avoid import issues
interface PartySong {
  _id: string;
  title: string;
  artist: string;
  coverArt?: string;
  duration?: number;
  sources?: {
    youtube: string;
  };
  globalBidValue?: number;
  bids?: any[];
  addedBy: string;
  [key: string]: any; // Allow additional properties
}


interface WebSocketMessage {
  type: 'JOIN' | 'UPDATE_QUEUE' | 'PLAY' | 'PAUSE' | 'SKIP' | 'TRANSITION_SONG' | 'SET_HOST' | 'PLAY_NEXT';
  partyId?: string;
  userId?: string;
  queue?: PartySong[];
  song?: PartySong;
}
import { 
  Music, 
  Users, 
  MapPin, 
  Clock, 
  Plus,
  Copy,
  Share2,
  PoundSterling
} from 'lucide-react';

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

  // Player warning system
  const { showWarning, isWarningOpen, warningAction, onConfirm, onCancel, currentSongTitle, currentSongArtist } = usePlayerWarning();

  // Use global WebPlayer store
  const {
    setCurrentSong,
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
            
            // Only update global queue if this is the currently active party
            console.log('WebSocket UPDATE_QUEUE - currentPartyId:', currentPartyId, 'partyId:', partyId, 'match:', currentPartyId === partyId);
            if (currentPartyId === partyId) {
              console.log('Updating global queue for active party');
              const cleanedQueue = message.queue.map((song: any) => {
                const actualSong = song.songId || song;
                let youtubeUrl = null;
                
                if (actualSong.sources) {
                  if (Array.isArray(actualSong.sources)) {
                    for (const source of actualSong.sources) {
                      if (source && source.platform === '$__parent' && source.url && source.url.sources) {
                        if (source.url.sources.youtube) {
                          youtubeUrl = source.url.sources.youtube;
                          break;
                        }
                      } else if (source && source.platform === 'youtube' && source.url) {
                        youtubeUrl = source.url;
                        break;
                      }
                    }
                  } else if (typeof actualSong.sources === 'object' && actualSong.sources.youtube) {
                    youtubeUrl = actualSong.sources.youtube;
                  }
                }
                
                return {
                  _id: actualSong._id,
                  title: actualSong.title,
                  artist: actualSong.artist,
                  duration: actualSong.duration,
                  coverArt: actualSong.coverArt,
                  sources: youtubeUrl ? { youtube: youtubeUrl } : { youtube: null },
                  globalBidValue: typeof actualSong.globalBidValue === 'number' ? actualSong.globalBidValue : 0,
                  bids: actualSong.bids,
                  addedBy: typeof actualSong.addedBy === 'object' ? actualSong.addedBy?.username || 'Unknown' : actualSong.addedBy,
                  totalBidValue: typeof actualSong.totalBidValue === 'number' ? actualSong.totalBidValue : 0
                };
              });
              
              setQueue(cleanedQueue);
              
              if (cleanedQueue.length > 0) {
                setCurrentSong(cleanedQueue[0], 0);
              }
            } else {
              console.log('Not updating global queue - different party is active');
            }
          }
          break;
        case 'PLAY':
        case 'PAUSE':
        case 'SKIP':
        case 'PLAY_NEXT':
          // Global store will handle these
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
      // Only update the global player if this is a new party or no party is currently active
      if (currentPartyId !== partyId) {
        console.log('New party detected, updating global player queue');
        
        // Clean and set the queue in global store
        const cleanedQueue = party.songs.map((song: any) => {
          const actualSong = song.songId || song;
          let youtubeUrl = null;
          
          if (actualSong.sources) {
            if (Array.isArray(actualSong.sources)) {
              for (const source of actualSong.sources) {
                if (source && source.platform === '$__parent' && source.url && source.url.sources) {
                  if (source.url.sources.youtube) {
                    youtubeUrl = source.url.sources.youtube;
                    break;
                  }
                } else if (source && source.platform === 'youtube' && source.url) {
                  youtubeUrl = source.url;
                  break;
                }
              }
            } else if (typeof actualSong.sources === 'object' && actualSong.sources.youtube) {
              youtubeUrl = actualSong.sources.youtube;
            }
          }
          
          return {
            _id: actualSong._id,
            title: actualSong.title,
            artist: actualSong.artist,
            duration: actualSong.duration,
            coverArt: actualSong.coverArt,
            sources: youtubeUrl ? { youtube: youtubeUrl } : { youtube: null },
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
          setCurrentSong(cleanedQueue[0], 0);
        }
      } else {
        console.log('Same party, not updating global player queue');
      }
    }
    
    if (user && party) {
      const hostId = typeof party.host === 'string' ? party.host : party.host._id;
      setIsHost(user._id === hostId);
    }
  }, [party, user, partyId, currentPartyId, setQueue, setCurrentSong, setIsHost, setCurrentPartyId, setGlobalPlayerActive]);


  const fetchPartyDetails = async () => {
    try {
      const response = await partyAPI.getPartyDetails(partyId!);
      setParty(response.party);
      // Note: Song setting is now handled by the useEffect hook
      // to prevent interference with global player state
    } catch (error) {
      console.error('Error fetching party details:', error);
      toast.error('Failed to load party details');
    } finally {
      setIsLoading(false);
    }
  };


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
        {/* Song Queue */}
        <div className="lg:col-span-2">
          {/* Song Queue */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Queue</h2>
              <button
                onClick={() => handleNavigateWithWarning(`/search?partyId=${partyId}`, 'navigate to search page')}
                className="btn-primary flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Song</span>
              </button>
            </div>
            
            {party.songs.length > 0 ? (
              <div className="space-y-3">
            {party.songs.map((song: any, index: number) => {
              // Extract the actual song data from songId property
              const songData = song.songId || song;
              return (
                <div
                  key={songData._id || `song-${index}`}
                  className={`flex items-center space-x-4 p-3 rounded-lg ${
                    index === 0 ? 'bg-purple-900 border border-purple-400' : 'bg-gray-800'
                  }`}
                >
                  <span className="text-sm font-medium text-gray-400 w-8">
                    {index + 1}
                  </span>
                  <img
                    src={songData.coverArt || '/default-cover.jpg'}
                    alt={songData.title || 'Unknown Song'}
                    className="w-20 h-20 rounded object-cover"
                    width="80"
                    height="80"
                  />
                  <div className="flex-1">
                    <h4 className="font-medium text-white">{songData.title || 'Unknown Song'}</h4>
                    <p className="text-sm text-gray-400">{songData.artist || 'Unknown Artist'}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-right min-w-[120px]">
                      <p className="text-sm font-medium text-white">
                        £{typeof songData.partyBidValue === 'number' ? songData.partyBidValue.toFixed(2) : '0.00'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {Array.isArray(songData.bids) ? songData.bids.length : 0} bids
                      </p>
                      {/* Show individual bids if available */}
                      {Array.isArray(songData.bids) && songData.bids.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {songData.bids.slice(0, 3).map((bid: any, bidIndex: number) => (
                            <div key={bidIndex} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400 truncate max-w-[60px]">
                                {typeof bid.userId === 'object' ? bid.userId?.username || 'Unknown' : 'User'}
                              </span>
                              <span className="text-white font-medium">
                                £{typeof bid.amount === 'number' ? bid.amount.toFixed(2) : '0.00'}
                              </span>
                            </div>
                          ))}
                          {songData.bids.length > 3 && (
                            <p className="text-xs text-gray-500">
                              +{songData.bids.length - 3} more
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleBidClick(song)}
                      className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-gradient-button text-white rounded-md transition-colors hover:opacity-90"
                      disabled={isBidding}
                    >
                      <PoundSterling className="h-3 w-3" />
                      <span>Bid</span>
                    </button>
                  </div>
                </div>
              );
            })}
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
    </div>
  );
};

export default Party;
