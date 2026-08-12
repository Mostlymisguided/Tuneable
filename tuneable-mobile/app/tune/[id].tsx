import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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
  type Href,
} from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { MiniSupportersBar } from '@/src/components/MiniSupportersBar';
import { TipSheet } from '@/src/components/TipSheet';
import { ClaimSheet } from '@/src/components/ClaimSheet';
import { mediaAPI } from '@/src/api/media';
import { useAuth } from '@/src/auth/AuthContext';
import { formatDuration, formatPoundsFromPence } from '@/src/lib/format';
import { getPlaceProfileHref } from '@/src/lib/location';
import { getTagProfileHref } from '@/src/lib/tagNormalizer';
import {
  formatArtist,
  getPlayabilityBlockReason,
  isRightsPendingClaimable,
  isUploadPlayable,
  mediaId,
} from '@/src/lib/media';
import { getListenElsewhereTarget } from '@/src/lib/listenElsewhere';
import {
  buildTipStatChips,
  resolveTipStatInputs,
} from '@/src/lib/tipStats';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { colors } from '@/src/theme/colors';
import {
  DEFAULT_COVER_ART,
  type ChartMediaItem,
  type MediaLocationRanking,
  type MediaTagRanking,
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
  const [tagRankings, setTagRankings] = useState<MediaTagRanking[]>([]);
  const [locationRankings, setLocationRankings] = useState<MediaLocationRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipInitial, setTipInitial] = useState<number | null>(null);
  const [supportAmount, setSupportAmount] = useState(1.11);
  const [showAboutMore, setShowAboutMore] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [profileRes, relatedRes, tagRes, locationRes] = await Promise.all([
          mediaAPI.getProfile(id),
          mediaAPI
            .getRelatedPlaylists(id, { relatedLimit: 8, fansLimit: 0 })
            .catch(() => ({ relatedMedia: [] as RelatedMediaItem[] })),
          mediaAPI.getTagRankings(id).catch(() => ({ tagRankings: [] as MediaTagRanking[] })),
          mediaAPI
            .getLocationRankings(id, 3)
            .catch(() => ({ locationRankings: [] as MediaLocationRanking[] })),
        ]);
        setMedia(profileRes.media ?? null);
        setRelated(relatedRes.relatedMedia ?? []);
        setTagRankings(tagRes.tagRankings ?? []);
        setLocationRankings(locationRes.locationRankings ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tune');
        setMedia(null);
        setTagRankings([]);
        setLocationRankings([]);
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
  const blockReason = getPlayabilityBlockReason(media);
  const rightsBlocked = blockReason === 'rights';
  const disputed = blockReason === 'disputed';
  const showClaimCta = Boolean(media && isRightsPendingClaimable(media));
  const listenElsewhere = media ? getListenElsewhereTarget(media) : null;
  const artist =
    media?.creatorDisplay ||
    (media ? formatArtist(media.artist) : 'Unknown artist');
  const tipTotal = media?.globalMediaAggregate ?? 0;
  const tipCount = media?.tipCount ?? media?.bids?.length ?? 0;
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

  const tipStats = useMemo(
    () => resolveTipStatInputs(media, user),
    [media, user]
  );

  const tipChips = useMemo(
    () =>
      buildTipStatChips({
        minTip: MIN_TIP,
        avgTip: tipStats.avgTip,
        championAggregate: tipStats.championAggregate,
        viewerAggregate: tipStats.viewerAggregate,
        viewerIsChampion: tipStats.viewerIsChampion,
      }),
    [tipStats]
  );

  const topTagRankings = useMemo(() => tagRankings.slice(0, 3), [tagRankings]);
  const topLocationRankings = useMemo(
    () => locationRankings.slice(0, 3),
    [locationRankings]
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

  const onListenElsewhere = () => {
    if (!listenElsewhere) return;
    void Linking.openURL(listenElsewhere.url);
  };

  const onPlayRelated = (item: RelatedMediaItem) => {
    const queue = related.map(relatedToChartItem);
    const chart = relatedToChartItem(item);
    const index = queue.findIndex((m) => mediaId(m) === mediaId(chart));
    if (index < 0) return;
    void setQueueAndPlay(queue, index);
  };

  const placeTip = async (amountPounds: number, tags: string[] = []) => {
    if (!media) return;
    const mid = mediaId(media);
    if (!mid) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(mid, amountPounds, { tags });
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

  const onConfirmTip = async (amountPounds: number, tags: string[]) => {
    await placeTip(amountPounds, tags);
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
                    <Ionicons
                      name="ribbon-outline"
                      size={28}
                      color="#fbbf24"
                    />
                    <Text style={styles.awaitingTitle}>
                      {disputed ? 'Rights disputed' : 'Awaiting Rights'}
                    </Text>
                    <Text style={styles.awaitingHint}>
                      {disputed
                        ? 'Playback is paused while ownership is resolved'
                        : rightsBlocked
                          ? 'Claim ownership to receive tips held in escrow'
                          : 'Claim this media and upload audio if you are the rights holder'}
                    </Text>
                    <View style={styles.awaitingActions}>
                      {!disputed ? (
                        <Pressable
                          style={styles.claimOverlayBtn}
                          onPress={() => setClaimOpen(true)}>
                          <Text style={styles.claimOverlayText}>Claim media</Text>
                        </Pressable>
                      ) : null}
                      {listenElsewhere ? (
                        <Pressable
                          style={styles.listenElsewhereOverlayBtn}
                          onPress={onListenElsewhere}>
                          <Ionicons
                            name="open-outline"
                            size={14}
                            color="#fff"
                          />
                          <Text style={styles.listenElsewhereOverlayText}>
                            {listenElsewhere.label}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                )}
              </View>
            </Pressable>

            <Text style={styles.title}>{media.title || 'Untitled'}</Text>
            <Text style={styles.artist}>{artist}</Text>

            {heroMetadata.length > 0 ? (
              <Text style={styles.metaLine}>{heroMetadata.join(' · ')}</Text>
            ) : null}

            {(topTagRankings.length > 0 || topLocationRankings.length > 0) ? (
              <View style={styles.rankingBlock}>
                {topTagRankings.length > 0 ? (
                  <View style={styles.rankingRow}>
                    {topTagRankings.map((ranking) => (
                      <Pressable
                        key={`tag-${ranking.tag}-${ranking.rank}`}
                        onPress={() =>
                          router.push(getTagProfileHref(ranking.tag) as Href)
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
            ) : media.tags && media.tags.length > 0 ? (
              <View style={styles.tags}>
                {media.tags.slice(0, 8).map((tag) => (
                  <Pressable
                    key={tag}
                    onPress={() => router.push(getTagProfileHref(tag) as Href)}
                    style={styles.tag}>
                    <Text style={styles.tagText}>#{tag}</Text>
                  </Pressable>
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
              {listenElsewhere ? (
                <Pressable
                  style={styles.listenElsewhereBtn}
                  onPress={onListenElsewhere}>
                  <Ionicons name="open-outline" size={16} color={colors.text} />
                  <Text style={styles.listenElsewhereBtnText}>
                    {listenElsewhere.label}
                  </Text>
                </Pressable>
              ) : null}
              {showClaimCta ? (
                <Pressable
                  style={styles.claimBtn}
                  onPress={() => setClaimOpen(true)}>
                  <Ionicons name="ribbon-outline" size={16} color="#fff" />
                  <Text style={styles.claimBtnText}>Claim</Text>
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
                  onPress={() => adjustSupport(-0.01)}>
                  <Ionicons name="remove" size={18} color="#fff" />
                </Pressable>
                <Text style={styles.stepperValue}>
                  £{supportAmount.toFixed(2)}
                </Text>
                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => adjustSupport(0.01)}>
                  <Ionicons name="add" size={18} color="#fff" />
                </Pressable>
                <Pressable
                  style={styles.supportTipBtn}
                  onPress={() => openTipSheet(supportAmount)}
                  accessibilityLabel={`Confirm tip of £${supportAmount.toFixed(2)}`}>
                  <Ionicons name="heart" size={16} color="#fff" />
                  <Text style={styles.supportTipText}>
                    £{supportAmount.toFixed(2)}
                  </Text>
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
                      disabled={disabled}
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
            </View>
          </ScrollView>

          <TipSheet
            visible={tipOpen}
            title={media.title || 'Untitled'}
            subtitle={artist}
            balancePence={user.balance ?? 0}
            defaultTipPounds={defaultTip}
            initialAmountPounds={tipInitial}
            tipMedia={media}
            onClose={() => {
              setTipOpen(false);
              setTipInitial(null);
            }}
            onConfirm={onConfirmTip}
          />
          <ClaimSheet
            visible={claimOpen}
            mediaId={mediaId(media) || id || ''}
            mediaTitle={media.title || 'Untitled'}
            onClose={() => setClaimOpen(false)}
            onSubmitted={() => {
              Alert.alert(
                'Claim submitted',
                "We'll notify you when it's reviewed. Approved claims receive tips held in escrow."
              );
            }}
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
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  awaitingActions: {
    marginTop: 10,
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
  listenElsewhereOverlayBtn: {
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
  listenElsewhereOverlayText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  claimBtnText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 14,
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
    flexWrap: 'wrap',
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
  listenElsewhereBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  listenElsewhereBtnText: {
    color: colors.text,
    fontWeight: '600',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#9333ea',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.55)',
    paddingHorizontal: 16,
    paddingVertical: 11,
    minWidth: 88,
  },
  supportTipText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
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
