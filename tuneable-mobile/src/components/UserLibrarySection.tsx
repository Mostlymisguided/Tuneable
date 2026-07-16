import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChartTrackRow } from '@/src/components/ChartTrackRow';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { formatPoundsFromPence } from '@/src/lib/format';
import { mediaId } from '@/src/lib/media';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { colors } from '@/src/theme/colors';
import type { ChartMediaItem, TimePeriodKey } from '@/src/types/media';
import type { User, UserLibraryItem } from '@/src/types/user';

const TIME_PERIODS: { key: TimePeriodKey; label: string }[] = [
  { key: 'all-time', label: 'All Time' },
  { key: 'this-month', label: 'This Month' },
  { key: 'this-week', label: 'This Week' },
  { key: 'today', label: 'Today' },
];

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
    tags: item.tags ?? [],
    sources: item.sources ?? {},
    partyMediaAggregate: item.globalUserMediaAggregate ?? 0,
    globalMediaAggregate: item.globalMediaAggregate ?? 0,
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
  const [tipTarget, setTipTarget] = useState<UserLibraryItem | null>(null);
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);

  const filtered = useMemo(
    () => items.filter((item) => itemInPeriod(item, period)),
    [items, period]
  );

  const playItem = (item: UserLibraryItem) => {
    const queue = filtered.map(toChartMediaItem);
    const index = filtered.findIndex((entry) => entry.mediaId === item.mediaId);
    void setQueueAndPlay(queue, Math.max(0, index));
  };

  const confirmTip = async (amountPounds: number) => {
    if (!tipTarget) return;
    const res = await mediaAPI.placeGlobalBid(tipTarget.mediaId, amountPounds);
    if (typeof res.updatedBalance === 'number') {
      onBalanceUpdate?.(res.updatedBalance);
    }
  };

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>Library</Text>
        <Text style={styles.subtitle}>
          {items.length} tune{items.length === 1 ? '' : 's'} tipped
        </Text>
      </View>

      <View style={styles.periods}>
        {TIME_PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              style={[styles.periodChip, active && styles.periodChipActive]}>
              <Text
                style={[
                  styles.periodText,
                  active && styles.periodTextActive,
                ]}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.mediaId}
        scrollEnabled={false}
        contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
        ListEmptyComponent={<Text style={styles.empty}>{emptyLabel}</Text>}
        renderItem={({ item, index }) => (
          <ChartTrackRow
            rank={index + 1}
            item={toChartMediaItem(item)}
            onOpen={() => router.push(`/tune/${item.mediaUuid || item.mediaId}`)}
            onPlay={() => playItem(item)}
            onTip={() => setTipTarget(item)}
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
  periods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  periodChipActive: {
    backgroundColor: '#7e22ce',
  },
  periodText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  periodTextActive: {
    color: '#fff',
  },
  empty: {
    marginTop: 20,
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
