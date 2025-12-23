import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { mediaAPI } from '../lib/api';
import BidModal from '../components/BidModal';
import { 
  ArrowLeft,
  Music,
  Clock,
  Calendar,
  TrendingUp,
  Coins,
  Users,
  Share2,
  Copy,
  Check,
  ChevronDown,
  Twitter,
  Facebook,
  Linkedin,
  Search,
  RefreshCw
} from 'lucide-react';
import { DEFAULT_COVER_ART } from '../constants';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
import { stripHtml } from '../utils/stripHtml';

interface PodcastSeries {
  _id: string;
  title: string;
  description?: string;
  coverArt?: string;
  host?: Array<{ name: string; userId?: any }>;
  genres?: string[];
  tags?: string[];
  language?: string;
  externalIds?: Record<string, string>;
}

interface Episode {
  _id: string;
  title: string;
  description?: string;
  coverArt?: string;
  duration?: number;
  globalMediaAggregate: number;
  releaseDate?: string;
  episodeNumber?: number;
  seasonNumber?: number;
  host?: Array<{ name: string }>;
  tags?: string[];
  genres?: string[];
}

interface SeriesStats {
  totalEpisodes: number;
  totalTips: number;
  avgTip: number;
  topEpisode?: {
    _id: string;
    title: string;
    globalMediaAggregate: number;
  };
}

