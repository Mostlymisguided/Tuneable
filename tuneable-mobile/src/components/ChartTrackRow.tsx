import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';
import { formatPoundsFromPence } from '@/src/lib/format';
import { formatArtist, isUploadPlayable } from '@/src/lib/media';

type Props = {
  rank: number;
  item: ChartMediaItem;
  onPlay: () => void;
};

export function ChartTrackRow({ rank, item, onPlay }: Props) {
  const playable = isUploadPlayable(item);

  return (
    <Pressable
      style={[styles.row, !playable && styles.rowMuted]}
      onPress={playable ? onPlay : undefined}
      disabled={!playable}>
      <Text style={styles.rank}>{rank}</Text>
      <Image
        source={{ uri: item.coverArt || DEFAULT_COVER_ART }}
        style={styles.cover}
      />
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title || 'Untitled'}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {formatArtist(item.artist)}
        </Text>
        {!playable ? (
          <Text style={styles.hint}>Catalog only — no upload yet</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.tips}>
          {formatPoundsFromPence(item.partyMediaAggregate ?? 0)}
        </Text>
        {playable ? (
          <Ionicons name="play-circle" size={28} color={colors.accentLight} />
        ) : (
          <Ionicons name="musical-note" size={22} color={colors.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  rowMuted: {
    opacity: 0.7,
  },
  rank: {
    width: 28,
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  artist: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 13,
  },
  hint: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tips: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
});
