import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ClaimSheet } from '@/src/components/ClaimSheet';
import { ReportHeaderButton, ReportSheet } from '@/src/components/ReportSheet';
import { booksAPI } from '@/src/api/books';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence } from '@/src/lib/format';
import { getReadElsewhereTarget } from '@/src/lib/listenElsewhere';
import { getCreatorDisplay, mediaId } from '@/src/lib/media';
import { colors } from '@/src/theme/colors';
import { bookCoverSource, isBlankCoverSize } from '@/src/lib/bookCover';
import { type ChartMediaItem } from '@/src/types/media';

export default function BookProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [book, setBook] = useState<ChartMediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await booksAPI.getBook(id);
        setCoverFailed(false);
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
  const coverState =
    book?.rightsStatus === 'disputed'
      ? 'disputed'
      : book?.rightsStatus === 'cleared' || book?.rightsCleared === true
        ? 'clear'
        : 'awaiting';
  const readElsewhere = book ? getReadElsewhereTarget(book) : null;

  const onReadElsewhere = () => {
    if (!readElsewhere) return;
    void Linking.openURL(readElsewhere.url);
  };

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
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          {book ? (
            <ReportHeaderButton onPress={() => setReportOpen(true)} />
          ) : null}
        </View>

        {loading && !book ? (
          <ActivityIndicator color={colors.accentLight} style={styles.loader} />
        ) : error || !book ? (
          <Text style={styles.error}>{error || 'Book not found'}</Text>
        ) : (
          <>
            <View style={styles.coverWrap}>
              <Image
                source={bookCoverSource(coverFailed ? null : book.coverArt)}
                resizeMode="cover"
                onLoad={(event) => {
                  const { width, height } = event.nativeEvent.source;
                  if (isBlankCoverSize(width, height)) setCoverFailed(true);
                }}
                onError={() => setCoverFailed(true)}
                style={styles.cover}
              />
              {coverState !== 'clear' ? (
                <View style={styles.coverOverlay}>
                  <View style={styles.awaitingBox}>
                    <Ionicons
                      name="ribbon-outline"
                      size={28}
                      color={coverState === 'disputed' ? '#f87171' : '#fbbf24'}
                    />
                    <Text style={styles.awaitingTitle}>
                      {coverState === 'disputed'
                        ? 'Rights disputed'
                        : 'Awaiting creator sign up'}
                    </Text>
                    <Text style={styles.awaitingHint}>
                      {coverState === 'disputed'
                        ? 'Tips are paused while ownership is resolved'
                        : 'Tips are held until the author joins Tuneable'}
                    </Text>
                    <View style={styles.awaitingActions}>
                      {coverState === 'awaiting' ? (
                        <Pressable
                          style={styles.claimOverlayBtn}
                          onPress={() => setClaimOpen(true)}
                          accessibilityRole="button"
                          accessibilityLabel="Claim media">
                          <Text style={styles.claimOverlayText}>Claim media</Text>
                        </Pressable>
                      ) : null}
                      {readElsewhere ? (
                        <Pressable
                          style={styles.openExternalBtn}
                          onPress={onReadElsewhere}
                          accessibilityRole="button"
                          accessibilityLabel="Open externally">
                          <Ionicons name="open-outline" size={14} color="#fff" />
                          <Text style={styles.openExternalText}>
                            {readElsewhere.label}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
            <Text style={styles.title}>{book.title || 'Untitled'}</Text>
            <Text style={styles.author}>{author}</Text>
            <Text style={styles.support}>{formatPoundsFromPence(support)} supported</Text>
            <Text style={styles.note}>
              Catalogue and tip written works here. Reading stays off-platform for now.
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.tipBtn}
                onPress={() => setTipOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Send a tip">
                <Ionicons name="heart" size={18} color="#fff" />
                <Text style={styles.tipBtnText}>Send a tip</Text>
              </Pressable>
              {coverState === 'clear' && readElsewhere ? (
                <Pressable
                  style={styles.openExternalPageBtn}
                  onPress={onReadElsewhere}
                  accessibilityRole="button"
                  accessibilityLabel="Open externally">
                  <Ionicons name="open-outline" size={14} color="#fff" />
                  <Text style={styles.openExternalText}>{readElsewhere.label}</Text>
                </Pressable>
              ) : null}
            </View>
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
      <ClaimSheet
        visible={claimOpen}
        mediaId={book ? mediaId(book) : id || ''}
        mediaTitle={book?.title || 'Untitled'}
        mediaKind="book"
        rightsStatus={book?.rightsStatus}
        onClose={() => setClaimOpen(false)}
        onSubmitted={() => {
          Alert.alert(
            'Claim submitted',
            "We'll notify you when it's reviewed. Approved claims receive tips held in escrow."
          );
        }}
      />
      <ReportSheet
        visible={reportOpen}
        reportType="media"
        targetId={book ? mediaId(book) : id || ''}
        targetTitle={book?.title || 'Untitled'}
        onClose={() => setReportOpen(false)}
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
  topRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
  coverWrap: {
    width: 200,
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
  },
  awaitingBox: {
    alignItems: 'center',
  },
  awaitingTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  awaitingHint: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 16,
  },
  awaitingActions: {
    marginTop: 12,
    gap: 8,
    alignItems: 'center',
  },
  claimOverlayBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  claimOverlayText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 13,
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  openExternalText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  openExternalPageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
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
  actions: {
    marginTop: 24,
    alignItems: 'center',
    gap: 10,
  },
  tipBtn: {
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
