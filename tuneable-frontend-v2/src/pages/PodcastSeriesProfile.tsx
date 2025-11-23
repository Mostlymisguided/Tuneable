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
  Linkedin
} from 'lucide-react';
import { DEFAULT_COVER_ART } from '../constants';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';

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
  const [isLoading, setIsLoading] = useState(true);
  
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
      fetchSeriesData();
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

  const fetchSeriesData = async () => {
    if (!seriesId) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/series/${seriesId}`
      );

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
      setEpisodes(data.episodes || []);
      setStats(data.stats || null);
    } catch (error: any) {
      console.error('Error fetching series:', error);
      toast.error('Failed to load podcast series');
    } finally {
      setIsLoading(false);
    }
  };

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
      fetchSeriesData();
      
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
    navigate(`/tune/${episode._id}`);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
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
              <p className="text-gray-300 mb-4">{series.description}</p>
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
          <h2 className="text-2xl font-bold mb-4">Episodes</h2>
          {episodes.length === 0 ? (
            <div className="text-center py-12 bg-gray-800/50 rounded-lg">
              <Music className="h-16 w-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No episodes found for this podcast series</p>
            </div>
          ) : (
            <div className="space-y-4">
              {episodes.map((episode, index) => (
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
                            <span className="text-purple-400 font-bold text-lg">#{index + 1}</span>
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
        userBalance={user ? penceToPoundsNumber((user as any).balance) : 0}
        isLoading={isPlacingBid}
      />
    </div>
  );
};

export default PodcastSeriesProfile;

