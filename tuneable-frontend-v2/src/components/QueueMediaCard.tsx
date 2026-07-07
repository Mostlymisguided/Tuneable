import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, X, Clock, Heart } from 'lucide-react';
import ClickableArtistDisplay from './ClickableArtistDisplay';
import MiniSupportersBar from './MiniSupportersBar';
import { DEFAULT_COVER_ART } from '../constants';

/** Normalize raw party-media payload for display (artists array, featuring, etc.) */
export function normalizeQueueMediaData(rawMediaData: any) {
  return {
    ...rawMediaData,
    artists: Array.isArray(rawMediaData.artists)
      ? rawMediaData.artists
      : Array.isArray(rawMediaData.artist)
        ? rawMediaData.artist
        : [],
    artist: rawMediaData.artist,
    featuring: Array.isArray(rawMediaData.featuring) ? rawMediaData.featuring : [],
    creatorDisplay: rawMediaData.creatorDisplay,
  };
}

function formatDuration(duration: number | string | undefined) {
  if (!duration) return '3:00';
  if (typeof duration === 'string' && duration.includes(':')) return duration;
  const totalSeconds = typeof duration === 'string' ? parseInt(duration, 10) : duration;
  if (isNaN(totalSeconds)) return '3:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export interface QueueMediaCardProps {
  item: any;
  index: number;
  mediaData: ReturnType<typeof normalizeQueueMediaData>;
  showActions: boolean;
  isBidding: boolean;
  onActionClick: (item: any) => void;
  onPlay: (item: any, index: number) => void;
  onTip: (item: any) => void;
}

const QueueMediaCard: React.FC<QueueMediaCardProps> = ({
  item,
  index,
  mediaData,
  showActions,
  isBidding,
  onActionClick,
  onPlay,
  onTip,
}) => {
  const navigate = useNavigate();

  return (
    <div
      className="rounded-2xl overflow-hidden backdrop-blur-md bg-gray-900/50 border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] transition-shadow relative p-1.5 md:p-4"
    >
      {showActions && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onActionClick(item);
          }}
          className="absolute top-2 right-2 z-20 text-gray-400 hover:text-white transition-colors"
          title="Actions"
        >
          <X className="h-3 w-3 md:h-4 md:w-4" />
        </button>
      )}

      <div className="flex items-center justify-center md:items-center md:justify-start w-full md:w-auto md:mr-3 mb-1 md:mb-0 order-first">
        <div className="w-5 h-5 md:w-8 md:h-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-lg">
          <span className="text-white font-bold text-[10px] md:text-sm">{index + 1}</span>
        </div>
      </div>

      <div className="flex flex-row md:contents items-start gap-2 mb-1 md:mb-0">
        <div
          className="relative w-24 h-24 md:w-20 md:h-20 rounded overflow-hidden cursor-pointer group flex-shrink-0"
          onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
        >
          <img
            src={mediaData.coverArt || DEFAULT_COVER_ART}
            alt={mediaData.title || 'Unknown Media'}
            className="w-full h-full object-cover"
            width="96"
            height="96"
          />
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/30 md:bg-black/40 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(item, index);
            }}
          >
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center border border-white bg-transparent md:border-0 md:bg-purple-600 md:hover:bg-purple-700 transition-all">
              <Play className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 md:ml-4">
          <h4
            className="font-medium text-white text-sm truncate cursor-pointer hover:text-purple-300 transition-colors"
            onClick={() => mediaData.uuid && navigate(`/tune/${mediaData.uuid}`)}
          >
            {mediaData.title || 'Unknown Media'}
          </h4>
          <p className="text-gray-400 text-xs truncate">
            <ClickableArtistDisplay media={mediaData} />
          </p>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="h-3 w-3 text-gray-500" />
            <span className="text-xs text-gray-400">{formatDuration(mediaData.duration)}</span>
          </div>
          {mediaData.tags && mediaData.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {mediaData.tags.slice(0, window.innerWidth < 640 ? 3 : 5).map((tag: string, tagIndex: number) => (
                <Link
                  key={tagIndex}
                  to={`/tune/${mediaData._id || mediaData.id}`}
                  className="px-2 py-0.5 bg-purple-700/60 hover:bg-purple-500 text-white text-[10px] rounded-full transition-colors no-underline"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center md:ml-2 md:mr-4 flex-shrink-0">
        <MiniSupportersBar bids={mediaData.bids || []} maxVisible={5} scrollable={true} />
      </div>

      <div className="flex items-center justify-end md:justify-center md:ml-auto flex-shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTip(item);
          }}
          disabled={isBidding}
          title="Send a tip"
          aria-label="Send a tip"
          className="group flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-purple-900/40 border border-purple-500/40 text-purple-300 hover:bg-purple-600 hover:text-white hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Heart className="h-5 w-5 md:h-6 md:w-6 transition-transform group-hover:scale-110" />
        </button>
      </div>
    </div>
  );
};

export default QueueMediaCard;
