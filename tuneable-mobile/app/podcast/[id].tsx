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
  type Href,
} from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { MiniSupportersBar } from '@/src/components/MiniSupportersBar';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { podcastsAPI } from '@/src/api/podcasts';
import { useAuth } from '@/src/auth/AuthContext';
import { formatDuration, formatPoundsFromPence } from '@/src/lib/format';
import { getPlaceProfileHref } from '@/src/lib/location';
import {
  episodeId,
  getEpisodeDisplayTags,
  isEpisodePlayable,
  mediaToPodcastEpisode,
  seriesTitle,
} from '@/src/lib/podcast';
import { mediaId } from '@/src/lib/media';
import { getTagProfileHref } from '@/src/lib/tagNormalizer';
import {
  buildTipStatChips,
  resolveTipStatInputs,
} from '@/src/lib/tipStats';
import { usePodcastPlayerStore } from '@/src/stores/podcastPlayerStore';
import { colors } from '@/src/theme/colors';
import type {
  ChartMediaItem,
  MediaLocationRanking,
  MediaTagRanking,
} from '@/src/types/media';
import {
  DEFAULT_PODCAST_COVER,
  type PodcastEpisode,
} from '@/src/types/podcast';

const MIN_TIP = 0.01;

function roundPounds(n: number): number {
  return Math.round(n * 100) / 100;
}

function seriesIdFromMedia(media: ChartMediaItem | null): string | null {
  if (!media?.podcastSeries) return null;
  if (typeof media.podcastSeries === 'string') return media.podcastSeries;
  return media.podcastSeries._id || null;
}

