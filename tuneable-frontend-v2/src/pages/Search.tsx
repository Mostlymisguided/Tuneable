import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { searchAPI, partyAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { Search, Music, Clock, Plus, ArrowLeft, ExternalLink, Link } from 'lucide-react';
import EpisodeCard from '../components/EpisodeCard';
import TagInputModal from '../components/TagInputModal';
import QuotaWarningBanner from '../components/QuotaWarningBanner';
import { penceToPounds } from '../utils/currency';

// Define types directly to avoid import issues
interface SearchResult {
  id: string;
  title: string;
  artist: string;
  coverArt: string;
  duration: number;
  sources: Record<string, string>;
  globalMediaAggregate?: number;
  addedBy?: string;
  isLocal?: boolean;
  isPodcast?: boolean;
  podcastAuthor?: string;
  description?: string;
  tags?: string[];
  category?: string;
  // External podcast data
  taddyData?: any;
  appleData?: any;
}

const SearchPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const partyId = searchParams.get('partyId');
  const navigate = useNavigate();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [bidAmounts, setBidAmounts] = useState<Record<string, number>>({});
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [activeTab] = useState<'songs' | 'podcasts'>('songs');
  const [party, setParty] = useState<any>(null);
  const [mediaSource, setMediaSource] = useState<'youtube'>('youtube');
  const [podcastSource] = useState<'local' | 'apple' | 'taddy'>('local');
  const [searchSource, setSearchSource] = useState<'local' | 'external' | null>(null);
  const [hasMoreExternal, setHasMoreExternal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<SearchResult | null>(null);

  useEffect(() => {
    if (!partyId) {
      toast.error('No party selected');
      navigate('/parties');
      return;
    }

    // Fetch party details to determine media source
    const fetchPartyDetails = async () => {
      try {
        const response = await partyAPI.getPartyDetails(partyId);
        setParty(response.party);
        setMediaSource((response.party as any).mediaSource || 'youtube');
        
      } catch (error) {
        console.error('Error fetching party details:', error);
        toast.error('Failed to load party details');
      }
    };

    fetchPartyDetails();
  }, [partyId, navigate]);

  // Initialize bid amounts for new search results
  const initializeBidAmounts = (newResults: SearchResult[]) => {
    const newBidAmounts: Record<string, number> = {};
    const minBid = party?.minimumBid || 0.01;
    
    newResults.forEach(song => {
      if (!bidAmounts[song.id]) {
        newBidAmounts[song.id] = Math.max(minBid, 1.00);
      }
    });
    
    if (Object.keys(newBidAmounts).length > 0) {
      setBidAmounts(prev => ({ ...prev, ...newBidAmounts }));
    }
  };

  const handleShowMore = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    try {
      let response;
      
      response = await searchAPI.search(query, 'youtube', undefined, undefined, true);
      
      // Track the source of results
      setSearchSource(response.source || 'external');
      setHasMoreExternal(false); // Hide the button after showing external results
      
      setResults(response.videos);
      setNextPageToken(response.nextPageToken || null);
      initializeBidAmounts(response.videos);
      
      toast.info(`Found ${response.videos.length} additional songs from YouTube`);
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
      
      if (activeTab === 'podcasts') {
        if (podcastSource === 'local') {
          // Search local database for podcast episodes
          const params = new URLSearchParams({
            q: searchQuery,
            limit: '20'
          });
          
          const podcastResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/search?${params}`);
          if (podcastResponse.ok) {
            const podcastData = await podcastResponse.json();
            // Convert podcast episodes to search result format
            const podcastResults = podcastData.episodes.map((episode: any) => ({
              id: episode.id,
              title: episode.title,
              artist: episode.podcastTitle,
              coverArt: episode.podcastImage,
              duration: episode.duration,
              sources: { audio: episode.audioUrl },
              globalMediaAggregate: episode.globalMediaAggregate,
              addedBy: episode.addedBy?.username,
              isLocal: true,
              isPodcast: true,
              podcastAuthor: episode.podcastAuthor,
              description: episode.description
            }));
            
            setResults(podcastResults);
            setSearchSource('local');
            setHasMoreExternal(false);
            setNextPageToken(null);
            initializeBidAmounts(podcastResults);
            
            toast.info(`Found ${podcastResults.length} podcast episodes`);
          } else {
            toast.error('Failed to search podcasts');
          }
        } else if (podcastSource === 'taddy') {
          // Search Taddy for episodes
          const params = new URLSearchParams({
            q: searchQuery,
            max: '20'
          });
          
          const taddyResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/discovery/taddy/search-episodes?${params}`);
          if (taddyResponse.ok) {
            const taddyData = await taddyResponse.json();
            // Convert Taddy episodes to search result format
            const taddyResults = taddyData.episodes.map((episode: any) => ({
              id: episode.taddyUuid || episode.guid, // Use Taddy UUID as temporary ID
              title: episode.title,
              artist: episode.podcastTitle,
              coverArt: episode.podcastImage,
              duration: episode.duration,
              sources: { audio: episode.audioUrl },
              globalMediaAggregate: 0,
              addedBy: null,
              isLocal: false,
              isPodcast: true,
              podcastAuthor: episode.podcastAuthor,
              description: episode.description,
              // Store Taddy-specific data for bidding
              taddyData: episode
            }));
            
            setResults(taddyResults);
            setSearchSource('external');
            setHasMoreExternal(false);
            setNextPageToken(null);
            initializeBidAmounts(taddyResults);
            
            toast.info(`Found ${taddyResults.length} episodes from Taddy`);
          } else {
            toast.error('Failed to search Taddy');
          }
        } else if (podcastSource === 'apple') {
          // Search Apple Podcasts for episodes
          const params = new URLSearchParams({
            q: searchQuery,
            max: '20'
          });
          
          const appleResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/discovery/apple/search-episodes?${params}`);
          if (appleResponse.ok) {
            const appleData = await appleResponse.json();
            // Convert Apple episodes to search result format
            const appleResults = appleData.episodes.map((episode: any) => ({
              id: episode.appleId || episode.guid, // Use Apple ID as temporary ID
              title: episode.title,
              artist: episode.podcastTitle,
              coverArt: episode.podcastImage,
              duration: episode.duration,
              sources: { audio: episode.audioUrl },
              globalMediaAggregate: 0,
              addedBy: null,
              isLocal: false,
              isPodcast: true,
              podcastAuthor: episode.podcastAuthor,
              description: episode.description,
              // Store Apple-specific data for bidding
              appleData: episode
            }));
            
            setResults(appleResults);
            setSearchSource('external');
            setHasMoreExternal(false);
            setNextPageToken(null);
            initializeBidAmounts(appleResults);
            
            toast.info(`Found ${appleResults.length} episodes from Apple Podcasts`);
          } else {
            toast.error('Failed to search Apple Podcasts');
          }
        }
        return;
      }
      
      // Use the unified search API for YouTube (which will search local DB first)
      response = await searchAPI.search(searchQuery, 'youtube', pageToken);
      
      // Track the source of results
      setSearchSource(response.source || 'external');
      setHasMoreExternal(response.hasMoreExternal || false);
      
      const newResults = pageToken ? [...results, ...response.videos] : response.videos;
      setResults(newResults);
      setNextPageToken(response.nextPageToken || null);
      initializeBidAmounts(response.videos);
      
      // Show user feedback about search source
      if (response.source === 'local') {
        toast.info(`Found ${response.videos.length} songs from our database`);
      } else if (response.source === 'external') {
        toast.info(`Found ${response.videos.length} songs from YouTube`);
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
    
    const songBidAmount = bidAmounts[song.id] || (party?.minimumBid || 0.01);
    
    try {
      if (song.isPodcast) {
        // Handle podcast episode
        if (song.isLocal) {
          // Episode is already in our database
          const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/${song.id}/party/${partyId}/bid`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ amount: songBidAmount })
          });

          if (response.ok) {
            await response.json();
            toast.success(`Podcast episode added to party with £${songBidAmount.toFixed(2)} bid!`);
            navigate(`/party/${partyId}`);
          } else {
            const error = await response.json();
            toast.error(error.error || 'Failed to add podcast episode');
          }
      } else {
        // External episode - need to create it first, then bid
        let importEndpoint = '';
        let importBody = {};
        
        if (song.taddyData) {
          // Taddy episode
          importEndpoint = '/api/podcasts/discovery/taddy/import-episodes';
          importBody = {
            podcastUuid: song.taddyData.podcastSeriesUuid,
            maxEpisodes: 1,
            specificEpisode: song.taddyData
          };
        } else if (song.appleData) {
          // Apple episode
          importEndpoint = '/api/podcasts/discovery/apple/import-episodes';
          importBody = {
            appleId: song.appleData?.collectionId || song.appleData?.appleId,
            maxEpisodes: 1,
            specificEpisode: song.appleData
          };
        }
        
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}${importEndpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(importBody)
        });

        if (response.ok) {
          const importData = await response.json();
          if (importData.imported > 0) {
            // Now bid on the newly created episode
            const episodeId = importData.importedEpisodes[0].id;
            const bidResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/${episodeId}/party/${partyId}/bid`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              },
              body: JSON.stringify({ amount: songBidAmount })
            });

            if (bidResponse.ok) {
              toast.success(`Podcast episode added to party with £${songBidAmount.toFixed(2)} bid!`);
              navigate(`/party/${partyId}`);
            } else {
              const error = await bidResponse.json();
              toast.error(error.error || 'Failed to add podcast episode to party');
            }
          } else {
            toast.error('Failed to import podcast episode');
          }
        } else {
          const error = await response.json();
          toast.error(error.error || 'Failed to import podcast episode');
        }
      }
      } else {
        // Handle regular song - show tag modal first
        setPendingMedia(song);
        setShowTagModal(true);
      }
    } catch (error: any) {
      console.error('Bid error:', error);
      toast.error(error.response?.data?.error || 'Failed to add content');
    }
  };

  const handleTagSubmit = async (tags: string[]) => {
    if (!pendingMedia || !partyId) return;

    const song = pendingMedia;
    const songBidAmount = bidAmounts[song.id] || (party?.minimumBid || 0.01);
    
    try {
      // Handle regular song - detect platform from available sources
      let platform = 'youtube';
      let url = song.sources.youtube;
      
      // Check for uploaded media first
      if (song.sources.upload) {
        platform = 'upload';
        url = song.sources.upload;
      } else if (song.sources.youtube) {
        platform = 'youtube';
        url = song.sources.youtube;
      }
      
      const response = await partyAPI.addMediaToParty(partyId, {
        title: song.title,
        artist: song.artist,
        url: url,
        platform: platform,
        duration: song.duration,
        coverArt: song.coverArt,
        bidAmount: songBidAmount,
        tags: tags, // Use user-generated tags
        category: song.category || 'Unknown',
      });
      
      if (response.isDuplicate) {
        toast.success(`Bid of £${songBidAmount.toFixed(2)} added to existing song in queue!`);
      } else {
        toast.success(`Song added to party with £${songBidAmount.toFixed(2)} bid!`);
      }
      navigate(`/party/${partyId}`);
    } catch (error: any) {
      console.error('Error adding media with tags:', error);
      toast.error(error.response?.data?.error || 'Failed to add content');
    } finally {
      setShowTagModal(false);
      setPendingMedia(null);
    }
  };

  const handleBidAmountChange = (mediaId: string, amount: number) => {
    setBidAmounts(prev => ({
      ...prev,
      [mediaId]: amount
    }));
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
              className="flex items-center space-x-2 px-4 py-2 text-white rounded-lg font-medium transition-colors border border-white hover:bg-white hover:text-gray-900"
              style={{ backgroundColor: 'transparent' }}
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Party</span>
            </button>
            <h1 className="text-3xl font-bold text-gray-900">Add Songs</h1>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Media Source:</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                mediaSource === 'youtube' 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-green-100 text-green-800'
              }`}>
                YouTube
              </span>
            </div>
          </div>
          
        </div>
        
        {/* Content Type Tabs - Commented out for MVP (only songs now) */}
        {/* <div className="mb-6">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('songs')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'songs'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Music className="w-4 h-4 mr-2" />
              Songs
            </button>
            <button
              onClick={() => setActiveTab('podcasts')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'podcasts'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Headphones className="w-4 h-4 mr-2" />
              Podcasts
            </button>
          </div>
        </div> */}
        
        {/* Podcast Source Selector - Commented out for MVP */}
        {/* {activeTab === 'podcasts' && (
          <div className="mb-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Search Source:</span>
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setPodcastSource('local')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    podcastSource === 'local'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📚 Local
                </button>
                <button
                  onClick={() => setPodcastSource('taddy')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    podcastSource === 'taddy'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🎧 Taddy
                </button>
                <button
                  onClick={() => setPodcastSource('apple')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    podcastSource === 'apple'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🍎 Apple
                </button>
              </div>
            </div>
          </div>
        )} */}
        
        {/* Quota Warning Banner */}
        {activeTab === 'songs' && (
          <QuotaWarningBanner className="mb-4" />
        )}

        {/* Search Bar */}
        <div className="space-y-2">
          <div className="flex space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder={activeTab === 'songs' 
                  ? 'Search for songs on YouTube or paste a YouTube URL...'
                  : podcastSource === 'local' 
                    ? 'Search for podcast episodes in our database...'
                    : podcastSource === 'taddy'
                      ? 'Search for podcast episodes on Taddy...'
                      : 'Search for podcast episodes on Apple Podcasts...'
                }
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
          {activeTab === 'songs' && (
            <div className="flex items-center space-x-2 text-xs text-gray-500 bg-purple-50 dark:bg-purple-900/20 p-2 rounded">
              <Link className="h-3 w-3 text-purple-600 dark:text-purple-400" />
              <span>
                💡 <strong>Tip:</strong> Paste a YouTube URL directly instead of searching to use 100x fewer API credits!
              </span>
            </div>
          )}
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
                {activeTab === 'podcasts' 
                  ? podcastSource === 'local' 
                    ? '📚 From Database' 
                    : podcastSource === 'taddy'
                      ? '🎧 From Taddy'
                      : '🍎 From Apple Podcasts'
                  : searchSource === 'local' 
                    ? '📚 From Database' 
                    : '🌐 From YouTube'
                }
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((song) => {
              if (song.isPodcast) {
                // Use EpisodeCard for podcast episodes
                const episode = {
                  id: song.id,
                  title: song.title,
                  description: song.description || '',
                  podcastTitle: song.artist,
                  podcastImage: song.coverArt,
                  podcastAuthor: song.podcastAuthor || '',
                  podcastCategory: '',
                  duration: song.duration,
                  publishedAt: new Date().toISOString(),
                  globalMediaAggregate: song.globalMediaAggregate || 0,
                  explicit: false,
                  episodeDisplay: song.title,
                  formattedDuration: formatDuration(song.duration),
          addedBy: song.addedBy ? {
            _id: '',
            username: song.addedBy,
            profilePic: ''
          } : {
            _id: '',
            username: 'External',
            profilePic: ''
          }
                };

                return (
                  <EpisodeCard
                    key={song.id}
                    episode={episode}
                    onAddToParty={() => handleBid(song)}
                    showActions={true}
                    compact={true}
                  />
                );
              } else {
                // Use regular song card for music
                return (
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
                          {song.isLocal && song.globalMediaAggregate && (
                            <>
                              <span className="text-xs text-gray-400">•</span>
                              <span className="text-xs text-green-600 font-medium">
                                {penceToPounds(song.globalMediaAggregate)} total (all parties)
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
                    
                    <div className="mt-4 space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Bid Amount:</span>
                          <span className="text-sm font-medium text-gray-900">
                            £{(bidAmounts[song.id] || (party?.minimumBid || 0.01)).toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={party?.minimumBid || 0.01}
                          max="11.11"
                          step="0.01"
                          value={bidAmounts[song.id] || (party?.minimumBid || 0.01)}
                          onChange={(e) => handleBidAmountChange(song.id, parseFloat(e.target.value))}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                          style={{
                            background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${((bidAmounts[song.id] || (party?.minimumBid || 0.01)) - (party?.minimumBid || 0.01)) / (11.11 - (party?.minimumBid || 0.01)) * 100}%, #e5e7eb ${((bidAmounts[song.id] || (party?.minimumBid || 0.01)) - (party?.minimumBid || 0.01)) / (11.11 - (party?.minimumBid || 0.01)) * 100}%, #e5e7eb 100%)`
                          }}
                        />
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>£{(party?.minimumBid || 0.01).toFixed(2)}</span>
                          <span>£11.11</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleBid(song)}
                        className="w-full btn-primary flex items-center justify-center space-x-1 text-sm"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Bid & Add</span>
                      </button>
                    </div>
                  </div>
                );
              }
            })}
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
                <span className="px-2">{isLoading ? 'Searching...' : 'Show More from YouTube'}</span>
              </button>
              <p className="text-sm text-gray-500 mt-2">
                Didn't find what you're looking for? Search YouTube for more results.
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Search for {activeTab === 'podcasts' ? 'podcast episodes' : 'songs'}
          </h3>
          <p className="text-gray-600">
            Enter a {activeTab === 'podcasts' ? 'podcast name, episode title, or topic' : 'song name or artist'} to find {activeTab === 'podcasts' ? 'episodes' : 'music'} to add to your party
          </p>
        </div>
      )}

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
    </div>
  );
};

export default SearchPage;
