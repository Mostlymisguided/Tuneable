import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  Search, 
  Link as LinkIcon, 
  Clock, 
  Play, 
  Calendar,
  Music,
  Loader,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { penceToPounds } from '../utils/currency';
import { DEFAULT_COVER_ART } from '../constants';
import { stripHtml } from '../utils/stripHtml';
import { usePodcastPlayerStore, getEpisodeAudioUrl } from '../stores/podcastPlayerStore';

interface PodcastEpisode {
  _id: string;
  id?: string;
  title: string;
  description?: string;
  coverArt?: string;
  duration?: number;
  globalMediaAggregate: number;
  playCount?: number;
  popularity?: number;
  releaseDate?: string;
  host?: Array<{ name: string }>;
  podcastSeries?: {
    _id: string;
    title: string;
    coverArt?: string;
  };
  genres?: string[];
  tags?: string[];
  category?: string;
  sources?: Record<string, string> | { get?(k: string): string };
  audioUrl?: string;
  enclosure?: { url?: string };
}

const PodcastSearch: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isImportingLink, setIsImportingLink] = useState(false);
  const [filters, setFilters] = useState({
    category: '',
    genre: '',
    tag: ''
  });
  const [hasSearched, setHasSearched] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    setOffset(0);
    try {
      const params = new URLSearchParams();
      params.append('q', searchQuery);
      if (filters.category) params.append('category', filters.category);
      if (filters.genre) params.append('genre', filters.genre);
      if (filters.tag) params.append('tag', filters.tag);
      params.append('limit', '50');
      params.append('offset', '0');

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/search-episodes?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to search podcast episodes');
      }

      const data = await response.json();
      setEpisodes(data.episodes || []);
      setHasMore(data.hasMore || false);
      setTotalCount(data.total || null);
      
      if (data.episodes && data.episodes.length === 0) {
        toast.info('No episodes found. Try a different search term.');
      }
    } catch (error: any) {
      console.error('Error searching:', error);
      toast.error('Failed to search podcast episodes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMore = async () => {
    if (!searchQuery.trim() || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const nextOffset = offset + 50;
      const params = new URLSearchParams();
      params.append('q', searchQuery);
      if (filters.category) params.append('category', filters.category);
      if (filters.genre) params.append('genre', filters.genre);
      if (filters.tag) params.append('tag', filters.tag);
      params.append('limit', '50');
      params.append('offset', nextOffset.toString());

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/search-episodes?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to load more episodes');
      }

      const data = await response.json();
      setEpisodes(prev => [...prev, ...(data.episodes || [])]);
      setHasMore(data.hasMore || false);
      setOffset(nextOffset);
    } catch (error: any) {
      console.error('Error loading more:', error);
      toast.error('Failed to load more episodes');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleImportLink = async () => {
    if (!linkUrl.trim()) {
      toast.error('Please enter a podcast URL');
      return;
    }

    if (!user) {
      toast.error('Please log in to import podcasts');
      navigate('/login');
      return;
    }

    setIsImportingLink(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/import-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ url: linkUrl })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import podcast');
      }

      const data = await response.json();
      
      if (data.type === 'episode' && data.episode) {
        toast.success(`Imported episode: ${data.episode.title}`);
        navigate(`/podcasts/${data.episode._id || data.episode.id}`);
      } else if (data.type === 'series' && data.series) {
        toast.success(`Imported series: ${data.series.title}`);
        // Could navigate to series page if we create one
        setLinkUrl('');
      }
    } catch (error: any) {
      console.error('Error importing link:', error);
      toast.error(error.message || 'Failed to import podcast from URL');
    } finally {
      setIsImportingLink(false);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds % 60}`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const { setCurrentEpisode, play } = usePodcastPlayerStore();

  const handlePlayEpisode = (episode: PodcastEpisode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.info('Please log in to play podcast episodes');
      navigate('/login');
      return;
    }
    const ep = {
      _id: episode._id,
      id: episode.id,
      title: episode.title,
      duration: episode.duration,
      coverArt: episode.coverArt || episode.podcastSeries?.coverArt,
      podcastSeries: episode.podcastSeries,
      sources: episode.sources,
      audioUrl: episode.audioUrl,
      enclosure: episode.enclosure,
    };
    if (!getEpisodeAudioUrl(ep)) {
      toast.error('No playable audio for this episode');
      return;
    }
    setCurrentEpisode(ep);
    play();
    toast.success(`Now playing: ${episode.title}`);
  };

  const handleEpisodeClick = async (episode: PodcastEpisode) => {
    const episodeId = episode._id || episode.id;
    if (!episodeId) {
      toast.error('Episode ID not found');
      return;
    }

    // Check if user is logged in
    if (!user) {
      toast.info('Please log in to view podcast episodes');
      navigate('/login');
      return;
    }

    try {
      // First, verify the episode exists by trying to fetch it
      const checkResponse = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/media/${episodeId}/profile`
      );

      if (checkResponse.ok) {
        // Episode exists, navigate directly
        navigate(`/podcasts/${episodeId}`);
        return;
      }

      // Episode doesn't exist in database - this shouldn't happen for search results
      // but if it does, try to import it if we have external data
      const episodeAny = episode as any;
      
      // Check if we have external source data to import from
      if (episodeAny.source && (episodeAny.taddyData || episodeAny.appleData || episodeAny.podcastIndexData || episodeAny.rawData)) {
        setIsLoading(true);
        toast.info('Importing episode...');
        
        const token = localStorage.getItem('token');
        let episodeData: any = null;
        let seriesData: any = null;
        let source = episodeAny.source;

        // Extract episode data based on source
        if (episodeAny.taddyData) {
          source = 'taddy';
          episodeData = episodeAny.taddyData;
          if (episodeAny.podcastTitle || episodeAny.rawData?.podcastSeries) {
            seriesData = {
              title: episodeAny.podcastTitle || episodeAny.rawData?.podcastSeries?.name || '',
              description: episodeAny.rawData?.podcastSeries?.description || '',
              author: episodeAny.podcastAuthor || episodeAny.rawData?.podcastSeries?.publisherName || '',
              image: episodeAny.podcastImage || episode.coverArt || episodeAny.rawData?.podcastSeries?.imageUrl || null,
              categories: episode.genres || [],
              language: 'en',
              taddyUuid: episodeAny.podcastSeriesUuid || episodeAny.rawData?.podcastSeries?.uuid
            };
          }
        } else if (episodeAny.appleData) {
          source = 'apple';
          episodeData = episodeAny.appleData;
          if (episodeAny.podcastTitle) {
            seriesData = {
              title: episodeAny.podcastTitle,
              description: '',
              author: episodeAny.podcastAuthor || '',
              image: episodeAny.podcastImage || episode.coverArt || null,
              categories: episode.genres || [],
              language: 'en',
              iTunesId: episodeAny.collectionId
            };
          }
        } else if (episodeAny.podcastIndexData) {
          source = 'podcastindex';
          episodeData = episodeAny.podcastIndexData;
          if (episodeAny.podcastTitle) {
            seriesData = {
              title: episodeAny.podcastTitle,
              description: '',
              author: episodeAny.podcastAuthor || '',
              image: episodeAny.podcastImage || episode.coverArt || null,
              categories: episode.genres || [],
              language: 'en',
              podcastIndexId: episodeAny.feedId?.toString()
            };
          }
        }

        if (episodeData) {
          // Import the episode
          const importResponse = await fetch(
            `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/discovery/import-single-episode`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                source,
                episodeData,
                seriesData
              })
            }
          );

          if (importResponse.ok) {
            const importResult = await importResponse.json();
            toast.success(`Imported: ${importResult.episode.title}`);
            navigate(`/podcasts/${importResult.episode._id}`);
          } else {
            const error = await importResponse.json();
            throw new Error(error.error || 'Failed to import episode');
          }
        } else {
          // No external data available
          toast.error('Episode not found. Please try clicking the series title to import episodes first.');
        }
      } else {
        // Episode doesn't exist and we don't have data to import
        toast.error('Episode not found. Please try clicking the series title to import episodes first.');
      }
    } catch (error: any) {
      console.error('Error handling episode click:', error);
      toast.error(error.message || 'Failed to load episode');
    } finally {
      setIsLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({ category: '', genre: '', tag: '' });
  };

  const hasActiveFilters = filters.category || filters.genre || filters.tag;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <Search className="h-8 w-8 text-purple-400" />
            <h1 className="text-3xl sm:text-4xl font-bold">Podcast Search</h1>
          </div>
          <p className="text-gray-400">Search for podcast episodes or paste a link to import</p>
        </div>

        {/* Link Import Section */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-purple-500/30">
          <div className="flex items-center space-x-2 mb-3">
            <LinkIcon className="h-5 w-5 text-purple-400" />
            <h2 className="text-xl font-semibold">Import from URL</h2>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            Paste an Apple Podcasts URL to import episodes or series
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://podcasts.apple.com/..."
              className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={handleImportLink}
              disabled={isImportingLink || !linkUrl.trim()}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {isImportingLink ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <LinkIcon className="h-5 w-5" />
                  <span>Import</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search Section */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-purple-500/30">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search podcast episodes..."
                className="w-full bg-gray-700 text-white rounded-lg pl-10 pr-4 py-3 border border-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isLoading || !searchQuery.trim()}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="h-5 w-5" />
                  <span>Search</span>
                </>
              )}
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              placeholder="Filter by category..."
              className="bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none text-sm"
            />
            <input
              type="text"
              value={filters.genre}
              onChange={(e) => setFilters({ ...filters, genre: e.target.value })}
              placeholder="Filter by genre..."
              className="bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none text-sm"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={filters.tag}
                onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
                placeholder="Filter by tag..."
                className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none text-sm"
              />
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  title="Clear filters"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        ) : hasSearched && episodes.length === 0 ? (
          <div className="text-center py-20">
            <Music className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No episodes found</p>
            <p className="text-gray-500 text-sm mt-2">Try a different search term or adjust your filters</p>
          </div>
        ) : episodes.length > 0 ? (
          <div className="space-y-4">
            <div className="text-gray-400 text-sm mb-4">
              {totalCount !== null 
                ? `Showing ${episodes.length} of ${totalCount} episode${totalCount !== 1 ? 's' : ''}`
                : `Found ${episodes.length} episode${episodes.length !== 1 ? 's' : ''}`
              }
            </div>
            {episodes.map((episode) => {
              const hasPlayable = user && getEpisodeAudioUrl({
                title: episode.title,
                _id: episode._id,
                id: episode.id,
                sources: episode.sources,
                audioUrl: episode.audioUrl,
                enclosure: episode.enclosure,
              });
              return (
              <div
                key={episode._id || episode.id}
                onClick={() => handleEpisodeClick(episode)}
                className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 hover:bg-gray-800/70 transition-all cursor-pointer border border-gray-700 hover:border-purple-500/50"
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Cover Art with Play overlay */}
                  <div className="relative flex-shrink-0 group">
                    <img
                      src={episode.coverArt || episode.podcastSeries?.coverArt || DEFAULT_COVER_ART}
                      alt={episode.title}
                      className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg object-cover"
                    />
                    {hasPlayable && (
                      <button
                        type="button"
                        onClick={(e) => handlePlayEpisode(episode, e)}
                        className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto"
                        aria-label="Play episode"
                      >
                        <span className="w-12 h-12 rounded-full bg-amber-500/90 flex items-center justify-center shadow-lg">
                          <Play className="w-6 h-6 text-gray-900 ml-0.5" fill="currentColor" />
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Episode Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold mb-2">{episode.title}</h3>
                    {episode.podcastSeries && (
                      <p className="text-purple-300 text-sm mb-2">{episode.podcastSeries.title}</p>
                    )}
                    {episode.host && episode.host.length > 0 && (
                      <p className="text-gray-400 text-sm mb-2">
                        Host: {episode.host.map(h => h.name).join(', ')}
                      </p>
                    )}

                    {episode.description && (
                      <p className="text-gray-400 text-sm line-clamp-2 mb-3">{stripHtml(episode.description)}</p>
                    )}

                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center space-x-1 text-purple-400">
                        <span className="font-semibold">{penceToPounds(episode.globalMediaAggregate)}</span>
                      </div>
                      {episode.duration && (
                        <div className="flex items-center space-x-1 text-gray-400">
                          <Clock className="h-4 w-4" />
                          <span>{formatDuration(episode.duration)}</span>
                        </div>
                      )}
                      {episode.playCount !== undefined && (
                        <div className="flex items-center space-x-1 text-gray-400">
                          <Play className="h-4 w-4" />
                          <span>{episode.playCount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-1 text-gray-400">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(episode.releaseDate)}</span>
                      </div>
                    </div>

                    {/* Tags */}
                    {(episode.tags && episode.tags.length > 0) || (episode.genres && episode.genres.length > 0) ? (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {episode.genres?.slice(0, 3).map((genre, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-purple-600/30 text-purple-300 text-xs rounded-full"
                          >
                            {genre}
                          </span>
                        ))}
                        {episode.tags?.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {/* Play button */}
                    {hasPlayable && (
                      <button
                        type="button"
                        onClick={(e) => handlePlayEpisode(episode, e)}
                        className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-gray-900 font-semibold rounded-lg transition-all flex items-center gap-2 w-fit"
                      >
                        <Play className="h-4 w-4" fill="currentColor" />
                        <span>Play</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ); })}
            
            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader className="h-5 w-5 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <span>Load More</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PodcastSearch;

