import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { tagAPI, type TagPlaceChip } from '@/src/api/tags';
import { mediaAPI } from '@/src/api/media';
import { ChartTrackRow } from '@/src/components/ChartTrackRow';
import { Screen } from '@/src/components/Screen';
import { TipSheet } from '@/src/components/TipSheet';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence } from '@/src/lib/format';
import { getPlaceProfileHref } from '@/src/lib/location';
import { formatArtist, isUploadPlayable, mediaId } from '@/src/lib/media';
import { getTagProfileHref, tagsMatch } from '@/src/lib/tagNormalizer';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { colors } from '@/src/theme/colors';
import {
  DEFAULT_COVER_ART,
  TIME_PERIODS,
  type ChartMediaItem,
  type TimePeriodKey,
} from '@/src/types/media';

function PlaceRow({
  label,
  places,
}: {
  label: string;
  places: TagPlaceChip[];
}) {
  if (places.length === 0) return null;
  return (
    <View style={styles.placeRow}>
      <Text style={styles.placeLabel}>{label}</Text>
      {places.map((place) => {
        const href = getPlaceProfileHref(place.placeId);
        if (!href) return null;
        return (
          <Pressable
            key={`${label}-${place.placeId}`}
            onPress={() => router.push(href as Href)}
            style={styles.placeChip}>
            <Ionicons name="location" size={12} color="#38bdf8" />
            <Text style={styles.placeChipText}>{place.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function formatTimePeriodLabel(period: TimePeriodKey): string {
  return TIME_PERIODS.find((p) => p.key === period)?.label ?? period;
}

export default function TagProfileScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = typeof slugParam === 'string' ? decodeURIComponent(slugParam) : '';
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);

  const [tagName, setTagName] = useState(slug.replace(/-/g, ' '));
  const [tagKind, setTagKind] = useState<'tag' | 'year' | 'bpm'>('tag');
  const [tipTotal, setTipTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [relatedTags, setRelatedTags] = useState<Array<{ name: string; slug: string }>>(
    []
  );
  const [topOriginPlaces, setTopOriginPlaces] = useState<TagPlaceChip[]>([]);
  const [topSupportPlaces, setTopSupportPlaces] = useState<TagPlaceChip[]>([]);
  const [media, setMedia] = useState<ChartMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<ChartMediaItem | null>(null);
  const [period, setPeriod] = useState<TimePeriodKey>('all-time');
  const [showTimePanel, setShowTimePanel] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!slug) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await tagAPI.getProfile(slug, { limit: 50, timePeriod: period });
        const name = data.tag?.name || slug.replace(/-/g, ' ');
        setTagName(name);
        setTagKind(
          data.tag?.kind ||
            (/^\d{4}$/.test(name)
              ? 'year'
              : /^\d{2,3}$/.test(name) && Number(name) >= 20 && Number(name) <= 400
                ? 'bpm'
                : 'tag')
        );
        setTipTotal(data.stats?.globalTagAggregate ?? 0);
        setTotal(data.pagination?.total ?? data.media?.length ?? 0);
        setRelatedTags(data.relatedTags || []);
        setTopOriginPlaces(data.topOriginPlaces || []);
        setTopSupportPlaces(data.topSupportPlaces || []);
        setMedia(data.media || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Tag not found or failed to load.');
        if (!isRefresh) {
          setMedia([]);
          setRelatedTags([]);
          setTopOriginPlaces([]);
          setTopSupportPlaces([]);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [slug, period]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const mosaicCovers = useMemo(
    () =>
      media.slice(0, 4).map((item, index) => ({
        id: mediaId(item) || `${item.title || 'cover'}-${index}`,
        uri: item.coverArt || DEFAULT_COVER_ART,
      })),
    [media]
  );

  const onPlayItem = (item: ChartMediaItem) => {
    const playable = media.filter(isUploadPlayable);
    const index = playable.findIndex((m) => mediaId(m) === mediaId(item));
    if (index < 0) {
      const fallback = media.findIndex((m) => mediaId(m) === mediaId(item));
      void setQueueAndPlay(media, Math.max(0, fallback));
      return;
    }
    void setQueueAndPlay(playable, index);
  };

  const onConfirmTip = async (amountPounds: number, tags: string[]) => {
    if (!tipTarget) return;
    const id = mediaId(tipTarget);
    if (!id) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds, { tags });
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    void load(true);
    return res;
  };

  const listHeader = (
    <View style={styles.hero}>
      <View style={styles.mosaicWrap}>
        {mosaicCovers.length >= 4 ? (
          <View style={styles.mosaicGrid}>
            {mosaicCovers.map((cover) => (
              <Image key={cover.id} source={{ uri: cover.uri }} style={styles.mosaicTile} />
            ))}
          </View>
        ) : mosaicCovers.length > 0 ? (
          <Image source={{ uri: mosaicCovers[0].uri }} style={styles.mosaicSingle} />
        ) : (
          <View style={[styles.mosaicSingle, styles.mosaicFallback]}>
            <Ionicons name="pricetag" size={42} color="#c084fc" />
          </View>
        )}
      </View>

      <Text style={styles.eyebrow}>
        {tagKind === 'year' ? 'Year' : tagKind === 'bpm' ? 'BPM' : 'Tag'}
      </Text>
      <Text style={styles.title}>
        {tagKind === 'bpm' ? `${tagName} BPM` : tagName}
      </Text>

      <View style={styles.statChips}>
        <View style={styles.statChip}>
          <Ionicons name="musical-notes-outline" size={14} color={colors.textMuted} />
          <Text style={styles.statChipText}>
            {loading ? '…' : `${total} ${total === 1 ? 'track' : 'tracks'}`}
          </Text>
        </View>
        {!loading && tipTotal > 0 ? (
          <View style={styles.statChip}>
            <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
            <Text style={styles.statChipText}>{formatPoundsFromPence(tipTotal)}</Text>
            <Text style={styles.statChipMuted}>
              {period === 'all-time'
                ? 'total support'
                : `${formatTimePeriodLabel(period).toLowerCase()} support`}
            </Text>
          </View>
        ) : null}
      </View>

      {!loading && relatedTags.length > 0 ? (
        <View style={styles.chipRow}>
          {relatedTags.map((related) => (
            <Pressable
              key={related.slug}
              onPress={() => router.push(getTagProfileHref(related.name) as Href)}
              style={styles.tagChip}>
              <Ionicons name="pricetag" size={12} color="#c084fc" />
              <Text style={styles.tagChipText}>{related.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!loading && (topOriginPlaces.length > 0 || topSupportPlaces.length > 0) ? (
        <View style={styles.placesBlock}>
          <PlaceRow label="From" places={topOriginPlaces} />
          <PlaceRow label="Supported in" places={topSupportPlaces} />
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Top Tunes</Text>
        <Pressable
          onPress={() => setShowTimePanel((open) => !open)}
          style={[
            styles.timeTrigger,
            (showTimePanel || period !== 'all-time') && styles.timeTriggerActive,
          ]}>
          <Ionicons name="time-outline" size={14} color={colors.accentLight} />
          <Text style={styles.timeTriggerLabel}>Time</Text>
          <Text style={styles.timeTriggerDetail} numberOfLines={1}>
            ({formatTimePeriodLabel(period)})
          </Text>
        </Pressable>
      </View>

      {showTimePanel ? (
        <View style={styles.timePanel}>
          <View style={styles.timePanelHeader}>
            <Text style={styles.timePanelTitle}>Time Period</Text>
            <Pressable onPress={() => setShowTimePanel(false)} hitSlop={8}>
              <Text style={styles.timePanelHide}>Hide</Text>
            </Pressable>
          </View>
          <View style={styles.timeChips}>
            {TIME_PERIODS.map((p) => {
              const active = period === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setPeriod(p.key)}
                  style={[styles.timeChip, active && styles.timeChipActive]}>
                  <Text
                    style={[styles.timeChipText, active && styles.timeChipTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen padForPlayer={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
      </View>

      {loading && media.length === 0 && !error ? (
        <ActivityIndicator color={colors.accentLight} style={{ marginTop: 48 }} />
      ) : error && media.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={media}
          keyExtractor={(item, index) => mediaId(item) || `tag-media-${index}`}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: Math.max(96, contentPaddingBottom + 24),
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accentLight}
            />
          }
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>
                {period === 'all-time' ? (
                  tagKind === 'bpm' ? (
                    <>
                      No tracks at <Text style={styles.emptyStrong}>{tagName} BPM</Text> yet.
                    </>
                  ) : tagKind === 'year' ? (
                    <>
                      No tracks from <Text style={styles.emptyStrong}>{tagName}</Text> yet.
                    </>
                  ) : (
                    <>
                      No tracks tagged <Text style={styles.emptyStrong}>{tagName}</Text> yet.
                    </>
                  )
                ) : (
                  <>
                    No tips for{' '}
                    <Text style={styles.emptyStrong}>
                      {tagKind === 'bpm' ? `${tagName} BPM` : tagName}
                    </Text>{' '}
                    in {formatTimePeriodLabel(period).toLowerCase()}.
                  </>
                )}
              </Text>
            ) : null
          }
          renderItem={({ item, index }) => (
            <ChartTrackRow
              rank={index + 1}
              item={{
                ...item,
                tags: (item.tags || []).filter((t) => !tagsMatch(t, tagName)),
              }}
              tipPence={item.timePeriodBidValue ?? item.globalMediaAggregate}
              variant="rich"
              onOpen={() => {
                const id = mediaId(item);
                if (id) router.push(`/tune/${id}`);
              }}
              onPlay={() => onPlayItem(item)}
              onTip={() => setTipTarget(item)}
            />
          )}
        />
      )}

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Untitled'}
        subtitle={tipTarget ? formatArtist(tipTarget.artist) : undefined}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 1.11}
        tipMedia={tipTarget}
        initialTags={tagName ? [tagName] : undefined}
        onClose={() => setTipTarget(null)}
        onConfirm={onConfirmTip}
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
    marginBottom: 4,
  },
  back: { marginLeft: -2 },
  hero: {
    marginBottom: 8,
  },
  mosaicWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  mosaicGrid: {
    width: 168,
    height: 168,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  mosaicTile: {
    width: '50%',
    height: '50%',
    backgroundColor: colors.card,
  },
  mosaicSingle: {
    width: 168,
    height: 168,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  mosaicFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
  },
  eyebrow: {
    color: '#c084fc',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  statChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  statChipMuted: {
    color: colors.textMuted,
    fontSize: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10,
  },
  tagChip: {
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
  tagChipText: {
    color: '#e9d5ff',
    fontSize: 12,
    fontWeight: '600',
  },
  placesBlock: {
    gap: 6,
    marginBottom: 14,
  },
  placeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  placeLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginRight: 2,
  },
  placeChip: {
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
  placeChipText: {
    color: '#bae6fd',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  timeTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  timeTriggerActive: {
    backgroundColor: 'rgba(55, 65, 81, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  timeTriggerLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  timeTriggerDetail: {
    color: '#c4b5fd',
    fontSize: 11,
  },
  timePanel: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  timePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  timePanelTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  timePanelHide: {
    color: colors.textMuted,
    fontSize: 13,
  },
  timeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  timeChipActive: {
    backgroundColor: '#7e22ce',
  },
  timeChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: '#fff',
  },
  centered: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 48,
    gap: 12,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
  },
  emptyStrong: {
    color: colors.text,
    fontWeight: '700',
  },
});
