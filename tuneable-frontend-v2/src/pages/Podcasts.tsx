import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { mediaAPI } from '../lib/api';
import BidModal from '../components/BidModal';
import { 
  TrendingUp, 
  Filter, 
  Clock, 
  Play, 
  Calendar,
  Music,
  X,
  Search,
  Link as LinkIcon,
  Loader,
  Share2,
  Copy,
  Check,
  ChevronDown,
  Twitter,
  Facebook,
  Linkedin,
  Coins,
  Users,
  Minus,
  Plus,
  Loader2
} from 'lucide-react';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
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
  creatorDisplay?: string;
}

const Podcasts: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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
  
  // Search/Import state
  const [searchQuery, setSearchQuery] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isImportingLink, setIsImportingLink] = useState(false);
  const [searchResults, setSearchResults] = useState<PodcastEpisode[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Tipping state
  const [bidModalOpen, setBidModalOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<PodcastEpisode | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [isPlacingBid, setIsPlacingBid] = useState(false);

  // Share state
  const [isMobile, setIsMobile] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const shareDropdownRef = useRef<HTMLDivElement>(null);

  // Metrics
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [totalTips, setTotalTips] = useState(0);
  const [avgTip, setAvgTip] = useState(0);

  useEffect(() => {
    fetchChart();
  }, [filters]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Click outside to close share dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareDropdownRef.current && !shareDropdownRef.current.contains(event.target as Node)) {
        setShowShareDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      const episodesList = data.episodes || [];
      setEpisodes(episodesList);
      setAvailableFilters(data.filters || { categories: [], genres: [], tags: [] });
      
      // Calculate metrics
      setTotalEpisodes(episodesList.length);
      const total = episodesList.reduce((sum: number, ep: PodcastEpisode) => sum + (ep.globalMediaAggregate || 0), 0);
      setTotalTips(total);
      const avg = episodesList.length > 0 ? total / episodesList.length : 0;
      setAvgTip(avg);
    } catch (error: any) {
      console.error('Error fetching chart:', error);
      toast.error('Failed to load podcast chart');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setShowSearchResults(true);
    try {
      const params = new URLSearchParams();
      params.append('q', searchQuery);
      if (filters.category) params.append('category', filters.category);
      if (filters.genre) params.append('genre', filters.genre);
      if (filters.tag) params.append('tag', filters.tag);
      params.append('limit', '50');

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/search-episodes?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to search podcast episodes');
      }

      const data = await response.json();
      setSearchResults(data.episodes || []);
      
      if (data.episodes && data.episodes.length === 0) {
        toast.info('No episodes found. Try a different search term.');
      }
    } catch (error: any) {
      console.error('Error searching:', error);
      toast.error('Failed to search podcast episodes');
    } finally {
      setIsSearching(false);
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
        // Refresh chart
        fetchChart();
        setLinkUrl('');
      } else if (data.type === 'series' && data.series) {
        toast.success(`Imported series: ${data.series.title}`);
        setLinkUrl('');
      }
    } catch (error: any) {
      console.error('Error importing link:', error);
      toast.error(error.message || 'Failed to import podcast from URL');
    } finally {
      setIsImportingLink(false);
    }
  };

  const handleTipClick = (episode: PodcastEpisode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.info('Please log in to tip podcast episodes');
      navigate('/login');
      return;
    }
    setSelectedEpisode(episode);
    setBidAmount('0.01');
    setBidModalOpen(true);
  };

  const handlePlaceBid = async (amount: number) => {
    if (!selectedEpisode || !user) return;

    setIsPlacingBid(true);
    try {
      const episodeId = selectedEpisode._id || selectedEpisode.id;
      await mediaAPI.placeGlobalBid(episodeId, amount);
      
      toast.success(`Tip of £${amount.toFixed(2)} placed successfully!`);
      setBidModalOpen(false);
      setSelectedEpisode(null);
      setBidAmount('');
      
      // Refresh chart
      fetchChart();
      
      // Refresh user balance
      window.location.reload(); // Simple refresh for now
    } catch (error: any) {
      console.error('Error placing bid:', error);
      toast.error(error.response?.data?.error || 'Failed to place tip');
    } finally {
      setIsPlacingBid(false);
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

  // Share functionality
  const shareUrl = window.location.href;
  const shareText = `Check out the top podcast episodes on Tuneable! Support your favourite podcasts and discover new content.`;

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Tuneable Podcast Chart',
          text: shareText,
          url: shareUrl,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleShare = (platform: string) => {
    try {
      const encodedUrl = encodeURIComponent(shareUrl);
      const encodedText = encodeURIComponent(shareText);

      const shareUrls: Record<string, string> = {
        twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}&hashtag=Tuneable`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      };

      if (shareUrls[platform]) {
        const shareWindow = window.open(
          shareUrls[platform], 
          '_blank', 
          'width=600,height=400,menubar=no,toolbar=no,resizable=yes,scrollbars=yes'
        );
        
        if (!shareWindow || shareWindow.closed || typeof shareWindow.closed === 'undefined') {
          toast.warning('Popup blocked. Please allow popups for this site to share.');
        }
      }
    } catch (error) {
      console.error(`Error sharing to ${platform}:`, error);
      toast.error(`Failed to open ${platform} share. Please try again.`);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy link');
    }
  };

  const displayEpisodes = showSearchResults && searchResults.length > 0 ? searchResults : episodes;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white">
      {/* Header */}
      <div className="justify-center text-center px-3 sm:px-6 py-4 sm:py-6">
        <h1 className="inline-block text-xl sm:text-3xl font-bold text-white px-6 sm:px-8 py-2 sm:py-3 rounded-full bg-gradient-to-r from-purple-600 to-purple-800 shadow-lg">
          Podcast Chart
        </h1>
      </div>

      {/* Share Button */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 p-2">
        <div className="flex justify-center">
          <div className="relative" ref={shareDropdownRef}>
            {isMobile && 'share' in navigator ? (
              <button
                onClick={handleNativeShare}
                className="px-4 py-2 rounded-lg bg-gray-900/80 hover:bg-gray-800 border border-purple-500/50 shadow-[0_0_8px_rgba(168,85,247,0.3)] flex items-center gap-2 transition-colors"
              >
                <Share2 className="h-4 w-4 text-white" />
                <span className="text-sm font-semibold text-white">Share</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowShareDropdown(!showShareDropdown)}
                  className="px-4 py-2 rounded-lg bg-gray-900/80 hover:bg-gray-800 border border-purple-500/50 shadow-[0_0_8px_rgba(168,85,247,0.3)] flex items-center gap-2 transition-colors"
                >
                  <Share2 className="h-4 w-4 text-purple-300" />
                  <span className="text-sm font-semibold text-white">Share</span>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showShareDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showShareDropdown && (
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
                    <div className="py-2">
                      <button
                        onClick={() => { handleShare('twitter'); setShowShareDropdown(false); }}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors"
                      >
                        <Twitter className="h-4 w-4 text-blue-400" />
                        <span className="text-sm text-white">Twitter/X</span>
                      </button>
                      <button
                        onClick={() => { handleShare('facebook'); setShowShareDropdown(false); }}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors"
                      >
                        <Facebook className="h-4 w-4 text-blue-500" />
                        <span className="text-sm text-white">Facebook</span>
                      </button>
                      <button
                        onClick={() => { handleShare('linkedin'); setShowShareDropdown(false); }}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors"
                      >
                        <Linkedin className="h-4 w-4 text-blue-600" />
                        <span className="text-sm text-white">LinkedIn</span>
                      </button>
                      <div className="border-t border-gray-700 my-1"></div>
                      <button
                        onClick={() => { handleCopyLink(); setShowShareDropdown(false); }}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors"
                      >
                        {copySuccess ? (
                          <Check className="h-4 w-4 text-green-400" />
                        ) : (
                          <Copy className="h-4 w-4 text-gray-400" />
                        )}
                        <span className="text-sm text-white">{copySuccess ? 'Copied!' : 'Copy Link'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gray-900/80 px-4 py-3 rounded-lg border-2 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-600/30 rounded-lg">
                <Music className="h-5 w-5 text-purple-300" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{totalEpisodes}</div>
                <div className="text-xs text-gray-400">Episodes</div>
              </div>
            </div>
          </div>
          <div className="bg-gray-900/80 px-4 py-3 rounded-lg border-2 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-600/30 rounded-lg">
                <Coins className="h-5 w-5 text-purple-300" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{penceToPounds(totalTips)}</div>
                <div className="text-xs text-gray-400">Total Tips</div>
              </div>
            </div>
          </div>
          <div className="bg-gray-900/80 px-4 py-3 rounded-lg border-2 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-600/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-300" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{penceToPounds(avgTip)}</div>
                <div className="text-xs text-gray-400">Avg Tip</div>
              </div>
            </div>
          </div>
          <div className="bg-gray-900/80 px-4 py-3 rounded-lg border-2 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-600/30 rounded-lg">
                <Users className="h-5 w-5 text-purple-300" />
              </div>
              <div>
                <div className="text-xl sm:text-2xl font-bold text-white">{totalEpisodes}</div>
                <div className="text-xs text-gray-400">Ranked</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4">
        {/* Search/Import Panel - Always Visible */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 mb-6 border border-purple-500/30">
          <h3 className="text-base sm:text-lg font-semibold text-white mb-4">Search for Podcast Episodes</h3>
          
          {/* Link Import */}
          <div className="mb-4">
            <div className="flex items-center space-x-2 mb-3">
              <LinkIcon className="h-5 w-5 text-purple-400" />
              <h4 className="text-sm font-medium text-gray-300">Import from URL</h4>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Paste Apple Podcasts, Spotify, or RSS URL..."
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

          {/* Search */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Search className="h-5 w-5 text-purple-400" />
              <h4 className="text-sm font-medium text-gray-300">Search Episodes</h4>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
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
                disabled={isSearching || !searchQuery.trim()}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                {isSearching ? (
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
          </div>

          {showSearchResults && searchResults.length > 0 && (
            <button
              onClick={() => {
                setShowSearchResults(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="mt-4 text-sm text-purple-400 hover:text-purple-300"
            >
              ← Back to Chart
            </button>
          )}
        </div>

        {/* Filters Panel */}
        <div className="mb-6 flex justify-center">
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

        {showFilters && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 mb-6 border border-purple-500/30">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

        {/* Chart/Results List */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        ) : displayEpisodes.length === 0 ? (
          <div className="text-center py-20">
            <Music className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">
              {showSearchResults ? 'No episodes found' : 'No podcast episodes found'}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              {showSearchResults ? 'Try a different search term or adjust your filters' : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayEpisodes.map((episode, index) => (
              <div
                key={episode._id || episode.id}
                className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 hover:bg-gray-800/70 transition-all border border-gray-700 hover:border-purple-500/50"
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Cover Art */}
                  <div 
                    className="flex-shrink-0 cursor-pointer"
                    onClick={() => handleEpisodeClick(episode)}
                  >
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
                          {!showSearchResults && (
                            <span className="text-purple-400 font-bold text-lg">#{index + 1}</span>
                          )}
                          <h3 
                            className="text-xl font-bold truncate cursor-pointer hover:text-purple-300"
                            onClick={() => handleEpisodeClick(episode)}
                          >
                            {episode.title}
                          </h3>
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
                    <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
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
                      <div className="flex flex-wrap gap-2 mb-3">
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

                    {/* Tip Button */}
                    {user && (
                      <button
                        onClick={(e) => handleTipClick(episode, e)}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-lg transition-all flex items-center gap-2"
                      >
                        <Coins className="h-4 w-4" />
                        <span>Tip Episode</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bid Modal */}
      <BidModal
        isOpen={bidModalOpen}
        onClose={() => {
          setBidModalOpen(false);
          setSelectedEpisode(null);
          setBidAmount('');
        }}
        onConfirm={handlePlaceBid}
        songTitle={selectedEpisode?.title || ''}
        songArtist={selectedEpisode?.creatorDisplay || selectedEpisode?.podcastSeries?.title || 'Unknown'}
        currentBid={selectedEpisode ? penceToPoundsNumber(selectedEpisode.globalMediaAggregate) : 0}
        userBalance={user ? penceToPoundsNumber((user as any).balance) : 0}
        isLoading={isPlacingBid}
      />
    </div>
  );
};

export default Podcasts;

