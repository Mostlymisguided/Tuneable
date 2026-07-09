import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import { mediaAPI } from '../lib/api';
import BidModal from '../components/BidModal';
import TopSupporters from '../components/TopSupporters';
import PodcastChartHero from '../components/PodcastChartHero';
import PodcastQueueMediaCard from '../components/PodcastQueueMediaCard';
import PodcastSeriesStrip from '../components/PodcastSeriesStrip';
import { 
  TrendingUp, 
  Clock, 
  Music,
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
  Tag,
  Music2,
  Upload,
  Award
} from 'lucide-react';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
import { usePodcastPlayerStore, getEpisodeAudioUrl } from '../stores/podcastPlayerStore';
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
  // Audio source (chart/media), or external
  sources?: Record<string, string> | { get?(k: string): string };
  audioUrl?: string;
  enclosure?: { url?: string };
  globalMediaBidTop?: number;
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

const EPISODE_PAGE_SIZE = 10;

const TIME_RANGE_OPTIONS = [
  { key: 'all', label: 'All Time' },
  { key: 'year', label: 'This Year' },
  { key: 'month', label: 'This Month' },
  { key: 'week', label: 'This Week' },
  { key: 'day', label: 'Today' },
] as const;

function formatTimeRangeLabel(range: string): string {
  return TIME_RANGE_OPTIONS.find((p) => p.key === range)?.label ?? range;
}

