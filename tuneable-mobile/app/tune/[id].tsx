import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { MiniSupportersBar } from '@/src/components/MiniSupportersBar';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { useAuth } from '@/src/auth/AuthContext';
import { formatDuration, formatPoundsFromPence } from '@/src/lib/format';
import { formatArtist, isUploadPlayable, mediaId } from '@/src/lib/media';
import { canUploadMedia } from '@/src/lib/permissions';
import {
  averageTipPounds,
  buildTipStatChips,
  computeChampionTipContext,
} from '@/src/lib/tipStats';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { colors } from '@/src/theme/colors';
import {
  DEFAULT_COVER_ART,
  type ChartMediaItem,
  type RelatedMediaItem,
} from '@/src/types/media';

const MIN_TIP = 0.01;

function roundPounds(n: number): number {
  return Math.round(n * 100) / 100;
}

function relatedToChartItem(item: RelatedMediaItem): ChartMediaItem {
  return {
    _id: item.mediaId || item._id,
    uuid: item.uuid,
    title: item.title,
    artist: item.artist,
    coverArt: item.coverArt ?? undefined,
    duration: item.duration,
    bpm: item.bpm,
    tags: item.tags,
    sources: item.sources,
    globalMediaAggregate: item.globalMediaAggregate,
    partyMediaAggregate: item.globalMediaAggregate,
  };
}

