import React from 'react';
import { Link } from 'react-router-dom';
import { Play, Clock, Heart, Loader } from 'lucide-react';
import MiniSupportersBar from './MiniSupportersBar';
import TagList from './TagList';
import { DEFAULT_COVER_ART } from '../constants';
import { getEpisodeDisplayTags } from '../utils/podcastTags';

function formatDuration(duration: number | string | undefined) {
  if (!duration) return '';
  if (typeof duration === 'string' && duration.includes(':')) return duration;
  const totalSeconds = typeof duration === 'string' ? parseInt(duration, 10) : duration;
  if (isNaN(totalSeconds)) return '';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export interface PodcastEpisodeCardData {
  _id?: string;
  id?: string;
  title: string;
  coverArt?: string;
  podcastImage?: string;
  duration?: number;
  globalMediaAggregate?: number;
  tags?: string[];
  genres?: string[];
  category?: string;
  podcastSeries?: { _id: string; title: string; coverArt?: string; genres?: string[]; tags?: string[] };
  podcastTitle?: string;
  sources?: Record<string, string>;
  audioUrl?: string;
  enclosure?: { url?: string };
  isExternal?: boolean;
  source?: 'local' | 'podcastindex' | 'taddy' | 'apple';
  bids?: Array<{
    _id?: string;
    userId: { username: string; profilePic?: string; uuid: string };
    amount: number;
    createdAt: string;
    status?: string;
  }>;
}

/** Category/genre tags first, then tip tags — deduped, same TagList style as global party. */

export interface PodcastQueueMediaCardProps {
  episode: PodcastEpisodeCardData;
  index: number;
  showRank?: boolean;
  isBidding?: boolean;
  isPlayLoading?: boolean;
  canPlay?: boolean;
  tipLabel?: string;
  /** When set, episode title/artwork render as real links to this path. */
  episodePath?: string;
  hideTag?: string;
  onEpisodeClick: (episode: PodcastEpisodeCardData) => void;
  onSeriesClick?: (episode: PodcastEpisodeCardData, e: React.MouseEvent) => void;
  onPlay: (episode: PodcastEpisodeCardData, e: React.MouseEvent) => void;
  onTip: (episode: PodcastEpisodeCardData, e: React.MouseEvent) => void;
}

const PodcastQueueMediaCard: React.FC<PodcastQueueMediaCardProps> = ({
  episode,
  index,
  showRank = true,
  isBidding = false,
  isPlayLoading = false,
  canPlay = false,
  tipLabel = 'Send a tip',
  episodePath,
  hideTag,
  onEpisodeClick,
  onSeriesClick,
  onPlay,
  onTip,
}) => {
  const tags = getEpisodeDisplayTags(episode);
  const seriesTitle = episode.podcastSeries?.title || episode.podcastTitle;
  const coverArt =
    episode.coverArt || episode.podcastImage || episode.podcastSeries?.coverArt || DEFAULT_COVER_ART;
  const mediaId = episode._id || episode.id;
  const durationLabel = formatDuration(episode.duration);

  const tipButton = (
    <button
      type="button"
      onClick={(e) => onTip(episode, e)}
      disabled={isBidding}
      title={tipLabel}
      aria-label={tipLabel}
      className="group flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-purple-900/40 border border-purple-500/40 text-purple-300 hover:bg-purple-600 hover:text-white hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {isBidding ? (
        <Loader className="h-5 w-5 animate-spin" />
      ) : (
        <Heart className="h-5 w-5 md:h-6 md:w-6 transition-transform group-hover:scale-110" />
      )}
    </button>
  );

  const rank = index + 1;
  const showArtOverlay = showRank || canPlay;

  return (
    <div className="rounded-2xl overflow-hidden backdrop-blur-md bg-gray-900/50 border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] transition-shadow relative p-1.5 md:p-4">
      <div className="flex flex-row items-start gap-2 md:contents">
        <div
          className="relative w-12 h-12 md:w-20 md:h-20 rounded overflow-hidden cursor-pointer group flex-shrink-0"
          onClick={episodePath ? undefined : () => onEpisodeClick(episode)}
        >
          {episodePath ? (
            <Link to={episodePath} className="block w-full h-full" tabIndex={-1}>
              <img
                src={coverArt}
                alt={episode.title}
                className="w-full h-full object-cover"
                width="96"
                height="96"
              />
            </Link>
          ) : (
            <img
              src={coverArt}
              alt={episode.title}
              className="w-full h-full object-cover"
              width="96"
              height="96"
            />
          )}
          {showArtOverlay && (
            <button
              type="button"
              className={`absolute inset-0 flex items-center justify-center bg-black/35 rounded ${
                canPlay ? 'cursor-pointer' : 'cursor-default'
              }`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (canPlay) onPlay(episode, e);
              }}
              disabled={!canPlay}
              aria-label={
                canPlay
                  ? showRank
                    ? `Play chart position ${rank}`
                    : `Play ${episode.title}`
                  : showRank
                    ? `Chart position ${rank}`
                    : undefined
              }
            >
              {showRank && (
                <span
                  className={`pointer-events-none text-white font-bold tabular-nums leading-none transition-all duration-150 ${
                    canPlay ? 'group-hover:opacity-0 group-hover:scale-90' : ''
                  } ${rank >= 100 ? 'text-xs md:text-sm' : 'text-sm md:text-lg'}`}
                >
                  {rank}
                </span>
              )}
              {canPlay && (
                <div
                  className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${
                    showRank
                      ? 'opacity-0 group-hover:opacity-100'
                      : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
                  }`}
                >
                  <div className="w-7 h-7 md:w-12 md:h-12 rounded-full flex items-center justify-center border border-white bg-transparent md:border-0 md:bg-purple-600">
                    {isPlayLoading ? (
                      <Loader className="h-3.5 w-3.5 md:h-6 md:w-6 text-white animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 md:h-6 md:w-6 text-white" />
                    )}
                  </div>
                </div>
              )}
            </button>
          )}
        </div>

        <div className="flex-1 min-w-0 md:ml-4 pr-11 md:pr-0">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="flex-1 min-w-0 font-medium text-white text-sm truncate">
              {episodePath ? (
                <Link
                  to={episodePath}
                  className="cursor-pointer hover:text-purple-300 transition-colors"
                >
                  {episode.title}
                </Link>
              ) : (
                <span
                  className="cursor-pointer hover:text-purple-300 transition-colors"
                  onClick={() => onEpisodeClick(episode)}
                >
                  {episode.title}
                </span>
              )}
            </h4>
            {durationLabel && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <Clock className="h-3 w-3 text-gray-500" />
                <span className="text-xs text-gray-400">{durationLabel}</span>
              </div>
            )}
          </div>
          {seriesTitle && (
            <p
              className={`text-gray-400 text-xs truncate ${onSeriesClick ? 'cursor-pointer hover:text-purple-300 transition-colors' : ''}`}
              onClick={onSeriesClick ? (e) => onSeriesClick(episode, e) : undefined}
            >
              {seriesTitle}
            </p>
          )}
          {tags.length > 0 && (
            <div className="hidden md:block mt-1">
              <TagList
                tags={tags}
                mediaId={mediaId ?? ''}
                limit={5}
                scope="podcast"
                hideTag={hideTag}
              />
            </div>
          )}
          {episode.isExternal && episode.source && (
            <span
              className={`inline-block mt-1 px-2 py-0.5 text-[10px] rounded-full ${
                episode.source === 'taddy'
                  ? 'bg-green-600/30 text-green-300'
                  : episode.source === 'apple'
                    ? 'bg-pink-600/30 text-pink-300'
                  : episode.source === 'podcastindex'
                    ? 'bg-blue-600/30 text-blue-300'
                    : 'bg-gray-600/30 text-gray-300'
              }`}
            >
              {episode.source}
            </span>
          )}
        </div>
      </div>

      {/* Tags — own line on mobile, aligned with supporters bar (same as global party) */}
      {tags.length > 0 && (
        <div className="md:hidden mt-1">
          <TagList
            tags={tags}
            mediaId={mediaId ?? ''}
            limit={3}
            scope="podcast"
            hideTag={hideTag}
          />
        </div>
      )}

      <div className="flex items-center md:ml-2 md:mr-4 flex-shrink-0">
        <MiniSupportersBar bids={episode.bids || []} maxVisible={5} scrollable={true} />
      </div>

      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 md:static md:translate-y-0 md:flex md:items-center md:justify-center md:ml-auto flex-shrink-0 z-10">
        {tipButton}
      </div>
    </div>
  );
};

export default PodcastQueueMediaCard;
