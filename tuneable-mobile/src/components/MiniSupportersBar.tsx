import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { formatPoundsFromPence } from '@/src/lib/format';
import type { ChartMediaItem } from '@/src/types/media';

const DEFAULT_PROFILE_PIC =
  'https://uploads.tuneable.stream/profile-pics/default-avatar.png';

type Bid = NonNullable<ChartMediaItem['bids']>[number];

type Props = {
  bids?: Bid[];
  maxVisible?: number;
};

export function MiniSupportersBar({ bids = [], maxVisible = 5 }: Props) {
  const supporters = useMemo(() => {
    const map: Record<
      string,
      {
        id: string;
        username: string;
        profilePic?: string;
        total: number;
      }
    > = {};

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
  }, [bids]);

  if (supporters.length === 0) return null;

  const visible = supporters.slice(0, maxVisible);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {visible.map((s) => (
        <Pressable
          key={s.id}
          style={styles.chip}
          onPress={() => router.push(`/user/${s.id}`)}>
          <Image
            source={{ uri: s.profilePic || DEFAULT_PROFILE_PIC }}
            style={styles.avatar}
          />
          <Text style={styles.username} numberOfLines={1}>
            {s.username}
          </Text>
          <Text style={styles.amount}>{formatPoundsFromPence(s.total)}</Text>
        </Pressable>
      ))}
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
});
