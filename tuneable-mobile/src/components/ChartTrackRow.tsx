import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
  /** Hide the inline "Catalog only" hint; use play alert instead. */
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

  const handlePlay = () => {
    if (playable) {
      onPlay();
      return;
    }
    Alert.alert(
      'Catalog only',
      'No upload yet — this tune can’t be played in the app until someone attaches audio.'
    );
  };

  const showHint = !playable && !hideCatalogHint;
  const toggleFooter = () => setFooterExpanded((open) => !open);

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
          {showHint ? (
            <Text style={styles.hint}>Catalog only — no upload yet</Text>
          ) : null}
        </Pressable>
        <View style={styles.right}>
          <Text style={styles.tips}>{formatPoundsFromPence(displayTip)}</Text>
          <View style={styles.actions}>
            <Pressable onPress={onTip} hitSlop={8} style={styles.actionBtn}>
              <Ionicons name="heart" size={22} color="#f472b6" />
            </Pressable>
            <Pressable onPress={handlePlay} hitSlop={8} style={styles.actionBtn}>
              <Ionicons
                name={playable ? 'play-circle' : 'musical-note'}
                size={playable ? 28 : 22}
                color={playable ? colors.accentLight : colors.textMuted}
              />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const collapsedTags = allTags.slice(0, COLLAPSED_TAG_COUNT);

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
          <Pressable style={styles.playOverlay} onPress={handlePlay} hitSlop={4}>
            <View style={[styles.playCircle, !playable && styles.playCircleMuted]}>
              <Ionicons
                name={playable ? 'play' : 'musical-note'}
                size={playable ? 16 : 14}
                color="#fff"
              />
            </View>
          </Pressable>
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
  playCircleMuted: {
    borderColor: 'rgba(255,255,255,0.45)',
    opacity: 0.85,
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
