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
import {
  CHART_LIBRARY_SORT_HINT,
  sortChartItems,
  type ChartSortKey,
} from '@/src/lib/chartSort';
import { isUploadPlayable, isWrittenMedia, mediaId } from '@/src/lib/media';
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
    releaseDate: item.releaseDate ?? null,
    releaseYear: item.releaseYear ?? null,
    primaryLocation: item.primaryLocation ?? null,
    tags: item.tags ?? [],
    sources: item.sources ?? {},
    partyMediaAggregate: item.globalUserMediaAggregate ?? 0,
    globalMediaAggregate: item.globalMediaAggregate ?? 0,
    lastBidAt: item.lastBidAt ?? null,
    contentForm: item.contentForm,
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

function isPodcastLibraryItem(item: UserLibraryItem | ChartMediaItem): boolean {
  const forms = Array.isArray((item as UserLibraryItem).contentForm)
    ? (item as UserLibraryItem).contentForm
    : Array.isArray((item as ChartMediaItem).contentForm)
      ? (item as ChartMediaItem).contentForm
      : [];
  return (forms || []).some((f) =>
    ['podcast', 'podcastseries', 'episode', 'podcastepisode'].includes(f)
  );
}

function isBookLibraryItem(item: UserLibraryItem | ChartMediaItem): boolean {
  return isWrittenMedia(item);
}

type SortMode = 'amount' | 'recent';

type Props = {
  items: UserLibraryItem[];
  user: User | null;
  onBalanceUpdate?: (newBalancePence: number) => void;
  contentPaddingBottom?: number;
  emptyLabel?: string;
  title?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  showTime?: boolean;
  showBpm?: boolean;
  sortBy?: SortMode;
  /** Cap visible rows (home preview). Overflow uses `onAction` instead of paging. */
  previewLimit?: number;
  emptyTitle?: string;
  emptyBody?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  searchHint?: string;
  compactHeader?: boolean;
};

