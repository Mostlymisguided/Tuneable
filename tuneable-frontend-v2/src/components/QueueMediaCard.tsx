import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, X, Clock, Coins, TrendingUp, Loader2, Minus, Plus } from 'lucide-react';
import ClickableArtistDisplay from './ClickableArtistDisplay';
import MiniSupportersBar from './MiniSupportersBar';
import { DEFAULT_COVER_ART } from '../constants';
import { penceToPounds } from '../utils/currency';

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
  queueBidAmounts: Record<string, string>;
  setQueueBidAmounts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onActionClick: (item: any) => void;
  onPlay: (item: any, index: number) => void;
  onInlineBid: (item: any) => void;
  calculateAverageBid: (mediaData: any, partyMediaEntry?: any) => number;
  getDefaultBidAmount: (media?: any) => number;
  getEffectiveMinimumBid: (media?: any) => number;
}

const QueueMediaCard: React.FC<QueueMediaCardProps> = ({
  item,
  index,
  mediaData,
  showActions,
  isBidding,
  queueBidAmounts,
  setQueueBidAmounts,
  onActionClick,
  onPlay,
  onInlineBid,
  calculateAverageBid,
  getDefaultBidAmount,
  getEffectiveMinimumBid,
}) => {
  const navigate = useNavigate();
  const mediaId = mediaData._id || mediaData.id;

  const getBidAmount = () => {
    const avgBid = calculateAverageBid(mediaData, item);
    return Math.max(getDefaultBidAmount(mediaData), avgBid || 0);
  };

  const updateBidAmount = (delta: number) => {
    const minBid = getEffectiveMinimumBid(mediaData);
    const defaultBid = getBidAmount();
    const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
    const newAmount = Math.max(minBid, current + delta);
    setQueueBidAmounts((prev) => ({ ...prev, [mediaId]: newAmount.toFixed(2) }));
  };

  const isAtMinimum = () => {
    const defaultBid = getDefaultBidAmount(mediaData);
    const current = parseFloat(queueBidAmounts[mediaId] ?? defaultBid.toFixed(2));
    return current <= getEffectiveMinimumBid(mediaData);
  };

  const tipButtonLabel = (() => {
    const raw = queueBidAmounts[mediaId] ?? getBidAmount().toFixed(2);
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return 'Send Tip';
    return `Tip £${parsed.toFixed(2)}`;
  })();

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

      <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-2">
        <div className="flex items-center justify-center space-x-2">
          <div className="flex flex-row md:flex-col items-center gap-2 md:gap-1 px-2 py-1.5 rounded-lg bg-purple-900/40 border border-purple-500/40">
            <div className="text-center p-0.5">
              <div className="flex items-center justify-center text-[9px] md:text-xs text-gray-300 tracking-wide" title="Tip Total">
                <Coins className="h-3 w-3 md:h-4 md:w-4" />
              </div>
              <div className="text-[9px] md:text-xs md:text-lg text-gray-300">
                {penceToPounds(typeof item.partyMediaAggregate === 'number' ? item.partyMediaAggregate : 0)}
              </div>
            </div>
            <div className="text-center p-0.5">
              <div className="flex items-center justify-center text-[9px] md:text-xs text-gray-300 tracking-wide" title="Average Tip">
                <TrendingUp className="h-3 w-3 md:h-4 md:w-4" />
              </div>
              <div className="text-[9px] md:text-xs md:text-lg text-gray-300">
                £{calculateAverageBid(mediaData, item).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex flex-row items-center space-x-1 md:space-x-2">
            <div className="flex flex-row md:flex-col items-center space-x-0 md:space-y-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateBidAmount(0.01);
                }}
                disabled={isBidding}
                className="hidden md:inline px-4 py-1 bg-white hover:bg-gray-900 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-tr-lg rounded-tl-lg text-black transition-colors flex items-center justify-center"
              >
                <Plus className="h-3 w-3 md:h-4 md:w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateBidAmount(-0.01);
                }}
                disabled={isBidding || isAtMinimum()}
                className="md:hidden px-1.5 py-1.5 md:px-6 md:py-1 bg-white hover:bg-gray-900 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-tl-lg rounded-bl-lg text-black transition-colors flex items-center justify-center"
              >
                <Minus className="h-3 w-3 md:h-4 md:w-4" />
              </button>
              <input
                type="number"
                step="0.01"
                min={getEffectiveMinimumBid(mediaData)}
                value={queueBidAmounts[mediaId] ?? getBidAmount().toFixed(2)}
                onChange={(e) =>
                  setQueueBidAmounts((prev) => ({ ...prev, [mediaId]: e.target.value }))
                }
                className="w-16 md:w-20 bg-gray-900 rounded px-1.5 md:px-2 py-1 md:py-1.5 text-center text-gray text-xs md:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateBidAmount(-0.01);
                }}
                disabled={isBidding || isAtMinimum()}
                className="hidden md:inline px-1.5 py-2 md:px-4 md:py-1 bg-white hover:bg-gray-900 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-bl-lg rounded-br-lg text-black transition-colors flex items-center justify-center"
              >
                <Minus className="h-3 w-3 md:h-4 md:w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  updateBidAmount(0.01);
                }}
                disabled={isBidding}
                className="md:hidden px-1.5 py-1.5 md:px-2 md:py-1 bg-white hover:bg-gray-900 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-tr-lg rounded-br-lg text-black transition-colors flex items-center justify-center"
              >
                <Plus className="h-3 w-3 md:h-4 md:w-4" />
              </button>
            </div>
            <button
              onClick={() => onInlineBid(item)}
              disabled={isBidding}
              className="px-2 md:px-4 py-1.5 md:py-2 bg-purple-800 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors text-xs md:text-sm whitespace-nowrap flex items-center justify-center gap-2"
            >
              {isBidding ? (
                <>
                  <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                  <span>Placing Tip...</span>
                </>
              ) : (
                tipButtonLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueueMediaCard;
