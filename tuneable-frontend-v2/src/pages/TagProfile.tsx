import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Tag, Loader2, Music, Mic, Coins, MapPin, Clock } from 'lucide-react';
import { mediaAPI, tagAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import MediaChampions from '../components/MediaChampions';
import TippedMediaQueueList, { type TippedQueueItem } from '../components/TippedMediaQueueList';
import PodcastQueueMediaCard, {
  type PodcastEpisodeCardData,
} from '../components/PodcastQueueMediaCard';
import BidConfirmationModal from '../components/BidConfirmationModal';
import { getMediaCoverArt } from '../utils/coverArt';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
import { getPlaceProfilePath } from '../utils/locationHelpers';
import { getTagProfilePath, tagsMatch } from '../utils/tagNormalizer';
import { episodeMatchesTag, relatedPodcastTags } from '../utils/podcastTags';
import { resolveTipStatInputs } from '../utils/tipStats';
import { getEpisodeAudioUrl, usePodcastPlayerStore } from '../stores/podcastPlayerStore';

interface TagEntity {
  name: string;
  slug: string;
  canonicalTag?: string;
  kind?: 'tag' | 'year' | 'bpm';
}

interface TagStats {
  mediaCount?: number;
  globalTagAggregate?: number;
}

interface RelatedTag {
  name: string;
  slug: string;
}

interface TagPlaceChip {
  placeId: string;
  name: string;
  featureType?: string | null;
}

type TagMediaItem = TippedQueueItem;

const TIME_PERIOD_OPTIONS = [
  { key: 'all-time', label: 'All Time' },
  { key: 'this-month', label: 'This Month' },
  { key: 'this-week', label: 'This Week' },
  { key: 'today', label: 'Today' },
] as const;

type TimePeriod = (typeof TIME_PERIOD_OPTIONS)[number]['key'];

function formatTimePeriodLabel(period: string): string {
  return (
    TIME_PERIOD_OPTIONS.find((p) => p.key === period)?.label ??
    period.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

function toPodcastChartTimeRange(period: TimePeriod): 'all' | 'day' | 'week' | 'month' {
  switch (period) {
    case 'today':
      return 'day';
    case 'this-week':
      return 'week';
    case 'this-month':
      return 'month';
    default:
      return 'all';
  }
}

function podcastCover(item: TagMediaItem | PodcastEpisodeCardData): string {
  const series =
    'podcastSeries' in item && item.podcastSeries && typeof item.podcastSeries === 'object'
      ? item.podcastSeries
      : undefined;
  if (item.coverArt) return getMediaCoverArt(item);
  if ('podcastImage' in item && item.podcastImage) return item.podcastImage;
  if (series?.coverArt) return series.coverArt;
  return getMediaCoverArt(item);
}

const TagProfile: React.FC = () => {
  const { slug: slugParam } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { setCurrentEpisode, play } = usePodcastPlayerStore();

  const slug = slugParam ? decodeURIComponent(slugParam) : '';
  const isPodcast = searchParams.get('type') === 'podcast';

  const [tag, setTag] = useState<TagEntity | null>(null);
  const [stats, setStats] = useState<TagStats | null>(null);
  const [relatedTags, setRelatedTags] = useState<RelatedTag[]>([]);
  const [topOriginPlaces, setTopOriginPlaces] = useState<TagPlaceChip[]>([]);
  const [topSupportPlaces, setTopSupportPlaces] = useState<TagPlaceChip[]>([]);
  const [media, setMedia] = useState<TagMediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>('all-time');
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [tipTarget, setTipTarget] = useState<PodcastEpisodeCardData | null>(null);
  const [isPlacingTip, setIsPlacingTip] = useState(false);
  const [fetchingPlayId, setFetchingPlayId] = useState<string | null>(null);

  const loadProfile = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!slug) return;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await tagAPI
          .getProfile(slug, {
            limit: 50,
            timePeriod: selectedTimePeriod,
            type: isPodcast ? 'podcast' : 'music',
          })
          .catch((err: unknown) => {
            if (!isPodcast) throw err;
            return null;
          });

        const nextTag = data?.tag || {
          name: slug.replace(/-/g, ' '),
          slug,
          kind: 'tag' as const,
        };
        setTag(nextTag);

        const profileMedia = (data?.media || []) as TagMediaItem[];
        const profileIsPodcastScoped =
          data?.contentScope === 'podcast' && profileMedia.length > 0;

        if (isPodcast && !profileIsPodcastScoped) {
          const params = new URLSearchParams({
            limit: '200',
            timeRange: toPodcastChartTimeRange(selectedTimePeriod),
            sortBy: 'globalMediaAggregate',
          });
          const response = await fetch(
            `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'}/api/podcasts/chart?${params}`
          );
          if (!response.ok) {
            throw new Error('Failed to load podcasts');
          }
          const chart = await response.json();
          const matched = ((chart.episodes || []) as PodcastEpisodeCardData[]).filter((episode) =>
            episodeMatchesTag(episode, nextTag.name)
          );
          setMedia(matched as TagMediaItem[]);
          setTotal(matched.length);
          setStats({
            mediaCount: matched.length,
            globalTagAggregate: matched.reduce(
              (sum, episode) => sum + (episode.globalMediaAggregate || 0),
              0
            ),
          });
          setRelatedTags(relatedPodcastTags(matched, nextTag.name));
          setTopOriginPlaces([]);
          setTopSupportPlaces([]);
        } else {
          setStats(data?.stats || null);
          setRelatedTags(data?.relatedTags || []);
          setTopOriginPlaces(data?.topOriginPlaces || []);
          setTopSupportPlaces(data?.topSupportPlaces || []);
          setMedia(profileMedia);
          setTotal(data?.pagination?.total ?? profileMedia.length);
        }
      } catch (err: unknown) {
        console.error('Error loading tag profile:', err);
        if (!silent) setError('Tag not found or failed to load.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [slug, selectedTimePeriod, isPodcast]
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const episodes = media as unknown as PodcastEpisodeCardData[];
  const tipStats = useMemo(() => resolveTipStatInputs(tipTarget, user), [tipTarget, user]);
  const defaultTip = Math.max(0.01, user?.preferences?.defaultTip ?? 1.11);

  const handlePodcastPlay = async (episode: PodcastEpisodeCardData, e: React.MouseEvent) => {
    e.stopPropagation();
    const ep = {
      _id: episode._id,
      id: episode.id,
      title: episode.title,
      duration: episode.duration,
      coverArt: episode.coverArt || episode.podcastImage || episode.podcastSeries?.coverArt,
      podcastSeries: episode.podcastSeries,
      podcastTitle: episode.podcastTitle,
      sources: episode.sources,
      audioUrl: episode.audioUrl,
      enclosure: episode.enclosure,
    };
    if (getEpisodeAudioUrl(ep)) {
      setCurrentEpisode(ep);
      play();
      toast.success(`Now playing: ${episode.title}`);
      return;
    }
    const id = episode._id || episode.id;
    if (!id) {
      toast.error('No playable audio for this episode');
      return;
    }
    setFetchingPlayId(id);
    try {
      const { media: loaded } = await mediaAPI.getProfile(id);
      const playable = {
        _id: loaded._id,
        id: loaded.uuid,
        title: loaded.title,
        duration: loaded.duration,
        coverArt: loaded.coverArt,
        podcastSeries:
          typeof loaded.podcastSeries === 'object' ? loaded.podcastSeries : undefined,
        sources: loaded.sources,
      };
      if (!getEpisodeAudioUrl(playable)) {
        toast.error('No playable audio for this episode');
        return;
      }
      setCurrentEpisode(playable);
      play();
      toast.success(`Now playing: ${loaded.title}`);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      toast.error(message || 'Failed to load episode');
    } finally {
      setFetchingPlayId(null);
    }
  };

  const handlePodcastTip = async (tags: string[], amount: number) => {
    if (!tipTarget || !user) return;
    const id = tipTarget._id || tipTarget.id;
    if (!id) {
      toast.error('Episode ID not found');
      return;
    }
    setIsPlacingTip(true);
    try {
      await mediaAPI.placeGlobalBid(id, amount, undefined, tags);
      toast.success(`Tip of £${amount.toFixed(2)} placed successfully!`);
      setTipTarget(null);
      await refreshUser();
      await loadProfile({ silent: true });
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      toast.error(message || 'Failed to place tip');
    } finally {
      setIsPlacingTip(false);
    }
  };

  const displayName = tag?.name || slug.replace(/-/g, ' ');
  const kindLabel =
    tag?.kind === 'year'
      ? 'Year'
      : tag?.kind === 'bpm'
        ? 'BPM'
        : /^\d{4}$/.test(displayName)
          ? 'Year'
          : /^\d{2,3}$/.test(displayName) &&
              Number(displayName) >= 20 &&
              Number(displayName) <= 400
            ? 'BPM'
            : 'Tag';
  const tipTotal = stats?.globalTagAggregate ?? 0;
  const mosaicCovers = media.slice(0, 4).map((item, index) => ({
    id: item._id || `${item.title}-${index}`,
    src: podcastCover(item),
    title: item.title,
  }));

  // Hide the tag you're already viewing from each card's tag chips
  const queueItems = useMemo(
    () =>
      media.map((item) => ({
        ...item,
        tags: (item.tags || []).filter((t) => !tagsMatch(t, displayName)),
      })),
    [media, displayName]
  );

  const handleTimePeriodChange = (period: TimePeriod) => {
    setSelectedTimePeriod(period);
  };

  const renderPlaceRow = (label: string, places: TagPlaceChip[]) => {
    if (places.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 mb-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold mr-0.5">
          {label}
        </span>
        {places.map((place) => {
          const path = getPlaceProfilePath(place.placeId);
          if (!path) return null;
          return (
            <Link
              key={`${label}-${place.placeId}`}
              to={path}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-100 text-xs font-medium hover:bg-blue-500/25 hover:border-blue-400/50 transition-colors no-underline"
            >
              <MapPin className="h-3 w-3 text-blue-300" />
              {place.name}
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 pb-24 md:pb-8">
      <div className="container mx-auto px-2 md:px-4 py-4 md:py-8">
        {/* Tag Profile Header */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <button
              onClick={() => navigate(-1)}
              className="px-3 md:px-4 py-2 rounded-lg font-medium transition-colors bg-black/20 border-white/20 border border-gray-500 text-white hover:bg-gray-700/30 text-sm md:text-base"
            >
              Back
            </button>
          </div>

          <div className="card p-4 md:p-6 flex flex-col md:flex-row items-start relative">
            {/* Tag Visual - mosaic of top tipped covers, falls back to tag icon */}
            <div className="w-full md:w-auto flex justify-center md:justify-start mb-4 md:mb-0 md:mr-6">
              {mosaicCovers.length >= 4 ? (
                <div className="grid grid-cols-2 gap-1 w-40 h-40 sm:w-48 sm:h-48 rounded-lg overflow-hidden shadow-xl flex-shrink-0">
                  {mosaicCovers.map((cover) => (
                    <img
                      key={cover.id}
                      src={cover.src}
                      alt={cover.title}
                      className="w-full h-full object-cover"
                    />
                  ))}
                </div>
              ) : mosaicCovers.length > 0 ? (
                <div className="relative w-40 h-40 sm:w-48 sm:h-48 rounded-lg overflow-hidden shadow-xl flex-shrink-0">
                  <img
                    src={mosaicCovers[0].src}
                    alt={mosaicCovers[0].title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-purple-900/80 to-transparent flex items-end justify-center pb-3">
                    <Tag className="h-8 w-8 text-purple-200" />
                  </div>
                </div>
              ) : (
                <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-lg bg-purple-600/30 border border-purple-500/40 flex items-center justify-center shadow-xl flex-shrink-0">
                  <Tag className="h-16 w-16 text-purple-300" />
                </div>
              )}
            </div>

            {/* Tag Info */}
            <div className="flex-1 w-full text-white">
              <div className="text-xs uppercase tracking-wide text-purple-300 font-semibold mb-1 text-center md:text-left">
                {kindLabel}
              </div>
              <h1 className="text-2xl md:text-4xl font-bold mb-3 text-center md:text-left">
                {kindLabel === 'BPM' ? `${displayName} BPM` : displayName}
              </h1>

              {/* Stat chips */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/20 border border-white/10 text-sm text-gray-100 shadow-sm backdrop-blur-sm">
                  {isPodcast ? (
                    <Mic className="h-3.5 w-3.5 text-gray-400" />
                  ) : (
                    <Music className="h-3.5 w-3.5 text-gray-400" />
                  )}
                  <span className="font-semibold">
                    {loading
                      ? '…'
                      : isPodcast
                        ? `${total} ${total === 1 ? 'episode' : 'episodes'}`
                        : `${total} ${total === 1 ? 'track' : 'tracks'}`}
                  </span>
                </span>
                {!loading && tipTotal > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/20 border border-white/10 text-sm text-gray-100 shadow-sm backdrop-blur-sm">
                    <Coins className="h-3.5 w-3.5 text-gray-400" />
                    <span className="font-semibold">{penceToPounds(tipTotal)}</span>
                    <span className="text-gray-400">
                      {selectedTimePeriod === 'all-time'
                        ? 'total support'
                        : `${formatTimePeriodLabel(selectedTimePeriod).toLowerCase()} support`}
                    </span>
                  </span>
                )}
              </div>

              {/* Related tags */}
              {!loading && relatedTags.length > 0 && (
                <div className="flex flex-wrap justify-center md:justify-start gap-1.5 mb-3">
                  {relatedTags.map((related) => (
                    <Link
                      key={related.slug}
                      to={getTagProfilePath(related.name, isPodcast ? 'podcast' : 'music')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs font-medium hover:bg-purple-500/25 hover:border-purple-400/50 transition-colors no-underline"
                    >
                      <Tag className="h-3 w-3 text-purple-400" />
                      {related.name}
                    </Link>
                  ))}
                </div>
              )}

              {/* Top origin + support places */}
              {!loading && (topOriginPlaces.length > 0 || topSupportPlaces.length > 0) && (
                <div className="mb-3">
                  {renderPlaceRow('From', topOriginPlaces)}
                  {renderPlaceRow('Supported in', topSupportPlaces)}
                </div>
              )}

              {/* Champions strip — music tag tippers; hide on podcast-scoped pages */}
              {!loading && !error && slug && !isPodcast && (
                <div className="w-full max-w-lg flex justify-center md:justify-start">
                  <MediaChampions
                    tagSlug={slug}
                    entityLabel={
                      kindLabel === 'BPM'
                        ? `${displayName} BPM`
                        : kindLabel === 'Year'
                          ? displayName
                          : `#${displayName}`
                    }
                    variant="strip"
                    compact
                    maxDisplay={10}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top Tunes */}
        <div className="mb-8 px-2 md:px-0">
          <div className="mb-3 md:mb-4 flex flex-wrap justify-center sm:justify-end">
            <button
              type="button"
              onClick={() => setShowTimeFilter((open) => !open)}
              className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
                showTimeFilter || selectedTimePeriod !== 'all-time'
                  ? 'bg-gray-700 ring-1 ring-purple-500/50'
                  : 'bg-gray-800'
              }`}
            >
              <Clock className="h-4 w-4 text-purple-400 flex-shrink-0" />
              Time
              <span className="text-xs text-purple-300 font-normal">
                ({formatTimePeriodLabel(selectedTimePeriod)})
              </span>
            </button>
          </div>

          {showTimeFilter && (
            <div className="card p-3 md:p-6 mb-3 md:mb-4 max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Clock className="h-4 w-4 mr-2 text-purple-400" />
                  Sort by Time
                </h3>
                <button
                  type="button"
                  onClick={() => setShowTimeFilter(false)}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Hide
                </button>
              </div>
              <div className="flex flex-row flex-nowrap gap-1 sm:gap-2 justify-center items-center max-w-full overflow-hidden">
                {TIME_PERIOD_OPTIONS.map((period) => (
                  <button
                    key={period.key}
                    type="button"
                    onClick={() => handleTimePeriodChange(period.key)}
                    className={`flex-1 min-w-0 px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-md font-medium transition-colors text-xs sm:text-sm truncate ${
                      selectedTimePeriod === period.key
                        ? 'bg-purple-700 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const heading = (
              <h2 className="text-xl md:text-2xl font-bold text-white flex items-center">
                {isPodcast ? (
                  <Mic className="h-5 w-5 md:h-6 md:w-6 mr-2 text-purple-400" />
                ) : (
                  <Music className="h-5 w-5 md:h-6 md:w-6 mr-2 text-purple-400" />
                )}
                {isPodcast ? 'Top Podcasts' : 'Top Tunes'}
              </h2>
            );

            if (!loading && !error && media.length > 0) {
              if (isPodcast) {
                return (
                  <>
                    <div className="mb-3 md:mb-4">{heading}</div>
                    <div className="space-y-3">
                      {episodes.map((episode, index) => {
                        const epId = episode._id || episode.id;
                        return (
                          <PodcastQueueMediaCard
                            key={`${epId || episode.title}-${index}`}
                            episode={episode}
                            index={index}
                            hideTag={displayName}
                            isBidding={isPlacingTip && (tipTarget?._id || tipTarget?.id) === epId}
                            isPlayLoading={!!fetchingPlayId && fetchingPlayId === epId}
                            canPlay={Boolean(epId)}
                            episodePath={epId ? `/podcasts/${epId}` : undefined}
                            onEpisodeClick={(ep) => {
                              const id = ep._id || ep.id;
                              if (id) navigate(`/podcasts/${id}`);
                            }}
                            onSeriesClick={(ep, e) => {
                              e.stopPropagation();
                              const seriesId = ep.podcastSeries?._id;
                              if (seriesId) navigate(`/podcast/${seriesId}`);
                            }}
                            onPlay={handlePodcastPlay}
                            onTip={(ep, e) => {
                              e.stopPropagation();
                              if (!user) {
                                toast.info('Please log in to tip podcast episodes');
                                navigate('/login');
                                return;
                              }
                              setTipTarget(ep);
                            }}
                          />
                        );
                      })}
                    </div>
                  </>
                );
              }
              return (
                <TippedMediaQueueList
                  items={queueItems}
                  header={heading}
                  defaultTipTags={[displayName]}
                  onTipPlaced={() => loadProfile({ silent: true })}
                />
              );
            }

            return (
              <>
                <div className="mb-3 md:mb-4">{heading}</div>
                <div className="card bg-black/20 rounded-lg p-4 md:p-6">
                  {loading ? (
                    <div className="flex items-center justify-center py-16 text-gray-300">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      {isPodcast ? 'Loading podcasts…' : 'Loading tracks…'}
                    </div>
                  ) : error ? (
                    <div className="text-center py-12 text-red-300">{error}</div>
                  ) : (
                    <div className="text-center py-12 text-gray-400">
                      {isPodcast ? (
                        <Mic className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      ) : (
                        <Music className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      )}
                      {selectedTimePeriod === 'all-time' ? (
                        <>
                          {kindLabel === 'BPM' ? (
                            <>
                              No tracks at{' '}
                              <span className="text-white font-medium">{displayName} BPM</span> yet.
                            </>
                          ) : kindLabel === 'Year' ? (
                            <>
                              No tracks from{' '}
                              <span className="text-white font-medium">{displayName}</span> yet.
                            </>
                          ) : isPodcast ? (
                            <>
                              No podcasts tagged{' '}
                              <span className="text-white font-medium">{displayName}</span> yet.
                            </>
                          ) : (
                            <>
                              No tracks tagged{' '}
                              <span className="text-white font-medium">{displayName}</span> yet.
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          No tips for{' '}
                          <span className="text-white font-medium">
                            {kindLabel === 'BPM' ? `${displayName} BPM` : displayName}
                          </span>{' '}
                          in {formatTimePeriodLabel(selectedTimePeriod).toLowerCase()}.
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      <BidConfirmationModal
        isOpen={Boolean(tipTarget)}
        onClose={() => setTipTarget(null)}
        onConfirm={handlePodcastTip}
        bidAmount={defaultTip}
        minTip={0.01}
        avgTip={tipStats.avgTip}
        championAggregate={tipStats.championAggregate}
        viewerAggregate={tipStats.viewerAggregate}
        viewerIsChampion={tipStats.viewerIsChampion}
        mediaTitle={tipTarget?.title || ''}
        mediaArtist={
          tipTarget?.podcastSeries?.title || tipTarget?.podcastTitle || 'Podcast'
        }
        userBalance={user ? penceToPoundsNumber((user as { balance?: number }).balance) : 0}
        isLoading={isPlacingTip}
        user={user}
        initialTags={[displayName]}
      />
    </div>
  );
};

export default TagProfile;
