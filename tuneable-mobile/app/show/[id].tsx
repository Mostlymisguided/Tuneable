import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { PodcastEpisodeRow } from '@/src/components/PodcastEpisodeRow';
import { MiniSupportersBar } from '@/src/components/MiniSupportersBar';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { podcastsAPI } from '@/src/api/podcasts';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { formatPoundsFromPence } from '@/src/lib/format';
import { getPlaceProfileHref } from '@/src/lib/location';
import { getTagProfileHref } from '@/src/lib/tagNormalizer';
import { shareStoryCard } from '@/src/lib/shareStoryCard';
import {
  episodeId,
  isEpisodePlayable,
  seriesTitle,
  stripHtml,
} from '@/src/lib/podcast';
import { usePodcastPlayerStore } from '@/src/stores/podcastPlayerStore';
import { colors } from '@/src/theme/colors';
import type {
  MediaChampion,
  MediaLocationRanking,
  MediaTagRanking,
} from '@/src/types/media';
import {
  DEFAULT_PODCAST_COVER,
  PODCAST_SHOW_SORT_OPTIONS,
  type PodcastEpisode,
  type PodcastSeriesRef,
  type PodcastSeriesStats,
  type PodcastShowSortKey,
} from '@/src/types/podcast';

const ABOUT_PREVIEW_CHARS = 180;
const EPISODE_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
const MIN_SEARCH_LENGTH = 2;

function hostLabel(series: PodcastSeriesRef | null): string | null {
  const names = [
    ...(series?.host ?? []).map((h) => h.name),
    ...(series?.author ?? []).map((a) => a.name),
  ].filter(Boolean) as string[];
  if (!names.length) return null;
  return [...new Set(names)].join(', ');
}

