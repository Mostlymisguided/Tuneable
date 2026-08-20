import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  countSupporters,
  MiniSupportersBar,
} from '@/src/components/MiniSupportersBar';
import { TagChip } from '@/src/components/TagChip';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';
import { formatDuration, formatPoundsFromPence } from '@/src/lib/format';
import {
  getCountryLabelFromLocation,
  getCountryPlaceProfileHref,
} from '@/src/lib/location';
import { formatArtist, isUploadPlayable } from '@/src/lib/media';
import { getTagProfileHref } from '@/src/lib/tagNormalizer';

const COLLAPSED_TAG_COUNT = 2;

function getReleaseYear(item: ChartMediaItem): number | null {
  const year = item.releaseYear;
  if (typeof year === 'number' && Number.isFinite(year) && year >= 1900 && year <= 2100) {
    return Math.trunc(year);
  }
  const date = item.releaseDate;
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  const fromDate = parsed.getFullYear();
  return fromDate >= 1900 && fromDate <= 2100 ? fromDate : null;
}

function getBpm(item: ChartMediaItem): number | null {
  const bpm = item.bpm;
  if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0) return null;
  return Math.round(bpm);
}

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
  const bpm = getBpm(item);
  const releaseYear = getReleaseYear(item);
  const country = getCountryLabelFromLocation(item.primaryLocation);
  const countryHref = getCountryPlaceProfileHref(item.primaryLocation);
  const countryLabel = country || 'Earth';
  const allTags = item.tags ?? [];
  const supporterCount = countSupporters(item.bids);
  const hasFooter = allTags.length > 0 || supporterCount > 0;
  const hiddenTagCount = Math.max(0, allTags.length - COLLAPSED_TAG_COUNT);
  const canExpandFooter =
    allTags.length > COLLAPSED_TAG_COUNT || supporterCount > 0;

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
            <Text style={styles.hint}>Catalog only — awaiting playback rights</Text>
          ) : null}
        </Pressable>
        <View style={styles.right}>
          <Text style={styles.tips}>{formatPoundsFromPence(displayTip)}</Text>
          <Pressable onPress={onTip} hitSlop={8} style={styles.actionBtn} accessibilityLabel="Send a tip">
            <Ionicons name="heart" size={16} color={colors.tipHeart} />
          </Pressable>
        </View>
      </View>
    );
  }

  const metaParts: Array<{ key: string; node: ReactNode }> = [];
  if (durationLabel) {
    metaParts.push({
      key: 'duration',
      node: (
        <View style={styles.durationRow}>
          <Ionicons name="time-outline" size={11} color={colors.textMuted} />
          <Text style={styles.metaStat}>{durationLabel}</Text>
        </View>
      ),
    });
  }
  if (bpm != null) {
    const bpmHref = getTagProfileHref(String(bpm));
    metaParts.push({
      key: 'bpm',
      node: (
        <Pressable
          onPress={() => router.push(bpmHref as Href)}
          hitSlop={4}
          accessibilityRole="link"
          accessibilityLabel={`Open ${bpm} BPM`}>
          <Text style={styles.metaStat}>{bpm}</Text>
        </Pressable>
      ),
    });
  }
  if (releaseYear != null) {
    const yearHref = getTagProfileHref(String(releaseYear));
    metaParts.push({
      key: 'year',
      node: (
        <Pressable
          onPress={() => router.push(yearHref as Href)}
          hitSlop={4}
          accessibilityRole="link"
          accessibilityLabel={`Open year ${releaseYear}`}>
          <Text style={styles.metaStat}>{releaseYear}</Text>
        </Pressable>
      ),
    });
  }
  metaParts.push({
    key: 'country',
    node: countryHref ? (
      <Pressable
        onPress={() => router.push(countryHref)}
        hitSlop={4}
        accessibilityRole="link"
        accessibilityLabel={`Open place ${countryLabel}`}>
        <Text style={styles.metaStat} numberOfLines={1}>
          {countryLabel}
        </Text>
      </Pressable>
    ) : (
      <Text style={styles.metaStat} numberOfLines={1}>
        {countryLabel}
      </Text>
    ),
  });

  const collapsedTags = allTags.slice(0, COLLAPSED_TAG_COUNT);

  return (
    <View style={[styles.richCard, !playable && styles.rowMuted]}>
      <View style={styles.richTop}>
        {coverArt}

        <View style={styles.richMeta}>
          <Pressable onPress={onOpen}>
            <View style={styles.titleRow}>
              <Text style={styles.richTitle} numberOfLines={1}>
                {item.title || 'Untitled'}
              </Text>
              <View style={styles.metaStats}>
                {metaParts.map((part, index) => (
                  <View key={part.key} style={styles.metaPart}>
                    {index > 0 ? <Text style={styles.metaDot}>·</Text> : null}
                    {part.node}
                  </View>
                ))}
              </View>
            </View>
          </Pressable>
          <View style={styles.artistRow}>
            <Pressable style={styles.artistPress} onPress={onOpen}>
              <Text style={styles.artist} numberOfLines={1}>
                {formatArtist(item.artist)}
              </Text>
              {showHint ? (
                <Text style={styles.hint}>Catalog only — awaiting playback rights</Text>
              ) : null}
            </Pressable>
            <Pressable
              onPress={onTip}
              hitSlop={8}
              style={styles.tipBtn}
              accessibilityLabel="Send a tip">
              <Ionicons name="heart" size={18} color={colors.tipHeart} />
            </Pressable>
          </View>
        </View>
      </View>

      {hasFooter && !footerExpanded ? (
        <View style={styles.denseFooter}>
          <View style={styles.tagsInline}>
            {collapsedTags.map((tag) => (
              <TagChip key={tag} tag={tag} />
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
                <TagChip key={tag} tag={tag} />
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tipHeartBg,
    borderWidth: 1,
    borderColor: colors.tipHeartBorder,
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
    alignItems: 'flex-start',
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
    gap: 8,
  },
  richTitle: {
    flex: 1,
    minWidth: 0,
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
  metaPart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  metaStat: {
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
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
  artistRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  artistPress: {
    flex: 1,
    minWidth: 0,
  },
  tipBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tipHeartBg,
    borderWidth: 1,
    borderColor: colors.tipHeartBorder,
    flexShrink: 0,
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
