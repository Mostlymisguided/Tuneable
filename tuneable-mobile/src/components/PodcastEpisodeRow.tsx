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
  onTip: () => void;
};

export function PodcastEpisodeRow({ rank, episode, onPlay, onTip }: Props) {
  const playable = isEpisodePlayable(episode);
  const cover =
    episode.coverArt ||
    episode.podcastSeries?.coverArt ||
    DEFAULT_PODCAST_COVER;

  return (
    <View style={[styles.row, !playable && styles.rowMuted]}>
      <Text style={styles.rank}>{rank}</Text>
      <Pressable onPress={playable ? onPlay : undefined} disabled={!playable}>
        <Image source={{ uri: cover }} style={styles.cover} />
      </Pressable>
      <Pressable
        style={styles.meta}
        onPress={playable ? onPlay : undefined}
        disabled={!playable}>
        <Text style={styles.title} numberOfLines={2}>
          {episode.title || 'Untitled episode'}
        </Text>
        <Text style={styles.series} numberOfLines={1}>
          {seriesTitle(episode)}
        </Text>
        {!playable ? <Text style={styles.hint}>No audio URL</Text> : null}
      </Pressable>
      <View style={styles.right}>
        <Text style={styles.tips}>
          {formatPoundsFromPence(episode.globalMediaAggregate ?? 0)}
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={onTip} hitSlop={8} style={styles.actionBtn}>
            <Ionicons name="heart" size={22} color="#f472b6" />
          </Pressable>
          {playable ? (
            <Pressable onPress={onPlay} hitSlop={8} style={styles.actionBtn}>
              <Ionicons name="play-circle" size={28} color={colors.accentLight} />
            </Pressable>
          ) : (
            <Ionicons name="mic-outline" size={22} color={colors.textMuted} />
          )}
        </View>
      </View>
    </View>
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
  rowMuted: { opacity: 0.85 },
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: { padding: 2 },
});
