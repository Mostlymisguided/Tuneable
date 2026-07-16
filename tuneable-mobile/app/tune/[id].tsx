import { useCallback, useState } from 'react';
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
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { useAuth } from '@/src/auth/AuthContext';
import { formatDuration, formatPoundsFromPence } from '@/src/lib/format';
import { formatArtist, isUploadPlayable, mediaId } from '@/src/lib/media';
import { canUploadMedia } from '@/src/lib/permissions';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';

export default function TuneProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, updateBalance } = useAuth();
  const [media, setMedia] = useState<ChartMediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await mediaAPI.getProfile(id);
        setMedia(res.media ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tune');
        setMedia(null);
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

  if (!user) {
    return <Redirect href="/login" />;
  }

  const playable = isUploadPlayable(media);
  const canUpload = canUploadMedia(user);
  const artist =
    media?.creatorDisplay ||
    (media ? formatArtist(media.artist) : 'Unknown artist');
  const tipTotal = media?.globalMediaAggregate ?? 0;
  const durationLabel = formatDuration(media?.duration);
  const topBids = (media?.bids ?? [])
    .slice()
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, 5);

  const onPlay = async () => {
    if (!media || !playable) return;
    await setQueueAndPlay([media], 0);
  };

  const onConfirmTip = async (amountPounds: number) => {
    if (!media) return;
    const mid = mediaId(media);
    if (!mid) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(mid, amountPounds);
    const tipPence = Math.round(amountPounds * 100);
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    setMedia((prev) =>
      prev
        ? {
            ...prev,
            globalMediaAggregate: (prev.globalMediaAggregate ?? 0) + tipPence,
          }
        : prev
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Tune</Text>
      </View>

      {loading && !media ? (
        <ActivityIndicator
          color={colors.accentLight}
          style={{ marginTop: 48 }}
        />
      ) : error && !media ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : media ? (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load(true)}
                tintColor={colors.accentLight}
              />
            }>
            <Image
              source={{ uri: media.coverArt || DEFAULT_COVER_ART }}
              style={styles.cover}
            />

            <Text style={styles.title}>{media.title || 'Untitled'}</Text>
            <Text style={styles.artist}>{artist}</Text>

            {!playable ? (
              <Text style={styles.catalogHint}>
                Catalog only — tippable until someone uploads audio
              </Text>
            ) : null}

            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>
                  {formatPoundsFromPence(tipTotal)}
                </Text>
                <Text style={styles.metricLabel}>Total tips</Text>
              </View>
              {media.globalMediaAggregateTopRank ? (
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>
                    #{media.globalMediaAggregateTopRank}
                  </Text>
                  <Text style={styles.metricLabel}>Global rank</Text>
                </View>
              ) : null}
              {durationLabel ? (
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>{durationLabel}</Text>
                  <Text style={styles.metricLabel}>Duration</Text>
                </View>
              ) : null}
            </View>

            {(media.album || media.category || media.addedBy?.username) && (
              <View style={styles.metaBlock}>
                {media.album ? (
                  <Text style={styles.metaLine}>Album · {media.album}</Text>
                ) : null}
                {media.category ? (
                  <Text style={styles.metaLine}>
                    Category · {media.category}
                  </Text>
                ) : null}
                {media.addedBy?.username ? (
                  <Pressable
                    onPress={() => {
                      const target = media.addedBy?.uuid || media.addedBy?._id;
                      if (target) router.push(`/user/${target}`);
                    }}>
                    <Text style={[styles.metaLine, styles.linkLine]}>
                      Added by · @{media.addedBy.username}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}

            {media.tags && media.tags.length > 0 ? (
              <View style={styles.tags}>
                {media.tags.slice(0, 12).map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                style={styles.tipBtn}
                onPress={() => setTipOpen(true)}>
                <Ionicons name="heart" size={20} color="#fff" />
                <Text style={styles.actionText}>Tip</Text>
              </Pressable>
              {playable ? (
                <Pressable
                  style={styles.playBtn}
                  onPress={() => void onPlay()}>
                  <Ionicons name="play" size={20} color="#fff" />
                  <Text style={styles.actionText}>Play</Text>
                </Pressable>
              ) : canUpload ? (
                <Pressable
                  style={styles.playBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/upload',
                      params: { attachTo: mediaId(media) || id },
                    })
                  }>
                  <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
                  <Text style={styles.actionText}>Upload audio</Text>
                </Pressable>
              ) : (
                <View style={[styles.playBtn, styles.playBtnDisabled]}>
                  <Ionicons name="musical-note" size={20} color={colors.textMuted} />
                  <Text style={[styles.actionText, styles.actionTextMuted]}>
                    No upload
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.balance}>
              Balance {formatPoundsFromPence(user.balance)}
            </Text>

            {topBids.length > 0 ? (
              <View style={styles.bidsSection}>
                <Text style={styles.sectionTitle}>Top tippers</Text>
                {topBids.map((bid, index) => (
                  <View
                    key={bid._id || `${bid.userId?.username}-${index}`}
                    style={styles.bidRow}>
                    <Text style={styles.bidRank}>{index + 1}</Text>
                    {bid.userId?.username && (bid.userId?.uuid || bid.userId?._id) ? (
                      <Pressable
                        style={styles.bidUserPress}
                        onPress={() =>
                          router.push(`/user/${bid.userId?.uuid || bid.userId?._id}`)
                        }>
                        <Text style={[styles.bidUser, styles.linkLine]} numberOfLines={1}>
                          @{bid.userId.username}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.bidUser} numberOfLines={1}>
                        Anonymous
                      </Text>
                    )}
                    <Text style={styles.bidAmount}>
                      {formatPoundsFromPence(bid.amount ?? 0)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <TipSheet
            visible={tipOpen}
            title={media.title || 'Untitled'}
            subtitle={artist}
            balancePence={user.balance ?? 0}
            defaultTipPounds={user.preferences?.defaultTip ?? 1.11}
            onClose={() => setTipOpen(false)}
            onConfirm={onConfirmTip}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    marginBottom: 8,
    gap: 4,
  },
  back: { marginLeft: -2 },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  centered: {
    paddingHorizontal: 24,
    marginTop: 48,
    alignItems: 'center',
  },
  cover: {
    width: 220,
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.card,
    marginBottom: 20,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  artist: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  catalogHint: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  metric: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  metricLabel: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 11,
  },
  metaBlock: {
    marginTop: 16,
    width: '100%',
    gap: 4,
  },
  metaLine: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  linkLine: {
    color: colors.accentLight,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
    width: '100%',
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  tipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#db2777',
    borderRadius: 12,
    paddingVertical: 14,
  },
  playBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
  },
  playBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  actionTextMuted: {
    color: colors.textMuted,
  },
  balance: {
    marginTop: 14,
    color: colors.textMuted,
    fontSize: 13,
  },
  bidsSection: {
    marginTop: 28,
    width: '100%',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
    gap: 10,
  },
  bidRank: {
    width: 22,
    color: colors.textMuted,
    fontWeight: '600',
  },
  bidUser: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  bidUserPress: {
    flex: 1,
  },
  bidAmount: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  error: {
    color: '#fca5a5',
    textAlign: 'center',
    marginBottom: 16,
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
