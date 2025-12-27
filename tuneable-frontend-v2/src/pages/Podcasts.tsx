import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { mediaAPI } from '../lib/api';
import BidModal from '../components/BidModal';
import TopSupporters from '../components/TopSupporters';
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
  Tag
} from 'lucide-react';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
import { DEFAULT_COVER_ART } from '../constants';
import { stripHtml } from '../utils/stripHtml';
import { getCanonicalTag } from '../utils/tagNormalizer';

interface PodcastEpisode {
  _id?: string;
  id?: string;
  title: string;
  description?: string;
  coverArt?: string;
  duration?: number;
  globalMediaAggregate?: number;
  playCount?: number;
  popularity?: number;
  releaseDate?: string;
  publishedAt?: string | Date; // For Taddy and other external sources
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
  // External source fields
  source?: 'local' | 'podcastindex' | 'taddy' | 'apple';
  isExternal?: boolean;
  podcastTitle?: string;
  podcastAuthor?: string;
  podcastImage?: string;
  // External IDs for import
  podcastIndexId?: number;
  feedId?: number;
  taddyUuid?: string;
  appleId?: string;
  collectionId?: string;
  // Raw data for import
  rawData?: any;
  // Bids for top supporters
  bids?: Array<{
    _id?: string;
    userId: {
      username: string;
      profilePic?: string;
      uuid: string;
    };
    amount: number;
    createdAt: string;
    status?: string;
  }>;
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
  
