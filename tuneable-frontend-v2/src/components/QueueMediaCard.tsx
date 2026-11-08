import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Play, Heart } from 'lucide-react';
import ClickableArtistDisplay from './ClickableArtistDisplay';
import MiniSupportersBar from './MiniSupportersBar';
import TagList from './TagList';
import AiAssistedBadge from './AiAssistedBadge';
import { DEFAULT_COVER_ART } from '../constants';
import BookCover from './BookCover';
import { isWrittenMedia } from '../utils/mediaPlayability';
import { DEFAULT_POST_AUTH_PATH } from '../utils/authHelpers';
import { getCountryLabelFromLocation, getCountryPlaceProfilePath } from '../utils/locationHelpers';
import { getTagProfilePath } from '../utils/tagNormalizer';
import { getMediaProfileUrl } from '../utils/mediaNavigation';
import { formatMediaTuneBytes } from '../utils/formatTuneBytes';
import { TuneBytesMark } from './TuneBytesMark';
import WaveformBars, { waveformPeaksOf } from './WaveformBars';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { promoteCoverArt, useNotedCover } from '../utils/coverMemory';

function QueueCover({ media }: { media: { coverArt?: string | null; title?: string; contentForm?: string | string[]; contentType?: string | string[] } }) {
  const alt = media.title || 'Unknown Media';
  const src = media.coverArt || DEFAULT_COVER_ART;
  useNotedCover(isWrittenMedia(media) ? null : src);
  if (isWrittenMedia(media)) {
    return <BookCover src={media.coverArt} alt={alt} className="w-full h-full object-cover" />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      width="96"
      height="96"
    />
  );
}

const QUIET_LINK_CLASS =
  'shrink-0 text-xs tabular-nums text-gray-400 hover:text-white hover:underline underline-offset-2 transition-colors no-underline';
const PLACE_CLASS =
  'inline-block max-w-[6.5rem] truncate text-xs text-gray-400 hover:text-white hover:underline underline-offset-2 transition-colors no-underline md:max-w-[9rem]';

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
  /** Accepted from existing callers. The dismiss control is no longer drawn on the card. */
  showActions: boolean;
  isBidding: boolean;
  /** Accepted from existing callers. The dismiss control is no longer drawn on the card. */
  onActionClick: (item: any) => void;
  onPlay: (item: any, index: number) => void;
  onTip: (item: any) => void;
  /** Override profile link (defaults to /tune/:uuid) */
  mediaHref?: string;
  /** Chart position. Defaults to index + 1. Pass the pre-filter rank when hiding unplayable rows. */
  rank?: number;
}