export function UserLibrarySection({
  items,
  user,
  onBalanceUpdate,
  contentPaddingBottom = 0,
  emptyLabel = 'No tunes tipped yet.',
  title = 'Library',
  subtitle,
  actionLabel,
  onAction,
  showTime = true,
  showBpm = true,
  sortBy = 'amount',
  previewLimit,
  emptyTitle,
  emptyBody,
  emptyActionLabel,
  onEmptyAction,
  searchHint = 'Filters your tipped tunes.',
  compactHeader = false,
}: Props) {
  const [period, setPeriod] = useState<TimePeriodKey>('all-time');
  const [chartSort, setChartSort] = useState<ChartSortKey>(
    sortBy === 'recent' ? 'newest' : 'most-tipped'
  );
  const [selectedTagTerms, setSelectedTagTerms] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [bpmFilterRange, setBpmFilterRange] = useState<BpmFilterRange>('all');
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [showTimePanel, setShowTimePanel] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);
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
  }, [period, selectedTagTerms, searchQuery, bpmFilterRange, items, chartSort]);

  const periodFiltered = useMemo(() => {
    return showTime
      ? items.filter((item) => itemInPeriod(item, period))
      : [...items];
  }, [items, period, showTime]);

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
    const effectiveSort: ChartSortKey = showTime
      ? chartSort
      : sortBy === 'recent'
        ? 'newest'
        : 'most-tipped';
    return sortChartItems(list, effectiveSort, {
      getDate: (item) => item.lastBidAt,
      getTip: (item) => item.partyMediaAggregate ?? 0,
    });
  }, [chartItems, filterState, chartSort, showTime, sortBy]);

  const visibleCap = previewLimit ?? Number.POSITIVE_INFINITY;
  const visible = useMemo(
    () => filtered.slice(0, Math.min(visibleCount, visibleCap)),
    [filtered, visibleCount, visibleCap]
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
    if (isBookLibraryItem(item)) return;
    if (isPodcastLibraryItem(item)) {
      const id = mediaId(item);
      if (!id) return;
      router.push(`/podcast/${id}`);
      return;
    }
    const playable = filtered.filter(isUploadPlayable);
    const index = playable.findIndex((m) => mediaId(m) === mediaId(item));
    if (index < 0) return;
    void setQueueAndPlay(playable, index);
  };

  const onPlayQueue = () => {
    const playable = filtered.filter(isUploadPlayable);
    if (playable.length === 0) return;
    void setQueueAndPlay(playable, 0);
  };

  const confirmTip = async (amountPounds: number, tags: string[]) => {
    if (!tipTarget) return;
    if (isBookLibraryItem(tipTarget)) return;
    const res = await mediaAPI.placeGlobalBid(tipTarget.mediaId, amountPounds, {
      tags,
    });
    if (typeof res.updatedBalance === 'number') {
      onBalanceUpdate?.(res.updatedBalance);
    }
    return res;
  };

  const findLibraryItem = (item: ChartMediaItem): UserLibraryItem | undefined => {
    const id = mediaId(item);
    return periodFiltered.find(
      (entry) => entry.mediaId === id || entry.mediaUuid === id
    );
  };

  const hasMore = visible.length < filtered.length && visible.length < visibleCap;
  const hasOverflow =
    previewLimit != null && filtered.length > previewLimit && Boolean(onAction);
  const resolvedSubtitle =
    subtitle === undefined
      ? `${items.length} tune${items.length === 1 ? '' : 's'} tipped`
      : subtitle;
  const emptyMessage = filtersActive
    ? 'No tunes match these filters.'
    : emptyLabel;
  const showFilters = items.length > 0;

  const emptyState =
    filtersActive || !emptyTitle ? (
      <Text style={styles.empty}>{emptyMessage}</Text>
    ) : (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        {emptyBody ? <Text style={styles.emptyBody}>{emptyBody}</Text> : null}
        {emptyActionLabel && onEmptyAction ? (
          <Pressable style={styles.emptyBtn} onPress={onEmptyAction}>
            <Text style={styles.emptyBtnText}>{emptyActionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    );

  const listFooter =
    hasMore ? (
      <Pressable
        style={styles.showMoreBtn}
        onPress={() => setVisibleCount((n) => n + LIBRARY_PAGE_SIZE)}>
        <Text style={styles.showMoreText}>
          Show more ({filtered.length - visible.length} remaining)
        </Text>
      </Pressable>
    ) : hasOverflow ? (
      <Pressable style={styles.showMoreBtn} onPress={onAction}>
        <Text style={styles.showMoreText}>
          See library ({filtered.length - visible.length} more)
        </Text>
      </Pressable>
    ) : null;

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, compactHeader && styles.titleCompact]}>
            {title}
          </Text>
          {resolvedSubtitle ? (
            <Text style={styles.subtitle}>{resolvedSubtitle}</Text>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      {showFilters ? (
        <ChartFilterToolbar
          period={period}
          onPeriodChange={(next) => setPeriod(next as TimePeriodKey)}
          selectedTagTerms={selectedTagTerms}
          onTagTermsChange={setSelectedTagTerms}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          bpmFilterRange={bpmFilterRange}
          onBpmFilterChange={setBpmFilterRange}
          showTime={showTime}
          showBpm={showBpm}
          topTags={topTags}
          showTagPanel={showTagPanel}
          showTimePanel={showTimePanel}
          sort={chartSort}
          onSortChange={setChartSort}
          showSortPanel={showSortPanel}
          onToggleSortPanel={() => setShowSortPanel((open) => !open)}
          sortHint={CHART_LIBRARY_SORT_HINT}
          showBpmPanel={showBpmPanel}
          showSearchPanel={showSearchPanel}
          onToggleTagPanel={() => setShowTagPanel((open) => !open)}
          onToggleTimePanel={() => setShowTimePanel((open) => !open)}
          onToggleBpmPanel={() => setShowBpmPanel((open) => !open)}
          onToggleSearchPanel={() => setShowSearchPanel((open) => !open)}
          onClearFilters={clearClientFilters}
          hasActiveFilters={filtersActive}
          searchHint={searchHint}
        />
      ) : null}

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
        ListEmptyComponent={emptyState}
        ListFooterComponent={listFooter}
        renderItem={({ item, index }) => (
          <ChartTrackRow
            rank={index + 1}
            item={item}
            variant="rich"
            hideCatalogHint
            tipPence={item.partyMediaAggregate ?? 0}
            onOpen={() => {
              const id = mediaId(item);
              if (!id) return;
              const lib = findLibraryItem(item);
              if ((lib && isBookLibraryItem(lib)) || isBookLibraryItem(item)) {
                return;
              }
              if (lib && isPodcastLibraryItem(lib)) {
                router.push(`/podcast/${id}`);
                return;
              }
              if (isPodcastLibraryItem(item)) {
                router.push(`/podcast/${id}`);
                return;
              }
              router.push(`/tune/${id}`);
            }}
            onPlay={() => playItem(item)}
            onTip={() => {
              const lib = findLibraryItem(item);
              if (!lib || isBookLibraryItem(lib)) return;
              setTipTarget(lib);
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
        tipMedia={tipTarget}
        onClose={() => setTipTarget(null)}
        onConfirm={confirmTip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  titleCompact: {
    fontSize: 18,
  },
  subtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 14,
  },
  action: {
    marginTop: 4,
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
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
  emptyCard: {
    marginTop: 4,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyBody: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  emptyBtnText: {
    color: '#e9d5ff',
    fontWeight: '600',
    fontSize: 13,
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
