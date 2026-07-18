import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { formatPoundsFromPence } from '@/src/lib/format';
import type { ChartMediaItem } from '@/src/types/media';
import { DEFAULT_PROFILE_PIC } from '@/src/types/user';

type Bid = NonNullable<ChartMediaItem['bids']>[number];

type Supporter = {
  id: string;
  username: string;
  profilePic?: string;
  total: number;
};

type Props = {
  bids?: Bid[];
  maxVisible?: number;
  /** Overlapping avatars for dense footers; chips for expanded view. */
  variant?: 'chips' | 'stack';
  /** Stack tap (e.g. expand card). Defaults to no-op when stack. */
  onStackPress?: () => void;
};

function podiumColor(rank: number): string {
  if (rank === 1) return '#fbbf24';
  if (rank === 2) return '#cbd5e1';
  return '#fb923c';
}

function aggregateSupporters(bids: Bid[]): Supporter[] {
  const map: Record<string, Supporter> = {};

  for (const bid of bids) {
    const user = bid.userId;
    if (!user?.username) continue;
    const id = user.uuid || user._id || user.username;
    const amount = typeof bid.amount === 'number' ? bid.amount : 0;
    if (!map[id]) {
      map[id] = {
        id,
        username: user.username,
        profilePic: user.profilePic,
        total: 0,
      };
    }
    map[id].total += amount;
  }

  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function countSupporters(bids?: Bid[]): number {
  if (!bids?.length) return 0;
  return aggregateSupporters(bids).length;
}

export function MiniSupportersBar({
  bids = [],
  maxVisible = 5,
  variant = 'chips',
  onStackPress,
}: Props) {
  const supporters = useMemo(() => aggregateSupporters(bids), [bids]);

  const podiumRankById = useMemo(() => {
    const m = new Map<string, number>();
    supporters.slice(0, 3).forEach((s, idx) => {
      m.set(s.id, idx + 1);
    });
    return m;
  }, [supporters]);

  if (supporters.length === 0) return null;

  if (variant === 'stack') {
    const stackVisible = supporters.slice(0, Math.min(3, maxVisible));
    const more = supporters.length - stackVisible.length;

    return (
      <Pressable
        style={styles.stack}
        onPress={onStackPress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`${supporters.length} tipper${supporters.length !== 1 ? 's' : ''}`}>
        {stackVisible.map((s, index) => {
          const rank = podiumRankById.get(s.id);
          return (
            <View
              key={s.id}
              style={[styles.stackItem, { zIndex: stackVisible.length - index, marginLeft: index === 0 ? 0 : -6 }]}>
              <Image
                source={{ uri: s.profilePic || DEFAULT_PROFILE_PIC }}
                style={styles.stackAvatar}
              />
              {rank ? (
                <View
                  style={[
                    styles.stackCrown,
                    { borderColor: `${podiumColor(rank)}66` },
                  ]}>
                  <Ionicons name="trophy" size={8} color={podiumColor(rank)} />
                </View>
              ) : null}
            </View>
          );
        })}
        {more > 0 ? (
          <View style={[styles.moreChip, { marginLeft: 4 }]}>
            <Text style={styles.moreText}>+{more}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  const visible = supporters.slice(0, maxVisible);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {visible.map((s) => {
        const rank = podiumRankById.get(s.id);
        return (
          <Pressable
            key={s.id}
            style={styles.chip}
            onPress={() => router.push(`/user/${s.id}`)}>
            <Image
              source={{ uri: s.profilePic || DEFAULT_PROFILE_PIC }}
              style={styles.avatar}
            />
            {rank ? (
              <View
                style={[
                  styles.crownBadge,
                  { borderColor: `${podiumColor(rank)}55` },
                ]}>
                <Ionicons name="trophy" size={9} color={podiumColor(rank)} />
              </View>
            ) : null}
            <Text style={styles.username} numberOfLines={1}>
              {s.username}
            </Text>
            <Text style={styles.amount}>{formatPoundsFromPence(s.total)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.25)',
    maxWidth: 160,
  },
  avatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  crownBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  username: {
    color: colors.text,
    fontSize: 10,
    flexShrink: 1,
  },
  amount: {
    color: '#86efac',
    fontSize: 10,
    fontWeight: '600',
  },
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  stackItem: {
    position: 'relative',
  },
  stackAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.gradientStart,
    backgroundColor: colors.card,
  },
  stackCrown: {
    position: 'absolute',
    right: -3,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  moreChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  moreText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
});
