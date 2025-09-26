import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchAPI, partyAPI } from '../lib/api';
import { spotifyService } from '../services/spotifyService';
import { toast } from 'react-toastify';
import { Search, Music, Clock, Plus, ArrowLeft, ExternalLink } from 'lucide-react';

// Define types directly to avoid import issues
interface SearchResult {
  id: string;
  title: string;
  artist: string;
  coverArt: string;
  duration: number;
  sources: Record<string, string>;
  globalBidValue?: number;
  addedBy?: string;
  isLocal?: boolean;
}

const SearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const partyId = searchParams.get('partyId');
  const navigate = useNavigate();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [bidAmount, setBidAmount] = useState(1.00);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [, setParty] = useState<any>(null);
  const [musicSource, setMusicSource] = useState<'youtube' | 'spotify'>('youtube');
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [searchSource, setSearchSource] = useState<'local' | 'external' | null>(null);
  const [hasMoreExternal, setHasMoreExternal] = useState(false);

  useEffect(() => {
    if (!partyId) {
      toast.error('No party selected');
      navigate('/parties');
      return;
    }

    // Fetch party details to determine music source
    const fetchPartyDetails = async () => {
      try {
        const response = await partyAPI.getPartyDetails(partyId);
        setParty(response.party);
        setMusicSource((response.party as any).musicSource || 'youtube');
        
        // Check if user has Spotify token stored
        const storedToken = localStorage.getItem('spotify_access_token');
        if (storedToken && (response.party as any).musicSource === 'spotify') {
          setSpotifyToken(storedToken);
          setIsSpotifyConnected(true);
        }
      } catch (error) {
        console.error('Error fetching party details:', error);
        toast.error('Failed to load party details');
      }
    };

    fetchPartyDetails();
  }, [partyId, navigate]);

  const handleShowMore = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    try {
      let response;
      
      if (musicSource === 'spotify') {
        if (!spotifyToken) {
          toast.error('Please connect your Spotify account first');
          setIsLoading(false);
          return;
        }
        response = await searchAPI.search(query, 'spotify', undefined, spotifyToken, true);
      } else {
        response = await searchAPI.search(query, 'youtube', undefined, undefined, true);
      }
      
      // Track the source of results
      setSearchSource(response.source || 'external');
      setHasMoreExternal(false); // Hide the button after showing external results
      
      setResults(response.videos);
      setNextPageToken(response.nextPageToken || null);
      
      toast.info(`Found ${response.videos.length} additional songs from ${musicSource === 'spotify' ? 'Spotify' : 'YouTube'}`);
    } catch (error) {
      console.error('Show more error:', error);
      toast.error('Failed to load more results. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (searchQuery: string, pageToken?: string) => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      let response;
      
      if (musicSource === 'spotify') {
        if (!spotifyToken) {
          toast.error('Please connect your Spotify account first');
          setIsLoading(false);
          return;
        }
        // Use the unified search API with Spotify access token
        response = await searchAPI.search(searchQuery, 'spotify', pageToken, spotifyToken);
      } else {
        // Use the unified search API for YouTube (which will search local DB first)
        response = await searchAPI.search(searchQuery, 'youtube', pageToken);
      }
      
      // Track the source of results
      setSearchSource(response.source || 'external');
      setHasMoreExternal(response.hasMoreExternal || false);
      
      setResults(pageToken ? [...results, ...response.videos] : response.videos);
      setNextPageToken(response.nextPageToken || null);
      
      // Show user feedback about search source
      if (response.source === 'local') {
        toast.info(`Found ${response.videos.length} songs from our database`);
      } else if (response.source === 'external') {
        toast.info(`Found ${response.videos.length} songs from ${musicSource === 'spotify' ? 'Spotify' : 'YouTube'}`);
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBid = async (song: SearchResult) => {
    if (!partyId) return;
    
    try {
      const platform = musicSource === 'spotify' ? 'spotify' : 'youtube';
      const url = musicSource === 'spotify' ? song.sources.spotify : song.sources.youtube;
      
      const response = await partyAPI.addSongToParty(partyId, {
        title: song.title,
        artist: song.artist,
        url: url,
        platform: platform,
        duration: song.duration,
        coverArt: song.coverArt,
        bidAmount: bidAmount,
      });
      
      if (response.isDuplicate) {
        toast.success(`Bid of £${bidAmount.toFixed(2)} added to existing song in queue!`);
      } else {
        toast.success('Song added to party!');
      }
      navigate(`/party/${partyId}`);
    } catch (error: any) {
      console.error('Bid error:', error);
      toast.error(error.response?.data?.error || 'Failed to add song');
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleSpotifyConnect = () => {
    const authUrl = spotifyService.getAuthUrl();
    window.location.href = authUrl;
  };

  const handleSpotifyDisconnect = () => {
    localStorage.removeItem('spotify_access_token');
    setSpotifyToken(null);
    setIsSpotifyConnected(false);
    toast.success('Disconnected from Spotify');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(`/party/${partyId}`)}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Party</span>
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Add Songs</h1>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Music Source:</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                musicSource === 'youtube' 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                {musicSource === 'youtube' ? 'YouTube' : 'Spotify'}
              </span>
            </div>
          </div>
          
          {/* Spotify Connection Status - Disabled for now */}
          {false && musicSource === 'spotify' && (
            <div className="flex items-center space-x-2">
              {isSpotifyConnected ? (
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-green-600">✓ Connected to Spotify</span>
                  <button
                    onClick={handleSpotifyDisconnect}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSpotifyConnect}
                  className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Connect Spotify</span>
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Search Bar */}
        <div className="flex space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder={`Search for songs on ${musicSource === 'youtube' ? 'YouTube' : 'Spotify'}...`}
              className="input pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearch(query);
                }
              }}
            />
          </div>
          <button
            onClick={() => handleSearch(query)}
            disabled={isLoading || !query.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Bid Amount */}
        <div className="mt-4 flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">
            Bid Amount:
          </label>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">£</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={bidAmount}
              onChange={(e) => setBidAmount(parseFloat(e.target.value) || 0)}
              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Search Results ({results.length})
            </h2>
            {searchSource && (
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                searchSource === 'local' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {searchSource === 'local' ? '📚 From Database' : `🌐 From ${musicSource === 'spotify' ? 'Spotify' : 'YouTube'}`}
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((song) => (
              <div key={song.id} className={`card hover:shadow-md transition-shadow ${song.isLocal ? 'ring-2 ring-green-200' : ''}`}>
                <div className="flex space-x-4">
                  <div className="relative">
                    <img
                      src={song.coverArt}
                      alt={song.title}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    />
                    {song.isLocal && (
                      <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs px-1 py-0.5 rounded-full">
                        📚
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">
                      {song.title}
                    </h3>
                    <p className="text-sm text-gray-600 truncate">
                      {song.artist}
                    </p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Clock className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {formatDuration(song.duration)}
                      </span>
                      {song.isLocal && song.globalBidValue && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-green-600 font-medium">
                            £{song.globalBidValue.toFixed(2)} total bids
                          </span>
                        </>
                      )}
                    </div>
                    {song.isLocal && song.addedBy && (
                      <p className="text-xs text-gray-500 mt-1">
                        Added by {song.addedBy}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Bid: £{bidAmount.toFixed(2)}
                  </div>
                  <button
                    onClick={() => handleBid(song)}
                    className="btn-primary flex items-center space-x-1 text-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Show More Button - Only show when we have local results */}
          {hasMoreExternal && searchSource === 'local' && (
            <div className="text-center mt-6">
              <button
                onClick={handleShowMore}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 mx-auto"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="px-2">{isLoading ? 'Searching...' : `Show More from ${musicSource === 'spotify' ? 'Spotify' : 'YouTube'}`}</span>
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Didn't find what you're looking for? Search {musicSource === 'spotify' ? 'Spotify' : 'YouTube'} for more results.
              </p>
            </div>
          )}

          {/* Load More */}
          {nextPageToken && (
            <div className="text-center mt-8">
              <button
                onClick={() => handleSearch(query, nextPageToken)}
                disabled={isLoading}
                className="btn-secondary disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {results.length === 0 && !isLoading && query && (
        <div className="text-center py-12">
          <Music className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-600">Try searching with different keywords</p>
        </div>
      )}

      {/* Initial State */}
      {results.length === 0 && !isLoading && !query && (
        <div className="text-center py-12">
          <Search className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Search for songs</h3>
          <p className="text-gray-600">Enter a song name or artist to find music to add to your party</p>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