const Podcasts: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, token, handleOAuthCallback, refreshUser } = useAuth();
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
  const [showTagFilterCloud, setShowTagFilterCloud] = useState(false);
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [visibleEpisodeCount, setVisibleEpisodeCount] = useState(EPISODE_PAGE_SIZE);
  
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
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [isImportingSpotify, setIsImportingSpotify] = useState(false);
  const [isImportingOpml, setIsImportingOpml] = useState(false);
  const [opmlFile, setOpmlFile] = useState<File | null>(null);
  
  // Search pagination state
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreLocal, setHasMoreLocal] = useState(false);
  const [totalLocal, setTotalLocal] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

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
  const [totalTips, setTotalTips] = useState(0);
  const [avgTip, setAvgTip] = useState(0);
  const [topTip, setTopTip] = useState(0);

  // Top Podcast Series
  const [topPodcastSeries, setTopPodcastSeries] = useState<Array<{
    _id: string;
    title: string;
    coverArt?: string;
    description?: string;
    genres?: string[];
    totalGlobalMediaAggregate: number;
    episodeCount: number;
  }>>([]);
  const [isLoadingTopSeries, setIsLoadingTopSeries] = useState(true);

  useEffect(() => {
    fetchChart();
    setVisibleEpisodeCount(EPISODE_PAGE_SIZE);
  }, [filters]);

  // Fetch Spotify connection status when user is logged in
  useEffect(() => {
    if (user && token) {
      fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/spotify-status`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setSpotifyConnected(!!data.connected))
        .catch(() => setSpotifyConnected(false));
    } else {
      setSpotifyConnected(false);
    }
  }, [user, token]);

  // Handle OAuth callback when returning from Spotify connect
  useEffect(() => {
    const urlToken = searchParams.get('token');
    const oauthSuccess = searchParams.get('oauth_success');
    const error = searchParams.get('error');
    const message = searchParams.get('message');
    if (urlToken && oauthSuccess === 'true') {
      handleOAuthCallback(urlToken).then(() => {
        refreshUser?.();
        const next = new URLSearchParams(searchParams);
        next.delete('token');
        next.delete('oauth_success');
        setSearchParams(next, { replace: true });
        toast.success('Spotify connected! You can now import your podcasts.');
      }).catch(() => toast.error('Failed to complete Spotify connection'));
    } else if (error === 'spotify_auth_failed') {
      toast.error(decodeURIComponent(message || 'Spotify connection failed'));
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      next.delete('message');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, handleOAuthCallback, refreshUser, setSearchParams]);

  useEffect(() => {
    fetchTopSeries();
  }, []);

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
      const total = episodesList.reduce((sum: number, ep: PodcastEpisode) => sum + (ep.globalMediaAggregate || 0), 0);
      setTotalTips(total);
      const tipCount = episodesList.reduce((sum: number, ep: PodcastEpisode) => sum + (ep.bids?.length || 0), 0);
      const avg = tipCount > 0 ? total / tipCount : 0;
      setAvgTip(avg);
      const fromBidTop = episodesList.map((ep: PodcastEpisode) => ep.globalMediaBidTop || 0);
      const fromBids = episodesList.flatMap((ep: PodcastEpisode) => (ep.bids || []).map(b => b.amount));
      setTopTip(Math.max(0, ...fromBidTop, ...fromBids));
    } catch (error: any) {
      console.error('Error fetching chart:', error);
      toast.error('Failed to load podcast chart');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTopSeries = async () => {
    setIsLoadingTopSeries(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/top-series?limit=10`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch top podcast series');
      }

      const data = await response.json();
      setTopPodcastSeries(data.series || []);
    } catch (error: any) {
      console.error('Error fetching top podcast series:', error);
      // Don't show toast error for this - it's not critical
    } finally {
      setIsLoadingTopSeries(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setIsSearching(true);
    setShowSearchResults(true);
    setSearchOffset(0); // Reset pagination
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
        params.append('offset', '0');

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
          
          // Store pagination info for "Load more"
          setHasMoreLocal(localData.hasMore || false);
          setTotalLocal(localData.total || null);
          setSearchOffset(50); // Next offset
        }
      } catch (error) {
        console.error('Error searching local database:', error);
      }

      // Step 2: Search Taddy (primary external source for discovery)
      try {
        const taddyParams = new URLSearchParams();
        taddyParams.append('q', searchQuery);
        taddyParams.append('max', '50'); // Increased from 20 to 50

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

  const handleLoadMoreSearch = async () => {
    if (!searchQuery.trim() || isLoadingMore || !hasMoreLocal) return;

    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.append('q', searchQuery);
      if (filters.category) params.append('category', filters.category);
      if (filters.genre) params.append('genre', filters.genre);
      if (filters.tag) params.append('tag', filters.tag);
      params.append('limit', '50');
      params.append('offset', searchOffset.toString());

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

        // Deduplicate and append to existing results
        const seenKeys = new Set(
          searchResults.map(ep => 
            `${ep.title}|${ep.podcastTitle || ep.podcastSeries?.title || ''}`.toLowerCase()
          )
        );
        
        const newUniqueEpisodes = localEpisodes.filter((ep: PodcastEpisode) => {
          const key = `${ep.title}|${ep.podcastTitle || ep.podcastSeries?.title || ''}`.toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            return true;
          }
          return false;
        });

        setSearchResults(prev => [...prev, ...newUniqueEpisodes]);
        setHasMoreLocal(localData.hasMore || false);
        setSearchOffset(searchOffset + 50);
        
        if (newUniqueEpisodes.length > 0) {
          toast.success(`Loaded ${newUniqueEpisodes.length} more episodes`);
        } else {
          toast.info('No more unique episodes found');
        }
      }
    } catch (error: any) {
      console.error('Error loading more search results:', error);
      toast.error('Failed to load more results');
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

  const handleConnectSpotify = () => {
    if (!user) {
      toast.error('Please log in to connect Spotify');
      navigate('/login');
      return;
    }
    const baseUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
    const redirectUrl = encodeURIComponent(`${window.location.origin}/podcasts?oauth_success=true`);
    const token = localStorage.getItem('token');
    window.location.href = `${baseUrl}/api/auth/spotify?link_account=true&redirect=${redirectUrl}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  };

  const handleImportFromSpotify = async () => {
    if (!user) {
      toast.error('Please log in to import podcasts');
      navigate('/login');
      return;
    }
    if (!spotifyConnected) {
      handleConnectSpotify();
      return;
    }
    setIsImportingSpotify(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/import-spotify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ maxShows: 50, episodesPerShow: 10 })
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      toast.success(`Imported ${data.imported?.seriesCount || 0} series and ${data.imported?.episodeCount || 0} episodes from Spotify`);
      fetchChart();
    } catch (err: any) {
      toast.error(err.message || 'Failed to import from Spotify');
    } finally {
      setIsImportingSpotify(false);
    }
  };

  const handleImportOpml = async () => {
    if (!user) {
      toast.error('Please log in to import podcasts');
      navigate('/login');
      return;
    }
    if (!opmlFile) {
      toast.error('Please select an OPML file first');
      return;
    }
    setIsImportingOpml(true);
    try {
      const formData = new FormData();
      formData.append('file', opmlFile);
      const res = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/import-opml`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          body: formData
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      toast.success(`Imported ${data.imported?.seriesCount || 0} series and ${data.imported?.episodeCount || 0} episodes from OPML`);
      setOpmlFile(null);
      fetchChart();
    } catch (err: any) {
      toast.error(err.message || 'Failed to import OPML');
    } finally {
      setIsImportingOpml(false);
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
      const raw = episode.rawData as any;

      // Build episodeData + seriesData per source. Backend expects series-first flow:
      // create/find series, then import episode and link it (artwork + series info come from series).
      let episodeData: any;
      let seriesData: any = null;

      if (episode.source === 'taddy') {
        // Taddy search returns converted format (title, podcastTitle, podcastImage, etc.).
        // Adapter expects raw-Taddy shape (uuid, name, podcastSeries: { uuid, name, imageUrl, rssUrl }).
        const podcastTitle = raw?.podcastTitle ?? episode.podcastTitle ?? '';
        const podcastImage = raw?.podcastImage ?? episode.podcastImage ?? null;
        const podcastSeriesUuid = raw?.podcastSeriesUuid ?? (episode as any).podcastSeriesUuid;
        const rssUrl = raw?.rssUrl ?? (episode as any).rssUrl ?? '';
        const publishedAt = raw?.publishedAt ?? raw?.releaseDate ?? episode.releaseDate ?? episode.publishedAt;
        let datePublishedSec = Math.floor(Date.now() / 1000);
        if (publishedAt) {
          const d = publishedAt instanceof Date ? publishedAt : new Date(publishedAt);
          if (!isNaN(d.getTime())) datePublishedSec = Math.floor(d.getTime() / 1000);
        }
        episodeData = {
          uuid: raw?.taddyUuid ?? episode.taddyUuid,
          name: raw?.title ?? episode.title,
          description: raw?.description ?? episode.description ?? '',
          duration: raw?.duration ?? episode.duration ?? 0,
          episodeNumber: raw?.episodeNumber ?? (episode as any).episodeNumber ?? null,
          seasonNumber: raw?.seasonNumber ?? (episode as any).seasonNumber ?? null,
          audioUrl: raw?.audioUrl ?? (episode as any).audioUrl ?? '',
          fileLength: raw?.audioSize ?? null,
          datePublished: datePublishedSec,
          podcastSeries: {
            uuid: podcastSeriesUuid,
            name: podcastTitle,
            imageUrl: podcastImage,
            rssUrl
          }
        };
        // Series must be created/found first so episode gets correct artwork and series link.
        if (podcastTitle) {
          seriesData = {
            title: podcastTitle,
            image: podcastImage,
            taddyUuid: podcastSeriesUuid || undefined,
            rssUrl: rssUrl || undefined,
            language: raw?.language ?? 'en'
          };
        }
      } else if (episode.source === 'podcastindex') {
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
        if (episode.podcastTitle) {
          seriesData = {
            title: episode.podcastTitle,
            description: '',
            author: episode.podcastAuthor || '',
            image: episode.podcastImage || null,
            categories: episode.genres || [],
            language: 'en',
            podcastIndexId: episode.feedId?.toString()
          };
        }
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
        if (episode.podcastTitle) {
          seriesData = {
            title: episode.podcastTitle,
            description: '',
            author: episode.podcastAuthor || '',
            image: episode.podcastImage || null,
            categories: episode.genres || [],
            language: 'en',
            iTunesId: episode.collectionId
          };
        }
      } else {
        episodeData = raw || {};
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
      const imported = data.episode;

      toast.success(`Imported: ${imported.title}`);

      // Use API response for artwork and series (populated when series was created/found)
      const coverArt = imported.coverArt ?? imported.podcastSeries?.coverArt ?? episode.podcastImage ?? episode.coverArt;
      const podcastSeries = imported.podcastSeries ?? (episode.podcastTitle ? { _id: '', title: episode.podcastTitle, coverArt: episode.podcastImage } : undefined);

      const updatedEpisode: PodcastEpisode = {
        ...episode,
        _id: imported._id,
        isExternal: false,
        source: 'local',
        globalMediaAggregate: imported.globalMediaAggregate ?? 0,
        coverArt: coverArt || undefined,
        podcastSeries: podcastSeries ? { _id: podcastSeries._id, title: podcastSeries.title, coverArt: podcastSeries.coverArt } : undefined,
        podcastTitle: podcastSeries?.title ?? episode.podcastTitle
      };

      setSearchResults(prev => prev.map(ep =>
        ep.title === episode.title && ep.podcastTitle === episode.podcastTitle
          ? updatedEpisode
          : ep
      ));

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

  const { setCurrentEpisode, play } = usePodcastPlayerStore();

  const handleEpisodeClick = (episode: PodcastEpisode) => {
    const episodeId = episode._id || episode.id;
    if (episodeId) {
      navigate(`/podcasts/${episodeId}`);
    }
  };

  const [fetchingPlayId, setFetchingPlayId] = useState<string | null>(null);

  const handleQueuePlay = async (episode: PodcastEpisode, e: React.MouseEvent) => {
    e.stopPropagation();
    const ep = {
      _id: episode._id,
      id: episode.id,
      title: episode.title,
      duration: episode.duration,
      coverArt: episode.coverArt || episode.podcastImage || episode.podcastSeries?.coverArt,
      podcastSeries: episode.podcastSeries,
      podcastTitle: episode.podcastTitle,
      sources: episode.sources,
      audioUrl: episode.audioUrl,
      enclosure: episode.enclosure,
    };
    if (getEpisodeAudioUrl(ep)) {
      setCurrentEpisode(ep);
      play();
      toast.success(`Now playing: ${episode.title}`);
      return;
    }
    const id = episode._id || episode.id;
    if (!id) {
      toast.error('No playable audio for this episode');
      return;
    }
    setFetchingPlayId(id);
    const toastId = toast.loading('Loading episode...');
    try {
      const { media } = await mediaAPI.getProfile(id);
      const loaded = {
        _id: media._id,
        id: media.uuid,
        title: media.title,
        duration: media.duration,
        coverArt: media.coverArt,
        podcastSeries: typeof media.podcastSeries === 'object' ? media.podcastSeries : undefined,
        sources: media.sources,
      };
      if (!getEpisodeAudioUrl(loaded)) {
        toast.error('No playable audio for this episode');
        return;
      }
      setCurrentEpisode(loaded);
      play();
      toast.success(`Now playing: ${media.title}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load episode');
    } finally {
      setFetchingPlayId(null);
      toast.dismiss(toastId);
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

  const handleCategoryChange = (category: string) => {
    setFilters((prev) => ({ ...prev, category }));
  };

  const handleTimeRangeChange = (timeRange: string) => {
    setFilters((prev) => ({ ...prev, timeRange }));
  };

  const hasActiveFilters = filters.category || filters.genre || filters.tag || filters.timeRange !== 'all';

  // Share functionality
  const shareUrl = window.location.href;
  const shareText = `Check out the top podcast episodes on Tuneable! Support your favourite Creators and discover new content.`;

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

  const visibleEpisodes = showSearchResults
    ? displayEpisodes
    : displayEpisodes.slice(0, visibleEpisodeCount);

  const canPlayEpisode = (episode: PodcastEpisode) => {
    if (!user) return false;
    if (
      getEpisodeAudioUrl({
        title: episode.title,
        _id: episode._id,
        id: episode.id,
        sources: episode.sources,
        audioUrl: episode.audioUrl,
        enclosure: episode.enclosure,
      })
    ) {
      return true;
    }
    return !!(episode._id || episode.id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white">
      <PodcastChartHero
        categories={availableFilters.categories}
        selectedCategory={filters.category}
        onCategoryChange={handleCategoryChange}
      />

      {/* Compact metrics */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-3">
        <div className="grid grid-cols-3 gap-1 sm:flex sm:flex-wrap sm:justify-center sm:gap-2 mb-3 sm:mb-4 max-w-md sm:max-w-none mx-auto">
          <div className="bg-gray-900/80 px-1.5 py-1.5 sm:px-3 sm:py-2 rounded-md border border-purple-500/40 min-w-0">
            <div className="flex items-center space-x-1 sm:space-x-2">
              <div className="p-0.5 sm:p-1 bg-purple-600/30 rounded shrink-0">
                <Coins className="h-3 w-3 sm:h-4 sm:w-4 text-purple-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-lg font-bold text-white leading-tight truncate">{penceToPounds(totalTips)}</div>
                <div className="text-[9px] sm:text-[10px] text-gray-400 truncate leading-tight">Total Tips</div>
              </div>
            </div>
          </div>
          <div className="bg-gray-900/80 px-1.5 py-1.5 sm:px-3 sm:py-2 rounded-md border border-green-500/40 min-w-0">
            <div className="flex items-center space-x-1 sm:space-x-2">
              <div className="p-0.5 sm:p-1 bg-green-600/30 rounded shrink-0">
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-lg font-bold text-white leading-tight truncate">{penceToPounds(avgTip)}</div>
                <div className="text-[9px] sm:text-[10px] text-gray-400 truncate leading-tight">Avg Tip</div>
              </div>
            </div>
          </div>
          <div className="bg-gray-900/80 px-1.5 py-1.5 sm:px-3 sm:py-2 rounded-md border border-yellow-500/40 min-w-0">
            <div className="flex items-center space-x-1 sm:space-x-2">
              <div className="p-0.5 sm:p-1 bg-yellow-600/30 rounded shrink-0">
                <Award className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-lg font-bold text-white leading-tight truncate">{penceToPounds(topTip)}</div>
                <div className="text-[9px] sm:text-[10px] text-gray-400 truncate leading-tight">Top Tip</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tag / Time / Search / Share controls */}
        <div className="mb-4 md:mb-6">
          <div className="flex flex-wrap justify-center items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTagFilterCloud((open) => !open)}
              className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
                showTagFilterCloud ? 'bg-gray-700 ring-1 ring-purple-500/50' : 'bg-gray-800'
              }`}
            >
              <Tag className="h-4 w-4 text-purple-400 flex-shrink-0" />
              Tag
              {selectedTagFilters.length > 0 && (
                <span className="text-xs text-purple-300 font-normal truncate max-w-[8rem] sm:max-w-[12rem]">
                  ({selectedTagFilters.map((t) => `#${t}`).join(', ')})
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowTimeFilter((open) => !open)}
              className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
                showTimeFilter ? 'bg-gray-700 ring-1 ring-purple-500/50' : 'bg-gray-800'
              }`}
            >
              <Clock className="h-4 w-4 text-purple-400 flex-shrink-0" />
              Time
              <span className="text-xs text-purple-300 font-normal">
                ({formatTimeRangeLabel(filters.timeRange)})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowSearchPanel((open) => !open)}
              className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
                showSearchPanel ? 'bg-gray-700 ring-1 ring-purple-500/50' : 'bg-gray-800'
              }`}
            >
              <Search className="h-4 w-4 text-purple-400 flex-shrink-0" />
              Search
              {searchQuery.trim() && (
                <span className="text-xs text-purple-300 font-normal truncate max-w-[8rem] sm:max-w-[12rem]">
                  ({searchQuery.trim()})
                </span>
              )}
            </button>
            <div className="relative" ref={shareDropdownRef}>
              {isMobile && 'share' in navigator ? (
                <button
                  onClick={handleNativeShare}
                  className="px-3 sm:px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5"
                >
                  <Share2 className="h-4 w-4 text-purple-400" />
                  Share
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowShareDropdown(!showShareDropdown)}
                    className="px-3 sm:px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5"
                  >
                    <Share2 className="h-4 w-4 text-purple-400" />
                    Share
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showShareDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showShareDropdown && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
                      <div className="py-2">
                        <button onClick={() => { handleShare('twitter'); setShowShareDropdown(false); }} className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors">
                          <Twitter className="h-4 w-4 text-blue-400" /><span className="text-sm text-white">Twitter/X</span>
                        </button>
                        <button onClick={() => { handleShare('facebook'); setShowShareDropdown(false); }} className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors">
                          <Facebook className="h-4 w-4 text-blue-500" /><span className="text-sm text-white">Facebook</span>
                        </button>
                        <button onClick={() => { handleShare('linkedin'); setShowShareDropdown(false); }} className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors">
                          <Linkedin className="h-4 w-4 text-blue-600" /><span className="text-sm text-white">LinkedIn</span>
                        </button>
                        <div className="border-t border-gray-700 my-1" />
                        <button onClick={() => { handleCopyLink(); setShowShareDropdown(false); }} className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors">
                          {copySuccess ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-gray-400" />}
                          <span className="text-sm text-white">{copySuccess ? 'Copied!' : 'Copy Link'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {showTagFilterCloud && (
            <div className="card p-3 md:p-6 mt-3">
              <div className="flex items-center justify-between mb-1 md:mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Tag className="h-4 w-4 mr-2 text-purple-400" />
                  Top Tags
                </h3>
                <div className="flex items-center gap-2">
                  {selectedTags.length > 0 && (
                    <button onClick={() => { setSelectedTags([]); setFilters((f) => ({ ...f, tag: '' })); }} className="text-sm text-purple-300 hover:text-white">
                      Clear tags
                    </button>
                  )}
                  <button type="button" onClick={() => setShowTagFilterCloud(false)} className="text-sm text-gray-400 hover:text-white">
                    Hide
                  </button>
                </div>
              </div>
              {topTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {topTags.map(({ tag, total }) => {
                    const selected = selectedTags.some((t) => t.toLowerCase() === tag.toLowerCase());
                    const weight = Math.max(0.75, Math.min(1.25, total / 50));
                    const sizeClass = weight > 1.1 ? 'text-sm' : weight > 0.95 ? 'text-xs' : 'text-[10px]';
                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          if (selected) {
                            setSelectedTags((prev) => prev.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
                            if (filters.tag === tag) setFilters((f) => ({ ...f, tag: '' }));
                          } else {
                            setSelectedTags((prev) => [...prev, tag]);
                            setFilters((f) => ({ ...f, tag }));
                          }
                        }}
                        className={`rounded-full px-3 py-1 transition-colors ${sizeClass} ${
                          selected ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-800'
                        }`}
                        title={`${penceToPounds(total)} total across episodes`}
                      >
                        #{tag}
                        <span className="ml-2 text-[10px] opacity-70">{penceToPounds(total)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No tags yet.</p>
              )}
              <div className="mt-4 pt-4 border-t border-gray-700/50">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <h4 className="text-sm font-semibold text-white">Top Fans</h4>
                  {selectedTagFilters.length > 0 ? (
                    <span className="text-xs text-purple-300">Filtered by {selectedTagFilters.map((t) => `#${t}`).join(', ')}</span>
                  ) : (
                    <span className="text-xs text-gray-400">Showing global support</span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto pr-1">
                  <TopSupporters bids={topSupporterBids} maxDisplay={10} />
                </div>
              </div>
            </div>
          )}

          {showTimeFilter && (
            <div className="card p-3 md:p-6 mt-3 max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Clock className="h-4 w-4 mr-2 text-purple-400" />
                  Sort by Time
                </h3>
                <button type="button" onClick={() => setShowTimeFilter(false)} className="text-sm text-gray-400 hover:text-white">
                  Hide
                </button>
              </div>
              <div className="flex flex-row flex-nowrap gap-1 sm:gap-2 justify-center items-center max-w-full overflow-hidden">
                {TIME_RANGE_OPTIONS.map((period) => (
                  <button
                    key={period.key}
                    onClick={() => handleTimeRangeChange(period.key)}
                    className={`flex-1 min-w-0 px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-md font-medium transition-colors text-xs sm:text-sm truncate ${
                      filters.timeRange === period.key
                        ? 'bg-purple-700 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
              {(availableFilters.genres.length > 0 || hasActiveFilters) && (
                <div className="mt-4 pt-4 border-t border-gray-700/50 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableFilters.genres.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Genre</label>
                      <select
                        value={filters.genre}
                        onChange={(e) => setFilters((f) => ({ ...f, genre: e.target.value }))}
                        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">All Genres</option>
                        {availableFilters.genres.map((genre) => (
                          <option key={genre} value={genre}>{genre}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Sort By</label>
                    <select
                      value={filters.sortBy}
                      onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value }))}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 text-sm focus:border-purple-500 focus:outline-none"
                    >
                      <option value="globalMediaAggregate">Total Tips</option>
                      <option value="playCount">Play Count</option>
                      <option value="popularity">Popularity</option>
                      <option value="releaseDate">Release Date</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {showSearchPanel && (
            <div className="card p-4 sm:p-6 mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base sm:text-lg font-semibold text-white">Search & Import</h3>
                <button type="button" onClick={() => setShowSearchPanel(false)} className="text-sm text-gray-400 hover:text-white">
                  Hide
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
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
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isSearching ? <><Loader className="h-5 w-5 animate-spin" /><span>Searching...</span></> : <><Search className="h-5 w-5" /><span>Search</span></>}
                </button>
                <button
                  onClick={() => setShowImportSection(!showImportSection)}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <LinkIcon className="h-5 w-5 text-purple-400" />
                  <span className="text-sm font-medium text-white">Import</span>
                  <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${showImportSection ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {showImportSection && (
                <div className="space-y-4 border-t border-gray-700/50 pt-4">
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Import from URL</h4>
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
                        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {isImportingLink ? <><Loader className="h-5 w-5 animate-spin" /><span>Importing...</span></> : <><LinkIcon className="h-5 w-5" /><span>Import</span></>}
                      </button>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Import from Spotify</h4>
                    <button
                      onClick={handleImportFromSpotify}
                      disabled={isImportingSpotify || !user}
                      className="px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                    >
                      {isImportingSpotify ? <><Loader className="h-5 w-5 animate-spin" /><span>Importing...</span></> : spotifyConnected ? <><Music2 className="h-5 w-5" /><span>Import My Spotify Podcasts</span></> : <><Music2 className="h-5 w-5" /><span>Connect Spotify & Import</span></>}
                    </button>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Import from OPML</h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <label className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-gray-700 rounded-lg border border-gray-600 cursor-pointer hover:bg-gray-600 transition-colors">
                        <Upload className="h-5 w-5 text-purple-400" />
                        <span className="text-sm text-gray-300 truncate">{opmlFile ? opmlFile.name : 'Choose OPML file...'}</span>
                        <input type="file" accept=".opml,.xml" className="hidden" onChange={(e) => setOpmlFile(e.target.files?.[0] || null)} />
                      </label>
                      <button
                        onClick={handleImportOpml}
                        disabled={isImportingOpml || !opmlFile || !user}
                        className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {isImportingOpml ? <><Loader className="h-5 w-5 animate-spin" /><span>Importing...</span></> : <><Upload className="h-5 w-5" /><span>Import OPML</span></>}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showSearchResults && searchResults.length > 0 && (
                <button
                  onClick={() => { setShowSearchResults(false); setSearchQuery(''); setSearchResults([]); }}
                  className="mt-4 text-sm text-purple-400 hover:text-purple-300"
                >
                  ← Back to Chart
                </button>
              )}
            </div>
          )}
        </div>

        {/* Episode queue */}
        {showSearchResults && (
          <p className="text-center text-sm text-purple-300 mb-3">Search results</p>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
          </div>
        ) : displayEpisodes.length === 0 ? (
          <div className="text-center py-20">
            <Music className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">
              {showSearchResults ? 'No episodes found' : 'No podcast episodes found'}
            </p>
            <p className="text-gray-500 text-sm mt-2">
              {showSearchResults ? 'Try a different search term' : 'Try adjusting your filters or search for podcasts'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleEpisodes.map((episode, index) => {
              const epId = episode._id || episode.id;
              const isExternal = !!episode.isExternal;
              return (
                <PodcastQueueMediaCard
                  key={`${epId || episode.title}-${index}`}
                  episode={episode}
                  index={index}
                  showRank={!showSearchResults}
                  isBidding={isPlacingBid && selectedEpisode?.title === episode.title}
                  isPlayLoading={!!fetchingPlayId && fetchingPlayId === epId}
                  canPlay={canPlayEpisode(episode)}
                  canTip={!!user}
                  tipLabel={isExternal ? 'Add & Tip' : 'Tip'}
                  onEpisodeClick={(ep) => handleEpisodeClick(ep as PodcastEpisode)}
                  onSeriesClick={(ep, e) => handleSeriesClick(ep as PodcastEpisode, e)}
                  onPlay={(ep, e) => handleQueuePlay(ep as PodcastEpisode, e)}
                  onTip={(ep, e) => (isExternal ? handleImportAndTip(ep as PodcastEpisode, e) : handleTipClick(ep as PodcastEpisode, e))}
                />
              );
            })}

            {!showSearchResults && displayEpisodes.length > visibleEpisodeCount && (
              <div className="flex justify-center pt-4 pb-2">
                <button
                  type="button"
                  onClick={() => setVisibleEpisodeCount((prev) => prev + EPISODE_PAGE_SIZE)}
                  className="px-6 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors flex items-center gap-2"
                >
                  <ChevronDown className="h-5 w-5" />
                  Show more ({displayEpisodes.length - visibleEpisodeCount} remaining)
                </button>
              </div>
            )}

            {showSearchResults && searchResults.length > 0 && (
              <div className="mt-6 flex flex-col items-center space-y-4">
                {totalLocal !== null && (
                  <p className="text-sm text-gray-400">
                    Showing {searchResults.filter((ep) => ep.source === 'local').length} of {totalLocal} local results
                    {searchResults.some((ep) => ep.source === 'taddy') && ` + ${searchResults.filter((ep) => ep.source === 'taddy').length} from Taddy`}
                  </p>
                )}
                {hasMoreLocal && (
                  <button
                    onClick={handleLoadMoreSearch}
                    disabled={isLoadingMore}
                    className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                  >
                    {isLoadingMore ? <><Loader className="h-5 w-5 animate-spin" /><span>Loading more...</span></> : <><ChevronDown className="h-5 w-5" /><span>Load More Search Results</span></>}
                  </button>
                )}
              </div>
            )}

            {!showSearchResults && (
              <PodcastSeriesStrip
                series={topPodcastSeries}
                isLoading={isLoadingTopSeries}
                onSeriesClick={(id) => navigate(`/podcast/${id}`)}
              />
            )}
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
        songArtist={selectedEpisode?.creatorDisplay || selectedEpisode?.podcastSeries?.title || selectedEpisode?.podcastTitle || 'Unknown'}
        currentBid={selectedEpisode ? penceToPoundsNumber(selectedEpisode.globalMediaAggregate) : 0}
        minimumBid={(selectedEpisode as any)?.minimumBid ?? 0.01}
        userBalance={user ? penceToPoundsNumber((user as any).balance) : 0}
        isLoading={isPlacingBid}
      />
    </div>
  );
};

export default Podcasts;

