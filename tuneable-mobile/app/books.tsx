import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { BookRow } from '@/src/components/BookRow';
import { TipSheet } from '@/src/components/TipSheet';
import { booksAPI, type BookRecord } from '@/src/api/books';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { getTipCurrentLocation } from '@/src/lib/currentLocation';
import { colors } from '@/src/theme/colors';

const PERIODS = [
  { key: 'all-time', label: 'All time' },
  { key: 'this-week', label: 'This week' },
  { key: 'this-month', label: 'This month' },
] as const;

function authorLine(book: BookRecord): string {
  if (book.creatorDisplay) return book.creatorDisplay;
  if (book.authors?.length) return book.authors.join(', ');
  if (book.author?.length) {
    return book.author.map((a) => a.name).filter(Boolean).join(', ');
  }
  return 'Unknown author';
}

export default function BooksScreen() {
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('all-time');
  const [books, setBooks] = useState<BookRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<BookRecord | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await booksAPI.getChart({ limit: 50, timePeriod: period });
        setBooks(res.books ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load books');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const defaultTip = useMemo(
    () => user?.preferences?.defaultTip ?? 1.11,
    [user?.preferences?.defaultTip]
  );

  return (
    <Screen>
      <FlatList
        data={books}
        keyExtractor={(item) => item._id}
        contentContainerStyle={[styles.list, { paddingBottom: Math.max(96, contentPaddingBottom + 24) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accentLight}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Books</Text>
            <Text style={styles.subtitle}>
              Catalogue, tip, and chart written works. Reading stays off-platform for now.
            </Text>
            <Pressable
              style={styles.findBtn}
              onPress={() => router.push('/book-search')}
              accessibilityRole="button"
              accessibilityLabel="Find books"
            >
              <Ionicons name="search" size={16} color="#fff" />
              <Text style={styles.findBtnText}>Find books</Text>
            </Pressable>
            <View style={styles.periods}>
              {PERIODS.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => setPeriod(item.key)}
                  style={[styles.period, period === item.key && styles.periodOn]}
                >
                  <Text style={[styles.periodText, period === item.key && styles.periodTextOn]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading && books.length === 0 ? (
              <ActivityIndicator color={colors.accentLight} style={styles.loader} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              No books on the chart yet. Search Open Library and import the first ones.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <BookRow
            title={item.title}
            subtitle={authorLine(item)}
            coverArt={item.coverArt}
            isbn={item.isbn}
            tipPence={item.globalMediaAggregate ?? 0}
            onPress={() => router.push(`/book/${item._id}`)}
            actionLabel="Tip"
            onAction={() => setTipTarget(item)}
          />
        )}
      />
      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Book'}
        subtitle={tipTarget ? authorLine(tipTarget) : undefined}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={defaultTip}
        tipMedia={tipTarget}
        onClose={() => setTipTarget(null)}
        onConfirm={async (amount) => {
          if (!tipTarget) return;
          const res = await booksAPI.boost(tipTarget._id, amount, getTipCurrentLocation());
          if (typeof res.updatedBalance === 'number') updateBalance(res.updatedBalance);
          setBooks((prev) =>
            prev.map((book) => (book._id === res.book?._id ? { ...book, ...res.book } : book))
          );
          setTipTarget(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16 },
  header: { marginBottom: 8, paddingTop: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, marginTop: 6, marginBottom: 14, lineHeight: 20 },
  findBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  findBtnText: { color: '#fff', fontWeight: '700' },
  periods: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  period: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  periodOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  periodText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  periodTextOn: { color: '#fff' },
  error: { color: '#fca5a5', marginBottom: 8 },
  loader: { marginVertical: 24 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 32, lineHeight: 20 },
});
