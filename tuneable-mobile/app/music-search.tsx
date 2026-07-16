import { useMemo, useState } from 'react';
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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { partyAPI } from '@/src/api/party';
import { searchAPI } from '@/src/api/search';
import { useAuth } from '@/src/auth/AuthContext';
import { formatPoundsFromPence } from '@/src/lib/format';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, GLOBAL_PARTY_ID } from '@/src/types/media';
import {
  formatSearchArtist,
  searchResultId,
  searchResultPlatform,
  searchResultUrl,
  type SearchResultItem,
} from '@/src/types/search';

const SEARCH_SOURCE = 'musicbrainz';

type FilterKey = 'all' | 'library' | 'catalog';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'library', label: 'Library' },
  { key: 'catalog', label: 'Catalog' },
];

function isLibraryResult(item: SearchResultItem): boolean {
  return Boolean(item.isLocal) || item.sourceLabel === 'Library';
}

function resultLabel(item: SearchResultItem): string {
  if (item.sourceLabel) return item.sourceLabel;
  if (isLibraryResult(item)) return 'Library';
  if (item.awaitingUpload) return 'MusicBrainz';
  return 'Catalog';
}

function mergeUnique(
  existing: SearchResultItem[],
  incoming: SearchResultItem[]
): SearchResultItem[] {
  const seen = new Set(existing.map((item) => searchResultId(item)).filter(Boolean));
  const next = [...existing];
  for (const item of incoming) {
    const id = searchResultId(item);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    next.push(item);
  }
  return next;
}

