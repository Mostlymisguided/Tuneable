import React, { useState, useEffect } from 'react';
import { topTunesAPI } from '../lib/api';
import { ArrowUpDown, Music } from 'lucide-react';

interface TopTunesSong {
  id: string;
  title: string;
  artist: string;
  duration: number;
  coverArt: string;
  globalBidValue: number;
  uploadedAt: string;
}

const TopTunes: React.FC = () => {
  const [songs, setSongs] = useState<TopTunesSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('globalBidValue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchTopTunes();
  }, [sortBy]);

  const fetchTopTunes = async () => {
    try {
      setLoading(true);
      const response = await topTunesAPI.getTopTunes(sortBy, 100);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Music className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-spin" />
          <p className="text-gray-600">Loading Top Tunes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-4">
              Top Tunes
            </h1>
            <p className="text-xl text-purple-100">
              The most bid-for music on Tuneable
            </p>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">

          {/* Chart Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Song
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('artist')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Artist</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('duration')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Duration</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('globalBidValue')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Total Bids (All Parties)</span>
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {songs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      <Music className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-lg">No songs with bids yet</p>
                      <p className="text-sm">Be the first to bid on a song!</p>
                    </td>
                  </tr>
                ) : (
                  songs.map((song, index) => (
                    <tr key={song.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-4">
                          <div className="flex-shrink-0 h-12 w-12">
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
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {song.title}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {song.artist}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDuration(song.duration)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                        {formatBidValue(song.globalBidValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TopTunes;
