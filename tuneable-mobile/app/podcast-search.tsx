import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { TipSheet } from '@/src/components/TipSheet';
import { podcastsAPI } from '@/src/api/podcasts';
import { mediaAPI } from '@/src/api/media';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { formatDuration, formatPoundsFromPence } from '@/src/lib/format';
import { episodeId, seriesTitle } from '@/src/lib/podcast';
import {
  buildEpisodeImportPayload,
  buildSeriesCreatePayload,
  importedEpisodeFromSearch,
  isExternalSearchEpisode,
  localSeriesId,
  markSearchEpisode,
  podcastSearchCover,
  podcastSearchDedupeKey,
  podcastSearchEpisodeId,
  podcastSearchSourceLabel,
} from '@/src/lib/podcastSearch';
import { colors } from '@/src/theme/colors';
import type { PodcastEpisode } from '@/src/types/podcast';

type FilterKey = 'all' | 'library' | 'catalog';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'library', label: 'Library' },
  { key: 'catalog', label: 'Catalog' },
];

function mergeUnique(
  existing: PodcastEpisode[],
  incoming: PodcastEpisode[]
): PodcastEpisode[] {
  const seen = new Set(existing.map(podcastSearchDedupeKey));
  const next = [...existing];
  for (const item of incoming) {
    const key = podcastSearchDedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

async function settled<T>(
  promise: Promise<T>
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

export default function PodcastSearchScreen() {
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const params = useLocalSearchParams<{ q?: string }>();
  const qParam = Array.isArray(params.q) ? params.q[0] : params.q;
  const [query, setQuery] = useState(qParam?.trim() ?? '');
  const queryRef = useRef(query);
  queryRef.current = query;
  const [results, setResults] = useState<PodcastEpisode[]>([]);
  const [hasSearched, setHasSearched] = useState(Boolean(qParam?.trim()));
  const [loading, setLoading] = useState(Boolean(qParam?.trim()));
  const [loadingMore, setLoadingMore] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<PodcastEpisode | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [hasMoreLocal, setHasMoreLocal] = useState(false);
  const [localOffset, setLocalOffset] = useState(0);
  const [hasMoreTaddy, setHasMoreTaddy] = useState(false);
  const [taddyPage, setTaddyPage] = useState(1);

  const defaultTip = useMemo(
    () => user?.preferences?.defaultTip ?? 1.11,
    [user?.preferences?.defaultTip]
  );

  const filteredResults = useMemo(() => {
    if (filter === 'library') {
      return results.filter((item) => !isExternalSearchEpisode(item));
    }
    if (filter === 'catalog') {
      return results.filter(isExternalSearchEpisode);
    }
    return results;
  }, [results, filter]);

  const libraryCount = useMemo(
    () => results.filter((item) => !isExternalSearchEpisode(item)).length,
    [results]
  );
  const catalogCount = results.length - libraryCount;

  const performSearch = useCallback(async (rawQuery?: string) => {
    const q = (rawQuery ?? queryRef.current).trim();
    if (q.length < 2) {
      setError('Enter at least 2 characters to search episodes.');
      return;
    }
    setHasSearched(true);
    setLoading(true);
    setError(null);
    setStatusNote(null);
    setResults([]);
    setFilter('all');
    setHasMoreLocal(false);
    setHasMoreTaddy(false);
    setLocalOffset(0);
    setTaddyPage(1);
    try {
      const [local, taddy, apple] = await Promise.all([
        settled(podcastsAPI.searchEpisodes(q, { limit: 50, offset: 0 })),
        settled(podcastsAPI.searchTaddyEpisodes(q, { max: 25, page: 1 })),
        settled(podcastsAPI.searchAppleEpisodes(q, { max: 50 })),
      ]);

      const items: PodcastEpisode[] = [];
      if (local.ok) {
        items.push(
          ...(local.value.episodes ?? []).map((ep) => markSearchEpisode(ep, 'local'))
        );
        setHasMoreLocal(Boolean(local.value.hasMore));
        setLocalOffset(50);
      }
      if (taddy.ok) {
        items.push(
          ...(taddy.value.episodes ?? []).map((ep) => markSearchEpisode(ep, 'taddy'))
        );
        setHasMoreTaddy(Boolean(taddy.value.hasMore));
        setTaddyPage(1);
      }
      if (apple.ok) {
        items.push(
          ...(apple.value.episodes ?? []).map((ep) => markSearchEpisode(ep, 'apple'))
        );
      }

      const merged = mergeUnique([], items);
      setResults(merged);

      const localHits = merged.filter((ep) => !isExternalSearchEpisode(ep)).length;
      const catalogHits = merged.length - localHits;
      if (merged.length > 0) {
        const parts = [];
        if (localHits) parts.push(`${localHits} in Tuneable`);
        if (catalogHits) parts.push(`${catalogHits} from catalogs`);
        setStatusNote(`Found ${parts.join(' · ')}`);
      } else if (!local.ok && !taddy.ok && !apple.ok) {
        setError('Search failed. Try again in a moment.');
      } else {
        setStatusNote(null);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Search failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = qParam?.trim();
    if (!q) return;
    setQuery(q);
    void performSearch(q);
  }, [qParam, performSearch]);

  const loadMore = async () => {
    const q = query.trim();
    if (!q || (!hasMoreLocal && !hasMoreTaddy)) return;
    setLoadingMore(true);
    setError(null);
    try {
      const fetches: Promise<PodcastEpisode[]>[] = [];
      if (hasMoreLocal) {
        fetches.push(
          podcastsAPI.searchEpisodes(q, { limit: 50, offset: localOffset }).then((res) => {
            setHasMoreLocal(Boolean(res.hasMore));
            setLocalOffset((prev) => prev + 50);
            return (res.episodes ?? []).map((ep) => markSearchEpisode(ep, 'local'));
          })
        );
      }
      if (hasMoreTaddy) {
        const nextPage = taddyPage + 1;
        fetches.push(
          podcastsAPI.searchTaddyEpisodes(q, { max: 25, page: nextPage }).then((res) => {
            setHasMoreTaddy(Boolean(res.hasMore));
            setTaddyPage(nextPage);
            return (res.episodes ?? []).map((ep) => markSearchEpisode(ep, 'taddy'));
          })
        );
      }
      const batches = await Promise.all(fetches.map((p) => settled(p)));
      const incoming = batches.flatMap((batch) => (batch.ok ? batch.value : []));
      setResults((prev) => mergeUnique(prev, incoming));
      setStatusNote((prev) =>
        incoming.length
          ? `${prev ? `${prev.split(' · loaded')[0]} · ` : ''}loaded ${incoming.length} more`
          : prev
      );
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load more'));
    } finally {
      setLoadingMore(false);
    }
  };

  const replaceResult = (original: PodcastEpisode, next: PodcastEpisode) => {
    setResults((prev) =>
      prev.map((ep) =>
        podcastSearchDedupeKey(ep) === podcastSearchDedupeKey(original)
          ? next
          : ep
      )
    );
  };

  const ensureLocalEpisode = async (item: PodcastEpisode): Promise<PodcastEpisode> => {
    if (!isExternalSearchEpisode(item) && episodeId(item)) return item;
    const payload = buildEpisodeImportPayload(item);
    const imported = await podcastsAPI.importSingleEpisode(payload);
    const mediaItem = importedEpisodeFromSearch(item, imported.episode);
    replaceResult(item, mediaItem);
    return mediaItem;
  };

  const openEpisode = async (item: PodcastEpisode) => {
    const key = `${podcastSearchEpisodeId(item)}:episode`;
    setOpeningKey(key);
    setError(null);
    try {
      const mediaItem = await ensureLocalEpisode(item);
      const id = episodeId(mediaItem);
      if (!id) throw new Error('Could not open this episode.');
      router.push(`/podcast/${id}`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not open episode'));
    } finally {
      setOpeningKey(null);
    }
  };

  const openShow = async (item: PodcastEpisode) => {
    const key = `${podcastSearchEpisodeId(item)}:show`;
    setOpeningKey(key);
    setError(null);
    try {
      const existing = localSeriesId(item);
      if (existing) {
        router.push(`/show/${existing}`);
        return;
      }
      const seriesData = buildSeriesCreatePayload(item);
      const res = await podcastsAPI.createOrFindSeries(seriesData);
      const id = res.series?._id;
      if (!id) throw new Error('Could not open this show.');
      replaceResult(item, {
        ...item,
        podcastSeries: {
          ...(typeof item.podcastSeries === 'object' ? item.podcastSeries : {}),
          _id: id,
          title: res.series.title || seriesTitle(item),
          coverArt: res.series.coverArt || item.podcastImage || item.coverArt,
        },
        podcastTitle: res.series.title || item.podcastTitle,
      });
      router.push(`/show/${id}`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not open show'));
    } finally {
      setOpeningKey(null);
    }
  };

  const addAndTip = async (amountPounds: number, tags: string[]) => {
    const item = tipTarget;
    if (!item) return;

    const searchId = podcastSearchEpisodeId(item);
    setAddingId(searchId);
    setError(null);
    try {
      const mediaItem = await ensureLocalEpisode(item);
      setTipTarget(mediaItem);

      const id = episodeId(mediaItem);
      if (!id) {
        throw new Error('Could not resolve this episode after import.');
      }

      const mergedTags = Array.from(
        new Set([...(mediaItem.tags || []), ...tags].filter(Boolean))
      );
      const res = await mediaAPI.placeGlobalBid(id, amountPounds, {
        tags: mergedTags,
      });
      if (typeof res.updatedBalance === 'number') {
        updateBalance(res.updatedBalance);
      }
      Alert.alert('Added', 'Episode tipped into your library.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      return res;
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to add episode');
      setError(message);
      throw new Error(message);
    } finally {
      setAddingId(null);
    }
  };

  const busy = loading || loadingMore || Boolean(openingKey);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Add podcast</Text>
        <Pressable
          style={styles.walletChip}
          onPress={() => router.push('/wallet')}
          accessibilityLabel="Open wallet">
          <Text style={styles.walletChipValue}>
            {formatPoundsFromPence(user?.balance)}
          </Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.input}
            placeholder="Search episode or show"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => void performSearch()}
            editable={!busy}
          />
        </View>
        <Pressable
          style={[styles.searchBtn, busy && styles.disabled]}
          onPress={() => void performSearch()}
          disabled={busy}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.searchBtnText}>Search</Text>
          )}
        </Pressable>
      </View>

      {statusNote ? <Text style={styles.status}>{statusNote}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {hasSearched && results.length > 0 ? (
        <View style={styles.filters}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count =
              f.key === 'all'
                ? results.length
                : f.key === 'library'
                  ? libraryCount
                  : catalogCount;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text
                  style={[
                    styles.filterText,
                    active && styles.filterTextActive,
                  ]}>
                  {f.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <FlatList
        data={filteredResults}
        keyExtractor={(item, index) =>
          podcastSearchEpisodeId(item) || String(index)
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(24, contentPaddingBottom) },
        ]}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              color={colors.accentLight}
              style={{ marginTop: 40 }}
            />
          ) : hasSearched ? (
            <View style={styles.emptyBlock}>
              <Ionicons
                name="mic-outline"
                size={40}
                color={colors.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {filter !== 'all' && results.length > 0
                  ? `No ${filter} matches`
                  : 'No episodes found'}
              </Text>
              <Text style={styles.empty}>
                {filter !== 'all' && results.length > 0
                  ? 'Try All, or search with a show name or episode title.'
                  : 'Try another episode title, show, or host. Tuneable hits appear first; Taddy and Apple fill in the rest.'}
              </Text>
            </View>
          ) : (
            <Text style={styles.emptyQuiet}>
              Search Tuneable’s library, then Taddy and Apple Podcasts.
            </Text>
          )
        }
        ListFooterComponent={
          filteredResults.length > 0 && (hasMoreLocal || hasMoreTaddy) ? (
            <View style={styles.footer}>
              <Pressable
                style={[styles.loadMoreBtn, busy && styles.disabled]}
                onPress={() => void loadMore()}
                disabled={busy}>
                {loadingMore ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.loadMoreText}>Load more</Text>
                )}
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const id = podcastSearchEpisodeId(item);
          const isAdding = addingId === id;
          const isOpening = openingKey?.startsWith(`${id}:`);
          const label = podcastSearchSourceLabel(item);
          const library = !isExternalSearchEpisode(item);
          const durationLabel = formatDuration(item.duration);
          const showName = seriesTitle(item);
          return (
            <View style={styles.card}>
              <Pressable
                onPress={() => void openEpisode(item)}
                disabled={Boolean(openingKey)}
                accessibilityRole="button"
                accessibilityLabel={`Open episode ${item.title || 'episode'}`}>
                <Image
                  source={{ uri: podcastSearchCover(item) }}
                  style={styles.cover}
                />
              </Pressable>
              <View style={styles.meta}>
                <Pressable
                  onPress={() => void openEpisode(item)}
                  disabled={Boolean(openingKey)}
                  accessibilityRole="link"
                  accessibilityLabel={`Open episode ${item.title || 'episode'}`}>
                  <Text style={styles.trackTitle} numberOfLines={2}>
                    {item.title || 'Untitled episode'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void openShow(item)}
                  disabled={Boolean(openingKey)}
                  accessibilityRole="link"
                  accessibilityLabel={`Open show ${showName}`}>
                  <Text style={styles.showTitle} numberOfLines={1}>
                    {showName}
                  </Text>
                </Pressable>
                <View style={styles.metaRow}>
                  <Text
                    style={[
                      styles.sourceLabel,
                      library ? styles.sourceLibrary : styles.sourceCatalog,
                    ]}>
                    {label}
                  </Text>
                  {durationLabel ? (
                    <>
                      <Text style={styles.metaDot}>·</Text>
                      <View style={styles.durationRow}>
                        <Ionicons
                          name="time-outline"
                          size={11}
                          color={colors.textMuted}
                        />
                        <Text style={styles.duration}>{durationLabel}</Text>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>
              <Pressable
                style={styles.heartBtn}
                hitSlop={8}
                disabled={isAdding || isOpening}
                accessibilityRole="button"
                accessibilityLabel={`Tip and add ${item.title || 'episode'}`}
                onPress={() => setTipTarget(item)}>
                {isAdding || isOpening ? (
                  <ActivityIndicator color={colors.accentLight} size="small" />
                ) : (
                  <Ionicons name="heart" size={18} color={colors.tipHeart} />
                )}
              </Pressable>
            </View>
          );
        }}
      />

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Episode'}
        subtitle={tipTarget ? seriesTitle(tipTarget) : undefined}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={defaultTip}
        initialTags={tipTarget?.tags}
        tipMedia={tipTarget}
        onClose={() => setTipTarget(null)}
        onConfirm={addAndTip}
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
    marginBottom: 12,
    gap: 4,
  },
  back: { marginLeft: -2 },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  walletChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(126, 34, 206, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  walletChipValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  searchBtn: {
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  searchBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  status: {
    paddingHorizontal: 16,
    marginBottom: 8,
    color: colors.accentLight,
    fontSize: 13,
  },
  error: {
    paddingHorizontal: 16,
    marginBottom: 8,
    color: '#fca5a5',
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  filterChipActive: {
    backgroundColor: '#7e22ce',
    borderColor: '#7e22ce',
  },
  filterText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  emptyBlock: {
    alignItems: 'center',
    marginTop: 36,
    paddingHorizontal: 20,
    gap: 10,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    lineHeight: 22,
  },
  emptyQuiet: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 10,
  },
  loadMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  loadMoreText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  cover: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  meta: { flex: 1, minWidth: 0 },
  trackTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  showTitle: {
    marginTop: 2,
    color: '#c4b5fd',
    fontSize: 13,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  sourceLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sourceLibrary: {
    color: colors.success,
  },
  sourceCatalog: {
    color: colors.textMuted,
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: 11,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  duration: {
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  heartBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tipHeartBg,
    borderWidth: 1,
    borderColor: colors.tipHeartBorder,
  },
  disabled: { opacity: 0.6 },
});