export default function TuneProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, updateBalance } = useAuth();
  const [media, setMedia] = useState<ChartMediaItem | null>(null);
  const [related, setRelated] = useState<RelatedMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipInitial, setTipInitial] = useState<number | null>(null);
  const [supportAmount, setSupportAmount] = useState(1.11);
  const [tipping, setTipping] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [showAboutMore, setShowAboutMore] = useState(false);
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [profileRes, relatedRes] = await Promise.all([
          mediaAPI.getProfile(id),
          mediaAPI
            .getRelatedPlaylists(id, { relatedLimit: 8, fansLimit: 0 })
            .catch(() => ({ relatedMedia: [] })),
        ]);
        setMedia(profileRes.media ?? null);
        setRelated(relatedRes.relatedMedia ?? []);
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

  const defaultTip = user?.preferences?.defaultTip ?? 1.11;

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      setSupportAmount(Math.max(MIN_TIP, defaultTip));
    }, [defaultTip])
  );

  const playable = isUploadPlayable(media);
  const canUpload = canUploadMedia(user);
  const artist =
    media?.creatorDisplay ||
    (media ? formatArtist(media.artist) : 'Unknown artist');
  const tipTotal = media?.globalMediaAggregate ?? 0;
  const tipCount = media?.bids?.length ?? 0;
  const durationLabel = formatDuration(media?.duration);

  const heroMetadata = useMemo(() => {
    if (!media) return [] as string[];
    const year = media.releaseDate
      ? String(new Date(media.releaseDate).getFullYear())
      : media.releaseYear
        ? String(media.releaseYear)
        : null;
    return [
      media.album || null,
      year,
      media.bpm != null ? `${media.bpm} BPM` : null,
      media.key || null,
      durationLabel || null,
    ].filter((part): part is string => Boolean(part));
  }, [media, durationLabel]);

  const championCtx = useMemo(
    () =>
      computeChampionTipContext(media?.bids, user, {
        fallbackChampionAggregatePence: media?.globalMediaAggregateTop,
        fallbackChampionUser: media?.globalMediaAggregateTopUser,
      }),
    [media, user]
  );

  const tipChips = useMemo(
    () =>
      buildTipStatChips({
        minTip: MIN_TIP,
        avgTip: averageTipPounds(media?.bids),
        championAggregate: championCtx?.championAggregate,
        viewerAggregate: championCtx?.viewerAggregate,
        viewerIsChampion: championCtx?.viewerIsChampion,
      }),
    [media?.bids, championCtx]
  );

  const aboutFields = useMemo(() => {
    if (!media) return [] as Array<{ label: string; value: string }>;
    const fields: Array<{ label: string; value: string }> = [];
    if (media.album) fields.push({ label: 'Album', value: media.album });
    if (media.category) fields.push({ label: 'Category', value: media.category });
    if (media.releaseYear || media.releaseDate) {
      fields.push({
        label: 'Year',
        value: media.releaseYear
          ? String(media.releaseYear)
          : String(new Date(media.releaseDate!).getFullYear()),
      });
    }
    if (media.bpm != null) fields.push({ label: 'BPM', value: String(media.bpm) });
    if (media.key) fields.push({ label: 'Key', value: media.key });
    if (durationLabel) fields.push({ label: 'Duration', value: durationLabel });
    if (media.addedBy?.username) {
      fields.push({ label: 'Added by', value: `@${media.addedBy.username}` });
    }
    if (media.description?.trim()) {
      fields.push({ label: 'Description', value: media.description.trim() });
    }
    return fields;
  }, [media, durationLabel]);

  const visibleAbout = showAboutMore ? aboutFields : aboutFields.slice(0, 4);

  if (!user) {
    return <Redirect href="/login" />;
  }

  const onPlay = async () => {
    if (!media || !playable) return;
    await setQueueAndPlay([media], 0);
  };

  const onPlayRelated = (item: RelatedMediaItem) => {
    const queue = related.map(relatedToChartItem);
    const chart = relatedToChartItem(item);
    if (!isUploadPlayable(chart)) return;
    const playableQueue = queue.filter(isUploadPlayable);
    const index = playableQueue.findIndex(
      (m) => mediaId(m) === mediaId(chart)
    );
    if (index < 0) return;
    void setQueueAndPlay(playableQueue, index);
  };

  const placeTip = async (amountPounds: number) => {
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
            bids: [
              ...(prev.bids ?? []),
              {
                amount: tipPence,
                userId: {
                  _id: user._id || user.id,
                  uuid: user.uuid,
                  username: user.username,
                  profilePic: user.profilePic,
                },
              },
            ],
          }
        : prev
    );
  };

  const onConfirmTip = async (amountPounds: number) => {
    await placeTip(amountPounds);
  };

  const onSupportTip = async () => {
    setSupportError(null);
    const amount = roundPounds(supportAmount);
    if (amount < MIN_TIP) {
      setSupportError('Minimum tip is £0.01');
      return;
    }
    if (Math.round(amount * 100) > (user.balance ?? 0)) {
      setSupportError(
        `Insufficient balance (${formatPoundsFromPence(user.balance)} available)`
      );
      return;
    }
    setTipping(true);
    try {
      await placeTip(amount);
    } catch (err) {
      setSupportError(err instanceof Error ? err.message : 'Tip failed');
    } finally {
      setTipping(false);
    }
  };

  const openTipSheet = (amount?: number) => {
    setTipInitial(amount ?? null);
    setTipOpen(true);
  };

  const onShare = async () => {
    if (!media) return;
    const mid = mediaId(media) || id;
    const url = `https://tuneable.stream/tune/${mid}`;
    try {
      await Share.share({
        message: `${media.title || 'Tune'} — ${artist}\n${url}`,
        url,
      });
    } catch {
      // dismissed
    }
  };

  const adjustSupport = (delta: number) => {
    setSupportAmount((prev) => {
      const next = roundPounds(prev + delta);
      const max = (user.balance ?? 0) / 100 || 9999;
      return Math.min(max, Math.max(MIN_TIP, next));
    });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
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
            {/* Cover + overlay */}
            <Pressable
              style={styles.coverWrap}
              onPress={() => {
                if (playable) void onPlay();
              }}>
              <Image
                source={{ uri: media.coverArt || DEFAULT_COVER_ART }}
                style={styles.cover}
              />
              <View style={styles.coverOverlay}>
                {playable ? (
                  <View style={styles.coverPlay}>
                    <Ionicons name="play" size={28} color="#fff" />
                  </View>
                ) : (
                  <View style={styles.awaitingBox}>
                    <Ionicons name="cloud-upload-outline" size={28} color="#fbbf24" />
                    <Text style={styles.awaitingTitle}>Awaiting upload</Text>
                    {canUpload ? (
                      <Pressable
                        style={styles.uploadOverlayBtn}
                        onPress={() =>
                          router.push({
                            pathname: '/upload',
                            params: { attachTo: mediaId(media) || id },
                          })
                        }>
                        <Text style={styles.uploadOverlayText}>Upload audio</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.awaitingHint}>Tip to support this tune</Text>
                    )}
                  </View>
                )}
              </View>
            </Pressable>

            <Text style={styles.title}>{media.title || 'Untitled'}</Text>
            <Text style={styles.artist}>{artist}</Text>

            {heroMetadata.length > 0 ? (
              <Text style={styles.metaLine}>{heroMetadata.join(' · ')}</Text>
            ) : null}

            {media.tags && media.tags.length > 0 ? (
              <View style={styles.tags}>
                {media.tags.slice(0, 8).map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.statChips}>
              <View style={styles.statChip}>
                <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
                <Text style={styles.statChipText}>
                  {formatPoundsFromPence(tipTotal)}
                </Text>
              </View>
              <View style={styles.statChip}>
                <Ionicons name="globe-outline" size={14} color={colors.textMuted} />
                <Text style={styles.statChipText}>
                  #{media.globalMediaAggregateTopRank || '—'} global
                </Text>
              </View>
              <View style={styles.statChip}>
                <Ionicons name="heart-outline" size={14} color={colors.textMuted} />
                <Text style={styles.statChipText}>
                  {tipCount} tip{tipCount === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            <View style={styles.supportersWrap}>
              <MiniSupportersBar bids={media.bids} maxVisible={5} variant="chips" />
            </View>

            <View style={styles.actions}>
              {playable ? (
                <Pressable style={styles.playBtn} onPress={() => void onPlay()}>
                  <Ionicons name="play" size={16} color="#fff" />
                  <Text style={styles.playBtnText}>Play</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.shareBtn} onPress={() => void onShare()}>
                <Ionicons name="share-outline" size={16} color={colors.text} />
                <Text style={styles.shareBtnText}>Share</Text>
              </Pressable>
              <Pressable
                style={styles.heartBtn}
                onPress={() => openTipSheet()}
                accessibilityLabel="Send a tip">
                <Ionicons name="heart" size={20} color="#e9d5ff" />
              </Pressable>
            </View>

            {/* Related tunes */}
            {related.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Related Tunes</Text>
                  {related.some((r) => isUploadPlayable(relatedToChartItem(r))) ? (
                    <Pressable
                      style={styles.sectionPlay}
                      onPress={() => {
                        const first = related.find((r) =>
                          isUploadPlayable(relatedToChartItem(r))
                        );
                        if (first) onPlayRelated(first);
                      }}>
                      <Ionicons name="play" size={14} color="#fff" />
                      <Text style={styles.sectionPlayText}>Play</Text>
                    </Pressable>
                  ) : null}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.relatedRow}>
                  {related.map((item, index) => {
                    const chart = relatedToChartItem(item);
                    const idKey = mediaId(chart) || String(index);
                    return (
                      <Pressable
                        key={idKey}
                        style={styles.relatedCard}
                        onPress={() => {
                          const tid = mediaId(chart);
                          if (tid) router.push(`/tune/${tid}`);
                        }}>
                        <Image
                          source={{
                            uri: item.coverArt || DEFAULT_COVER_ART,
                          }}
                          style={styles.relatedCover}
                        />
                        <Text style={styles.relatedTitle} numberOfLines={2}>
                          {item.title || 'Untitled'}
                        </Text>
                        <Text style={styles.relatedArtist} numberOfLines={1}>
                          {item.artist || 'Unknown'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* About */}
            {aboutFields.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>About this tune</Text>
                  {aboutFields.length > 4 ? (
                    <Pressable onPress={() => setShowAboutMore((v) => !v)}>
                      <Text style={styles.showMore}>
                        {showAboutMore ? 'Show less' : 'Show all'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.aboutCard}>
                  {visibleAbout.map((field) => (
                    <View key={field.label} style={styles.aboutRow}>
                      <Text style={styles.aboutLabel}>{field.label}</Text>
                      {field.label === 'Added by' && media.addedBy ? (
                        <Pressable
                          onPress={() => {
                            const target =
                              media.addedBy?.uuid || media.addedBy?._id;
                            if (target) router.push(`/user/${target}`);
                          }}>
                          <Text style={[styles.aboutValue, styles.link]}>
                            {field.value}
                          </Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.aboutValue}>{field.value}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Support */}
            <View style={styles.supportCard}>
              <Text style={styles.supportTitle}>Support This Tune</Text>
              <Text style={styles.supportSubtitle}>
                {playable
                  ? 'Boost global ranking and support the artist'
                  : 'Tip to help get this track fully added once audio is uploaded.'}
              </Text>
              <Text style={styles.supportBalance}>
                Balance {formatPoundsFromPence(user.balance)}
              </Text>

              <View style={styles.stepperRow}>
                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => adjustSupport(-0.01)}
                  disabled={tipping}>
                  <Ionicons name="remove" size={18} color="#fff" />
                </Pressable>
                <Text style={styles.stepperValue}>
                  £{supportAmount.toFixed(2)}
                </Text>
                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => adjustSupport(0.01)}
                  disabled={tipping}>
                  <Ionicons name="add" size={18} color="#fff" />
                </Pressable>
                <Pressable
                  style={[styles.supportTipBtn, tipping && styles.disabled]}
                  onPress={() => void onSupportTip()}
                  disabled={tipping}>
                  {tipping ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.supportTipText}>Tip</Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.chipRow}>
                {tipChips.map((chip) => {
                  const disabled = chip.kind === 'champion' && chip.disabled;
                  const label =
                    chip.kind === 'champion' && chip.disabled
                      ? chip.label
                      : chip.kind === 'champion' && chip.displayValue != null
                        ? `${chip.label} £${chip.displayValue.toFixed(2)}`
                        : `${chip.label} £${chip.value.toFixed(2)}`;
                  return (
                    <Pressable
                      key={chip.label}
                      disabled={disabled || tipping}
                      onPress={() => {
                        setSupportAmount(roundPounds(chip.value));
                        openTipSheet(chip.value);
                      }}
                      style={[
                        styles.tipChip,
                        chip.kind === 'champion' && styles.tipChipChampion,
                        disabled && styles.tipChipDisabled,
                      ]}>
                      <Text
                        style={[
                          styles.tipChipText,
                          chip.kind === 'champion' && styles.tipChipChampionText,
                        ]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {supportError ? (
                <Text style={styles.supportError}>{supportError}</Text>
              ) : null}
            </View>
          </ScrollView>

          <TipSheet
            visible={tipOpen}
            title={media.title || 'Untitled'}
            subtitle={artist}
            balancePence={user.balance ?? 0}
            defaultTipPounds={defaultTip}
            initialAmountPounds={tipInitial}
            onClose={() => {
              setTipOpen(false);
              setTipInitial(null);
            }}
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
    marginBottom: 4,
  },
  back: { marginLeft: -2 },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  centered: {
    paddingHorizontal: 24,
    marginTop: 48,
    alignItems: 'center',
  },
  coverWrap: {
    width: 220,
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: colors.card,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  coverPlay: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  awaitingBox: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  awaitingTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    marginTop: 6,
  },
  awaitingHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  uploadOverlayBtn: {
    marginTop: 10,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  uploadOverlayText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  artist: {
    marginTop: 6,
    color: '#c4b5fd',
    fontSize: 17,
    textAlign: 'center',
  },
  metaLine: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  tag: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    color: '#e9d5ff',
    fontSize: 12,
    fontWeight: '600',
  },
  statChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  supportersWrap: {
    width: '100%',
    marginTop: 12,
    alignItems: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 16,
    width: '100%',
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
    fontSize: 14,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  shareBtnText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  heartBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  section: {
    width: '100%',
    marginTop: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionPlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sectionPlayText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  relatedRow: {
    gap: 10,
    paddingRight: 8,
  },
  relatedCard: {
    width: 120,
  },
  relatedCover: {
    width: 120,
    height: 120,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  relatedTitle: {
    marginTop: 6,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  relatedArtist: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
  },
  showMore: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
  },
  aboutCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  aboutRow: {
    gap: 2,
  },
  aboutLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  aboutValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  link: {
    color: colors.accentLight,
  },
  supportCard: {
    width: '100%',
    marginTop: 28,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(126, 34, 206, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  supportTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  supportSubtitle: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  supportBalance: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 0,
  },
  stepperBtn: {
    width: 40,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(55,65,81,0.95)',
  },
  stepperValue: {
    minWidth: 84,
    textAlign: 'center',
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    backgroundColor: 'rgba(31,41,55,0.95)',
    paddingVertical: 10,
  },
  supportTipBtn: {
    marginLeft: 12,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
    minWidth: 72,
    alignItems: 'center',
  },
  supportTipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  disabled: { opacity: 0.6 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  tipChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  tipChipChampion: {
    borderColor: 'rgba(251, 191, 36, 0.5)',
    backgroundColor: 'rgba(120, 53, 15, 0.35)',
  },
  tipChipDisabled: {
    opacity: 0.55,
  },
  tipChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  tipChipChampionText: {
    color: '#fde68a',
  },
  supportError: {
    marginTop: 10,
    color: '#fca5a5',
    textAlign: 'center',
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
