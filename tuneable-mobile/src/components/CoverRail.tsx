import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART } from '@/src/types/media';

export type CoverRailItem = {
  key: string;
  title: string;
  subtitle: string;
  coverArt?: string | null;
  meta?: string;
  badge?: string;
};

type Props = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  items: CoverRailItem[];
  emptyTitle?: string;
  emptyBody?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onOpen: (item: CoverRailItem, index: number) => void;
  onPlay: (item: CoverRailItem, index: number) => void;
};

export function CoverRail({
  title,
  actionLabel,
  onAction,
  items,
  emptyTitle,
  emptyBody,
  emptyActionLabel,
  onEmptyAction,
  onOpen,
  onPlay,
}: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8}>
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          {emptyTitle ? <Text style={styles.emptyTitle}>{emptyTitle}</Text> : null}
          {emptyBody ? <Text style={styles.emptyBody}>{emptyBody}</Text> : null}
          {emptyActionLabel && onEmptyAction ? (
            <Pressable style={styles.emptyBtn} onPress={onEmptyAction}>
              <Text style={styles.emptyBtnText}>{emptyActionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}>
          {items.map((item, index) => (
            <View key={item.key} style={styles.card}>
              <Pressable
                onPress={() => onPlay(item, index)}
                style={styles.coverWrap}
                accessibilityRole="button"
                accessibilityLabel={`Play ${item.title}`}>
                <Image
                  source={{ uri: item.coverArt || DEFAULT_COVER_ART }}
                  style={styles.cover}
                />
                <View style={styles.playBadge}>
                  <Ionicons name="play" size={12} color="#fff" />
                </View>
                {item.badge ? (
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{item.badge}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable onPress={() => onOpen(item, index)}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
                {item.meta ? (
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.meta}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  action: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
  },
  rail: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 132,
  },
  coverWrap: {
    width: 132,
    height: 132,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cover: {
    width: 132,
    height: 132,
    backgroundColor: colors.card,
  },
  playBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: 'rgba(126, 34, 206, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  cardTitle: {
    marginTop: 8,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  cardSubtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 12,
  },
  cardMeta: {
    marginTop: 2,
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: '600',
  },
  empty: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyBody: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  emptyBtnText: {
    color: '#e9d5ff',
    fontWeight: '600',
    fontSize: 13,
  },
});
