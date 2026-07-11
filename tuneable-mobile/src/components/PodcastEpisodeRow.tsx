import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme/colors';
import { DEFAULT_PODCAST_COVER, type PodcastEpisode } from '@/src/types/podcast';
import { formatPoundsFromPence } from '@/src/lib/format';
import { isEpisodePlayable, seriesTitle } from '@/src/lib/podcast';

type Props = {
  rank: number;
  episode: PodcastEpisode;
  onPlay: () => void;
};

export function PodcastEpisodeRow({ rank, episode, onPlay }: Props) {
  const playable = isEpisodePlayable(episode);
  const cover =
    episode.coverArt ||
    episode.podcastSeries?.coverArt ||
    DEFAULT_PODCAST_COVER;

  return (
    <Pressable
      style={[styles.row, !playable && styles.rowMuted]}
      onPress={playable ? onPlay : undefined}
      disabled={!playable}>
      <Text style={styles.rank}>{rank}</Text>
      <Image source={{ uri: cover }} style={styles.cover} />
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>
          {episode.title || 'Untitled episode'}
        </Text>
        <Text style={styles.series} numberOfLines={1}>
          {seriesTitle(episode)}
        </Text>
        {!playable ? <Text style={styles.hint}>No audio URL</Text> : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.tips}>
          {formatPoundsFromPence(episode.globalMediaAggregate ?? 0)}
        </Text>
        {playable ? (
          <Ionicons name="play-circle" size={28} color={colors.accentLight} />
        ) : (
          <Ionicons name="mic-outline" size={22} color={colors.textMuted} />
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
  rowMuted: { opacity: 0.7 },
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
  meta: { flex: 1, minWidth: 0 },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  series: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 13,
  },
  hint: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 11,
  },
  right: { alignItems: 'flex-end', gap: 4 },
  tips: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
});