export default function MusicSearchScreen() {
  const { user, updateBalance } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipAmounts, setTipAmounts] = useState<Record<string, string>>({});
  const [searchSource, setSearchSource] = useState<'local' | 'external' | string | null>(
    null
  );
  const [hasMoreExternal, setHasMoreExternal] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const defaultTip = useMemo(
    () => (user?.preferences?.defaultTip ?? 1).toFixed(2),
    [user?.preferences?.defaultTip]
  );

  const seedTips = (items: SearchResultItem[]) => {
    setTipAmounts((prev) => {
      const next = { ...prev };
      for (const item of items) {
        const id = searchResultId(item);
        if (id && next[id] == null) next[id] = defaultTip;
      }
      return next;
    });
  };

  const filteredResults = useMemo(() => {
    if (filter === 'library') return results.filter(isLibraryResult);
    if (filter === 'catalog') return results.filter((item) => !isLibraryResult(item));
    return results;
  }, [results, filter]);

  const libraryCount = useMemo(
    () => results.filter(isLibraryResult).length,
    [results]
  );
  const catalogCount = results.length - libraryCount;

  const performSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setHasSearched(true);
    setLoading(true);
    setError(null);
    setStatusNote(null);
    setResults([]);
    setHasMoreExternal(false);
    setNextPageToken(null);
    setSearchSource(null);
    setFilter('all');
    try {
      const res = await searchAPI.search(q, { source: SEARCH_SOURCE });
      const items = [...(res.videos ?? [])];
      setResults(items);
      setSearchSource(res.source || null);
      setHasMoreExternal(Boolean(res.hasMoreExternal));
      setNextPageToken(res.nextPageToken || null);
      seedTips(items);

      if (res.source === 'local') {
        setStatusNote(
          `Found ${items.length} in your library${
            res.hasMoreExternal ? ' · more available on MusicBrainz' : ''
          }`
        );
      } else if (items.length > 0) {
        setStatusNote(`Found ${items.length} from MusicBrainz`);
      } else {
        setStatusNote(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const showMoreFromCatalog = async () => {
    const q = query.trim();
    if (!q) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await searchAPI.search(q, {
        source: SEARCH_SOURCE,
        forceExternal: true,
      });
      const items = [...(res.videos ?? [])];
      setResults(items);
      setSearchSource(res.source || 'external');
      setHasMoreExternal(false);
      setNextPageToken(res.nextPageToken || null);
      seedTips(items);
      setStatusNote(`Showing ${items.length} MusicBrainz catalog matches`);
      setFilter('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog');
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMore = async () => {
    const q = query.trim();
    if (!q || !nextPageToken) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await searchAPI.search(q, {
        source: SEARCH_SOURCE,
        forceExternal: searchSource === 'external' || Boolean(nextPageToken),
        pageToken: nextPageToken,
      });
      const items = [...(res.videos ?? [])];
      setResults((prev) => mergeUnique(prev, items));
      setNextPageToken(res.nextPageToken || null);
      if (res.source) setSearchSource(res.source);
      seedTips(items);
      setStatusNote((prev) =>
        prev ? `${prev.split(' ·')[0]} · loaded more` : `Loaded ${items.length} more`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const addAndTip = async (item: SearchResultItem) => {
    const id = searchResultId(item);
    const url = searchResultUrl(item) ?? undefined;
    const externalIds = item.externalIds;
    if (!url && (!externalIds || Object.keys(externalIds).length === 0)) {
      Alert.alert(
        'Missing catalog data',
        'This result has no source URL or MusicBrainz ID.'
      );
      return;
    }
    const tipText = tipAmounts[id] ?? defaultTip;
    const bidAmount = Number.parseFloat(tipText.replace(',', '.'));
    if (Number.isNaN(bidAmount) || bidAmount < 0.01) {
      Alert.alert('Invalid tip', 'Tip must be at least £0.01');
      return;
    }
    const needed = Math.round(bidAmount * 100);
    if ((user?.balance ?? 0) < needed) {
      Alert.alert(
        'Insufficient balance',
        `You need ${formatPoundsFromPence(needed)} (have ${formatPoundsFromPence(user?.balance)}). Top up your wallet first.`
      );
      return;
    }

    setAddingId(id);
    setError(null);
    try {
      const res = await partyAPI.addMediaToParty(GLOBAL_PARTY_ID, {
        url,
        title: item.title || 'Unknown',
        artist: formatSearchArtist(item.artist),
        bidAmount,
        platform: searchResultPlatform(item),
        duration: item.duration,
        coverArt: item.coverArt,
        category: item.category || 'Music',
        tags: item.tags,
        externalIds,
        album: item.album ?? null,
        releaseDate: item.releaseDate ?? null,
        releaseYear: item.releaseYear ?? null,
      });
      if (typeof res.updatedBalance === 'number') {
        updateBalance(res.updatedBalance);
      }
      Alert.alert('Added', res.message || 'Tune added to the global chart.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string; message?: string } } })
          ?.response?.data?.error ||
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        (err instanceof Error ? err.message : 'Failed to add tune');
      setError(message);
    } finally {
      setAddingId(null);
    }
  };

  const busy = loading || loadingMore;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Add tunes</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search library or MusicBrainz"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => void performSearch()}
          editable={!busy}
        />
        <Pressable
          style={[styles.searchBtn, busy && styles.disabled]}
          onPress={() => void performSearch()}
          disabled={busy}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="search" size={22} color="#fff" />
          )}
        </Pressable>
      </View>

      <Text style={styles.balance}>
        Balance {formatPoundsFromPence(user?.balance)}
      </Text>

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
        keyExtractor={(item, index) => searchResultId(item) || String(index)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              color={colors.accentLight}
              style={{ marginTop: 40 }}
            />
          ) : hasSearched ? (
            <View style={styles.emptyBlock}>
              <Ionicons
                name="musical-notes-outline"
                size={40}
                color={colors.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {filter !== 'all' && results.length > 0
                  ? `No ${filter} matches`
                  : 'No tunes found'}
              </Text>
              <Text style={styles.empty}>
                {filter !== 'all' && results.length > 0
                  ? 'Try All, or search with different keywords.'
                  : 'Try another title, artist, or spelling. Library hits appear first; MusicBrainz fills in the rest.'}
              </Text>
              {hasMoreExternal && searchSource === 'local' ? (
                <Pressable
                  style={styles.showMoreBtn}
                  onPress={() => void showMoreFromCatalog()}
                  disabled={busy}>
                  <Text style={styles.showMoreText}>
                    Search MusicBrainz catalog
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.emptyBlock}>
              <Ionicons
                name="search-outline"
                size={40}
                color={colors.textMuted}
              />
              <Text style={styles.emptyTitle}>Find something to tip</Text>
              <Text style={styles.empty}>
                We check Tuneable’s library first, then MusicBrainz. Uploads stay
                playable in-app; catalog tips are tippable until someone uploads
                audio.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          filteredResults.length > 0 ? (
            <View style={styles.footer}>
              {hasMoreExternal && searchSource === 'local' ? (
                <Pressable
                  style={[styles.showMoreBtn, busy && styles.disabled]}
                  onPress={() => void showMoreFromCatalog()}
                  disabled={busy}>
                  {loadingMore ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="globe-outline" size={18} color="#fff" />
                      <Text style={styles.showMoreText}>
                        Show more from MusicBrainz
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : null}

              {nextPageToken ? (
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
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const id = searchResultId(item);
          const isAdding = addingId === id;
          const label = resultLabel(item);
          const library = isLibraryResult(item);
          return (
            <View style={styles.card}>
              <Image
                source={{ uri: item.coverArt || DEFAULT_COVER_ART }}
                style={styles.cover}
              />
              <View style={styles.meta}>
                <Text style={styles.trackTitle} numberOfLines={2}>
                  {item.title || 'Untitled'}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {formatSearchArtist(item.artist)}
                </Text>
                <Text
                  style={[
                    styles.sourceLabel,
                    library ? styles.sourceLibrary : styles.sourceCatalog,
                  ]}>
                  {label}
                </Text>
                <View style={styles.tipRow}>
                  <Text style={styles.currency}>£</Text>
                  <TextInput
                    style={styles.tipInput}
                    keyboardType="decimal-pad"
                    value={tipAmounts[id] ?? defaultTip}
                    onChangeText={(t) =>
                      setTipAmounts((prev) => ({ ...prev, [id]: t }))
                    }
                    editable={!isAdding}
                  />
                  <Pressable
                    style={[styles.addBtn, isAdding && styles.disabled]}
                    disabled={isAdding}
                    onPress={() => void addAndTip(item)}>
                    {isAdding ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.addText}>Add & tip</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
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
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  searchBtn: {
    width: 48,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balance: {
    paddingHorizontal: 16,
    marginBottom: 4,
    color: colors.textMuted,
    fontSize: 13,
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
  footer: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 10,
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  showMoreText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
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
  artist: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 13,
  },
  sourceLabel: {
    marginTop: 4,
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
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  currency: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tipInput: {
    width: 64,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: colors.text,
    fontSize: 14,
  },
  addBtn: {
    marginLeft: 'auto',
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 88,
    alignItems: 'center',
  },
  addText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  disabled: { opacity: 0.6 },
});