  // Tag filtering state (for top tags click functionality)
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // Search/Import state
  const [searchQuery, setSearchQuery] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isImportingLink, setIsImportingLink] = useState(false);
  const [searchResults, setSearchResults] = useState<PodcastEpisode[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showImportSection, setShowImportSection] = useState(false);

  // Tipping state
  const [bidModalOpen, setBidModalOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<PodcastEpisode | null>(null);
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

  // Sync selectedTags with filters.tag
  useEffect(() => {
    if (filters.tag) {
      // Add the filter tag to selectedTags if not already present
      setSelectedTags(prev => {
        const tagLower = filters.tag.toLowerCase();
        if (!prev.some(t => t.toLowerCase() === tagLower)) {
          return [...prev, filters.tag];
        }
        return prev;
      });
    } else {
      // Clear selectedTags when filter is cleared
      setSelectedTags([]);
    }
  }, [filters.tag]);

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
    setShowSearchResults(true);
    const allResults: PodcastEpisode[] = [];
    const seenGuids = new Set<string>();

    try {
      // Helper to deduplicate and add results
      const addResults = (episodes: PodcastEpisode[], source: string) => {
        episodes.forEach(ep => {
          // Create a unique key for deduplication (title + podcast title)
          const key = `${ep.title}|${ep.podcastTitle || ep.podcastSeries?.title || ''}`.toLowerCase();
          if (!seenGuids.has(key)) {
            seenGuids.add(key);
            allResults.push({
              ...ep,
              source: source as any,
              isExternal: true,
              globalMediaAggregate: ep.globalMediaAggregate || 0
            });
          }
        });
      };

      // Step 1: Search local database first
      try {
        const params = new URLSearchParams();
        params.append('q', searchQuery);
        if (filters.category) params.append('category', filters.category);
        if (filters.genre) params.append('genre', filters.genre);
        if (filters.tag) params.append('tag', filters.tag);
        params.append('limit', '50');

        const localResponse = await fetch(
          `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/search-episodes?${params}`
        );

        if (localResponse.ok) {
          const localData = await localResponse.json();
          const localEpisodes = (localData.episodes || []).map((ep: PodcastEpisode) => ({
            ...ep,
            source: 'local' as const,
            isExternal: false
          }));
          addResults(localEpisodes, 'local');
        }
      } catch (error) {
        console.error('Error searching local database:', error);
      }

      // Step 2: Search Taddy (primary external source for discovery)
      try {
        const taddyParams = new URLSearchParams();
        taddyParams.append('q', searchQuery);
        taddyParams.append('max', '20');

        const taddyResponse = await fetch(
          `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/discovery/taddy/search-episodes?${taddyParams}`
        );

        if (taddyResponse.ok) {
          const taddyData = await taddyResponse.json();
          // Store raw data for import (includes RSS URLs in podcastSeries)
          const episodesWithRaw = (taddyData.episodes || []).map((ep: any) => ({
            ...ep,
            rawData: ep // Store full episode data for import
          }));
          addResults(episodesWithRaw, 'taddy');
        }
      } catch (error) {
        console.error('Error searching Taddy:', error);
      }

      setSearchResults(allResults);
      
      if (allResults.length === 0) {
        toast.info('No episodes found. Try a different search term.');
      } else {
        const sourceCounts = allResults.reduce((acc, ep) => {
          acc[ep.source || 'unknown'] = (acc[ep.source || 'unknown'] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const sources = Object.entries(sourceCounts).map(([source, count]) => `${source} (${count})`).join(', ');
        toast.success(`Found ${allResults.length} episodes from: ${sources}`);
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

  const handleImportAndTip = async (episode: PodcastEpisode, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.info('Please log in to import and tip podcast episodes');
      navigate('/login');
      return;
    }

    // If already in database, just open tip modal
    if (!episode.isExternal && episode._id) {
      setSelectedEpisode(episode);
      setBidModalOpen(true);
      return;
    }

    // Import external episode first
    setIsPlacingBid(true);
    try {
      const token = localStorage.getItem('token');
      
      // Prepare episode data based on source - use rawData if available
      let episodeData: any = episode.rawData || {};
      let seriesData: any = null;

      // If no rawData, construct from episode fields
      if (!episode.rawData) {
        if (episode.source === 'podcastindex') {
          episodeData = {
            title: episode.title,
            description: episode.description,
            feedTitle: episode.podcastTitle,
            feedId: episode.feedId,
            feedImage: episode.podcastImage,
            feedAuthor: episode.podcastAuthor,
            duration: episode.duration || 0,
            enclosureUrl: (episode as any).audioUrl || '',
            datePublished: episode.releaseDate ? Math.floor(new Date(episode.releaseDate).getTime() / 1000) : Math.floor(Date.now() / 1000),
            id: episode.podcastIndexId,
            guid: (episode as any).guid || ''
          };
        } else if (episode.source === 'taddy') {
          episodeData = {
            uuid: episode.taddyUuid,
            name: episode.title,
            description: episode.description,
            podcastSeriesUuid: (episode as any).podcastSeriesUuid
          };
        } else if (episode.source === 'apple') {
          episodeData = {
            trackName: episode.title,
            description: episode.description,
            collectionName: episode.podcastTitle,
            collectionId: episode.collectionId,
            artworkUrl600: episode.podcastImage,
            artistName: episode.podcastAuthor,
            trackTimeMillis: (episode.duration || 0) * 1000,
            trackId: episode.appleId,
            releaseDate: episode.releaseDate || new Date().toISOString()
          };
        }
      }

      // Prepare series data if available
      if (episode.podcastTitle && (episode.source === 'podcastindex' || episode.source === 'apple')) {
        seriesData = {
          title: episode.podcastTitle,
          description: '',
          author: episode.podcastAuthor || '',
          image: episode.podcastImage || null,
          categories: episode.genres || [],
          language: 'en'
        };
        if (episode.source === 'podcastindex') {
          seriesData.podcastIndexId = episode.feedId?.toString();
        }
      }

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/discovery/import-single-episode`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            source: episode.source,
            episodeData,
            seriesData
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import episode');
      }

      const data = await response.json();
      const importedEpisode = data.episode;

      toast.success(`Imported: ${importedEpisode.title}`);
      
      // Update the episode in search results
      const updatedEpisode: PodcastEpisode = {
        ...episode,
        _id: importedEpisode._id,
        isExternal: false,
        source: 'local',
        globalMediaAggregate: importedEpisode.globalMediaAggregate || 0
      };
      
      // Update search results
      setSearchResults(prev => prev.map(ep => 
        ep.title === episode.title && ep.podcastTitle === episode.podcastTitle
          ? updatedEpisode
          : ep
      ));

      // Open tip modal with imported episode
      setSelectedEpisode(updatedEpisode);
      setBidModalOpen(true);
    } catch (error: any) {
      console.error('Error importing episode:', error);
      toast.error(error.message || 'Failed to import episode');
    } finally {
      setIsPlacingBid(false);
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
    setBidModalOpen(true);
  };

  const handlePlaceBid = async (amount: number) => {
    if (!selectedEpisode || !user) return;

    setIsPlacingBid(true);
    try {
      const episodeId = selectedEpisode._id || selectedEpisode.id;
      if (!episodeId) {
        toast.error('Episode ID not found');
        return;
      }
      await mediaAPI.placeGlobalBid(episodeId, amount);
      
      toast.success(`Tip of £${amount.toFixed(2)} placed successfully!`);
      setBidModalOpen(false);
      setSelectedEpisode(null);
      
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

  const formatDate = (dateString?: string | Date | null, publishedAt?: string | Date | null) => {
    // Prefer releaseDate, fallback to publishedAt
    const dateValue = dateString || publishedAt;
    
    if (!dateValue) return 'Unknown';
    
    // Handle Date objects
    let date: Date;
    if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      return 'Unknown';
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Unknown';
    }
    
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleEpisodeClick = (episode: PodcastEpisode) => {
    const episodeId = episode._id || episode.id;
    if (episodeId) {
      navigate(`/podcasts/${episodeId}`);
    }
  };

  const handleSeriesClick = async (episode: PodcastEpisode, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      toast.info('Please log in to view podcast series');
      navigate('/login');
      return;
    }

    // If series already exists in database, navigate directly
    if (episode.podcastSeries?._id) {
      navigate(`/podcast/${episode.podcastSeries._id}`);
      return;
    }

    // Otherwise, create or find the series first
    try {
      const token = localStorage.getItem('token');
      
      // Prepare series data based on episode source
      let seriesData: any = null;
      
      if (episode.podcastTitle) {
        seriesData = {
          title: episode.podcastTitle,
          description: '',
          author: episode.podcastAuthor || '',
          image: episode.podcastImage || episode.coverArt || null,
          categories: episode.genres || [],
          language: 'en'
        };
        
        // Add external IDs and RSS URL based on source
        if (episode.source === 'taddy') {
          if ((episode as any).podcastSeriesUuid) {
            seriesData.taddyUuid = (episode as any).podcastSeriesUuid;
          }
          // Get RSS URL from episode's rawData (from Taddy search)
          if ((episode as any).rawData?.podcastSeries?.rssUrl) {
            seriesData.rssUrl = (episode as any).rawData.podcastSeries.rssUrl;
          }
        } else if (episode.source === 'podcastindex' && episode.feedId) {
          seriesData.podcastIndexId = episode.feedId.toString();
        } else if (episode.source === 'apple' && episode.collectionId) {
          seriesData.iTunesId = episode.collectionId;
        }
      }

      if (!seriesData) {
        toast.error('Unable to determine podcast series information');
        return;
      }

      // Create or find series via backend
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/discovery/create-or-find-series`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ seriesData })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create/find series');
      }

      const data = await response.json();
      navigate(`/podcast/${data.series._id}`);
    } catch (error: any) {
      console.error('Error creating/finding series:', error);
      toast.error(error.message || 'Failed to load podcast series');
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

  // Top Tags cloud (similar to Party page)
  const topTags = useMemo(() => {
    if (displayEpisodes.length === 0) return [] as Array<{ tag: string; total: number; count: number }>;
    const counts: Record<string, { total: number; count: number }> = {};

    for (const episode of displayEpisodes) {
      const tags: string[] = Array.isArray(episode.tags) ? episode.tags : [];
      const value = typeof episode.globalMediaAggregate === 'number' ? episode.globalMediaAggregate : 0;

      for (const raw of tags) {
        const t = (raw || '').trim().toLowerCase();
        if (!t) continue;
        if (!counts[t]) counts[t] = { total: 0, count: 0 };
        counts[t].total += value;
        counts[t].count += 1;
      }
    }

    return Object.entries(counts)
      .map(([tag, v]) => ({ tag, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total || b.count - a.count)
      .slice(0, 15);
  }, [displayEpisodes]);

  // Selected tag filters (canonical form for matching)
  const selectedTagFilters = useMemo(() => {
    return selectedTags
      .map(t => t && typeof t === 'string' ? getCanonicalTag(t) : '')
      .filter(t => t);
  }, [selectedTags]);

  // Aggregate bids across episodes filtered by selected tags
  const topSupporterBids = useMemo(() => {
    if (displayEpisodes.length === 0) return [] as any[];
    const out: any[] = [];
    
    for (const episode of displayEpisodes) {
      // Get canonical forms of tags for matching (handles aliases like D&b -> dnb)
      const tags: string[] = Array.isArray(episode.tags) 
        ? episode.tags.map((t: string) => t && typeof t === 'string' ? getCanonicalTag(t) : '').filter((t: string) => t)
        : [];
      
      if (selectedTagFilters.length > 0) {
        // Use OR logic (.some()) to match filtering behavior
        // Episode should be included if it has ANY of the selected tags
        const ok = selectedTagFilters.some((selectedTag) => 
          tags.some((tag) => tag === selectedTag)
        );
        if (!ok) continue;
      }
      
      // Add all bids from this episode
      if (episode.bids && Array.isArray(episode.bids)) {
        episode.bids.forEach((b: any) => {
          // Only include active bids
          if (!b.status || b.status === 'active') {
            out.push(b);
          }
        });
      }
    }
    return out;
  }, [displayEpisodes, selectedTagFilters]);

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
          
          {/* Search */}
          <div className="mb-4">
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
              <button
                onClick={() => setShowImportSection(!showImportSection)}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center justify-center space-x-2"
              >
                <LinkIcon className="h-5 w-5 text-purple-400" />
                <span className="text-sm font-medium text-white">Import from URL/RSS Feed</span>
                <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${showImportSection ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {/* Link Import - Collapsible */}
          {showImportSection && (
            <div className="mt-3">
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
          )}

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

        {/* Top Tags + Top Supporters (two columns on desktop) */}
        {!showSearchResults && (
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Top Tags Cloud */}
            {topTags.length > 0 && (
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-3 md:p-6 border border-purple-500/30">
                <div className="flex items-center justify-between mb-1 md:mb-3">
                  <h3 className="text-lg font-semibold text-white flex items-center">
                    <Tag className="h-4 w-4 mr-2 text-purple-400" />
                    Top Tags
                  </h3>
                  {selectedTags.length > 0 && (
                    <button
                      onClick={() => setSelectedTags([])}
                      className="text-sm text-purple-300 hover:text-white"
                    >
                      Clear tags
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {topTags.map(({ tag, total }) => {
                    const hash = `#${tag}`;
                    const selected = selectedTags.some((t) => t.toLowerCase() === tag.toLowerCase());
                    const weight = Math.max(0.75, Math.min(1.25, total / 50));
                    const sizeClass = weight > 1.1 ? 'text-sm' : weight > 0.95 ? 'text-xs' : 'text-[10px]';

                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          if (selected) {
                            setSelectedTags(prev => prev.filter(t => t.toLowerCase() !== tag.toLowerCase()));
                            // Clear tag filter if this was the only selected tag
                            if (filters.tag === tag) {
                              setFilters({ ...filters, tag: '' });
                            }
                          } else {
                            setSelectedTags(prev => [...prev, tag]);
                            // Update filter to show only episodes with this tag
                            setFilters({ ...filters, tag: tag });
                          }
                        }}
                        className={`rounded-full px-3 py-1 transition-colors ${sizeClass} ${
                          selected
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 text-gray-200 hover:bg-gray-800'
                        }`}
                        title={`${penceToPounds(total)} total across episodes`}
                      >
                        #{tag}
                        <span className="ml-2 text-[10px] opacity-70">{penceToPounds(total)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top Supporters */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-3 md:p-6 border border-purple-500/30">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2 md:mb-3">
                <h3 className="text-base md:text-lg font-semibold text-white">Top Supporters</h3>
                {selectedTagFilters.length > 0 ? (
                  <span className="text-xs text-purple-300">Filtered by {selectedTagFilters.map((t) => `#${t}`).join(', ')}</span>
                ) : (
                  <span className="text-xs text-gray-400">Showing global support</span>
                )}
              </div>
              <div className="max-h-48 md:max-h-64 overflow-y-auto pr-1">
                <TopSupporters bids={topSupporterBids} maxDisplay={10} />
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
                      src={episode.coverArt || episode.podcastImage || episode.podcastSeries?.coverArt || DEFAULT_COVER_ART}
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
                          {episode.isExternal && episode.source && (
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              episode.source === 'podcastindex' ? 'bg-blue-600/30 text-blue-300' :
                              episode.source === 'taddy' ? 'bg-green-600/30 text-green-300' :
                              episode.source === 'apple' ? 'bg-gray-600/30 text-gray-300' :
                              'bg-purple-600/30 text-purple-300'
                            }`}>
                              {episode.source === 'podcastindex' ? 'Podcast Index' :
                               episode.source === 'taddy' ? 'Taddy' :
                               episode.source === 'apple' ? 'Apple' : episode.source}
                            </span>
                          )}
                        </div>
                        {(episode.podcastSeries || episode.podcastTitle) && (
                          <p 
                            className="text-purple-300 text-sm mb-2 cursor-pointer hover:text-purple-200 hover:underline transition-colors"
                            onClick={(e) => handleSeriesClick(episode, e)}
                          >
                            {episode.podcastSeries?.title || episode.podcastTitle}
                          </p>
                        )}
                        {(episode.host && episode.host.length > 0) || episode.podcastAuthor ? (
                          <p className="text-gray-400 text-sm">
                            {episode.host && episode.host.length > 0 
                              ? `Host: ${episode.host.map(h => h.name).join(', ')}`
                              : episode.podcastAuthor ? `Author: ${episode.podcastAuthor}` : ''}
                          </p>
                        ) : null}
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
                      {episode.playCount !== undefined && (
                        <div className="flex items-center space-x-1 text-gray-400">
                          <Play className="h-4 w-4" />
                          <span>{episode.playCount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-1 text-gray-400">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(episode.releaseDate, episode.publishedAt)}</span>
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

                    {/* Tip/Import & Tip Button */}
                    {user && (
                      <button
                        onClick={(e) => episode.isExternal ? handleImportAndTip(episode, e) : handleTipClick(episode, e)}
                        disabled={isPlacingBid}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all flex items-center gap-2"
                      >
                        {isPlacingBid ? (
                          <>
                            <Loader className="h-4 w-4 animate-spin" />
                            <span>Adding...</span>
                          </>
                        ) : (
                          <>
                            <Coins className="h-4 w-4" />
                            <span>{episode.isExternal ? 'Add & Tip' : 'Tip Episode'}</span>
                          </>
                        )}
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
        }}
        onConfirm={handlePlaceBid}
        songTitle={selectedEpisode?.title || ''}
        songArtist={selectedEpisode?.creatorDisplay || selectedEpisode?.podcastSeries?.title || 'Unknown'}
        currentBid={selectedEpisode ? penceToPoundsNumber(selectedEpisode.globalMediaAggregate) : 0}
        minimumBid={(selectedEpisode as any)?.minimumBid ?? 0.01}
        userBalance={user ? penceToPoundsNumber((user as any).balance) : 0}
        isLoading={isPlacingBid}
      />
    </div>
  );
};

export default Podcasts;

