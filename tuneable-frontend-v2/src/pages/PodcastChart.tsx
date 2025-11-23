import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { 
  TrendingUp, 
  Filter, 
  Clock, 
  Play, 
  Calendar,
  Music,
  X
} from 'lucide-react';
import { penceToPounds } from '../utils/currency';
import { DEFAULT_COVER_ART } from '../constants';

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
}

const PodcastChart: React.FC = () => {
  const navigate = useNavigate();
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: '',
    genre: '',
    tag: '',
    timeRange: 'all',
    sortBy: 'globalMediaAggregate'
  });
  const [availableFilters, setAvailableFilters] = useState({
    categories: [] as string[],
    genres: [] as string[],
    tags: [] as string[]
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchChart();
  }, [filters]);

  const fetchChart = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.category) params.append('category', filters.category);
      if (filters.genre) params.append('genre', filters.genre);
      if (filters.tag) params.append('tag', filters.tag);
      params.append('timeRange', filters.timeRange);
      params.append('sortBy', filters.sortBy);
      params.append('limit', '50');

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/chart?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch podcast chart');
      }

      const data = await response.json();
      setEpisodes(data.episodes || []);
      setAvailableFilters(data.filters || { categories: [], genres: [], tags: [] });
    } catch (error: any) {
      console.error('Error fetching chart:', error);
      toast.error('Failed to load podcast chart');
    } finally {
      setIsLoading(false);
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

  const handleEpisodeClick = (episode: PodcastEpisode) => {
    const episodeId = episode._id || episode.id;
    if (episodeId) {
      navigate(`/tune/${episodeId}`);
    }
  };

  const clearFilters = () => {
    setFilters({
      category: '',
      genre: '',
      tag: '',
      timeRange: 'all',
      sortBy: 'globalMediaAggregate'
    });
  };

  const hasActiveFilters = filters.category || filters.genre || filters.tag || filters.timeRange !== 'all';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <TrendingUp className="h-8 w-8 text-purple-400" />
              <h1 className="text-3xl sm:text-4xl font-bold">Podcast Chart</h1>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
            >
              <Filter className="h-5 w-5" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="bg-purple-800 text-xs px-2 py-0.5 rounded-full">
                  {[filters.category, filters.genre, filters.tag, filters.timeRange !== 'all' ? filters.timeRange : null].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>
          <p className="text-gray-400">Top podcast episodes ranked by tips and engagement</p>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-purple-500/30">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">All Categories</option>
                  {availableFilters.categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Genre Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Genre</label>
                <select
                  value={filters.genre}
                  onChange={(e) => setFilters({ ...filters, genre: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">All Genres</option>
                  {availableFilters.genres.map((genre) => (
                    <option key={genre} value={genre}>{genre}</option>
                  ))}
                </select>
              </div>

              {/* Tag Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Tag</label>
                <select
                  value={filters.tag}
                  onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">All Tags</option>
                  {availableFilters.tags.map((tag) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>

              {/* Time Range Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Time Range</label>
                <select
                  value={filters.timeRange}
                  onChange={(e) => setFilters({ ...filters, timeRange: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none"
                >
                  <option value="all">All Time</option>
                  <option value="day">Last 24 Hours</option>
                  <option value="week">Last Week</option>
                  <option value="month">Last Month</option>
                  <option value="year">Last Year</option>
                </select>
              </div>

              {/* Sort By Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Sort By</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none"
                >
                  <option value="globalMediaAggregate">Total Tips</option>
                  <option value="playCount">Play Count</option>
                  <option value="popularity">Popularity</option>
                  <option value="releaseDate">Release Date</option>
                </select>
              </div>

              {/* Clear Filters */}
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center justify-center space-x-2"
                >
                  <X className="h-4 w-4" />
                  <span>Clear All</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chart List */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        ) : episodes.length === 0 ? (
          <div className="text-center py-20">
            <Music className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No podcast episodes found</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {episodes.map((episode, index) => (
              <div
                key={episode._id || episode.id}
                onClick={() => handleEpisodeClick(episode)}
                className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 hover:bg-gray-800/70 transition-all cursor-pointer border border-gray-700 hover:border-purple-500/50"
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Cover Art */}
                  <div className="flex-shrink-0">
                    <img
                      src={episode.coverArt || episode.podcastSeries?.coverArt || DEFAULT_COVER_ART}
                      alt={episode.title}
                      className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg object-cover"
                    />
                  </div>

                  {/* Episode Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-purple-400 font-bold text-lg">#{index + 1}</span>
                          <h3 className="text-xl font-bold truncate">{episode.title}</h3>
                        </div>
                        {episode.podcastSeries && (
                          <p className="text-purple-300 text-sm mb-2">{episode.podcastSeries.title}</p>
                        )}
                        {episode.host && episode.host.length > 0 && (
                          <p className="text-gray-400 text-sm">
                            Host: {episode.host.map(h => h.name).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>

                    {episode.description && (
                      <p className="text-gray-400 text-sm line-clamp-2 mb-3">{episode.description}</p>
                    )}

                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center space-x-1 text-purple-400">
                        <TrendingUp className="h-4 w-4" />
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PodcastChart;

