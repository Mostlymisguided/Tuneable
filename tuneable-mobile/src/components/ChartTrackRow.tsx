import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MiniSupportersBar } from '@/src/components/MiniSupportersBar';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';
import { formatDuration, formatPoundsFromPence } from '@/src/lib/format';
import { formatArtist, isUploadPlayable } from '@/src/lib/media';

type Props = {
  rank: number;
  item: ChartMediaItem;
  tipPence?: number;
  variant?: 'compact' | 'rich';
  onOpen: () => void;
  onPlay: () => void;
  onTip: () => void;
};

export function ChartTrackRow({
  rank,
  item,
  tipPence,
  variant = 'compact',
  onOpen,
  onPlay,
  onTip,
}: Props) {
  const playable = isUploadPlayable(item);
  const displayTip = tipPence ?? item.partyMediaAggregate ?? 0;
  const durationLabel = formatDuration(item.duration);
  const tags = (item.tags ?? []).slice(0, 3);

  if (variant === 'compact') {
    return (
      <View style={[styles.row, !playable && styles.rowMuted]}>
        <Text style={styles.rank}>{rank}</Text>
        <Pressable onPress={onOpen}>
          <Image
            source={{ uri: item.coverArt || DEFAULT_COVER_ART }}
            style={styles.cover}
          />
        </Pressable>
        <Pressable style={styles.meta} onPress={onOpen}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title || 'Untitled'}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {formatArtist(item.artist)}
          </Text>
          {!playable ? (
            <Text style={styles.hint}>Catalog only — no upload yet</Text>
          ) : null}
        </Pressable>
        <View style={styles.right}>
          <Text style={styles.tips}>{formatPoundsFromPence(displayTip)}</Text>
          <View style={styles.actions}>
            <Pressable onPress={onTip} hitSlop={8} style={styles.actionBtn}>
              <Ionicons name="heart" size={22} color="#f472b6" />
            </Pressable>
            {playable ? (
              <Pressable onPress={onPlay} hitSlop={8} style={styles.actionBtn}>
                <Ionicons name="play-circle" size={28} color={colors.accentLight} />
              </Pressable>
            ) : (
              <Ionicons name="musical-note" size={22} color={colors.textMuted} />
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.richCard, !playable && styles.rowMuted]}>
      <View style={styles.richTop}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankBadgeText}>{rank}</Text>
        </View>

        <Pressable onPress={onOpen} style={styles.coverWrap}>
          <Image
            source={{ uri: item.coverArt || DEFAULT_COVER_ART }}
            style={styles.richCover}
          />
          {playable ? (
            <Pressable style={styles.playOverlay} onPress={onPlay} hitSlop={4}>
              <View style={styles.playCircle}>
                <Ionicons name="play" size={16} color="#fff" />
              </View>
            </Pressable>
          ) : null}
        </Pressable>

        <Pressable style={styles.richMeta} onPress={onOpen}>
          <View style={styles.titleRow}>
            <Text style={styles.richTitle} numberOfLines={1}>
              {item.title || 'Untitled'}
            </Text>
            <View style={styles.metaStats}>
              {item.bpm != null ? (
                <Text style={styles.metaStat}>{item.bpm}</Text>
              ) : null}
              {item.bpm != null && durationLabel ? (
                <Text style={styles.metaDot}>·</Text>
              ) : null}
              {durationLabel ? (
                <View style={styles.durationRow}>
                  <Ionicons name="time-outline" size={11} color={colors.textMuted} />
                  <Text style={styles.metaStat}>{durationLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text style={styles.artist} numberOfLines={1}>
            {formatArtist(item.artist)}
          </Text>
          {!playable ? (
            <Text style={styles.hint}>Catalog only — no upload yet</Text>
          ) : null}
        </Pressable>

        <Pressable onPress={onTip} hitSlop={8} style={styles.tipBtn}>
          <Ionicons name="heart" size={24} color="#f472b6" />
          <Text style={styles.tipAmount}>{formatPoundsFromPence(displayTip)}</Text>
        </Pressable>
      </View>

      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.map((tag) => (
            <View key={tag} style={styles.tagChip}>
              <Text style={styles.tagText}>#{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <MiniSupportersBar bids={item.bids} maxVisible={4} />
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
  rowMuted: {
    opacity: 0.85,
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    padding: 2,
  },
  richCard: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  richTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: '#e9d5ff',
    fontSize: 12,
    fontWeight: '700',
  },
  coverWrap: {
    position: 'relative',
  },
  richCover: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
  },
  playCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  richMeta: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  richTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  metaStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  metaStat: {
    color: colors.textMuted,
    fontSize: 11,
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: 11,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tipBtn: {
    alignItems: 'center',
    paddingLeft: 4,
  },
  tipAmount: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(126, 34, 206, 0.25)',
  },
  tagText: {
    color: '#ddd6fe',
    fontSize: 11,
  },
});
