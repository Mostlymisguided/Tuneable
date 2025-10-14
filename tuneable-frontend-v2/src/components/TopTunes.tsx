import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { topTunesAPI } from '../lib/api';
import { ArrowUpDown, Music } from 'lucide-react';
import TopBidders from './TopBidders';

interface TopTunesSong {
  id: string;
  uuid?: string;
  title: string;
  artist: string;
  duration: number;
  coverArt: string;
  globalMediaAggregate: number;
  uploadedAt: string;
  bids?: Array<{
    userId: {
      username: string;
      profilePic?: string;
      uuid: string;
    };
    amount: number;
  }>;
}

interface TopTunesProps {
  limit?: number;
  showHeader?: boolean;
}

const TopTunes: React.FC<TopTunesProps> = ({ limit = 10, showHeader = true }) => {
  const navigate = useNavigate();
  const [songs, setSongs] = useState<TopTunesSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('globalMediaAggregate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showAll, setShowAll] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    fetchTopTunes();
  }, [sortBy, limit, showAll]);

  const fetchTopTunes = async () => {
    try {
      setLoading(true);
      // Always fetch at least 20 songs initially to enable Show More button
      const fetchLimit = showAll ? 50 : Math.max(20, limit);
      const response = await topTunesAPI.getTopTunes(sortBy, fetchLimit);
      if (response.success) {
        setSongs(response.songs);
      }
    } catch (error) {
      console.error('Error fetching Top Tunes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBidValue = (value: number) => {
    return `£${value.toFixed(2)}`;
  };

  const handleShowMore = () => {
    setShowAll(true);
    setIsExpanded(true);
  };

  const handleShowLess = () => {
    setShowAll(false);
    setIsExpanded(false);
  };

  // Determine which songs to display
  const displaySongs = isExpanded ? songs : songs.slice(0, limit);

  if (loading) {
    return (
      <div className="card">
        {showHeader && (
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Tunes</h2>
        )}
        <div className="text-center py-8">
          <Music className="h-8 w-8 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading Top Tunes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {showHeader && (
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Tunes</h2>
      )}
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                #
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Song
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Top Bids
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('artist')}
              >
                <div className="flex items-center space-x-1">
                  <span>Artist</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('duration')}
              >
                <div className="flex items-center space-x-1">
                  <span>Duration</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('globalMediaAggregate')}
              >
                <div className="flex items-center space-x-1">
                  <span>Total Bids</span>
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displaySongs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  <Music className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm">No songs with bids yet</p>
                </td>
              </tr>
            ) : (
              displaySongs.map((song, index) => (
                <tr key={song.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {index + 1}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="flex-shrink-0 h-12 w-12 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => song.uuid && navigate(`/tune/${song.uuid}`)}
                      >
                        {song.coverArt ? (
                          <img
                            className="h-12 w-12 rounded-lg object-cover"
                            src={song.coverArt}
                            alt={`${song.title} cover`}
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-gray-200 flex items-center justify-center">
                            <Music className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p 
                          className="text-sm font-medium text-gray-900 truncate cursor-pointer hover:text-purple-600 transition-colors"
                          onClick={() => song.uuid && navigate(`/tune/${song.uuid}`)}
                        >
                          {song.title}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {song.bids && song.bids.length > 0 ? (
                      <TopBidders bids={song.bids} maxDisplay={3} />
                    ) : (
                      <span className="text-sm text-gray-400">No bids</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {song.artist}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatDuration(song.duration)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-green-600">
                    {formatBidValue(song.globalMediaAggregate)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Show More/Less Button */}
      {songs.length > limit && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={isExpanded ? handleShowLess : handleShowMore}
            className="w-full text-center text-sm font-medium text-purple-600 hover:text-purple-800 transition-colors"
          >
            {isExpanded ? (
              `Show Less (${limit} songs)`
            ) : (
              `Show More (${songs.length - limit} more songs)`
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default TopTunes;
