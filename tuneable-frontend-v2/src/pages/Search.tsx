import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchAPI, partyAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { Search, Music, Clock, Plus, ArrowLeft } from 'lucide-react';

// Define types directly to avoid import issues
interface SearchResult {
  id: string;
  title: string;
  artist: string;
  coverArt: string;
  duration: number;
  sources: Record<string, string>;
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

  useEffect(() => {
    if (!partyId) {
      toast.error('No party selected');
      navigate('/parties');
    }
  }, [partyId, navigate]);

  const handleSearch = async (searchQuery: string, pageToken?: string) => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await searchAPI.search(searchQuery, 'youtube', pageToken);
      setResults(pageToken ? [...results, ...response.videos] : response.videos);
      setNextPageToken(response.nextPageToken || null);
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
      await partyAPI.addSongToParty(partyId, {
        title: song.title,
        artist: song.artist,
        url: song.sources.youtube,
        platform: 'youtube',
        duration: song.duration,
        coverArt: song.coverArt,
        bidAmount: bidAmount,
      });
      
      toast.success('Song added to party!');
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
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="flex space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search for songs on YouTube..."
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
          <h2 className="text-xl font-semibold text-gray-900">
            Search Results ({results.length})
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((song) => (
              <div key={song.id} className="card hover:shadow-md transition-shadow">
                <div className="flex space-x-4">
                  <img
                    src={song.coverArt}
                    alt={song.title}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
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
                    </div>
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
