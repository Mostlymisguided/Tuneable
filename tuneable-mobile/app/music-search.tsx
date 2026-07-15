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

export default function MusicSearchScreen() {
  const { user, updateBalance } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tipAmounts, setTipAmounts] = useState<Record<string, string>>({});

  const defaultTip = useMemo(
    () => (user?.preferences?.defaultTip ?? 1).toFixed(2),
    [user?.preferences?.defaultTip]
  );

  const performSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setHasSearched(true);
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const res = await searchAPI.search(q, { source: SEARCH_SOURCE });
      let items: SearchResultItem[] = [...(res.videos ?? [])];
      if (res.hasMoreExternal) {
        const ext = await searchAPI.search(q, {
          source: SEARCH_SOURCE,
          forceExternal: true,
        });
        items = [...items, ...(ext.videos ?? [])];
      }
      setResults(items);
      setTipAmounts((prev) => {
        const next = { ...prev };
        for (const item of items) {
          const id = searchResultId(item);
          if (id && next[id] == null) next[id] = defaultTip;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
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
          placeholder="Search MusicBrainz or library"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => void performSearch()}
          editable={!loading}
        />
        <Pressable
          style={[styles.searchBtn, loading && styles.disabled]}
          onPress={() => void performSearch()}
          disabled={loading}>
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={results}
        keyExtractor={(item, index) => searchResultId(item) || String(index)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          hasSearched && !loading ? (
            <Text style={styles.empty}>No tunes found.</Text>
          ) : !hasSearched ? (
            <Text style={styles.empty}>
              Search the library and MusicBrainz catalog, then add with a tip.
              Uploads stay playable in-app; catalog tips are tippable only until
              someone uploads audio.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const id = searchResultId(item);
          const isAdding = addingId === id;
          const label =
            item.sourceLabel ||
            (item.isLocal ? 'Library' : item.awaitingUpload ? 'MusicBrainz' : null);
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
                {label ? <Text style={styles.sourceLabel}>{label}</Text> : null}
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
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 13,
  },
  error: {
    paddingHorizontal: 16,
    marginBottom: 8,
    color: '#fca5a5',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 40,
    paddingHorizontal: 24,
    lineHeight: 22,
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
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
