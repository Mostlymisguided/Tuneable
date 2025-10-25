import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, Play } from 'lucide-react';
import { topTunesAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { useWebPlayerStore } from '../stores/webPlayerStore';

interface TopTunesSong {
  id: string;
  _id?: string;
  title: string;
  artist: string;
  coverArt: string;
  globalMediaAggregate: number;
  globalMediaBidTop: number;
  globalMediaBidTopUser?: {
    username: string;
    profilePic?: string;
  };
  bids?: any[];
  tags?: string[];
  sources?: any;
  duration?: number;
}

interface TopTunesProps {
  limit?: number;
  showHeader?: boolean;
}

const TopTunes: React.FC<TopTunesProps> = ({ limit = 10, showHeader = true }) => {
  const navigate = useNavigate();
  const { setCurrentMedia, setGlobalPlayerActive } = useWebPlayerStore();
  
  const [songs, setSongs] = useState<TopTunesSong[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('globalMediaAggregate');

  useEffect(() => {
    fetchTopTunes();
  }, [sortBy, limit]);

  const fetchTopTunes = async () => {
    try {
      setIsLoading(true);
      const fetchLimit = limit || 10;
      const response = await topTunesAPI.getTopTunes(sortBy, fetchLimit);
      setSongs(response.songs || []);
    } catch (error) {
      console.error('Error fetching top tunes:', error);
      toast.error('Failed to load top tunes');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `£${amount.toFixed(2)}`;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds === 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlay = (song: TopTunesSong) => {
    const mediaId = song._id || song.id;
    
    if (!mediaId) {
      toast.error('Unable to identify media item');
      return;
    }

    // Clean and format the media for the webplayer
    const cleanedMedia = {
      id: mediaId,
      _id: song._id,
      title: song.title,
      artist: song.artist,
      duration: song.duration || 0,
      coverArt: song.coverArt,
      sources: song.sources || {},
      globalMediaAggregate: song.globalMediaAggregate,
      bids: song.bids || [],
      addedBy: null,
      totalBidValue: song.globalMediaAggregate,
    };
    
    // Set the media in the webplayer and start playing
    setCurrentMedia(cleanedMedia, 0, true); // true = autoplay
    setGlobalPlayerActive(true);
    
    toast.success(`Now playing: ${cleanedMedia.title}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {showHeader && <h2 className="text-xl font-semibold text-gray-300">Top Tunes</h2>}
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-300">Top Tunes</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setSortBy('globalMediaAggregate')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                sortBy === 'globalMediaAggregate'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Total
            </button>
            <button
              onClick={() => setSortBy('globalMediaBidTop')}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                sortBy === 'globalMediaBidTop'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Top Bid
            </button>
          </div>
        </div>
      )}

      {songs.length === 0 ? (
        <div className="text-center py-8">
          <Music className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No tunes found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {songs.map((song, index) => (
            <div
              key={song.id}
              className="flex items-center space-x-4 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
            >
              {/* Rank */}
              <div className="flex-shrink-0 w-8 text-center">
                <span className="text-lg font-bold text-purple-400">#{index + 1}</span>
              </div>

              {/* Cover Art with Play Button Overlay */}
              <div className="flex-shrink-0 relative w-12 h-12">
                <img
                  src={song.coverArt || '/default-cover.jpg'}
                  alt={song.title}
                  className="w-full h-full rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => {
                    const mediaId = song._id || song.id;
                    if (mediaId) navigate(`/tune/${mediaId}`);
                  }}
                />
                {/* Play Icon Overlay - Only visible on hover */}
                <div 
                  className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg cursor-pointer hover:bg-black/60 transition-colors opacity-0 hover:opacity-100 group"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlay(song);
                  }}
                >
                  <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors">
                    <Play className="h-3 w-3 text-white" fill="currentColor" />
                  </div>
                </div>
              </div>

              {/* Song Info */}
              <div className="flex-1 min-w-0">
                <h3 
                  className="text-white font-medium truncate cursor-pointer hover:text-purple-300 transition-colors"
                  onClick={() => {
                    const mediaId = song._id || song.id;
                    if (mediaId) navigate(`/tune/${mediaId}`);
                  }}
                >
                  {song.title}
                </h3>
                <div className="flex items-center space-x-2 text-sm text-gray-400">
                  <p className="truncate">{song.artist}</p>
                  {song.duration && (
                    <>
                      <span>•</span>
                      <span className="text-gray-500">{formatDuration(song.duration)}</span>
                    </>
                  )}
                </div>
                
                {/* Tags */}
                {song.tags && song.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {song.tags.slice(0, 3).map((tag, tagIndex) => (
                      <span
                        key={tagIndex}
                        className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                    {song.tags.length > 3 && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                        +{song.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="flex-shrink-0 text-right">
                <div className="flex items-center space-x-2 text-sm">
                  <span className="text-green-400 font-medium">
                    {formatCurrency(song.globalMediaAggregate)}
                  </span>
                </div>
                {song.globalMediaBidTop > 0 && (
                  <div className="text-xs text-gray-400">
                    Top: {formatCurrency(song.globalMediaBidTop)}
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TopTunes;
