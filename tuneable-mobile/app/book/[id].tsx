import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { booksAPI } from '@/src/api/books';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence } from '@/src/lib/format';
import { getCreatorDisplay, mediaId } from '@/src/lib/media';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';

export default function BookProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [book, setBook] = useState<ChartMediaItem | null>(null);
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
        const data = await booksAPI.getBook(id);
        setBook(data.book);
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

  const author = useMemo(() => (book ? getCreatorDisplay(book) : ''), [book]);
  const support = book?.globalMediaAggregate ?? 0;

  const onConfirmTip = async (amountPounds: number, _tags: string[]) => {
    const bookId = book ? mediaId(book) : id;
    if (!bookId) throw new Error('Missing book id');
    const res = await booksAPI.boost(bookId, amountPounds);
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    if (res.book) setBook(res.book);
    return res;
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(48, contentPaddingBottom + 24) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accentLight}
          />
        }>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        {loading && !book ? (
          <ActivityIndicator color={colors.accentLight} style={styles.loader} />
        ) : error || !book ? (
          <Text style={styles.error}>{error || 'Book not found'}</Text>
        ) : (
          <>
            <Image
              source={{ uri: book.coverArt || DEFAULT_COVER_ART }}
              style={styles.cover}
            />
            <Text style={styles.title}>{book.title || 'Untitled'}</Text>
            <Text style={styles.author}>{author}</Text>
            <Text style={styles.support}>{formatPoundsFromPence(support)} supported</Text>
            <Text style={styles.note}>
              Catalogue and tip written works here. Reading stays off-platform for now.
            </Text>
            <Pressable
              style={styles.tipBtn}
              onPress={() => setTipOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Send a tip">
              <Ionicons name="heart" size={18} color="#fff" />
              <Text style={styles.tipBtnText}>Send a tip</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <TipSheet
        visible={tipOpen}
        title={book?.title || 'Untitled'}
        subtitle={author || undefined}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 1.11}
        tipMedia={book}
        onClose={() => setTipOpen(false)}
        onConfirm={onConfirmTip}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: 'center',
  },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 16,
  },
  backText: {
    color: colors.text,
    fontSize: 16,
  },
  loader: {
    marginTop: 48,
  },
  error: {
    color: '#fca5a5',
    marginTop: 32,
    textAlign: 'center',
  },
  cover: {
    width: 180,
    height: 240,
    borderRadius: 8,
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  author: {
    color: colors.textSecondary,
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  support: {
    color: colors.accentLight,
    fontWeight: '700',
    marginTop: 12,
  },
  note: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  tipBtn: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  tipBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
