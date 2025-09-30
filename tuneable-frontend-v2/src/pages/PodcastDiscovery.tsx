import React, { useState, useEffect } from 'react';
import { Search, Download, Play, Headphones, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

interface Podcast {
  title: string;
  description: string;
  author: string;
  image: string;
  categories: string[];
  language: string;
  rssUrl: string;
  podcastIndexId?: number;
  appleId?: number;
  genre?: string;
  lastUpdate?: string;
}

interface Episode {
  title: string;
  description: string;
  podcastTitle: string;
  podcastId: string;
  podcastImage: string;
  podcastAuthor: string;
  podcastCategory: string;
  duration: number;
  publishedAt: string;
  audioUrl: string;
  explicit: boolean;
  podcastIndexId: number;
  feedId: number;
}

const PodcastDiscovery: React.FC = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'podcasts' | 'episodes'>('podcasts');
  const [searchSource, setSearchSource] = useState<'podcastindex' | 'apple' | 'rss'>('apple');
  const [results, setResults] = useState<Podcast[] | Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [genres, setGenres] = useState<Array<{id: string, name: string}>>([]);
  const [selectedGenre, setSelectedGenre] = useState('all');
  // RSS support removed - Taddy and Apple Podcasts are the primary sources
  const [popularFeeds, setPopularFeeds] = useState<Array<{name: string, url: string, description: string, category: string}>>([]);
  const [topBoostedPodcasts, setTopBoostedPodcasts] = useState<Array<{title: string, podcastTitle: string, globalBidValue: number, playCount: number}>>([]);

  useEffect(() => {
    // Load Apple genres
    const loadGenres = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/discovery/apple/genres`);
        if (response.ok) {
          const data = await response.json();
          setGenres(data.genres || []);
        }
      } catch (error) {
        console.error('Error loading genres:', error);
      }
    };

    // Load popular RSS feeds
    const loadPopularFeeds = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/discovery/rss/popular-feeds`);
        if (response.ok) {
          const data = await response.json();
          setPopularFeeds(data.feeds || []);
        }
      } catch (error) {
        console.error('Error loading popular feeds:', error);
      }
    };

    // Load top boosted podcasts
    const loadTopBoostedPodcasts = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/charts/boosted?limit=10`);
        if (response.ok) {
          const data = await response.json();
          setTopBoostedPodcasts(data.episodes || []);
        }
      } catch (error) {
        console.error('Error loading top boosted podcasts:', error);
      }
    };

    loadGenres();
    loadPopularFeeds();
    loadTopBoostedPodcasts();
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      let endpoint;
      if (searchSource === 'apple') {
        endpoint = searchType === 'podcasts' 
          ? `/api/podcasts/discovery/apple/search-podcasts`
          : `/api/podcasts/discovery/apple/search-episodes`;
      } else if (searchSource === 'rss') {
        // For RSS, we parse the URL directly
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/discovery/rss/parse-rss`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rssUrl: searchQuery })
        });
        
        if (response.ok) {
          const data = await response.json();
          setResults(data.episodes || []);
          toast.success(`Found ${data.count || 0} episodes from RSS feed`);
        } else {
          const error = await response.json();
          toast.error(error.error || 'RSS parsing failed');
          setResults([]);
        }
        setLoading(false);
        return;
      } else {
        endpoint = searchType === 'podcasts' 
          ? `/api/podcasts/discovery/podcastindex/search-podcasts`
          : `/api/podcasts/discovery/podcastindex/search-episodes`;
      }
      
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}${endpoint}?q=${encodeURIComponent(searchQuery)}&max=20`);
      
      if (response.ok) {
        const data = await response.json();
        setResults(data[searchType] || []);
        toast.success(`Found ${data.count || 0} ${searchType} from ${searchSource === 'apple' ? 'Apple Podcasts' : 'PodcastIndex'}`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Search failed');
        setResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseTop = async () => {
    if (searchSource !== 'apple') return;
    
    setLoading(true);
    setHasSearched(true);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/apple-podcasts/top-podcasts?genre=${selectedGenre}&max=20`);
      
      if (response.ok) {
        const data = await response.json();
        setResults(data.podcasts || []);
        toast.success(`Found ${data.count || 0} top podcasts in ${genres.find(g => g.id === selectedGenre)?.name || 'All Genres'}`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to load top podcasts');
        setResults([]);
      }
    } catch (error) {
      console.error('Browse error:', error);
      toast.error('Failed to load top podcasts');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImportEpisodes = async (podcastId: string, podcastTitle: string) => {
    if (!user) {
      toast.error('Please log in to import episodes');
      return;
    }

    setImporting(podcastId);
    
    try {
      let endpoint, body;
      
      if (searchSource === 'rss') {
        endpoint = '/api/podcasts/discovery/rss/import-rss';
        body = { rssUrl: searchQuery, maxEpisodes: 10 };
      } else if (searchSource === 'apple') {
        endpoint = '/api/podcasts/discovery/apple/import-episodes';
        body = { appleId: podcastId, maxEpisodes: 10 };
      } else {
        endpoint = '/api/podcasts/discovery/podcastindex/import-episodes';
        body = { podcastId: podcastId, maxEpisodes: 10 };
      }
        
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Imported ${data.imported} episodes from ${podcastTitle}`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Import failed');
    } finally {
      setImporting(null);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Discover Podcasts</h1>
          <p className="text-gray-600">Find and import amazing podcast content from the global podcast directory</p>
        </div>

        {/* Search Interface */}
        <div className="mb-8 space-y-4">
          {/* Source Selection */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setSearchSource('apple')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchSource === 'apple'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🍎 Apple Podcasts
            </button>
            <button
              onClick={() => setSearchSource('podcastindex')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchSource === 'podcastindex'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📡 PodcastIndex
            </button>
            <button
              onClick={() => setSearchSource('rss')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchSource === 'rss'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📻 RSS Feed
            </button>
          </div>

          {/* Search Type Tabs */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setSearchType('podcasts')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchType === 'podcasts'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Headphones className="w-4 h-4 mr-2" />
              Podcasts
            </button>
            <button
              onClick={() => setSearchType('episodes')}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                searchType === 'episodes'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Play className="w-4 h-4 mr-2" />
              Episodes
            </button>
          </div>

          {/* Apple-specific: Browse Top Podcasts */}
          {searchSource === 'apple' && searchType === 'podcasts' && (
            <div className="flex items-center space-x-4">
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {genres.map((genre) => (
                  <option key={genre.id} value={genre.id}>
                    {genre.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBrowseTop}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Browse Top Podcasts
              </button>
            </div>
          )}

          {/* Search Bar */}
          <div className="flex space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={searchSource === 'rss' ? 'Enter RSS feed URL...' : `Search for ${searchType} on ${searchSource === 'apple' ? 'Apple Podcasts' : 'PodcastIndex'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !searchQuery.trim()}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : searchSource === 'rss' ? (
          <>
            {/* Popular RSS Feeds */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Popular RSS Feeds</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {popularFeeds.map((feed, index) => (
                  <div key={index} className="p-4 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
                    <h4 className="font-medium text-gray-900 mb-1">{feed.name}</h4>
                    <p className="text-sm text-gray-600 mb-2">{feed.description}</p>
                    <p className="text-xs text-gray-500 mb-3">{feed.category}</p>
                    <button
                      onClick={() => {
                        setSearchQuery(feed.url);
                        handleSearch();
                      }}
                      className="w-full px-3 py-2 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 transition-colors"
                    >
                      Parse Feed
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : hasSearched ? (
          <>
            {/* Results Header */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                {results.length > 0 
                  ? `Found ${results.length} ${searchType} from ${searchSource === 'apple' ? 'Apple Podcasts' : 'PodcastIndex'}`
                  : `No ${searchType} found`
                }
              </h2>
            </div>

            {/* Results Grid */}
            {results.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {searchType === 'podcasts' ? (
                  // Podcast Results
                  (results as Podcast[]).map((podcast) => (
                    <div key={podcast.podcastIndexId} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <div className="flex items-start space-x-4">
                        <img
                          src={podcast.image || '/default-podcast.png'}
                          alt={podcast.title}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {podcast.title}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            by {podcast.author}
                          </p>
                          {(podcast.categories?.length > 0 || podcast.genre) && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {podcast.genre && (
                                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                  {podcast.genre}
                                </span>
                              )}
                              {podcast.categories?.slice(0, 2).map((category, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full"
                                >
                                  {category}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-sm text-gray-500 line-clamp-2">
                            {podcast.description}
                          </p>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                          {podcast.language.toUpperCase()}
                        </div>
                        <button
                          onClick={() => handleImportEpisodes(
                            searchSource === 'apple' ? (podcast.appleId?.toString() || '') : (podcast.podcastIndexId?.toString() || ''), 
                            podcast.title
                          )}
                          disabled={importing === (searchSource === 'apple' ? podcast.appleId?.toString() : podcast.podcastIndexId?.toString())}
                          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                        >
                          {importing === (searchSource === 'apple' ? podcast.appleId?.toString() : podcast.podcastIndexId?.toString()) ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          ) : (
                            <Download className="w-4 h-4 mr-2" />
                          )}
                          Import Episodes
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  // Episode Results
                  (results as Episode[]).map((episode) => (
                    <div key={episode.podcastIndexId} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <div className="flex items-start space-x-4">
                        <img
                          src={episode.podcastImage || '/default-podcast.png'}
                          alt={episode.podcastTitle}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">
                            {episode.title}
                          </h3>
                          <p className="text-sm text-gray-600 mb-2">
                            {episode.podcastTitle} • {episode.podcastAuthor}
                          </p>
                          <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                            <span>{formatDuration(episode.duration)}</span>
                            <span>{formatDate(episode.publishedAt)}</span>
                            {episode.explicit && (
                              <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                                Explicit
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-2">
                            {episode.description}
                          </p>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                          {episode.podcastCategory}
                        </div>
                        <div className="flex space-x-2">
                          <button className="flex items-center px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                            <Play className="w-4 h-4 mr-1" />
                            Preview
                          </button>
                          <button className="flex items-center px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                            <Plus className="w-4 h-4 mr-1" />
                            Add to Party
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <Search className="w-16 h-16 mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
                <p className="text-gray-500">
                  Try adjusting your search terms or searching for different {searchType}
                </p>
              </div>
            )}
          </>
        ) : (
          /* Top Boosted Podcasts Chart */
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Top Boosted Podcasts</h2>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {topBoostedPodcasts.length > 0 ? (
                <div className="space-y-4">
                  {topBoostedPodcasts.map((episode, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-600 font-bold text-sm">#{index + 1}</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 truncate">{episode.title}</h3>
                          <p className="text-sm text-gray-500 truncate">{episode.podcastTitle}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">£{episode.globalBidValue.toFixed(2)}</div>
                          <div className="text-xs text-gray-500">{episode.playCount} plays</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-4">
                    <Headphones className="w-12 h-12 mx-auto" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No boosted podcasts yet</h3>
                  <p className="text-gray-500">
                    Start boosting your favorite podcast episodes to see them appear here!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Initial State - only show when no search has been performed */}
        {!hasSearched && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <Headphones className="w-16 h-16 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Discover Amazing Podcasts</h3>
            <p className="text-gray-500 mb-6">
              Search through thousands of podcasts and episodes from the global podcast directory
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <Search className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900 mb-1">Search Podcasts</h4>
                <p className="text-sm text-gray-500">Find podcasts by name, topic, or host</p>
              </div>
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <Play className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900 mb-1">Browse Episodes</h4>
                <p className="text-sm text-gray-500">Discover specific episodes across all podcasts</p>
              </div>
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <Download className="w-8 h-8 text-primary-600 mx-auto mb-2" />
                <h4 className="font-medium text-gray-900 mb-1">Import Content</h4>
                <p className="text-sm text-gray-500">Add episodes to your Tuneable database</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PodcastDiscovery;
