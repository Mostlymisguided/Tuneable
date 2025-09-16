import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { partyAPI } from '../lib/api';
import { toast } from 'react-toastify';
import WebPlayer from '../components/WebPlayer';
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
  Share2
} from 'lucide-react';

const Party: React.FC = () => {
  const { partyId } = useParams<{ partyId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [party, setParty] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isHost, setIsHost] = useState(false);

  const { isConnected, sendMessage } = useWebSocket({
    partyId: partyId || '',
    userId: user?._id,
    onMessage: (message: WebSocketMessage) => {
      console.log('WebSocket message received:', message);
      
      switch (message.type) {
        case 'UPDATE_QUEUE':
          if (message.queue) {
            setParty((prev: any) => prev ? { ...prev, songs: message.queue! } : null);
            if (message.queue.length > 0) {
              // Extract the actual song data from songId property
              const firstSong = message.queue[0].songId || message.queue[0];
              setCurrentSong(firstSong);
            }
          }
          break;
        case 'PLAY':
          setIsPlaying(true);
          break;
        case 'PAUSE':
          setIsPlaying(false);
          break;
        case 'PLAY_NEXT':
          if (message.song) {
            setCurrentSong(message.song);
          }
          break;
      }
    },
  });

  useEffect(() => {
    if (partyId) {
      fetchPartyDetails();
    }
  }, [partyId]);

  // Set current song and host status when party loads
  useEffect(() => {
    if (party && party.songs.length > 0) {
      // Extract the actual song data from songId property
      const firstSong = party.songs[0].songId || party.songs[0];
      console.log('Setting current song:', firstSong);
      console.log('First song sources:', firstSong.sources);
      
      // Clean the song data to remove Mongoose metadata
      if (firstSong && typeof firstSong === 'object') {
        // Check if the song has a nested songId property (from party songs)
        const actualSong = (firstSong as any).songId || firstSong;
        
        const cleanSong = {
          _id: actualSong._id,
          title: actualSong.title,
          artist: actualSong.artist,
          duration: actualSong.duration,
          coverArt: actualSong.coverArt,
          sources: actualSong.sources && typeof actualSong.sources === 'object' && !Array.isArray(actualSong.sources) 
            ? actualSong.sources 
            : { youtube: null }, // Fallback if sources is corrupted
          globalBidValue: actualSong.globalBidValue,
          bids: actualSong.bids,
          addedBy: actualSong.addedBy,
          totalBidValue: actualSong.totalBidValue
        };
        
        console.log('Clean song sources:', cleanSong.sources);
        setCurrentSong(cleanSong);
      }
      setCurrentSongIndex(0);
    }
    if (user && party) {
      // Handle both string and object host types
      const hostId = typeof party.host === 'string' ? party.host : party.host._id;
      console.log('User ID:', user._id, 'Host ID:', hostId, 'Is Host:', user._id === hostId);
      setIsHost(user._id === hostId);
    }
  }, [party, user]);

  const fetchPartyDetails = async () => {
    try {
      const response = await partyAPI.getPartyDetails(partyId!);
      setParty(response.party);
      if (response.party.songs.length > 0) {
        // Extract the actual song data from songId property
        const firstSong = response.party.songs[0].songId || response.party.songs[0];
        
        // Clean the song data to remove Mongoose metadata
        if (firstSong && typeof firstSong === 'object') {
          // Check if the song has a nested songId property (from party songs)
          const actualSong = (firstSong as any).songId || firstSong;
          
          const cleanSong = {
            _id: actualSong._id,
            title: actualSong.title,
            artist: actualSong.artist,
            duration: actualSong.duration,
            coverArt: actualSong.coverArt,
            sources: actualSong.sources && typeof actualSong.sources === 'object' && !Array.isArray(actualSong.sources) 
              ? actualSong.sources 
              : { youtube: null }, // Fallback if sources is corrupted
            globalBidValue: actualSong.globalBidValue,
            bids: actualSong.bids,
            addedBy: actualSong.addedBy,
            totalBidValue: actualSong.totalBidValue
          };
          
          setCurrentSong(cleanSong);
        }
      }
    } catch (error) {
      console.error('Error fetching party details:', error);
      toast.error('Failed to load party details');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayPause = () => {
    const hostId = typeof party?.host === 'string' ? party.host : party?.host?._id;
    console.log('handlePlayPause called - User ID:', user?._id, 'Host ID:', hostId, 'Is Host:', user?._id === hostId);
    if (user?._id === hostId) {
      const action = isPlaying ? 'PAUSE' : 'PLAY';
      console.log('Sending WebSocket message:', action);
      sendMessage({ type: action });
      // Also update local state immediately for better UX
      setIsPlaying(!isPlaying);
    } else {
      console.log('User is not the host, cannot control playback');
    }
  };


  const handleNext = () => {
    const hostId = typeof party?.host === 'string' ? party.host : party?.host?._id;
    if (user?._id === hostId && party && party.songs.length > 0) {
      const nextIndex = (currentSongIndex + 1) % party.songs.length;
      setCurrentSongIndex(nextIndex);
      const nextSong = party.songs[nextIndex].songId || party.songs[nextIndex];
      setCurrentSong(nextSong);
      sendMessage({ type: 'PLAY_NEXT' });
    }
  };

  const handlePrevious = () => {
    const hostId = typeof party?.host === 'string' ? party.host : party?.host?._id;
    if (user?._id === hostId && party && party.songs.length > 0) {
      const prevIndex = currentSongIndex === 0 ? party.songs.length - 1 : currentSongIndex - 1;
      setCurrentSongIndex(prevIndex);
      const prevSong = party.songs[prevIndex].songId || party.songs[prevIndex];
      setCurrentSong(prevSong);
      sendMessage({ type: 'PLAY_NEXT' }); // Reuse the same message type
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
          <button onClick={() => navigate('/parties')} className="btn-primary">
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
        {/* Current Song & Controls */}
        <div className="lg:col-span-2">
          <WebPlayer
            currentSong={currentSong}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onNext={handleNext}
            onPrevious={handlePrevious}
            isHost={isHost}
          />

          {/* Song Queue */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Queue</h2>
              <button
                onClick={() => navigate(`/search?partyId=${partyId}`)}
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
                    index === 0 ? 'bg-primary-50 border border-primary-200' : 'bg-gray-50'
                  }`}
                >
                  <span className="text-sm font-medium text-gray-500 w-8">
                    {index + 1}
                  </span>
                  <img
                    src={songData.coverArt || '/default-cover.jpg'}
                    alt={songData.title || 'Unknown Song'}
                    className="w-10 h-10 rounded object-cover"
                  />
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{songData.title || 'Unknown Song'}</h4>
                    <p className="text-sm text-gray-600">{songData.artist || 'Unknown Artist'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      £{songData.globalBidValue?.toFixed(2) || '0.00'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {songData.bids?.length || 0} bids
                    </p>
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
                  onClick={() => navigate(`/search?partyId=${partyId}`)}
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
    </div>
  );
};

export default Party;
