import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';

export type UploadPhase = 'uploading' | 'processing';

type Props = {
  phase: UploadPhase;
  loaded: number;
  total: number;
  onCancel?: () => void;
};

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadProgressBar({ phase, loaded, total, onCancel }: Props) {
  const percent = total > 0 ? Math.min(100, Math.round((loaded * 100) / total)) : 0;
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: phase === 'processing' ? 100 : percent,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [percent, phase, width]);

  const processing = phase === 'processing';

  return (
    <View style={styles.card} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {processing ? <ActivityIndicator size="small" color={colors.accentLight} /> : null}
          <Text style={styles.title}>{processing ? 'Processing on server…' : 'Uploading…'}</Text>
        </View>
        <View style={styles.titleRow}>
          {!processing ? <Text style={styles.percent}>{percent}%</Text> : null}
          {onCancel && !processing ? (
            <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Cancel upload">
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            processing && styles.fillProcessing,
            { width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>

      <Text style={styles.detail}>
        {processing
          ? 'Upload complete. Saving your track — large files can take a moment.'
          : total > 0
            ? `${formatMb(loaded)} of ${formatMb(total)}`
            : ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  percent: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  fillProcessing: {
    opacity: 0.6,
  },
  detail: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
