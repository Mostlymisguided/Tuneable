import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  countSupporters,
  MiniSupportersBar,
} from '@/src/components/MiniSupportersBar';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';
import { formatDuration, formatPoundsFromPence } from '@/src/lib/format';
import { formatArtist, isUploadPlayable } from '@/src/lib/media';

const COLLAPSED_TAG_COUNT = 2;

type Props = {
  rank: number;
  item: ChartMediaItem;
  tipPence?: number;
  variant?: 'compact' | 'rich';
  /** Hide the inline "Catalog only" hint. */
  hideCatalogHint?: boolean;
  onOpen: () => void;
  onPlay: () => void;
  onTip: () => void;
};

export function ChartTrackRow({
  rank,
  item,
  tipPence,
  variant = 'compact',
  hideCatalogHint = false,
  onOpen,
  onPlay,
  onTip,
}: Props) {
  const [footerExpanded, setFooterExpanded] = useState(false);
  const playable = isUploadPlayable(item);
  const displayTip = tipPence ?? item.partyMediaAggregate ?? 0;
  const durationLabel = formatDuration(item.duration);
  const allTags = item.tags ?? [];
  const supporterCount = countSupporters(item.bids);
  const hasFooter = allTags.length > 0 || supporterCount > 0;
  const hiddenTagCount = Math.max(0, allTags.length - COLLAPSED_TAG_COUNT);
  const canExpandFooter =
    allTags.length > COLLAPSED_TAG_COUNT || supporterCount > 3;

  const showHint = !playable && !hideCatalogHint;
  const toggleFooter = () => setFooterExpanded((open) => !open);

  const coverArt = (
    <Pressable
      onPress={onPlay}
      style={styles.coverWrap}
      accessibilityRole="button"
      accessibilityLabel={
        playable
          ? `Play chart position ${rank}`
          : `Play next available from chart position ${rank}`
      }>
      {({ pressed }) => (
        <>
          <Image
            source={{ uri: item.coverArt || DEFAULT_COVER_ART }}
            style={variant === 'compact' ? styles.cover : styles.richCover}
          />
          <View style={styles.rankPlayOverlay}>
            <View
              style={[
                styles.rankPlayCircle,
                !playable && styles.rankPlayCircleMuted,
              ]}>
              {pressed ? (
                <Ionicons name="play" size={16} color="#fff" />
              ) : (
                <Text
                  style={[
                    styles.rankOnArt,
                    rank >= 100 && styles.rankOnArtSmall,
                  ]}>
                  {rank}
                </Text>
              )}
            </View>
          </View>
        </>
      )}
    </Pressable>
  );

  if (variant === 'compact') {
    return (
      <View style={[styles.row, !playable && styles.rowMuted]}>
        {coverArt}
        <Pressable style={styles.meta} onPress={onOpen}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title || 'Untitled'}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {formatArtist(item.artist)}
          </Text>
          {showHint ? (
            <Text style={styles.hint}>Catalog only — no upload yet</Text>
          ) : null}
        </Pressable>
        <View style={styles.right}>
          <Text style={styles.tips}>{formatPoundsFromPence(displayTip)}</Text>
          <Pressable onPress={onTip} hitSlop={8} style={styles.actionBtn}>
            <Ionicons name="heart" size={22} color="#f472b6" />
          </Pressable>
        </View>
      </View>
    );
  }

  const collapsedTags = allTags.slice(0, COLLAPSED_TAG_COUNT);

  return (
    <View style={[styles.richCard, !playable && styles.rowMuted]}>
      <View style={styles.richTop}>
        {coverArt}

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
          {showHint ? (
            <Text style={styles.hint}>Catalog only — no upload yet</Text>
          ) : null}
        </Pressable>

        <Pressable onPress={onTip} hitSlop={8} style={styles.tipBtn}>
          <Ionicons name="heart" size={24} color="#f472b6" />
          <Text style={styles.tipAmount}>{formatPoundsFromPence(displayTip)}</Text>
        </Pressable>
      </View>

      {hasFooter && !footerExpanded ? (
        <View style={styles.denseFooter}>
          <View style={styles.tagsInline}>
            {collapsedTags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
            {hiddenTagCount > 0 ? (
              <Pressable style={styles.moreChip} onPress={toggleFooter} hitSlop={6}>
                <Text style={styles.moreChipText}>+{hiddenTagCount}</Text>
              </Pressable>
            ) : null}
          </View>
          <MiniSupportersBar
            bids={item.bids}
            maxVisible={3}
            variant="stack"
            onStackPress={canExpandFooter ? toggleFooter : undefined}
          />
        </View>
      ) : null}

      {hasFooter && footerExpanded ? (
        <View style={styles.expandedFooter}>
          {allTags.length > 0 ? (
            <View style={styles.tags}>
              {allTags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <MiniSupportersBar bids={item.bids} maxVisible={8} variant="chips" />
          <Pressable style={styles.collapseBtn} onPress={toggleFooter} hitSlop={8}>
            <Text style={styles.collapseText}>Show less</Text>
            <Ionicons name="chevron-up" size={14} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
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
  coverWrap: {
    position: 'relative',
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
  actionBtn: {
    padding: 2,
  },
  richCard: {
    marginBottom: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  richTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  richCover: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  rankPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: 8,
  },
  rankPlayCircle: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankPlayCircleMuted: {
    borderColor: 'rgba(255,255,255,0.45)',
    opacity: 0.9,
  },
  rankOnArt: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  rankOnArtSmall: {
    fontSize: 11,
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
  denseFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  tagsInline: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
  moreChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  moreChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  expandedFooter: {
    marginTop: 8,
    gap: 8,
  },
  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  collapseText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});
