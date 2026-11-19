import { useCallback, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { mediaAPI } from '@/src/api/media';
import { userAPI } from '@/src/api/user';
import { ArtworkLoader } from '@/src/components/ArtworkCube';
import { TagChip } from '@/src/components/TagChip';
import { TipSheet } from '@/src/components/TipSheet';
import { isUploadPlayable, mediaId } from '@/src/lib/media';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';
import { promoteCoverArt, RememberCover } from '@/src/lib/coverMemory';
import type { HomeListenQueueItem } from '@/src/types/homeQueue';
import type { User } from '@/src/types/user';

type FilterKey = 'unheard' | 'heard';

const TAG_GAP = 4;
const MORE_CHIP_WIDTH = 32;

function chipWidth(tag: string): number {
  return 16 + (tag.length + 1) * 6.6;
}

function tagsThatFit(tags: string[], width: number): { shown: string[]; hidden: number } {
  const clean = tags.filter((tag) => tag.trim());
  if (clean.length === 0) return { shown: [], hidden: 0 };
  if (width <= 0) return { shown: clean.slice(0, 1), hidden: Math.max(0, clean.length - 1) };

  let used = 0;
  const shown: string[] = [];
  for (let index = 0; index < clean.length; index += 1) {
    const remainingAfter = clean.length - shown.length - 1;
    const reserve = remainingAfter > 0 ? TAG_GAP + MORE_CHIP_WIDTH : 0;
    const gap = shown.length ? TAG_GAP : 0;
    const next = chipWidth(clean[index]);
    if (shown.length > 0 && used + gap + next + reserve > width) break;
    used += gap + Math.min(next, width);
    shown.push(clean[index]);
  }
  return { shown, hidden: clean.length - shown.length };
}

function QueueTags({ tags }: { tags?: string[] }) {
  const [width, setWidth] = useState(0);
  const { shown, hidden } = tagsThatFit(tags || [], width);
  if (shown.length === 0) return null;
  return (
    <View
      style={styles.tagRow}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setWidth((current) => (Math.abs(current - next) < 1 ? current : next));
      }}>
      {shown.map((tag) => (
        <TagChip key={tag} tag={tag} style={styles.tagChip} textStyle={styles.tagText} />
      ))}
      {hidden > 0 ? (
        <View style={styles.moreChip}>
          <Text style={styles.moreChipText}>+{hidden}</Text>
        </View>
      ) : null}
    </View>
  );
}

type Props = {
  revision: number;
  user: User | null;
  onBalanceUpdate?: (balancePence: number) => void;
};

function toChartItem(item: HomeListenQueueItem): ChartMediaItem {
  return {
    _id: item.mediaId,
    uuid: item.mediaUuid,
    title: item.title,
    artist: item.artist,
    coverArt: item.coverArt || undefined,
    duration: item.duration || undefined,
    tags: item.tags,
    sources: item.sources,
    contentForm: item.contentForm,
    rightsStatus: item.rightsStatus,
    rightsCleared: item.rightsCleared,
    isPlayable: item.isPlayable,
    hasHostedAudio: item.hasHostedAudio,
    playabilityBlockReason: item.playabilityBlockReason,
    sourceType: 'user_queue',
  };
}

