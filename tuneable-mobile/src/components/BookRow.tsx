import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART } from '@/src/types/media';
import { formatPoundsFromPence } from '@/src/lib/format';

type Props = {
  title: string;
  subtitle?: string;
  coverArt?: string | null;
  isbn?: string | null;
  tipPence?: number;
  actionLabel?: string;
  onPress: () => void;
  onAction?: () => void;
  actionBusy?: boolean;
};

export function BookRow({
  title,
  subtitle,
  coverArt,
  isbn,
  tipPence,
  actionLabel,
  onPress,
  onAction,
  actionBusy,
}: Props) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <Image source={{ uri: coverArt || DEFAULT_COVER_ART }} style={styles.cover} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {isbn ? <Text style={styles.meta}>ISBN {isbn}</Text> : null}
        {typeof tipPence === 'number' ? (
          <Text style={styles.tip}>{formatPoundsFromPence(tipPence)}</Text>
        ) : null}
      </View>
      {onAction ? (
        <Pressable
          style={styles.action}
          onPress={onAction}
          disabled={actionBusy}
          accessibilityRole="button"
          accessibilityLabel={actionLabel || 'Add'}
        >
          <Ionicons
            name={actionLabel === 'Tip' ? 'heart' : 'add'}
            size={18}
            color="#fff"
          />
          <Text style={styles.actionText}>{actionBusy ? '…' : actionLabel || 'Add'}</Text>
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  cover: {
    width: 44,
    height: 64,
    borderRadius: 6,
    backgroundColor: colors.card,
  },
  body: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  tip: { color: colors.accentLight, fontSize: 13, fontWeight: '700', marginTop: 4 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
