import React, { useState } from 'react';
import { Play, Pause, Heart, DollarSign, Clock, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-toastify';

interface Episode {
  id: string;
  title: string;
  description: string;
  podcastTitle: string;
  podcastImage: string;
  podcastAuthor: string;
  podcastCategory: string;
  duration: number;
  publishedAt: string;
  globalMediaAggregate: number;
  playCount?: number;
  popularity?: number;
  explicit: boolean;
  episodeDisplay: string;
  formattedDuration: string;
  addedBy: {
    _id: string;
    username: string;
    profilePic: string;
  };
}

interface EpisodeCardProps {
  episode: Episode;
  onPlay?: (episode: Episode) => void;
  onBoost?: (episode: Episode) => void;
  onAddToParty?: (episode: Episode) => void;
  isPlaying?: boolean;
  showActions?: boolean;
  compact?: boolean;
}

const EpisodeCard: React.FC<EpisodeCardProps> = ({
  episode,
  onPlay,
  onBoost,
  onAddToParty,
  isPlaying = false,
  showActions = true,
  compact = false
}) => {
  const { user } = useAuth();
  const [isBoosting, setIsBoosting] = useState(false);
  const [boostAmount, setBoostAmount] = useState(1.00);
  const [showBoostModal, setShowBoostModal] = useState(false);

  const handlePlay = () => {
    if (onPlay) {
      onPlay(episode);
    }
  };

  const handleBoost = async () => {
    if (!user) {
      toast.error('Please log in to boost episodes');
      return;
    }

    setIsBoosting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/${episode.id}/boost`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ amount: boostAmount })
      });

      if (response.ok) {
        toast.success(`Boosted ${episode.title} with $${boostAmount}!`);
        setShowBoostModal(false);
        if (onBoost) {
          onBoost(episode);
        }
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to boost episode');
      }
    } catch (error) {
      console.error('Error boosting episode:', error);
      toast.error('Failed to boost episode');
    } finally {
      setIsBoosting(false);
    }
  };

  const handleAddToParty = () => {
    if (onAddToParty) {
      onAddToParty(episode);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (compact) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <img
              src={episode.podcastImage || '/default-podcast.png'}
              alt={episode.podcastTitle}
              className="w-12 h-12 rounded-lg object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {episode.title}
            </h3>
            <p className="text-xs text-gray-500 truncate">
              {episode.podcastTitle} • {episode.podcastAuthor}
            </p>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-gray-400 flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                {formatDuration(episode.duration)}
              </span>
              <span className="text-xs text-gray-400 flex items-center">
                <DollarSign className="w-3 h-3 mr-1" />
                ${episode.globalMediaAggregate.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="flex-shrink-0">
            <button
              onClick={handlePlay}
              className="p-2 rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Podcast Image and Basic Info */}
      <div className="p-6">
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <img
              src={episode.podcastImage || '/default-podcast.png'}
              alt={episode.podcastTitle}
              className="w-16 h-16 rounded-lg object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {episode.title}
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  {episode.podcastTitle} • {episode.podcastAuthor}
                </p>
                {episode.episodeDisplay && (
                  <span className="inline-block px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full mb-2">
                    {episode.episodeDisplay}
                  </span>
                )}
                {episode.explicit && (
                  <span className="inline-block px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full ml-2">
                    Explicit
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">
                  {formatDate(episode.publishedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {episode.description && (
          <div className="mt-4">
            <p className="text-sm text-gray-700 line-clamp-3">
              {episode.description}
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 flex items-center space-x-6 text-sm text-gray-500">
          <div className="flex items-center">
            <Clock className="w-4 h-4 mr-1" />
            {formatDuration(episode.duration)}
          </div>
          <div className="flex items-center">
            <DollarSign className="w-4 h-4 mr-1" />
            ${episode.globalMediaAggregate.toFixed(2)} boosted
          </div>
          <div className="flex items-center">
            <User className="w-4 h-4 mr-1" />
            {episode.addedBy.username}
          </div>
        </div>

        {/* Actions */}
        {showActions && (
          <div className="mt-6 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={handlePlay}
                className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              
              <button
                onClick={() => setShowBoostModal(true)}
                className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Boost
              </button>

              {onAddToParty && (
                <button
                  onClick={handleAddToParty}
                  className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Heart className="w-4 h-4 mr-2" />
                  Add to Party
                </button>
              )}
            </div>

            <div className="text-sm text-gray-500">
              Category: {episode.podcastCategory || 'Uncategorized'}
            </div>
          </div>
        )}
      </div>

      {/* Boost Modal */}
      {showBoostModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Boost Episode
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              How much would you like to boost "{episode.title}"?
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount ($)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={boostAmount}
                onChange={(e) => setBoostAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowBoostModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBoost}
                disabled={isBoosting || boostAmount <= 0}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isBoosting ? 'Boosting...' : `Boost $${boostAmount.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EpisodeCard;
