import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import ClickableArtistDisplay from './ClickableArtistDisplay';
import { DEFAULT_COVER_ART } from '../constants';
import { normalizeQueueMediaData } from './QueueMediaCard';

function formatDuration(duration: number | string | undefined) {
  if (!duration) return '3:00';
  if (typeof duration === 'string' && duration.includes(':')) return duration;
  const totalSeconds = typeof duration === 'string' ? parseInt(duration, 10) : duration;
  if (isNaN(totalSeconds)) return '3:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export interface VetoedQueueMediaCardProps {
  item: any;
  mediaData: ReturnType<typeof normalizeQueueMediaData>;
  showUnveto: boolean;
  onUnveto: (item: any) => void;
}

const VetoedQueueMediaCard: React.FC<VetoedQueueMediaCardProps> = ({
  item,
  mediaData,
  showUnveto,
  onUnveto,
}) => {
  const navigate = useNavigate();

  return (
    <div className="bg-red-900/20 border border-red-800/30 p-4 rounded-lg flex items-center space-x-4">
      <img
        src={mediaData.coverArt || DEFAULT_COVER_ART}
        alt={mediaData.title || 'Unknown Media'}
        className="w-32 h-32 rounded object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        width="128"
        height="128"
        onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <h4
            className="font-medium text-white text-lg truncate cursor-pointer hover:text-purple-300 transition-colors"
            onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
          >
            {mediaData.title || 'Unknown Media'}
          </h4>
          <span className="text-gray-400">•</span>
          <span className="text-gray-300 text-lg truncate font-light">
            <ClickableArtistDisplay media={mediaData} />
          </span>
          <div className="flex items-center space-x-1 ml-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-300">{formatDuration(mediaData.duration)}</span>
          </div>
        </div>
        <div className="mt-2">
          <p className="text-xs text-red-400">
            Vetoed {item.vetoedAt ? new Date(item.vetoedAt).toLocaleString() : 'recently'}
            {item.vetoedBy && ` by ${item.vetoedBy}`}
          </p>
          {item.vetoedReason && (
            <p className="text-xs text-gray-400 mt-1">Reason: {item.vetoedReason}</p>
          )}
        </div>
      </div>

      {showUnveto && (
        <div className="flex flex-col space-y-2">
          <button
            onClick={() => onUnveto(item)}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2"
          >
            <span>Unveto</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default VetoedQueueMediaCard;