export default function PodcastShowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [series, setSeries] = useState<PodcastSeriesRef | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [stats, setStats] = useState<PodcastSeriesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAboutMore, setShowAboutMore] = useState(false);
  const [tipTarget, setTipTarget] = useState<PodcastEpisode | null>(null);
  const [sortBy, setSortBy] = useState<PodcastShowSortKey>('mostTipped');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const episodeRequestSeq = useRef(0);
  const [tagRankings, setTagRankings] = useState<MediaTagRanking[]>([]);
  const [locationRankings, setLocationRankings] = useState<MediaLocationRanking[]>(
    []
  );
  const [champions, setChampions] = useState<MediaChampion[]>([]);
  const [sharing, setSharing] = useState(false);
  const setQueueAndPlay = usePodcastPlayerStore((s) => s.setQueueAndPlay);

  useEffect(() => {
    const trimmed = searchInput.trim();
    const handle = setTimeout(
      () => {
        setSearchQuery(trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : '');
      },
      trimmed ? SEARCH_DEBOUNCE_MS : 0
    );
    return () => clearTimeout(handle);
  }, [searchInput]);

  const loadMeta = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (!isRefresh) setLoading(true);
      setError(null);
      try {
        const [info, tagRes, locationRes, champRes] = await Promise.all([
          podcastsAPI.getSeriesInfo(id),
          mediaAPI
            .getTagRankings(id)
            .catch(() => ({ tagRankings: [] as MediaTagRanking[] })),
          mediaAPI
            .getLocationRankings(id, 3)
            .catch(() => ({ locationRankings: [] as MediaLocationRanking[] })),
          mediaAPI
            .getChampions(id, { limit: 3 })
            .catch(() => ({ champions: [] as MediaChampion[], rankings: [] as MediaChampion[] })),
        ]);
        setSeries(info.series ?? null);
        setStats(info.stats ?? null);
        setTagRankings(tagRes.tagRankings ?? []);
        setLocationRankings(locationRes.locationRankings ?? []);
        setChampions(
          champRes.champions?.length
            ? champRes.champions
            : (champRes.rankings ?? []).slice(0, 3)
        );
      } catch (err) {
        setError(getApiErrorMessage(err, 'Failed to load show'));
        if (!isRefresh) {
          setSeries(null);
          setEpisodes([]);
          setTagRankings([]);
          setLocationRankings([]);
          setChampions([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  const loadEpisodes = useCallback(async () => {
    if (!id) return;
    const seq = ++episodeRequestSeq.current;
    setLoadingEpisodes(true);
    try {
      const params = {
        autoImport: false,
        limit: EPISODE_PAGE_SIZE,
        offset: 0,
        sortBy,
        q: searchQuery || undefined,
      };
      let data = await podcastsAPI.getSeries(id, params);
      // Only hit RSS/import when the catalog is empty, never while searching.
      if ((data.episodes?.length ?? 0) === 0 && !searchQuery) {
        data = await podcastsAPI.getSeries(id, {
          ...params,
          autoImport: true,
        });
      }
      if (seq !== episodeRequestSeq.current) return;
      if (data.series) setSeries(data.series);
      if (data.stats) setStats(data.stats);
      setEpisodes(data.episodes ?? []);
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      if (seq !== episodeRequestSeq.current) return;
      setError(getApiErrorMessage(err, 'Failed to load episodes'));
    } finally {
      if (seq === episodeRequestSeq.current) {
        setLoadingEpisodes(false);
      }
    }
  }, [id, sortBy, searchQuery]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        await Promise.all([loadMeta(isRefresh), loadEpisodes()]);
      } finally {
        if (isRefresh) setRefreshing(false);
      }
    },
    [loadMeta, loadEpisodes]
  );

  const loadMoreEpisodes = useCallback(async () => {
    if (!id || loadingMore || loadingEpisodes || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await podcastsAPI.getSeries(id, {
        autoImport: false,
        limit: EPISODE_PAGE_SIZE,
        offset: episodes.length,
        sortBy,
        q: searchQuery || undefined,
      });
      const incoming = data.episodes ?? [];
      setEpisodes((prev) => {
        const seen = new Set(prev.map((ep) => episodeId(ep)));
        return [...prev, ...incoming.filter((ep) => !seen.has(episodeId(ep)))];
      });
      setHasMore(Boolean(data.hasMore));
      if (data.stats) setStats(data.stats);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [
    id,
    loadingMore,
    loadingEpisodes,
    hasMore,
    episodes.length,
    sortBy,
    searchQuery,
  ]);

  useFocusEffect(
    useCallback(() => {
      void loadMeta();
    }, [loadMeta])
  );

  useEffect(() => {
    void loadEpisodes();
  }, [loadEpisodes]);

  const about = useMemo(
    () => stripHtml(series?.description),
    [series?.description]
  );
  const host = hostLabel(series);
  const playableCount = useMemo(
    () => episodes.filter(isEpisodePlayable).length,
    [episodes]
  );
  const tags = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of [...(series?.genres ?? []), ...(series?.tags ?? [])]) {
      const t = tag?.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out.slice(0, 8);
  }, [series?.genres, series?.tags]);
  const topTagRankings = useMemo(() => tagRankings.slice(0, 3), [tagRankings]);
  const topLocationRankings = useMemo(
    () => locationRankings.slice(0, 3),
    [locationRankings]
  );

  const onPlayItem = (episode: PodcastEpisode) => {
    const index = episodes.findIndex((e) => episodeId(e) === episodeId(episode));
    if (index < 0) return;
    void setQueueAndPlay(episodes, index);
  };

  const onConfirmTip = async (amountPounds: number, tagsToApply: string[]) => {
    if (!tipTarget) return;
    const tid = episodeId(tipTarget);
    if (!tid) throw new Error('Missing episode id');
    const res = await mediaAPI.placeGlobalBid(tid, amountPounds, {
      tags: tagsToApply,
    });
    const tipPence = Math.round(amountPounds * 100);
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    setEpisodes((prev) => {
      const next = prev.map((e) =>
        episodeId(e) === tid
          ? {
              ...e,
              globalMediaAggregate: (e.globalMediaAggregate ?? 0) + tipPence,
            }
          : e
      );
      if (sortBy === 'mostTipped') {
        next.sort(
          (a, b) =>
            (b.globalMediaAggregate ?? 0) - (a.globalMediaAggregate ?? 0)
        );
      }
      return next;
    });
    return res;
  };

  const onShare = async () => {
    if (!series || !id) return;
    const url = `https://tuneable.stream/podcast/${id}`;
    setSharing(true);
    try {
      await shareStoryCard({
        mediaId: id,
        title: series.title || 'Podcast',
        artist: hostLabel(series) || undefined,
        url,
      });
    } catch {
      try {
        await Share.share({
          message: `${series.title || 'Podcast'}\n${url}`,
          url,
        });
      } catch {
        // dismissed
      }
    } finally {
      setSharing(false);
    }
  };

  const truncatedAbout =
    about.length > ABOUT_PREVIEW_CHARS && !showAboutMore
      ? `${about.slice(0, ABOUT_PREVIEW_CHARS).trim()}…`
      : about;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
      </View>

      {loading && !series ? (
        <ActivityIndicator
          color={colors.accentLight}
          style={{ marginTop: 48 }}
        />
      ) : error && !series ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : series ? (
        <FlatList
          data={episodes}
          keyExtractor={(item, index) => episodeId(item) || String(index)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: Math.max(24, contentPaddingBottom) },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accentLight}
            />
          }
          ListHeaderComponent={
            <View style={styles.hero}>
              <Image
                source={{ uri: series.coverArt || DEFAULT_PODCAST_COVER }}
                style={styles.cover}
              />
              <Text style={styles.title}>{series.title || 'Podcast'}</Text>
              {host ? <Text style={styles.host}>{host}</Text> : null}

              {topTagRankings.length > 0 || topLocationRankings.length > 0 ? (
                <View style={styles.rankingBlock}>
                  {topTagRankings.length > 0 ? (
                    <View style={styles.rankingRow}>
                      {topTagRankings.map((ranking) => (
                        <Pressable
                          key={`tag-${ranking.tag}-${ranking.rank}`}
                          onPress={() =>
                            router.push(
                              getTagProfileHref(ranking.tag, 'podcast') as Href
                            )
                          }
                          style={styles.tagRankChip}>
                          <Ionicons name="pricetag" size={12} color="#c084fc" />
                          <Text style={styles.tagRankText}>
                            #{ranking.rank} {ranking.tag}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {topLocationRankings.length > 0 ? (
                    <View style={styles.rankingRow}>
                      {topLocationRankings.map((ranking) => {
                        const href = getPlaceProfileHref(ranking.placeId);
                        if (!href) {
                          return (
                            <View
                              key={`loc-${ranking.placeId}`}
                              style={styles.locationRankChip}>
                              <Ionicons name="location" size={12} color="#38bdf8" />
                              <Text style={styles.locationRankText}>
                                #{ranking.rank} {ranking.name}
                              </Text>
                            </View>
                          );
                        }
                        return (
                          <Pressable
                            key={`loc-${ranking.placeId}`}
                            onPress={() => router.push(href as Href)}
                            style={styles.locationRankChip}>
                            <Ionicons name="location" size={12} color="#38bdf8" />
                            <Text style={styles.locationRankText}>
                              #{ranking.rank} {ranking.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : tags.length > 0 ? (
                <View style={styles.rankingBlock}>
                  <View style={styles.rankingRow}>
                    {tags.map((tag) => (
                      <Pressable
                        key={tag}
                        onPress={() =>
                          router.push(getTagProfileHref(tag, 'podcast') as Href)
                        }
                        style={styles.tagRankChip}>
                        <Ionicons name="pricetag" size={12} color="#c084fc" />
                        <Text style={styles.tagRankText}>{tag}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.statRow}>
                {typeof stats?.totalEpisodes === 'number' ? (
                  <View style={styles.statChip}>
                    <Ionicons
                      name="list-outline"
                      size={14}
                      color={colors.textMuted}
                    />
                    <Text style={styles.statChipText}>
                      {stats.totalEpisodes} episode
                      {stats.totalEpisodes === 1 ? '' : 's'}
                    </Text>
                  </View>
                ) : null}
                {typeof stats?.totalTips === 'number' ? (
                  <View style={styles.statChip}>
                    <Ionicons
                      name="heart-outline"
                      size={14}
                      color={colors.textMuted}
                    />
                    <Text style={styles.statChipText}>
                      {formatPoundsFromPence(stats.totalTips)} tipped
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.actions}>
                {playableCount > 0 ? (
                  <Pressable
                    style={styles.playBtn}
                    onPress={() => {
                      const first = episodes.findIndex(isEpisodePlayable);
                      if (first >= 0) void setQueueAndPlay(episodes, first);
                    }}>
                    <Ionicons name="play" size={16} color="#fff" />
                    <Text style={styles.playBtnText}>Play</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.shareBtn, sharing && { opacity: 0.6 }]}
                  onPress={() => void onShare()}
                  disabled={sharing}>
                  {sharing ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Ionicons name="share-outline" size={16} color={colors.text} />
                  )}
                  <Text style={styles.shareBtnText}>{sharing ? 'Preparing…' : 'Share'}</Text>
                </Pressable>
              </View>

              {champions.length > 0 ? (
                <View style={styles.supportersWrap}>
                  <MiniSupportersBar
                    champions={champions}
                    maxVisible={5}
                    variant="chips"
                  />
                </View>
              ) : null}

              {about ? (
                <Pressable
                  onPress={() => setShowAboutMore((open) => !open)}
                  disabled={about.length <= ABOUT_PREVIEW_CHARS}>
                  <Text style={styles.about}>{truncatedAbout}</Text>
                  {about.length > ABOUT_PREVIEW_CHARS ? (
                    <Text style={styles.aboutMore}>
                      {showAboutMore ? 'Show less' : 'Show more'}
                    </Text>
                  ) : null}
                </Pressable>
              ) : null}

              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Episodes</Text>
                {loadingEpisodes && episodes.length > 0 ? (
                  <ActivityIndicator color={colors.accentLight} />
                ) : null}
              </View>
              <View style={styles.searchField}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={searchInput}
                  onChangeText={setSearchInput}
                  placeholder="Search episodes in this show"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  accessibilityLabel="Search episodes in this show"
                />
                {searchInput.length > 0 ? (
                  <Pressable
                    onPress={() => setSearchInput('')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear episode search">
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>
                ) : null}
              </View>
              {searchQuery && (loadingEpisodes || episodes.length > 0) ? (
                <Text style={styles.searchMeta}>
                  {loadingEpisodes && episodes.length === 0
                    ? 'Searching…'
                    : `${episodes.length}${hasMore ? '+' : ''} matching episode${
                        episodes.length === 1 ? '' : 's'
                      }`}
                </Text>
              ) : null}
              <View style={styles.sortRow}>
                {PODCAST_SHOW_SORT_OPTIONS.map((option) => {
                  const active = sortBy === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setSortBy(option.key)}
                      style={[styles.sortChip, active && styles.sortChipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Sort episodes by ${option.label}`}>
                      <Text
                        style={[
                          styles.sortChipText,
                          active && styles.sortChipTextActive,
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {loadingEpisodes && episodes.length === 0 ? (
                <ActivityIndicator
                  color={colors.accentLight}
                  style={{ marginVertical: 24 }}
                />
              ) : null}
              {error ? <Text style={styles.inlineError}>{error}</Text> : null}
            </View>
          }
          ListEmptyComponent={
            !loadingEpisodes ? (
              <Text style={styles.empty}>
                {searchQuery
                  ? `No episodes in this show match “${searchQuery}”.`
                  : 'No episodes in this show yet.'}
              </Text>
            ) : null
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!loadingEpisodes) void loadMoreEpisodes();
          }}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={colors.accentLight}
                style={{ marginVertical: 16 }}
              />
            ) : null
          }
          renderItem={({ item, index }) => (
            <PodcastEpisodeRow
              rank={index + 1}
              episode={item}
              fallbackCoverArt={series.coverArt}
              tipPence={item.globalMediaAggregate ?? 0}
              onPlay={() => onPlayItem(item)}
              onTip={() => setTipTarget(item)}
              onOpenProfile={() => {
                const tid = episodeId(item);
                if (tid) router.push(`/podcast/${tid}`);
              }}
            />
          )}
        />
      ) : null}

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Episode'}
        subtitle={tipTarget ? seriesTitle(tipTarget) : series?.title}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 1.11}
        tipMedia={tipTarget}
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
  list: {
    paddingHorizontal: 16,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 12,
  },
  cover: {
    width: 180,
    height: 180,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  host: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  rankingBlock: {
    width: '100%',
    marginTop: 12,
    gap: 6,
  },
  rankingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  tagRankChip: {
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
  tagRankText: {
    color: '#e9d5ff',
    fontSize: 12,
    fontWeight: '600',
  },
  locationRankChip: {
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
  locationRankText: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: '600',
  },
  supportersWrap: {
    width: '100%',
    marginTop: 12,
    alignItems: 'center',
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  playBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  shareBtnText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 15,
  },
  about: {
    marginTop: 16,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  aboutMore: {
    marginTop: 6,
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionTitleRow: {
    alignSelf: 'stretch',
    marginTop: 22,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  searchField: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },
  searchMeta: {
    alignSelf: 'stretch',
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 10,
  },
  sortRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sortChipActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.28)',
    borderColor: 'rgba(168, 85, 247, 0.55)',
  },
  sortChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: colors.text,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 16,
    marginBottom: 24,
  },
  centered: {
    paddingHorizontal: 24,
    marginTop: 48,
    alignItems: 'center',
  },
  error: {
    color: '#fca5a5',
    textAlign: 'center',
    marginBottom: 16,
  },
  inlineError: {
    color: '#fca5a5',
    textAlign: 'center',
    marginTop: 8,
  },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
