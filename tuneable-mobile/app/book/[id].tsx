import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { TipSheet } from '@/src/components/TipSheet';
import { booksAPI, type BookRecord } from '@/src/api/books';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { getTipCurrentLocation } from '@/src/lib/currentLocation';
import { formatPoundsFromPence } from '@/src/lib/format';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART } from '@/src/types/media';

function authorLine(book: BookRecord): string {
  if (book.creatorDisplay) return book.creatorDisplay;
  if (book.authors?.length) return book.authors.join(', ');
  if (book.author?.length) {
    return book.author.map((a) => a.name).filter(Boolean).join(', ');
  }
  return 'Unknown author';
}

function readElsewhere(book: BookRecord): { url: string; label: string } | null {
  const sources = book.sources || {};
  if (sources.openLibrary) return { url: sources.openLibrary, label: 'Open Library' };
  if (sources.googleBooks) return { url: sources.googleBooks, label: 'Google Books' };
  if (book.isbn) return { url: `https://openlibrary.org/isbn/${book.isbn}`, label: 'Open Library' };
  const q = [book.title, authorLine(book)].filter(Boolean).join(' ');
  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(`${q} book`)}`,
    label: 'Find this book',
  };
}

export default function BookProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [book, setBook] = useState<BookRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await booksAPI.getBook(id);
        setBook(res.book);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Book not found');
        setBook(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const authors = useMemo(() => (book ? authorLine(book) : ''), [book]);
  const elsewhere = book ? readElsewhere(book) : null;
  const defaultTip = user?.preferences?.defaultTip ?? 1.11;

  if (loading && !book) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accentLight} />
        </View>
      </Screen>
    );
  }

  if (!book) {
    return (
      <Screen>
        <View style={styles.centered}>
          <Text style={styles.error}>{error || 'Book not found'}</Text>
          <Pressable onPress={() => router.push('/books')}>
            <Text style={styles.link}>Back to books</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(96, contentPaddingBottom + 24) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accentLight}
          />
        }
      >
        <View style={styles.hero}>
          <Image source={{ uri: book.coverArt || DEFAULT_COVER_ART }} style={styles.cover} />
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>Book</Text>
            <Text style={styles.title}>{book.title}</Text>
            <Text style={styles.authors}>{authors}</Text>
            {book.isbn ? <Text style={styles.meta}>ISBN {book.isbn}</Text> : null}
            {book.publisher ? <Text style={styles.meta}>{book.publisher}</Text> : null}
            {book.pages ? <Text style={styles.meta}>{book.pages} pages</Text> : null}
          </View>
        </View>

        <Text style={styles.tipped}>
          {formatPoundsFromPence(book.globalMediaAggregate || 0)} tipped
        </Text>

        <View style={styles.actions}>
          <Pressable
            style={styles.tipBtn}
            onPress={() => {
              if (!user) {
                router.push('/login');
                return;
              }
              setTipOpen(true);
            }}
          >
            <Ionicons name="heart" size={16} color="#fff" />
            <Text style={styles.tipBtnText}>Tip this book</Text>
          </Pressable>
          {elsewhere ? (
            <Pressable style={styles.outBtn} onPress={() => void Linking.openURL(elsewhere.url)}>
              <Ionicons name="open-outline" size={16} color={colors.text} />
              <Text style={styles.outBtnText}>{elsewhere.label}</Text>
            </Pressable>
          ) : null}
        </View>

        {book.description ? <Text style={styles.description}>{book.description}</Text> : null}

        {(book.tags || []).length > 0 ? (
          <View style={styles.tags}>
            {(book.tags || []).map((tag) => (
              <Text key={tag} style={styles.tag}>
                {tag}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <TipSheet
        visible={tipOpen}
        title={book.title}
        subtitle={authors}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={defaultTip}
        tipMedia={book}
        onClose={() => setTipOpen(false)}
        onConfirm={async (amount) => {
          const res = await booksAPI.boost(book._id, amount, getTipCurrentLocation());
          if (typeof res.updatedBalance === 'number') updateBalance(res.updatedBalance);
          if (res.book) setBook(res.book);
          setTipOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hero: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  cover: { width: 110, height: 154, borderRadius: 10, backgroundColor: colors.card },
  heroCopy: { flex: 1, minWidth: 0 },
  kicker: { color: colors.accentLight, fontWeight: '700', marginBottom: 4 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  authors: { color: colors.textSecondary, fontSize: 16, marginTop: 4 },
  meta: { color: colors.textMuted, marginTop: 4, fontSize: 13 },
  tipped: { color: colors.accentLight, fontWeight: '700', marginBottom: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  tipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tipBtnText: { color: '#fff', fontWeight: '700' },
  outBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  outBtnText: { color: colors.text, fontWeight: '600' },
  description: { color: colors.textSecondary, lineHeight: 22, marginBottom: 16 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    color: colors.textSecondary,
    backgroundColor: colors.card,
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
  },
  error: { color: '#fca5a5', marginBottom: 12, textAlign: 'center' },
  link: { color: colors.accentLight, fontWeight: '700' },
});
