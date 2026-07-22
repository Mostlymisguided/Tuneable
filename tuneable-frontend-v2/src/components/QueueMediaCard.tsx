import React from 'react';
import { Link } from 'react-router-dom';
import { Play, X, Clock, Heart } from 'lucide-react';
import ClickableArtistDisplay from './ClickableArtistDisplay';
import MiniSupportersBar from './MiniSupportersBar';
import TagList from './TagList';
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

function getBpm(mediaData: { bpm?: number | null }): number | null {
  const bpm = mediaData?.bpm;
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) return null;
  return Math.round(bpm);
}

function getReleaseYear(mediaData: {
  releaseYear?: number | null;
  releaseDate?: string | Date | null;
}): number | null {
  const year = mediaData?.releaseYear;
  if (typeof year === 'number' && Number.isFinite(year) && year >= 1900 && year <= 2100) {
    return Math.trunc(year);
  }
  const date = mediaData?.releaseDate;
  if (!date) return null;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const fromDate = parsed.getFullYear();
  return fromDate >= 1900 && fromDate <= 2100 ? fromDate : null;
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
  /** Override profile link (defaults to /tune/:uuid) */
  mediaHref?: string;
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
  mediaHref,
}) => {
  const tags = mediaData.tags ?? [];
  const bpm = getBpm(mediaData);
  const releaseYear = getReleaseYear(mediaData);
  const href =
    mediaHref ||
    (mediaData.uuid ? `/tune/${mediaData.uuid}` : undefined);

  const metaParts: React.ReactNode[] = [];
  metaParts.push(
    <span key="duration" className="flex items-center gap-1">
      <Clock className="h-3 w-3 text-gray-500" />
      <span>{formatDuration(mediaData.duration)}</span>
    </span>
  );
  if (bpm != null) {
    metaParts.push(
      <span key="bpm" title={`${bpm} BPM`} className="tabular-nums">
        <span className="md:hidden">{bpm}</span>
        <span className="hidden md:inline">{bpm} BPM</span>
      </span>
    );
  }
  if (releaseYear != null) {
    metaParts.push(
      <span key="year" title={`Released ${releaseYear}`} className="tabular-nums">
        {releaseYear}
      </span>
    );
  }

  const chartBadge = (
    <div className="w-5 h-5 md:w-8 md:h-8 rounded-full flex items-center justify-center">
      <span className="text-white font-bold text-[10px] md:text-sm">{index + 1}</span>
    </div>
  );

  const tipButton = (
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
  );

  return (
    <div className="flex items-stretch gap-1.5 md:contents">
      {/* Chart number — left gutter on mobile */}
      <div className="flex-shrink-0 w-5 flex items-center justify-center md:hidden">
        {chartBadge}
      </div>

      <div className="flex-1 min-w-0 rounded-2xl overflow-hidden backdrop-blur-md bg-gray-900/50 border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] transition-shadow relative p-1.5 md:p-4">
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

        {/* Chart number — inside card on desktop */}
        <div className="hidden md:flex items-center justify-center md:mr-3 flex-shrink-0">
          {chartBadge}
        </div>

        <div className="flex flex-row items-start gap-2 md:contents">
          <div className="relative w-12 h-12 md:w-20 md:h-20 rounded overflow-hidden cursor-pointer group flex-shrink-0">
            {href ? (
              <Link to={href} className="block w-full h-full">
                <img
                  src={mediaData.coverArt || DEFAULT_COVER_ART}
                  alt={mediaData.title || 'Unknown Media'}
                  className="w-full h-full object-cover"
                  width="96"
                  height="96"
                />
              </Link>
            ) : (
              <img
                src={mediaData.coverArt || DEFAULT_COVER_ART}
                alt={mediaData.title || 'Unknown Media'}
                className="w-full h-full object-cover"
                width="96"
                height="96"
              />
            )}
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/30 md:bg-black/40 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(item, index);
              }}
            >
              <div className="w-7 h-7 md:w-12 md:h-12 rounded-full flex items-center justify-center border border-white bg-transparent md:border-0 md:bg-purple-600 md:hover:bg-purple-700 transition-all">
                <Play className="h-3.5 w-3.5 md:h-6 md:w-6 text-white" />
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 md:ml-4 pr-11 md:pr-0">
            <div className="flex items-center gap-2 min-w-0">
              <h4 className="flex-1 min-w-0 font-medium text-white text-sm truncate">
                {href ? (
                  <Link
                    to={href}
                    className="cursor-pointer hover:text-purple-300 transition-colors"
                  >
                    {mediaData.title || 'Unknown Media'}
                  </Link>
                ) : (
                  mediaData.title || 'Unknown Media'
                )}
              </h4>
              <div className="flex items-center gap-1.5 flex-shrink-0 text-xs text-gray-400">
                {metaParts.flatMap((part, i) =>
                  i === 0
                    ? [part]
                    : [
                        <span key={`sep-${i}`} className="text-gray-600" aria-hidden>
                          ·
                        </span>,
                        part,
                      ]
                )}
              </div>
            </div>
            <p className="text-gray-400 text-xs truncate">
              <ClickableArtistDisplay media={mediaData} />
            </p>
            {tags.length > 0 && (
              <div className="hidden md:block mt-1">
                <TagList
                  tags={tags}
                  mediaId={mediaData.uuid || mediaData._id || mediaData.id}
                  limit={5}
                />
              </div>
            )}
          </div>
        </div>

        {/* Tags — own line on mobile, aligned with supporters bar */}
        {tags.length > 0 && (
          <div className="md:hidden mt-1">
            <TagList
              tags={tags}
              mediaId={mediaData.uuid || mediaData._id || mediaData.id}
              limit={3}
            />
          </div>
        )}

        <div className="flex items-center md:ml-2 md:mr-4 flex-shrink-0">
          <MiniSupportersBar bids={mediaData.bids || []} maxVisible={5} scrollable={true} />
        </div>

        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 md:static md:translate-y-0 md:flex md:items-center md:justify-center md:ml-auto flex-shrink-0 z-10">
          {tipButton}
        </div>
      </div>
    </div>
  );
};

export default QueueMediaCard;
