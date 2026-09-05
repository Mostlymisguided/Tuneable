import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { tagAPI, type TagPlaceChip } from '@/src/api/tags';
import { mediaAPI } from '@/src/api/media';
import { podcastsAPI } from '@/src/api/podcasts';
import { ChartTrackRow } from '@/src/components/ChartTrackRow';
import { PodcastEpisodeRow } from '@/src/components/PodcastEpisodeRow';
import { Screen } from '@/src/components/Screen';
import { TipSheet } from '@/src/components/TipSheet';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence } from '@/src/lib/format';
import { getPlaceProfileHref } from '@/src/lib/location';
import { formatArtist, isUploadPlayable, mediaId } from '@/src/lib/media';
import {
  CHART_ADDED_SORT_HINT,
  CHART_PODCAST_SORT_HINT,
  CHART_SORT_OPTIONS,
  chartSortLabel,
  sortChartItems,
  type ChartSortKey,
} from '@/src/lib/chartSort';
import {
  episodeId,
  episodeMatchesTag,
  isEpisodePlayable,
  mediaToPodcastEpisode,
  relatedPodcastTags,
  seriesTitle,
} from '@/src/lib/podcast';
import { getTagProfileHref, tagsMatch } from '@/src/lib/tagNormalizer';
import { usePlayableOnly } from '@/src/hooks/usePlayableOnly';
import { buildChartRankMap, catalogHiddenLabel } from '@/src/lib/playableFilterPref';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { usePodcastPlayerStore } from '@/src/stores/podcastPlayerStore';
import { colors } from '@/src/theme/colors';
import {
  DEFAULT_COVER_ART,
  TIME_PERIODS,
  type ChartMediaItem,
  type TimePeriodKey,
} from '@/src/types/media';
import type { PodcastTimeRangeKey } from '@/src/types/podcast';