const QueueMediaCard: React.FC<QueueMediaCardProps> = ({
  item,
  index,
  mediaData,
  isBidding,
  onPlay,
  onTip,
  mediaHref,
  rank: rankProp,
}) => {
  const routeLocation = useLocation();
  const tags = mediaData.tags ?? [];
  const releaseYear = getReleaseYear(mediaData);
  const country = getCountryLabelFromLocation(mediaData.primaryLocation);
  const countryPath = getCountryPlaceProfilePath(mediaData.primaryLocation);
  const isOnGlobalEarth =
    routeLocation.pathname === '/party/global' &&
    !new URLSearchParams(routeLocation.search).get('location');
  const href =
    mediaHref ||
    (mediaData.slug || mediaData.uuid || mediaData._id ? getMediaProfileUrl(mediaData) : undefined);
  const mediaId = mediaData.uuid || mediaData._id || mediaData.id;
  const rank = rankProp ?? index + 1;
  const tuneBytesLabel = formatMediaTuneBytes(mediaData.tuneBytesEarned);
  const bids = mediaData.bids || [];
  const peaks = waveformPeaksOf(mediaData.waveformPeaks);
  const playProgress = useWebPlayerStore((state) => {
    if (!peaks) return 0;
    const activeId = String(state.currentMedia?._id || state.currentMedia?.id || '');
    if (!mediaId || activeId !== String(mediaId) || !state.duration) return 0;
    return Math.max(0, Math.min(1, state.currentTime / state.duration));
  });

  const place = country ? (
    countryPath ? (
      <Link to={countryPath} title={country} onClick={(e) => e.stopPropagation()} className={PLACE_CLASS}>
        {country}
      </Link>
    ) : (
      <span title={country} className={PLACE_CLASS}>
        {country}
      </span>
    )
  ) : isOnGlobalEarth ? (
    <span title="Origin unknown" className={PLACE_CLASS}>
      Earth
    </span>
  ) : (
    <Link
      to={DEFAULT_POST_AUTH_PATH}
      title="Origin unknown — view Global Party"
      onClick={(e) => e.stopPropagation()}
      className={PLACE_CLASS}
    >
      Earth
    </Link>
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
      className="group flex h-10 w-10 items-center justify-center rounded-full border border-purple-500/40 bg-purple-900/40 text-purple-300 transition-colors hover:border-purple-500 hover:bg-purple-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 md:h-11 md:w-11"
    >
      <Heart className="h-5 w-5 transition-transform group-hover:scale-110" />
    </button>
  );

  const scoreStack = (
    <>
      {tuneBytesLabel ? (
        <TuneBytesMark label={tuneBytesLabel} className="text-xs md:text-lg" />
      ) : null}
      <MiniSupportersBar
        bids={bids}
        maxVisible={5}
        limit={5}
        scrollable={false}
        alignEnd
        stackBelowMd
        className=""
      />
    </>
  );

  return (
    <div className="relative flex items-stretch gap-2 rounded-2xl overflow-hidden backdrop-blur-md bg-gray-900/50 border border-white/10 shadow-2xl p-2 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] transition-shadow md:gap-4 md:px-4 md:pt-2.5 md:pb-3">
      <div className="flex min-w-0 flex-1 items-start gap-2 md:gap-4">
        <div className="relative h-12 w-12 flex-shrink-0 cursor-pointer overflow-hidden rounded group md:h-20 md:w-20">
          {href ? (
            <Link
              to={href}
              className="block h-full w-full"
              tabIndex={-1}
              onClick={() => promoteCoverArt(mediaData.coverArt)}
            >
              <QueueCover media={mediaData} />
            </Link>
          ) : (
            <QueueCover media={mediaData} />
          )}
          <button
            type="button"
            className="absolute inset-0 flex cursor-pointer items-center justify-center rounded bg-black/35"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPlay(item, index);
            }}
            aria-label={`Play chart position ${rank}`}
          >
            <span
              className={`pointer-events-none font-bold tabular-nums leading-none text-white transition-all duration-150 group-hover:scale-90 group-hover:opacity-0 ${
                rank >= 100 ? 'text-xs md:text-sm' : 'text-sm md:text-lg'
              }`}
            >
              {rank}
            </span>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white bg-transparent md:h-12 md:w-12 md:border-0 md:bg-purple-600">
                <Play className="h-3.5 w-3.5 text-white md:h-6 md:w-6" />
              </div>
            </div>
          </button>
        </div>

        <div className="min-w-0 flex-1 md:pt-0.5">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <h4 className="min-w-0 shrink text-sm font-medium text-white">
              {href ? (
                <Link
                  to={href}
                  className="block truncate cursor-pointer transition-colors hover:text-purple-300"
                  onClick={() => promoteCoverArt(mediaData.coverArt)}
                >
                  {mediaData.title || 'Unknown Media'}
                </Link>
              ) : (
                <span className="block truncate">{mediaData.title || 'Unknown Media'}</span>
              )}
            </h4>
            <AiAssistedBadge aiUsage={mediaData.aiUsage} size="sm" />
            <span className="shrink-0 text-xs tabular-nums text-gray-400">
              {formatDuration(mediaData.duration)}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
            <p className="min-w-0 shrink truncate text-xs text-gray-400">
              <ClickableArtistDisplay media={mediaData} />
            </p>
            {releaseYear != null && (
              <>
                <span className="shrink-0 text-xs text-gray-600" aria-hidden>
                  ·
                </span>
                <Link
                  to={getTagProfilePath(String(releaseYear))}
                  title={`Released ${releaseYear}`}
                  onClick={(e) => e.stopPropagation()}
                  className={QUIET_LINK_CLASS}
                >
                  {releaseYear}
                </Link>
              </>
            )}
          </div>
          {tags.length > 0 && (
            <div className="mt-1.5">
              <div className="md:hidden">
                <TagList tags={tags} mediaId={mediaId} limit={3} />
              </div>
              <div className="hidden md:block">
                <TagList tags={tags} mediaId={mediaId} limit={5} />
              </div>
            </div>
          )}
          {peaks && (
            <div className="mt-2 hidden md:block">
              <WaveformBars peaks={peaks} progress={playProgress} />
            </div>
          )}
        </div>
      </div>

      <div className="ml-auto grid shrink-0 grid-cols-[max-content_2.5rem] grid-rows-[auto_1fr] items-stretch gap-x-2 self-stretch md:grid-cols-[max-content_2.75rem] md:gap-x-3.5">
        <div className="col-span-2 row-start-1 justify-self-end leading-none">{place}</div>
        <div className="col-start-1 row-start-2 flex flex-col items-end gap-1 self-center md:gap-1.5">
          {scoreStack}
        </div>
        <div className="col-start-2 row-start-2 flex items-center justify-center self-center">
          {tipButton}
        </div>
      </div>
    </div>
  );
};

export default QueueMediaCard;
