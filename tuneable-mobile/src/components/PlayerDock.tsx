import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { PlayerMiniBar } from '@/src/components/PlayerMiniBar';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { colors } from '@/src/theme/colors';

/**
 * Sticky bottom player chrome — above the tab bar on tabs,
 * above the home indicator on stack screens. Hidden on auth + Now Playing.
 */
export function PlayerDock() {
  const { mode, bottomOffset, visible } = usePlayerDockState();

  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { bottom: bottomOffset }]}>
      {mode === 'playing' ? (
        <PlayerMiniBar />
      ) : (
        <Pressable
          style={styles.idle}
          onPress={() => router.push('/(tabs)/music')}>
          <Text style={styles.idleLabel}>Nothing playing</Text>
          <Text style={styles.idleCta}>Browse music →</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 50,
  },
  idle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(26, 26, 46, 0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  idleLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  idleCta: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
  },
});