export function HomeListenQueue({
  revision,
  user,
  onBalanceUpdate,
}: Props) {
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);
  const [filter, setFilter] = useState<FilterKey>('unheard');
  const [unheard, setUnheard] = useState<HomeListenQueueItem[]>([]);
  const [heard, setHeard] = useState<HomeListenQueueItem[]>([]);
  const [counts, setCounts] = useState({ unheard: 0, heard: 0, tipped: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<HomeListenQueueItem | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await userAPI.getHomeListenQueue();
      setUnheard(data.unheard || []);
      setHeard(data.heard || []);
      setCounts(data.counts || { unheard: 0, heard: 0, tipped: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load your queue';
      showToast(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load, revision])
  );

  const activeItems = filter === 'heard' ? heard : unheard;

  const playItems = (items: HomeListenQueueItem[], start: HomeListenQueueItem) => {
    const chartItems = items.map(toChartItem);
    const playable = chartItems.filter(isUploadPlayable);
    const startId = start.mediaUuid || start.mediaId;
    const index = playable.findIndex((item) => mediaId(item) === startId || mediaId(item) === start.mediaId);
    if (index < 0) {
      showToast('This tune is not playable yet.');
      return;
    }
    void setQueueAndPlay(playable, index);
  };

  const removeQueued = async (item: HomeListenQueueItem) => {
    setBusyId(item.mediaId);
    try {
      await userAPI.removeFromPlaybackQueue(item.mediaUuid || item.mediaId);
      showToast(`Removed ${item.title} from your queue`);
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to remove from your queue');
    } finally {
      setBusyId(null);
    }
  };

  const confirmTip = async (amountPounds: number, tags: string[]) => {
    if (!tipTarget) return;
    const res = await mediaAPI.placeGlobalBid(tipTarget.mediaUuid || tipTarget.mediaId, amountPounds, { tags });
    if (typeof res.updatedBalance === 'number') onBalanceUpdate?.(res.updatedBalance);
    await load();
    return res;
  };

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'unheard', label: 'New', count: counts.unheard },
    { key: 'heard', label: 'Heard', count: counts.heard },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Your queue</Text>
      <View style={styles.filters}>
        {filters.map((entry) => {
          const selected = filter === entry.key;
          return (
            <Pressable
              key={entry.key}
              style={[styles.filter, selected && styles.filterOn]}
              onPress={() => setFilter(entry.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}>
              <Text style={[styles.filterText, selected && styles.filterTextOn]}>{entry.label}</Text>
              <Text style={[styles.filterCount, selected && styles.filterTextOn]}>{entry.count}</Text>
            </Pressable>
          );
        })}
      </View>

      {activeItems.length > 0 ? (
        <Pressable style={styles.playAll} onPress={() => playItems(activeItems, activeItems[0])}>
          <Ionicons name="play" size={14} color="#fff" />
          <Text style={styles.playAllText}>Play</Text>
        </Pressable>
      ) : null}

      {loading && activeItems.length === 0 ? (
        <ArtworkLoader size="section" style={styles.loader} />
      ) : activeItems.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {filter === 'unheard' ? 'Nothing new' : 'Nothing heard yet'}
          </Text>
          <Text style={styles.emptyBody}>
            {filter === 'unheard'
              ? 'Add a tune from Rising this week or search. A tip or a play moves it on.'
              : 'A tune moves here after you listen for 30 seconds, or half the track.'}
          </Text>
          {filter === 'unheard' ? (
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/music-search')}>
              <Text style={styles.emptyBtnText}>Search tunes</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.list}>
          {activeItems.map((item) => (
            <View key={item.mediaId} style={styles.row}>
              <RememberCover uri={item.coverArt} />
              <Pressable
                onPress={() => {
                  promoteCoverArt(item.coverArt);
                  router.push(`/tune/${item.mediaUuid || item.mediaId}`);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}>
                <Image source={{ uri: item.coverArt || DEFAULT_COVER_ART }} style={styles.cover} />
              </Pressable>
              <View style={styles.meta}>
                <Text style={styles.track} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
                <QueueTags tags={item.tags} />
              </View>
              <Pressable
                style={styles.iconBtn}
                onPress={() => playItems(activeItems, item)}
                accessibilityLabel={`Play ${item.title}`}>
                <Ionicons name="play" size={16} color="#fff" />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => setTipTarget(item)}
                accessibilityLabel={item.tipped ? `You tipped ${item.title}. Send another tip` : `Tip ${item.title}`}>
                <Ionicons
                  name="heart"
                  size={16}
                  color={item.tipped ? colors.tipHeartTipped : colors.tipHeart}
                />
              </Pressable>
              {item.queued ? (
                <Pressable
                  style={styles.iconBtn}
                  disabled={busyId === item.mediaId}
                  onPress={() => void removeQueued(item)}
                  accessibilityLabel={`Remove ${item.title} from your queue`}>
                  <Ionicons name="close" size={16} color={colors.text} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Untitled'}
        subtitle={tipTarget?.artist}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 1}
        tipMedia={
          tipTarget
            ? {
                tags: tipTarget.tags,
                viewerAggregatePence: tipTarget.userBidTotal || 0,
              }
            : null
        }
        onClose={() => setTipTarget(null)}
        onConfirm={confirmTip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  filters: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  filter: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 9,
    paddingVertical: 8,
  },
  filterOn: {
    backgroundColor: colors.accent,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  filterTextOn: {
    color: '#fff',
  },
  filterCount: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  playAll: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  playAllText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  loader: {
    marginVertical: 24,
  },
  empty: {
    paddingVertical: 16,
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  track: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  artist: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  tagRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: TAG_GAP,
    overflow: 'hidden',
  },
  tagChip: {
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 11,
  },
  moreChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  moreChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