function PlaceRow({
  label,
  places,
}: {
  label: string;
  places: TagPlaceChip[];
}) {
  if (places.length === 0) return null;
  return (
    <View style={styles.placeRow}>
      <Text style={styles.placeLabel}>{label}</Text>
      {places.map((place) => {
        const href = getPlaceProfileHref(place.placeId);
        if (!href) return null;
        return (
          <Pressable
            key={`${label}-${place.placeId}`}
            onPress={() => router.push(href as Href)}
            style={styles.placeChip}>
            <Ionicons name="location" size={12} color="#38bdf8" />
            <Text style={styles.placeChipText}>{place.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatTimePeriodLabel(period: TimePeriodKey): string {
  return TIME_PERIODS.find((p) => p.key === period)?.label ?? period;
}

function toPodcastChartTimeRange(period: TimePeriodKey): PodcastTimeRangeKey {
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

export default function TagProfileScreen() {
  const { slug: slugParam, type: typeParam } = useLocalSearchParams<{
    slug: string;
    type?: string | string[];
  }>();
  const slug = typeof slugParam === 'string' ? decodeURIComponent(slugParam) : '';
  const contentScope =
    (Array.isArray(typeParam) ? typeParam[0] : typeParam) === 'podcast'
      ? 'podcast'
      : 'music';
  const isPodcast = contentScope === 'podcast';
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);
  const setPodcastQueueAndPlay = usePodcastPlayerStore((s) => s.setQueueAndPlay);
  const { playableOnly, setPlayableOnly } = usePlayableOnly('chart');

  const [tagName, setTagName] = useState(slug.replace(/-/g, ' '));
  const [tagKind, setTagKind] = useState<'tag' | 'year' | 'bpm'>('tag');
  const [tipTotal, setTipTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [relatedTags, setRelatedTags] = useState<Array<{ name: string; slug: string }>>(
    []
  );
  const [topOriginPlaces, setTopOriginPlaces] = useState<TagPlaceChip[]>([]);
  const [topSupportPlaces, setTopSupportPlaces] = useState<TagPlaceChip[]>([]);
  const [media, setMedia] = useState<ChartMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<ChartMediaItem | null>(null);
  const [period, setPeriod] = useState<TimePeriodKey>('all-time');
  const [chartSort, setChartSort] = useState<ChartSortKey>('most-tipped');
  const [showTimePanel, setShowTimePanel] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!slug) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await tagAPI.getProfile(slug, {
          limit: 50,
          timePeriod: period,
          type: contentScope,
          sortBy: chartSort,
        }).catch((err) => {
          if (!isPodcast) throw err;
          return null;
        });
        const name = data?.tag?.name || slug.replace(/-/g, ' ');
        setTagName(name);
        setTagKind(
          data?.tag?.kind ||
            (/^\d{4}$/.test(name)
              ? 'year'
              : /^\d{2,3}$/.test(name) && Number(name) >= 20 && Number(name) <= 400
                ? 'bpm'
                : 'tag')
        );

        const profileMedia = data?.media || [];
        const profileIsPodcastScoped =
          data?.contentScope === 'podcast' && profileMedia.length > 0;

        if (isPodcast && !profileIsPodcastScoped) {
          const chart = await podcastsAPI.getChart({
            limit: 200,
            timeRange: toPodcastChartTimeRange(period),
          });
          const matched = (chart.episodes || []).filter((episode) =>
            episodeMatchesTag(episode, name)
          );
          setMedia(matched as ChartMediaItem[]);
          setTotal(matched.length);
          setTipTotal(
            matched.reduce(
              (sum, episode) => sum + (episode.globalMediaAggregate || 0),
              0
            )
          );
          setRelatedTags(relatedPodcastTags(matched, name));
          setTopOriginPlaces([]);
          setTopSupportPlaces([]);
        } else {
          setTipTotal(data?.stats?.globalTagAggregate ?? 0);
          setTotal(data?.pagination?.total ?? profileMedia.length);
          setRelatedTags(data?.relatedTags || []);
          setTopOriginPlaces(data?.topOriginPlaces || []);
          setTopSupportPlaces(data?.topSupportPlaces || []);
          setMedia(profileMedia);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Tag not found or failed to load.');
        if (!isRefresh) {
          setMedia([]);
          setRelatedTags([]);
          setTopOriginPlaces([]);
          setTopSupportPlaces([]);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [slug, period, contentScope, chartSort, isPodcast]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const sortedMedia = useMemo(
    () =>
      sortChartItems(media, chartSort, {
        getDate: (item) =>
          isPodcast
            ? item.releaseDate || item.createdAt
            : item.createdAt || item.queuedAt,
      }),
    [media, chartSort, isPodcast]
  );

  const chartRanks = useMemo(
    () => buildChartRankMap(sortedMedia, mediaId),
    [sortedMedia]
  );

  const displayedMedia = useMemo(
    () =>
      !isPodcast && playableOnly
        ? sortedMedia.filter(isUploadPlayable)
        : sortedMedia,
    [isPodcast, playableOnly, sortedMedia]
  );

  const hiddenPlayableCount = sortedMedia.length - displayedMedia.length;

  const mosaicCovers = useMemo(
    () =>
      media.slice(0, 4).map((item, index) => {
        const seriesCover =
          item.podcastSeries && typeof item.podcastSeries === 'object'
            ? item.podcastSeries.coverArt
            : undefined;
        return {
          id: mediaId(item) || `${item.title || 'cover'}-${index}`,
          uri: item.coverArt || seriesCover || DEFAULT_COVER_ART,
        };
      }),
    [media]
  );

  const episodes = useMemo(
    () => sortedMedia.map((item) => mediaToPodcastEpisode(item)),
    [sortedMedia]
  );

  const playableCount = useMemo(
    () =>
      isPodcast
        ? episodes.filter(isEpisodePlayable).length
        : displayedMedia.filter(isUploadPlayable).length,
    [isPodcast, episodes, displayedMedia]
  );

  const onPlayItem = (item: ChartMediaItem) => {
    const playable = displayedMedia.filter(isUploadPlayable);
    const index = playable.findIndex((m) => mediaId(m) === mediaId(item));
    if (index < 0) {
      const fallback = displayedMedia.findIndex((m) => mediaId(m) === mediaId(item));
      void setQueueAndPlay(displayedMedia, Math.max(0, fallback));
      return;
    }
    void setQueueAndPlay(playable, index);
  };

  const onPlayEpisode = (episode: ReturnType<typeof mediaToPodcastEpisode>) => {
    const playable = episodes.filter(isEpisodePlayable);
    const playableIndex = playable.findIndex(
      (e) => episodeId(e) === episodeId(episode)
    );
    if (playableIndex >= 0) {
      void setPodcastQueueAndPlay(playable, playableIndex);
      return;
    }
    const fallback = episodes.findIndex((e) => episodeId(e) === episodeId(episode));
    if (fallback >= 0) void setPodcastQueueAndPlay(episodes, fallback);
  };

  const onPlayQueue = () => {
    if (isPodcast) {
      void setPodcastQueueAndPlay(episodes, 0);
      return;
    }
    void setQueueAndPlay(displayedMedia, 0);
  };

  const onConfirmTip = async (amountPounds: number, tags: string[]) => {
    if (!tipTarget) return;
    const id = mediaId(tipTarget);
    if (!id) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds, { tags });
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    void load(true);
    return res;
  };

  const listHeader = (
    <View style={styles.hero}>
      <View style={styles.mosaicWrap}>
        {mosaicCovers.length >= 4 ? (
          <View style={styles.mosaicGrid}>
            {mosaicCovers.map((cover) => (
              <Image key={cover.id} source={{ uri: cover.uri }} style={styles.mosaicTile} />
            ))}
          </View>
        ) : mosaicCovers.length > 0 ? (
          <Image source={{ uri: mosaicCovers[0].uri }} style={styles.mosaicSingle} />
        ) : (
          <View style={[styles.mosaicSingle, styles.mosaicFallback]}>
            <Ionicons name="pricetag" size={42} color="#c084fc" />
          </View>
        )}
      </View>

      <Text style={styles.eyebrow}>
        {tagKind === 'year' ? 'Year' : tagKind === 'bpm' ? 'BPM' : 'Tag'}
      </Text>
      <Text style={styles.title}>
        {tagKind === 'bpm' ? `${tagName} BPM` : tagName}
      </Text>

      <View style={styles.statChips}>
        <View style={styles.statChip}>
          <Ionicons
            name={isPodcast ? 'mic-outline' : 'musical-notes-outline'}
            size={14}
            color={colors.textMuted}
          />
          <Text style={styles.statChipText}>
            {loading
              ? '…'
              : isPodcast
                ? `${total} ${total === 1 ? 'episode' : 'episodes'}`
                : `${total} ${total === 1 ? 'track' : 'tracks'}`}
          </Text>
        </View>
        {!loading && tipTotal > 0 ? (
          <View style={styles.statChip}>
            <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
            <Text style={styles.statChipText}>{formatPoundsFromPence(tipTotal)}</Text>
            <Text style={styles.statChipMuted}>
              {period === 'all-time'
                ? 'total support'
                : `${formatTimePeriodLabel(period).toLowerCase()} support`}
            </Text>
          </View>
        ) : null}
      </View>

      {!loading && relatedTags.length > 0 ? (
        <View style={styles.chipRow}>
          {relatedTags.map((related) => (
            <Pressable
              key={related.slug}
              onPress={() =>
                router.push(getTagProfileHref(related.name, contentScope) as Href)
              }
              style={styles.tagChip}>
              <Ionicons name="pricetag" size={12} color="#c084fc" />
              <Text style={styles.tagChipText}>{related.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!loading && (topOriginPlaces.length > 0 || topSupportPlaces.length > 0) ? (
        <View style={styles.placesBlock}>
          <PlaceRow label="From" places={topOriginPlaces} />
          <PlaceRow label="Supported in" places={topSupportPlaces} />
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{isPodcast ? 'Top Podcasts' : 'Top Tunes'}</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              setShowSortPanel(false);
              setShowTimePanel((open) => !open);
            }}
            style={[
              styles.timeTrigger,
              (showTimePanel || period !== 'all-time') && styles.timeTriggerActive,
            ]}>
            <Ionicons name="time-outline" size={14} color={colors.accentLight} />
            <Text style={styles.timeTriggerLabel}>Time</Text>
            <Text style={styles.timeTriggerDetail} numberOfLines={1}>
              ({formatTimePeriodLabel(period)})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setShowTimePanel(false);
              setShowSortPanel((open) => !open);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${chartSortLabel(chartSort)}`}
            style={[
              styles.timeTrigger,
              styles.sortTrigger,
              (showSortPanel || chartSort !== 'most-tipped') && styles.timeTriggerActive,
            ]}>
            <Ionicons name="swap-vertical-outline" size={14} color={colors.accentLight} />
          </Pressable>
          {!isPodcast ? (
            <Pressable
              onPress={() => setPlayableOnly(!playableOnly)}
              accessibilityRole="button"
              accessibilityLabel={
                playableOnly ? 'Playable only, on' : 'Playable only, off'
              }
              style={[
                styles.timeTrigger,
                playableOnly && styles.timeTriggerActive,
              ]}>
              <Ionicons name="headset-outline" size={14} color={colors.accentLight} />
              <Text style={styles.timeTriggerLabel}>Playable</Text>
              <Text style={styles.timeTriggerDetail} numberOfLines={1}>
                {playableOnly
                  ? hiddenPlayableCount > 0
                    ? `(−${hiddenPlayableCount})`
                    : ''
                  : '(All)'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!isPodcast && playableOnly && hiddenPlayableCount > 0 ? (
        <Pressable onPress={() => setPlayableOnly(false)} style={styles.hiddenHintBtn}>
          <Text style={styles.hiddenHint}>
            Showing playable only · {catalogHiddenLabel(hiddenPlayableCount)}
          </Text>
        </Pressable>
      ) : null}

      {showTimePanel ? (
        <View style={styles.timePanel}>
          <View style={styles.timePanelHeader}>
            <Text style={styles.timePanelTitle}>Time Period</Text>
            <Pressable onPress={() => setShowTimePanel(false)} hitSlop={8}>
              <Text style={styles.timePanelHide}>Hide</Text>
            </Pressable>
          </View>
          <View style={styles.timeChips}>
            {TIME_PERIODS.map((p) => {
              const active = period === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setPeriod(p.key)}
                  style={[styles.timeChip, active && styles.timeChipActive]}>
                  <Text
                    style={[styles.timeChipText, active && styles.timeChipTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {showSortPanel ? (
        <View style={styles.timePanel}>
          <View style={styles.timePanelHeader}>
            <Text style={styles.timePanelTitle}>Sort</Text>
            <Pressable onPress={() => setShowSortPanel(false)} hitSlop={8}>
              <Text style={styles.timePanelHide}>Hide</Text>
            </Pressable>
          </View>
          <View style={styles.timeChips}>
            {CHART_SORT_OPTIONS.map((option) => {
              const active = chartSort === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setChartSort(option.key)}
                  style={[styles.timeChip, active && styles.timeChipActive]}>
                  <Text
                    style={[styles.timeChipText, active && styles.timeChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.sortHint}>
            {isPodcast ? CHART_PODCAST_SORT_HINT : CHART_ADDED_SORT_HINT}
          </Text>
        </View>
      ) : null}

      {playableCount > 0 ? (
        <Pressable
          style={styles.playBtn}
          onPress={onPlayQueue}
          accessibilityRole="button"
          accessibilityLabel={`Play ${playableCount} ${
            isPodcast ? 'episode' : 'upload'
          }${playableCount !== 1 ? 's' : ''}`}>
          <Ionicons name="play" size={22} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <Screen padForPlayer={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
      </View>

      {loading && media.length === 0 && !error ? (
        <ActivityIndicator color={colors.accentLight} style={{ marginTop: 48 }} />
      ) : error && media.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={isPodcast ? sortedMedia : displayedMedia}
          keyExtractor={(item, index) => mediaId(item) || `tag-media-${index}`}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: Math.max(96, contentPaddingBottom + 24),
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accentLight}
            />
          }
          ListEmptyComponent={
            !loading ? (
              !isPodcast &&
              playableOnly &&
              sortedMedia.length > 0 &&
              displayedMedia.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.empty}>No playable audio here yet.</Text>
                  <Pressable
                    style={styles.showCatalogBtn}
                    onPress={() => setPlayableOnly(false)}>
                    <Text style={styles.showCatalogText}>
                      Show catalog ({hiddenPlayableCount})
                    </Text>
                  </Pressable>
                </View>
              ) : (
              <Text style={styles.empty}>
                {period === 'all-time' ? (
                  tagKind === 'bpm' ? (
                    <>
                      No tracks at <Text style={styles.emptyStrong}>{tagName} BPM</Text> yet.
                    </>
                  ) : tagKind === 'year' ? (
                    <>
                      No tracks from <Text style={styles.emptyStrong}>{tagName}</Text> yet.
                    </>
                  ) : isPodcast ? (
                    <>
                      No podcasts tagged <Text style={styles.emptyStrong}>{tagName}</Text> yet.
                    </>
                  ) : (
                    <>
                      No tracks tagged <Text style={styles.emptyStrong}>{tagName}</Text> yet.
                    </>
                  )
                ) : (
                  <>
                    No tips for{' '}
                    <Text style={styles.emptyStrong}>
                      {tagKind === 'bpm' ? `${tagName} BPM` : tagName}
                    </Text>{' '}
                    in {formatTimePeriodLabel(period).toLowerCase()}.
                  </>
                )}
              </Text>
              )
            ) : null
          }
          renderItem={({ item, index }) => {
            if (isPodcast) {
              const episode = episodes[index] ?? mediaToPodcastEpisode(item);
              return (
                <PodcastEpisodeRow
                  rank={index + 1}
                  episode={episode}
                  tipPence={item.timePeriodBidValue ?? item.globalMediaAggregate}
                  hideTag={tagName}
                  onPlay={() => onPlayEpisode(episode)}
                  onTip={() => setTipTarget(item)}
                  onOpenProfile={() => {
                    const id = mediaId(item);
                    if (id) router.push(`/podcast/${id}`);
                  }}
                />
              );
            }
            return (
              <ChartTrackRow
                rank={chartRanks.get(mediaId(item)) ?? index + 1}
                item={{
                  ...item,
                  tags: (item.tags || []).filter((t) => !tagsMatch(t, tagName)),
                }}
                tipPence={item.timePeriodBidValue ?? item.globalMediaAggregate}
                variant="rich"
                onOpen={() => {
                  const id = mediaId(item);
                  if (id) router.push(`/tune/${id}`);
                }}
                onPlay={() => onPlayItem(item)}
                onTip={() => setTipTarget(item)}
              />
            );
          }}
        />
      )}

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || (isPodcast ? 'Episode' : 'Untitled')}
        subtitle={
          tipTarget
            ? isPodcast
              ? seriesTitle(mediaToPodcastEpisode(tipTarget))
              : formatArtist(tipTarget.artist)
            : undefined
        }
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 1.11}
        tipMedia={tipTarget}
        initialTags={tagName ? [tagName] : undefined}
        onClose={() => setTipTarget(null)}
        onConfirm={onConfirmTip}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    marginBottom: 4,
  },
  back: { marginLeft: -2 },
  hero: {
    marginBottom: 8,
  },
  mosaicWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  mosaicGrid: {
    width: 168,
    height: 168,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  mosaicTile: {
    width: '50%',
    height: '50%',
    backgroundColor: colors.card,
  },
  mosaicSingle: {
    width: 168,
    height: 168,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  mosaicFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
  },
  eyebrow: {
    color: '#c084fc',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  statChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  statChipMuted: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagChipText: {
    color: '#e9d5ff',
    fontSize: 12,
    fontWeight: '600',
  },
  placesBlock: {
    gap: 6,
    marginBottom: 14,
  },
  placeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  placeLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginRight: 2,
  },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  placeChipText: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  sortTrigger: {
    paddingHorizontal: 8,
  },
  sortHint: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  timeTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  timeTriggerActive: {
    backgroundColor: 'rgba(55, 65, 81, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  timeTriggerLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  timeTriggerDetail: {
    color: '#c4b5fd',
    fontSize: 11,
  },
  timePanel: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  timePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  timePanelTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  timePanelHide: {
    color: colors.textMuted,
    fontSize: 13,
  },
  timeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  timeChipActive: {
    backgroundColor: '#7e22ce',
  },
  timeChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#fff',
  },
  playBtn: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  centered: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 48,
    gap: 12,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
  },
  emptyStrong: {
    color: colors.text,
    fontWeight: '700',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  hiddenHintBtn: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  hiddenHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  showCatalogBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  showCatalogText: {
    color: '#e9d5ff',
    fontWeight: '600',
    fontSize: 14,
  },
});
