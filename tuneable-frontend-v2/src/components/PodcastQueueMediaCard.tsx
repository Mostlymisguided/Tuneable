import React from 'react';
import { Play, Clock, Heart, Loader } from 'lucide-react';
import MiniSupportersBar from './MiniSupportersBar';
import TagList from './TagList';
import { DEFAULT_COVER_ART } from '../constants';

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
function getDisplayTags(episode: PodcastEpisodeCardData): string[] {
  const candidates = [
    ...(episode.genres ?? []),
    ...(episode.podcastSeries?.genres ?? []),
    ...(episode.category ? [episode.category] : []),
    ...(episode.tags ?? []),
    ...(episode.podcastSeries?.tags ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const tag = typeof raw === 'string' ? raw.trim() : '';
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export interface PodcastQueueMediaCardProps {
  episode: PodcastEpisodeCardData;
  index: number;
  showRank?: boolean;
  isBidding?: boolean;
  isPlayLoading?: boolean;
  canPlay?: boolean;
  tipLabel?: string;
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
  onEpisodeClick,
  onSeriesClick,
  onPlay,
  onTip,
}) => {
  const tags = getDisplayTags(episode);
  const seriesTitle = episode.podcastSeries?.title || episode.podcastTitle;
  const coverArt =
    episode.coverArt || episode.podcastImage || episode.podcastSeries?.coverArt || DEFAULT_COVER_ART;
  const mediaId = episode._id || episode.id;
  const durationLabel = formatDuration(episode.duration);
  const tagListPath = mediaId ? `/podcasts/${mediaId}` : undefined;

  const chartBadge = showRank ? (
    <div className="w-5 h-5 md:w-8 md:h-8 rounded-full flex items-center justify-center">
      <span className="text-white font-bold text-[10px] md:text-sm">{index + 1}</span>
    </div>
  ) : null;

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

  return (
    <div className="flex items-stretch gap-1.5 md:contents">
      {chartBadge && (
        <div className="flex-shrink-0 w-5 flex items-center justify-center md:hidden">{chartBadge}</div>
      )}

      <div className="flex-1 min-w-0 rounded-2xl overflow-hidden backdrop-blur-md bg-gray-900/50 border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] transition-shadow relative p-1.5 md:p-4">
        {chartBadge && (
          <div className="hidden md:flex items-center justify-center md:mr-3 flex-shrink-0">{chartBadge}</div>
        )}

        <div className="flex flex-row items-start gap-2 md:contents">
          <div
            className="relative w-12 h-12 md:w-20 md:h-20 rounded overflow-hidden cursor-pointer group flex-shrink-0"
            onClick={() => onEpisodeClick(episode)}
          >
            <img
              src={coverArt}
              alt={episode.title}
              className="w-full h-full object-cover"
              width="96"
              height="96"
            />
            {canPlay && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 md:bg-black/40 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(episode, e);
                }}
              >
                <div className="w-7 h-7 md:w-12 md:h-12 rounded-full flex items-center justify-center border border-white bg-transparent md:border-0 md:bg-purple-600 md:hover:bg-purple-700 transition-all">
                  {isPlayLoading ? (
                    <Loader className="h-3.5 w-3.5 md:h-6 md:w-6 text-white animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 md:h-6 md:w-6 text-white" />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 md:ml-4 pr-11 md:pr-0">
            <div className="flex items-center gap-2 min-w-0">
              <h4
                className="flex-1 min-w-0 font-medium text-white text-sm truncate cursor-pointer hover:text-purple-300 transition-colors"
                onClick={() => onEpisodeClick(episode)}
              >
                {episode.title}
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
                  linkPath={tagListPath}
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
              linkPath={tagListPath}
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
    </div>
  );
};

export default PodcastQueueMediaCard;
