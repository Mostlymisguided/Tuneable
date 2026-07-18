import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ChartFilterToolbar } from '@/src/components/ChartFilterToolbar';
import { ChartTrackRow } from '@/src/components/ChartTrackRow';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import {
  type BpmFilterRange,
  computeTopTags,
  filterChartMedia,
  hasActiveChartFilters,
} from '@/src/lib/chartFilters';
import { isUploadPlayable, mediaId } from '@/src/lib/media';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { colors } from '@/src/theme/colors';
import type { ChartMediaItem, TimePeriodKey } from '@/src/types/media';
import type { User, UserLibraryItem } from '@/src/types/user';

const LIBRARY_PAGE_SIZE = 10;

function getPeriodStart(period: TimePeriodKey): Date | null {
  if (period === 'all-time') return null;
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === 'this-week') {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function itemInPeriod(item: UserLibraryItem, period: TimePeriodKey): boolean {
  const start = getPeriodStart(period);
  if (!start) return true;
  const last = item.lastBidAt ? new Date(item.lastBidAt).getTime() : 0;
  const first = item.firstBidAt ? new Date(item.firstBidAt).getTime() : last;
  const startMs = start.getTime();
  return last >= startMs || first >= startMs;
}

function toChartMediaItem(item: UserLibraryItem): ChartMediaItem {
  return {
    _id: item.mediaId,
    uuid: item.mediaUuid,
    title: item.title,
    artist: item.artist,
    coverArt: item.coverArt ?? undefined,
    duration: item.duration ?? undefined,
    bpm: item.bpm ?? null,
    tags: item.tags ?? [],
    sources: item.sources ?? {},
    partyMediaAggregate: item.globalUserMediaAggregate ?? 0,
    globalMediaAggregate: item.globalMediaAggregate ?? 0,
    bids: (item.bids ?? []).map((bid) => ({
      amount: bid.amount,
      status: bid.status,
      createdAt: bid.createdAt,
      userId: bid.userId
        ? {
            _id: bid.userId._id,
            uuid: bid.userId.uuid,
            username: bid.userId.username,
            profilePic: bid.userId.profilePic,
          }
        : undefined,
    })),
  };
}

type Props = {
  items: UserLibraryItem[];
  user: User | null;
  onBalanceUpdate?: (newBalancePence: number) => void;
  contentPaddingBottom?: number;
  emptyLabel?: string;
};

export function UserLibrarySection({
  items,
  user,
  onBalanceUpdate,
  contentPaddingBottom = 0,
  emptyLabel = 'No tunes tipped yet.',
}: Props) {
  const [period, setPeriod] = useState<TimePeriodKey>('all-time');
  const [selectedTagTerms, setSelectedTagTerms] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [bpmFilterRange, setBpmFilterRange] = useState<BpmFilterRange>('all');
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [showTimePanel, setShowTimePanel] = useState(false);
  const [showBpmPanel, setShowBpmPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LIBRARY_PAGE_SIZE);
  const [tipTarget, setTipTarget] = useState<UserLibraryItem | null>(null);
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);

  const filterState = useMemo(
    () => ({
      selectedTagTerms,
      searchQuery,
      bpmFilterRange,
      requireAllTags: true,
    }),
    [selectedTagTerms, searchQuery, bpmFilterRange]
  );

  useEffect(() => {
    setVisibleCount(LIBRARY_PAGE_SIZE);
  }, [period, selectedTagTerms, searchQuery, bpmFilterRange, items]);

  const periodFiltered = useMemo(
    () => items.filter((item) => itemInPeriod(item, period)),
    [items, period]
  );

  const chartItems = useMemo(
    () => periodFiltered.map(toChartMediaItem),
    [periodFiltered]
  );

  const topTags = useMemo(
    () => computeTopTags(chartItems, 'all-time'),
    [chartItems]
  );

  const filtered = useMemo(() => {
    const list = filterChartMedia(chartItems, filterState);
    return [...list].sort(
      (a, b) => (b.partyMediaAggregate ?? 0) - (a.partyMediaAggregate ?? 0)
    );
  }, [chartItems, filterState]);

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const playableCount = useMemo(
    () => filtered.filter(isUploadPlayable).length,
    [filtered]
  );

  const filtersActive = hasActiveChartFilters(filterState);

  const clearClientFilters = () => {
    setSelectedTagTerms([]);
    setSearchQuery('');
    setBpmFilterRange('all');
  };

  const playItem = (item: ChartMediaItem) => {
    const playableQueue = filtered.filter(isUploadPlayable);
    const index = playableQueue.findIndex(
      (m) => mediaId(m) === mediaId(item)
    );
    if (index < 0) return;
    void setQueueAndPlay(playableQueue, index);
  };

  const onPlayQueue = () => {
    const playableQueue = filtered.filter(isUploadPlayable);
    if (playableQueue.length === 0) return;
    void setQueueAndPlay(playableQueue, 0);
  };

  const confirmTip = async (amountPounds: number) => {
    if (!tipTarget) return;
    const res = await mediaAPI.placeGlobalBid(tipTarget.mediaId, amountPounds);
    if (typeof res.updatedBalance === 'number') {
      onBalanceUpdate?.(res.updatedBalance);
    }
  };

  const findLibraryItem = (item: ChartMediaItem): UserLibraryItem | undefined => {
    const id = mediaId(item);
    return periodFiltered.find(
      (entry) => entry.mediaId === id || entry.mediaUuid === id
    );
  };

  const hasMore = visibleCount < filtered.length;
  const emptyMessage = filtersActive
    ? 'No tunes match these filters.'
    : emptyLabel;

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <Text style={styles.subtitle}>
          {items.length} tune{items.length === 1 ? '' : 's'} tipped
        </Text>
      </View>

      <ChartFilterToolbar
        period={period}
        onPeriodChange={setPeriod}
        selectedTagTerms={selectedTagTerms}
        onTagTermsChange={setSelectedTagTerms}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        bpmFilterRange={bpmFilterRange}
        onBpmFilterChange={setBpmFilterRange}
        topTags={topTags}
        showTagPanel={showTagPanel}
        showTimePanel={showTimePanel}
        showBpmPanel={showBpmPanel}
        showSearchPanel={showSearchPanel}
        onToggleTagPanel={() => setShowTagPanel((open) => !open)}
        onToggleTimePanel={() => setShowTimePanel((open) => !open)}
        onToggleBpmPanel={() => setShowBpmPanel((open) => !open)}
        onToggleSearchPanel={() => setShowSearchPanel((open) => !open)}
        onClearFilters={clearClientFilters}
        hasActiveFilters={filtersActive}
      />

      {playableCount > 0 ? (
        <Pressable
          style={styles.playBtn}
          onPress={onPlayQueue}
          accessibilityRole="button"
          accessibilityLabel={`Play ${playableCount} upload${playableCount !== 1 ? 's' : ''}`}>
          <Ionicons name="play" size={22} color="#fff" />
        </Pressable>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(item, index) => mediaId(item) || String(index)}
        scrollEnabled={false}
        contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
        ListEmptyComponent={<Text style={styles.empty}>{emptyMessage}</Text>}
        ListFooterComponent={
          hasMore ? (
            <Pressable
              style={styles.showMoreBtn}
              onPress={() => setVisibleCount((n) => n + LIBRARY_PAGE_SIZE)}>
              <Text style={styles.showMoreText}>
                Show more ({filtered.length - visibleCount} remaining)
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ChartTrackRow
            rank={index + 1}
            item={item}
            variant="rich"
            hideCatalogHint
            tipPence={item.partyMediaAggregate ?? 0}
            onOpen={() => {
              const id = mediaId(item);
              if (id) router.push(`/tune/${id}`);
            }}
            onPlay={() => playItem(item)}
            onTip={() => {
              const lib = findLibraryItem(item);
              if (lib) setTipTarget(lib);
            }}
          />
        )}
      />

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Untitled'}
        subtitle={tipTarget?.artist}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 1.11}
        onClose={() => setTipTarget(null)}
        onConfirm={confirmTip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 10,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 14,
  },
  playBtn: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  empty: {
    marginTop: 20,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  showMoreBtn: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  showMoreText: {
    color: '#e9d5ff',
    fontWeight: '600',
    fontSize: 14,
  },
});