export default function PodcastEpisodeProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, updateBalance } = useAuth();
  const [media, setMedia] = useState<ChartMediaItem | null>(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState<PodcastEpisode[]>([]);
  const [tagRankings, setTagRankings] = useState<MediaTagRanking[]>([]);
  const [locationRankings, setLocationRankings] = useState<
    MediaLocationRanking[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipInitial, setTipInitial] = useState<number | null>(null);
  const [supportAmount, setSupportAmount] = useState(1.11);
  const [tipping, setTipping] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [showAboutMore, setShowAboutMore] = useState(false);
  const setQueueAndPlay = usePodcastPlayerStore((s) => s.setQueueAndPlay);

  const loadSeriesEpisodes = useCallback(
    async (episodeMedia: ChartMediaItem | null) => {
      const seriesId = seriesIdFromMedia(episodeMedia);
      if (!seriesId) {
        setSeriesEpisodes([]);
        return;
      }
      try {
        const data = await podcastsAPI.getSeries(seriesId, {
          autoImport: false,
          limit: 12,
        });
        const currentId = mediaId(episodeMedia || {}) || id || '';
        const episodes = (data.episodes || [])
          .filter((ep) => episodeId(ep) !== currentId)
          .slice(0, 12);
        setSeriesEpisodes(episodes);
      } catch {
        setSeriesEpisodes([]);
      }
    },
    [id]
  );

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [profileRes, tagRes, locationRes] = await Promise.all([
          mediaAPI.getProfile(id),
          mediaAPI
            .getTagRankings(id)
            .catch(() => ({ tagRankings: [] as MediaTagRanking[] })),
          mediaAPI
            .getLocationRankings(id, 3)
            .catch(() => ({ locationRankings: [] as MediaLocationRanking[] })),
        ]);
        const nextMedia = profileRes.media ?? null;
        setMedia(nextMedia);
        setTagRankings(tagRes.tagRankings ?? []);
        setLocationRankings(locationRes.locationRankings ?? []);
        await loadSeriesEpisodes(nextMedia);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load episode'
        );
        setMedia(null);
        setTagRankings([]);
        setLocationRankings([]);
        setSeriesEpisodes([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, loadSeriesEpisodes]
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

  const episode = useMemo(
    () => (media ? mediaToPodcastEpisode(media) : null),
    [media]
  );
  const playable = isEpisodePlayable(episode);
  const seriesName = episode ? seriesTitle(episode) : 'Podcast';
  const tipTotal = media?.globalMediaAggregate ?? 0;
  const tipCount = media?.tipCount ?? media?.bids?.length ?? 0;
  const durationLabel = formatDuration(media?.duration);
  const coverUri =
    media?.coverArt ||
    (typeof media?.podcastSeries === 'object'
      ? media.podcastSeries?.coverArt
      : undefined) ||
    DEFAULT_PODCAST_COVER;

  const heroMetadata = useMemo(() => {
    if (!media) return [] as string[];
    const dateLabel = media.releaseDate
      ? new Date(media.releaseDate).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : media.releaseYear
        ? String(media.releaseYear)
        : null;
    return [dateLabel, durationLabel || null, media.category || null].filter(
      (part): part is string => Boolean(part)
    );
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
  const fallbackTags = useMemo(
    () => (episode ? getEpisodeDisplayTags(episode).slice(0, 8) : []),
    [episode]
  );

  const aboutFields = useMemo(() => {
    if (!media) return [] as Array<{ label: string; value: string }>;
    const fields: Array<{ label: string; value: string }> = [];
    if (seriesName) fields.push({ label: 'Series', value: seriesName });
    if (media.category) fields.push({ label: 'Category', value: media.category });
    if (media.releaseDate || media.releaseYear) {
      fields.push({
        label: 'Released',
        value: media.releaseDate
          ? new Date(media.releaseDate).toLocaleDateString()
          : String(media.releaseYear),
      });
    }
    if (durationLabel) fields.push({ label: 'Duration', value: durationLabel });
    if (media.addedBy?.username) {
      fields.push({ label: 'Added by', value: `@${media.addedBy.username}` });
    }
    if (media.description?.trim()) {
      fields.push({ label: 'Description', value: media.description.trim() });
    }
    return fields;
  }, [media, seriesName, durationLabel]);

  const visibleAbout = showAboutMore ? aboutFields : aboutFields.slice(0, 4);

  const playQueue = useMemo(() => {
    if (!episode) return [] as PodcastEpisode[];
    return [episode, ...seriesEpisodes.filter(isEpisodePlayable)];
  }, [episode, seriesEpisodes]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  const onPlay = async () => {
    if (!episode || !playable) return;
    await setQueueAndPlay(playQueue, 0);
  };

  const onPlaySeriesEpisode = (item: PodcastEpisode) => {
    if (!isEpisodePlayable(item)) {
      const tid = episodeId(item);
      if (tid) router.push(`/podcast/${tid}`);
      return;
    }
    const queue = [
      item,
      ...playQueue.filter((ep) => episodeId(ep) !== episodeId(item)),
    ];
    void setQueueAndPlay(queue, 0);
  };

  const placeTip = async (amountPounds: number, tags: string[] = []) => {
    if (!media) return;
    const mid = mediaId(media);
    if (!mid) throw new Error('Missing episode id');
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
            tipCount: (prev.tipCount ?? prev.bids?.length ?? 0) + 1,
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
    return res;
  };

  const onConfirmTip = async (amountPounds: number, tags: string[]) => {
    return placeTip(amountPounds, tags);
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
    const url = `https://tuneable.stream/podcasts/${mid}`;
    try {
      await Share.share({
        message: `${media.title || 'Episode'} — ${seriesName}\n${url}`,
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
      ) : media && episode ? (
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
            <Pressable
              style={styles.coverWrap}
              onPress={() => {
                if (playable) void onPlay();
              }}>
              <Image source={{ uri: coverUri }} style={styles.cover} />
              <View style={styles.coverOverlay}>
                {playable ? (
                  <View style={styles.coverPlay}>
                    <Ionicons name="play" size={28} color="#fff" />
                  </View>
                ) : (
                  <View style={styles.awaitingBox}>
                    <Ionicons
                      name="headset-outline"
                      size={28}
                      color="#fbbf24"
                    />
                    <Text style={styles.awaitingTitle}>No audio yet</Text>
                    <Text style={styles.awaitingHint}>
                      Tip to support this episode
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>

            <Text style={styles.title}>{media.title || 'Untitled episode'}</Text>
            <Text style={styles.series}>{seriesName}</Text>

            {heroMetadata.length > 0 ? (
              <Text style={styles.metaLine}>{heroMetadata.join(' · ')}</Text>
            ) : null}

            {topTagRankings.length > 0 || topLocationRankings.length > 0 ? (
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
            ) : fallbackTags.length > 0 ? (
              <View style={styles.tags}>
                {fallbackTags.map((tag) => (
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
              <Pressable style={styles.shareBtn} onPress={() => void onShare()}>
                <Ionicons name="share-outline" size={16} color={colors.text} />
                <Text style={styles.shareBtnText}>Share</Text>
              </Pressable>
              <Pressable
                style={styles.heartBtn}
                onPress={() => openTipSheet()}
                accessibilityLabel="Send a tip">
                <Ionicons name="heart" size={20} color={colors.tipHeart} />
              </Pressable>
            </View>

            {seriesEpisodes.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>More from this series</Text>
                  {seriesEpisodes.some(isEpisodePlayable) ? (
                    <Pressable
                      style={styles.sectionPlay}
                      onPress={() => {
                        const first = seriesEpisodes.find(isEpisodePlayable);
                        if (first) onPlaySeriesEpisode(first);
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
                  {seriesEpisodes.map((item, index) => {
                    const idKey = episodeId(item) || String(index);
                    return (
                      <Pressable
                        key={idKey}
                        style={styles.relatedCard}
                        onPress={() => {
                          const tid = episodeId(item);
                          if (tid) router.push(`/podcast/${tid}`);
                        }}>
                        <Image
                          source={{
                            uri:
                              item.coverArt ||
                              item.podcastSeries?.coverArt ||
                              DEFAULT_PODCAST_COVER,
                          }}
                          style={styles.relatedCover}
                        />
                        <Text style={styles.relatedTitle} numberOfLines={2}>
                          {item.title || 'Untitled'}
                        </Text>
                        <Text style={styles.relatedArtist} numberOfLines={1}>
                          {seriesTitle(item)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {aboutFields.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>About this episode</Text>
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

            <View style={styles.supportCard}>
              <Text style={styles.supportTitle}>Support This Episode</Text>
              <Text style={styles.supportSubtitle}>
                Boost ranking and support the show
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
            title={media.title || 'Episode'}
            subtitle={seriesName}
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
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  series: {
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
    backgroundColor: colors.tipHeartBg,
    borderWidth: 1,
    borderColor: colors.tipHeartBorder,
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