const PodcastSeriesProfile: React.FC = () => {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [series, setSeries] = useState<PodcastSeries | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [stats, setStats] = useState<SeriesStats | null>(null);
  const [isLoadingSeries, setIsLoadingSeries] = useState(true);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading podcast series...');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [episodeCount, setEpisodeCount] = useState<number | null>(null);
  const [loadingSource, setLoadingSource] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState<string>('');
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'mostTipped' | 'duration'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const episodesPerPage = 20;
  
  // Tipping state
  const [bidModalOpen, setBidModalOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [isPlacingBid, setIsPlacingBid] = useState(false);

  // Share state
  const [isMobile, setIsMobile] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (seriesId) {
      // First load series info (fast)
      fetchSeriesInfo().then(() => {
        // Then load episodes (slower, with import)
        fetchEpisodes();
      });
    }
  }, [seriesId]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Reset to page 1 when search or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

  const fetchSeriesInfo = async () => {
    if (!seriesId) return;
    
    setIsLoadingSeries(true);
    try {
      const url = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/series/${seriesId}/info`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          toast.error('Podcast series not found');
          navigate('/podcasts');
          return;
        }
        throw new Error('Failed to fetch podcast series');
      }

      const data = await response.json();
      setSeries(data.series);
      setStats(data.stats || null);
    } catch (error: any) {
      console.error('Error fetching series info:', error);
      toast.error('Failed to load podcast series');
    } finally {
      setIsLoadingSeries(false);
    }
  };

  const fetchEpisodes = async (refresh = false) => {
    if (!seriesId) return;
    
    setIsLoadingEpisodes(true);
    setLoadingMessage('Loading episodes...');
    setLoadingStage('loading');
    setLoadingSource(null);
    setEpisodeCount(null);
    setLoadingProgress(20);
    
    try {
      const params = new URLSearchParams();
      if (refresh) {
        params.append('refresh', 'true');
      }
      
      // Don't auto-import on initial load if episodes likely exist
      // Only import if explicitly refreshing or loading more
      if (!refresh) {
        params.append('autoImport', 'false'); // Skip auto-import on initial load
      }
      
      setLoadingMessage('Fetching episodes...');
      setLoadingProgress(50);
      
      const url = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/series/${seriesId}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch episodes');
      }

      setLoadingMessage('Processing episodes...');
      setLoadingProgress(80);
      
      const data = await response.json();
      
      // If episodes exist, show them immediately
      if (data.episodes && data.episodes.length > 0) {
        setEpisodes(data.episodes || []);
        if (data.stats) {
          setStats(data.stats);
        }
        setEpisodeCount(data.episodes.length);
        setLoadingProgress(100);
        
        // Only show import message if new episodes were imported
        if (data.importInfo && data.importInfo.imported > 0) {
          toast.success(`Imported ${data.importInfo.imported} new episode${data.importInfo.imported === 1 ? '' : 's'}`);
        }
      } else {
        // No episodes exist, trigger import with limit=10
        setLoadingMessage('Importing episodes from external sources...');
        setLoadingStage('importing');
        setLoadingProgress(60);
        
        // Re-fetch with auto-import enabled and limit=10
        const importParams = new URLSearchParams();
        importParams.append('autoImport', 'true');
        importParams.append('limit', '10'); // Reduce initial import to 10
        const importUrl = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/series/${seriesId}?${importParams.toString()}`;
        
        // Start the import (don't await yet)
        const importPromise = fetch(importUrl);
        
        // Start polling for progress
        let pollInterval: NodeJS.Timeout | null = null;
        let pollAttempts = 0;
        const maxPollAttempts = 120; // Poll for up to 2 minutes (120 * 1s)
        
        const pollProgress = async () => {
          try {
            const progressUrl = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/series/${seriesId}/import-progress`;
            const progressResponse = await fetch(progressUrl);
            
            if (progressResponse.ok) {
              const progressData = await progressResponse.json();
              
              if (progressData.status === 'importing' && progressData.total > 0) {
                // Update UI with real progress
                const progressPercent = Math.min(60 + (progressData.current / progressData.total) * 35, 95); // 60% to 95%
                setLoadingProgress(progressPercent);
                setEpisodeCount(progressData.current);
                setLoadingMessage(`Processing episode ${progressData.current} of ${progressData.total}...`);
                
                // Continue polling
                pollAttempts++;
                if (pollAttempts < maxPollAttempts) {
                  pollInterval = setTimeout(pollProgress, 1000); // Poll every second
                }
              } else if (progressData.status === 'complete') {
                // Import complete, stop polling
                if (pollInterval) {
                  clearTimeout(pollInterval);
                }
                setLoadingProgress(95);
                setLoadingMessage('Finalizing...');
              } else if (progressData.status === 'not_started') {
                // Import hasn't started yet, keep polling
                pollAttempts++;
                if (pollAttempts < maxPollAttempts) {
                  pollInterval = setTimeout(pollProgress, 1000);
                }
              }
            }
          } catch (error) {
            console.error('Error polling progress:', error);
            // Continue polling on error (might be transient)
            pollAttempts++;
            if (pollAttempts < maxPollAttempts && pollInterval) {
              pollInterval = setTimeout(pollProgress, 1000);
            }
          }
        };
        
        // Start polling immediately
        pollProgress();
        
        try {
          const importResponse = await importPromise;
          
          // Stop polling once we get the response
          if (pollInterval) {
            clearTimeout(pollInterval);
          }
          
          if (importResponse.ok) {
            const importData = await importResponse.json();
            setEpisodes(importData.episodes || []);
            if (importData.stats) {
              setStats(importData.stats);
            }
            if (importData.importInfo && importData.importInfo.imported > 0) {
              toast.success(`Imported ${importData.importInfo.imported} new episode${importData.importInfo.imported === 1 ? '' : 's'}`);
            }
          }
          setLoadingProgress(100);
        } catch (error) {
          // Stop polling on error
          if (pollInterval) {
            clearTimeout(pollInterval);
          }
          throw error;
        }
      }
    } catch (error: any) {
      console.error('Error fetching episodes:', error);
      toast.error('Failed to load episodes');
      setLoadingMessage('Error loading episodes');
      setLoadingStage('error');
    } finally {
      setIsLoadingEpisodes(false);
      setLoadingProgress(0);
      setEpisodeCount(null);
      setLoadingSource(null);
      setLoadingStage('');
    }
  };
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchEpisodes(true);
    setIsRefreshing(false);
  };
  
  const handleLoadMore = async () => {
    if (!seriesId || isLoadingMore) return;
    
    setIsLoadingMore(true);
    setLoadingMessage('Preparing to load more episodes...');
    setLoadingStage('preparing');
    setLoadingSource(null);
    setEpisodeCount(null);
    setLoadingProgress(10);
    
    try {
      // Stage 1: Connecting
      setLoadingMessage('Connecting to podcast database...');
      setLoadingStage('connecting');
      setLoadingProgress(15);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Stage 2: Checking existing episodes
      setLoadingMessage('Checking for new episodes...');
      setLoadingStage('checking');
      setLoadingProgress(25);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Use current episode count as offset (how many we've already loaded)
      const params = new URLSearchParams({
        loadMore: 'true',
        limit: '20',
        offset: episodes.length.toString() // Offset based on currently loaded episodes
      });
      
      // Stage 3: Fetching from RSS/Taddy
      setLoadingMessage('Fetching episodes from external sources...');
      setLoadingStage('fetching');
      setLoadingSource('RSS/Taddy');
      setLoadingProgress(35);
      await new Promise(resolve => setTimeout(resolve, 400));
      
      const url = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/series/${seriesId}?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to load more episodes');
      }

      // Stage 4: Processing response
      setLoadingMessage('Processing episode data...');
      setLoadingStage('processing');
      setLoadingProgress(50);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const data = await response.json();
      
      // Stage 5: Importing new episodes
      if (data.importInfo && data.importInfo.imported > 0) {
        setEpisodeCount(data.importInfo.imported);
        setLoadingMessage(`Importing ${data.importInfo.imported} new episode${data.importInfo.imported === 1 ? '' : 's'}...`);
        setLoadingStage('importing');
        setLoadingProgress(60);
        
        // Simulate progress during import
        for (let i = 60; i < 90; i += 5) {
          await new Promise(resolve => setTimeout(resolve, 200));
          setLoadingProgress(i);
        }
      } else {
        setLoadingMessage('Finalizing episode list...');
        setLoadingStage('finalizing');
        setLoadingProgress(70);
      }
      
      // Append new episodes to existing list
      const newEpisodes = data.episodes || [];
      setEpisodes(prev => {
        const existingIds = new Set(prev.map(ep => ep._id));
        const uniqueNewEpisodes = newEpisodes.filter((ep: Episode) => !existingIds.has(ep._id));
        return [...prev, ...uniqueNewEpisodes];
      });
      
      // Update stats
      if (data.stats) {
        setStats(data.stats);
      }
      
      // Stage 6: Complete
      setLoadingMessage('Complete!');
      setLoadingStage('complete');
      setLoadingProgress(100);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (data.importInfo && data.importInfo.imported > 0) {
        toast.success(`Loaded ${data.importInfo.imported} more episode${data.importInfo.imported === 1 ? '' : 's'}`);
      } else {
        toast.info('No more episodes available to load');
      }
    } catch (error: any) {
      console.error('Error loading more episodes:', error);
      toast.error('Failed to load more episodes');
      setLoadingMessage('Error loading episodes');
      setLoadingStage('error');
    } finally {
      setIsLoadingMore(false);
      setLoadingProgress(0);
      setEpisodeCount(null);
      setLoadingSource(null);
      setLoadingStage('');
    }
  };
  
  // Filter and sort episodes
  const getFilteredAndSortedEpisodes = () => {
    let filtered = episodes;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(ep =>
        ep.title.toLowerCase().includes(query) ||
        ep.description?.toLowerCase().includes(query) ||
        ep.host?.some(h => h.name.toLowerCase().includes(query))
      );
    }
    
    // Apply sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return dateB - dateA;
        case 'oldest':
          const dateA2 = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB2 = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return dateA2 - dateB2;
        case 'mostTipped':
          return (b.globalMediaAggregate || 0) - (a.globalMediaAggregate || 0);
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        default:
          return 0;
      }
    });
    
    return sorted;
  };
  
  // Pagination
  const paginatedEpisodes = () => {
    const filtered = getFilteredAndSortedEpisodes();
    const startIndex = (currentPage - 1) * episodesPerPage;
    const endIndex = startIndex + episodesPerPage;
    return filtered.slice(startIndex, endIndex);
  };
  
  const totalPages = Math.ceil(getFilteredAndSortedEpisodes().length / episodesPerPage);
  
  // Reset to page 1 when search or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

  const handleTipClick = (episode: Episode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.info('Please log in to tip podcast episodes');
      navigate('/login');
      return;
    }
    setSelectedEpisode(episode);
    setBidModalOpen(true);
  };

  const handlePlaceBid = async (amount: number) => {
    if (!selectedEpisode || !user) return;

    setIsPlacingBid(true);
    try {
      const episodeId = selectedEpisode._id;
      await mediaAPI.placeGlobalBid(episodeId, amount);
      
      toast.success(`Tip of £${amount.toFixed(2)} placed successfully!`);
      setBidModalOpen(false);
      setSelectedEpisode(null);
      
      // Refresh series data
      await fetchSeriesInfo();
      await fetchEpisodes();
      
      // Refresh user balance
      window.location.reload();
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

  const handleEpisodeClick = (episode: Episode) => {
    navigate(`/podcasts/${episode._id}`);
  };

  // Share functionality
  const shareUrl = window.location.href;
  const shareText = `Check out "${series?.title || 'this podcast'}" on Tuneable! Support your favourite podcasts and discover new content.`;

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: series?.title || 'Tuneable Podcast',
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

  if (isLoadingSeries) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-300 text-lg">Loading podcast series...</p>
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Podcast series not found</h1>
            <button onClick={() => navigate('/podcasts')} className="btn-primary">
              Back to Podcasts
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => navigate('/podcasts')}
          className="mb-6 flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Podcasts</span>
        </button>

        {/* Series Header */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          {/* Cover Art */}
          <div className="flex-shrink-0">
            <img
              src={series.coverArt || DEFAULT_COVER_ART}
              alt={series.title}
              className="w-48 h-48 md:w-64 md:h-64 rounded-lg object-cover shadow-xl"
            />
          </div>

          {/* Series Info */}
          <div className="flex-1">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-3xl md:text-4xl font-bold mb-2">{series.title}</h1>
                {series.host && series.host.length > 0 && (
                  <p className="text-purple-300 text-lg mb-2">
                    Host: {series.host.map(h => h.name).join(', ')}
                  </p>
                )}
              </div>
              
              {/* Share Button */}
              <div className="relative">
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
                      <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
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

            {series.description && (
              <p className="text-gray-300 mb-4">{stripHtml(series.description)}</p>
            )}

            {/* Genres/Tags */}
            {(series.genres && series.genres.length > 0) || (series.tags && series.tags.length > 0) ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {series.genres?.slice(0, 5).map((genre, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-purple-600/30 text-purple-300 text-xs rounded-full"
                  >
                    {genre}
                  </span>
                ))}
                {series.tags?.slice(0, 5).map((tag, idx) => (
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

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
            <div className="bg-gray-900/80 px-4 py-3 rounded-lg border-2 border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-600/30 rounded-lg">
                  <Music className="h-5 w-5 text-purple-300" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white">{stats.totalEpisodes}</div>
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
                  <div className="text-xl sm:text-2xl font-bold text-white">{penceToPounds(stats.totalTips)}</div>
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
                  <div className="text-xl sm:text-2xl font-bold text-white">{penceToPounds(stats.avgTip)}</div>
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
                  <div className="text-xl sm:text-2xl font-bold text-white">{stats.totalEpisodes}</div>
                  <div className="text-xs text-gray-400">Ranked</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Episodes List */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h2 className="text-2xl font-bold">Episodes</h2>
            
            {/* Search and Controls */}
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              {/* Search Bar */}
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search episodes..."
                  className="w-full bg-gray-700 text-white rounded-lg pl-10 pr-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>
              
              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="mostTipped">Most Tipped</option>
                <option value="duration">Longest</option>
              </select>
              
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                title="Refresh episodes from external source"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
          
          {/* Search Results Count */}
          {!isLoadingEpisodes && (searchQuery || getFilteredAndSortedEpisodes().length !== episodes.length) && (
            <p className="text-gray-400 text-sm mb-4">
              Showing {getFilteredAndSortedEpisodes().length} of {episodes.length} episodes
            </p>
          )}
          
          {isLoadingEpisodes ? (
            <div className="text-center py-12 bg-gray-800/50 rounded-lg">
              <RefreshCw className="h-12 w-12 text-purple-400 animate-spin mx-auto mb-4" />
              
              {/* Main Loading Message */}
              <p className="text-gray-300 text-xl font-semibold mb-2">{loadingMessage}</p>
              
              {/* Episode Count Display */}
              {episodeCount !== null && (
                <div className="mb-4">
                  <div className="inline-flex items-center space-x-2 bg-purple-600/20 px-4 py-2 rounded-lg border border-purple-500/30">
                    <Music className="h-5 w-5 text-purple-400" />
                    <span className="text-purple-300 font-bold text-lg">{episodeCount}</span>
                    <span className="text-gray-400 text-sm">
                      {episodeCount === 1 ? 'episode' : 'episodes'} {loadingStage === 'importing' ? 'imported' : 'found'}
                    </span>
                  </div>
                </div>
              )}
              
              {/* Source Indicator */}
              {loadingSource && (
                <div className="mb-4">
                  <span className="inline-flex items-center space-x-2 text-sm text-gray-400">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></span>
                    <span>Fetching from {loadingSource}</span>
                  </span>
                </div>
              )}
              
              {/* Stage Description */}
              {loadingStage && (
                <p className="text-gray-500 text-sm mb-4">
                  {loadingStage === 'searching' && 'Searching external podcast databases...'}
                  {loadingStage === 'connecting' && 'Establishing connection...'}
                  {loadingStage === 'checking' && 'Checking for existing episodes...'}
                  {loadingStage === 'fetching-taddy' && 'Requesting episodes from Taddy API...'}
                  {loadingStage === 'processing-taddy' && 'Processing Taddy episode data...'}
                  {loadingStage === 'processing' && 'Organizing episode information...'}
                  {loadingStage === 'importing' && (
                    episodeCount !== null ? 
                      `Processing episode ${episodeCount}...` : 
                      'Adding episodes to database...'
                  )}
                  {loadingStage === 'finalizing' && 'Preparing episode list...'}
                  {loadingStage === 'complete' && 'Almost done!'}
                </p>
              )}
              
              {/* Progress Bar */}
              <div className="w-full max-w-md mx-auto bg-gray-700 rounded-full h-3 mb-4 overflow-hidden shadow-inner">
                <div 
                  className="bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              
              {/* Progress Percentage */}
              <div className="mb-4">
                <span className="text-purple-400 font-semibold">{loadingProgress}%</span>
                <span className="text-gray-500 text-sm ml-2">complete</span>
              </div>
              
              {/* Loading Steps Indicator */}
              <div className="flex justify-center space-x-2 mt-4 mb-4">
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${loadingProgress >= 15 ? 'bg-purple-400 scale-125' : 'bg-gray-600'}`} />
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${loadingProgress >= 35 ? 'bg-purple-400 scale-125' : 'bg-gray-600'}`} />
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${loadingProgress >= 60 ? 'bg-purple-400 scale-125' : 'bg-gray-600'}`} />
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${loadingProgress >= 80 ? 'bg-purple-400 scale-125' : 'bg-gray-600'}`} />
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${loadingProgress >= 100 ? 'bg-purple-400 scale-125' : 'bg-gray-600'}`} />
              </div>
              
              {/* Helpful tip */}
              <p className="text-gray-600 text-xs mt-6">
                💡 Tip: Episodes are automatically imported from Taddy, RSS feeds, and other sources
              </p>
            </div>
          ) : episodes.length === 0 ? (
            <div className="text-center py-12 bg-gray-800/50 rounded-lg">
              <Music className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No episodes found for this podcast series</p>
              <p className="text-gray-500 text-sm mt-2">Episodes will be imported automatically when available</p>
            </div>
          ) : getFilteredAndSortedEpisodes().length === 0 ? (
            <div className="text-center py-12 bg-gray-800/50 rounded-lg">
              <Search className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No episodes match your search</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 text-purple-400 hover:text-purple-300"
              >
                Clear search
              </button>
            </div>
          ) : (
            <>
            <div className="space-y-4">
              {paginatedEpisodes().map((episode, index) => (
                <div
                  key={episode._id}
                  className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 hover:bg-gray-800/70 transition-all border border-gray-700 hover:border-purple-500/50"
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Cover Art */}
                    <div 
                      className="flex-shrink-0 cursor-pointer"
                      onClick={() => handleEpisodeClick(episode)}
                    >
                      <img
                        src={episode.coverArt || series.coverArt || DEFAULT_COVER_ART}
                        alt={episode.title}
                        className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg object-cover"
                      />
                    </div>

                    {/* Episode Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-purple-400 font-bold text-lg">#{(currentPage - 1) * episodesPerPage + index + 1}</span>
                            <h3 
                              className="text-xl font-bold truncate cursor-pointer hover:text-purple-300"
                              onClick={() => handleEpisodeClick(episode)}
                            >
                              {episode.title}
                            </h3>
                          </div>
                          {episode.episodeNumber && (
                            <p className="text-gray-400 text-sm mb-2">
                              Episode {episode.episodeNumber}
                              {episode.seasonNumber && ` • Season ${episode.seasonNumber}`}
                            </p>
                          )}
                        </div>
                      </div>

                      {episode.description && (
                        <p className="text-gray-400 text-sm line-clamp-2 mb-3">{stripHtml(episode.description)}</p>
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
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Previous
                </button>
                <span className="text-gray-400 px-4">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Next
                </button>
              </div>
            )}
            
            {/* Load More Episodes Button - Only show on last page */}
            {!searchQuery && currentPage === totalPages && (
              <div className="flex flex-col items-center mt-6 space-y-4">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                >
                  {isLoadingMore ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      <span>Loading more episodes...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-5 w-5" />
                      <span>Load More Episodes</span>
                    </>
                  )}
                </button>
                
                {/* Detailed loading state for load more */}
                {isLoadingMore && (
                  <div className="w-full max-w-2xl bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                    <div className="flex items-center justify-center mb-4">
                      <RefreshCw className="h-8 w-8 text-purple-400 animate-spin mr-3" />
                      <p className="text-gray-300 text-lg font-medium">{loadingMessage}</p>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-700 rounded-full h-2.5 mb-4 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-purple-600 to-pink-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${loadingProgress}%` }}
                      />
                    </div>
                    
                    {/* Loading Steps Indicator */}
                    <div className="flex justify-center space-x-2 mb-4">
                      <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${loadingProgress >= 15 ? 'bg-purple-400' : 'bg-gray-600'}`} />
                      <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${loadingProgress >= 35 ? 'bg-purple-400' : 'bg-gray-600'}`} />
                      <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${loadingProgress >= 50 ? 'bg-purple-400' : 'bg-gray-600'}`} />
                      <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${loadingProgress >= 70 ? 'bg-purple-400' : 'bg-gray-600'}`} />
                      <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${loadingProgress >= 100 ? 'bg-purple-400' : 'bg-gray-600'}`} />
                    </div>
                    
                    {/* Additional Info */}
                    <div className="text-center space-y-2">
                      {loadingSource && (
                        <p className="text-gray-400 text-sm">
                          📡 Fetching from {loadingSource}
                        </p>
                      )}
                      {episodeCount !== null && (
                        <p className="text-purple-400 text-sm font-medium">
                          {episodeCount} new episode{episodeCount === 1 ? '' : 's'} found
                        </p>
                      )}
                      <p className="text-gray-500 text-xs mt-2">
                        💡 Episodes are automatically imported from RSS feeds and external sources
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* Bid Modal */}
      <BidModal
        isOpen={bidModalOpen}
        onClose={() => {
          setBidModalOpen(false);
          setSelectedEpisode(null);
        }}
        onConfirm={handlePlaceBid}
        songTitle={selectedEpisode?.title || ''}
        songArtist={series.host && series.host.length > 0 ? series.host[0].name : series.title}
        currentBid={selectedEpisode ? penceToPoundsNumber(selectedEpisode.globalMediaAggregate) : 0}
        minimumBid={(selectedEpisode as any)?.minimumBid ?? 0.01}
        userBalance={user ? penceToPoundsNumber((user as any).balance) : 0}
        isLoading={isPlacingBid}
      />
    </div>
  );
};

export default PodcastSeriesProfile;

