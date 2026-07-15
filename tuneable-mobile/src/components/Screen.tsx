import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { colors } from '@/src/theme/colors';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Clear space for the sticky player dock on stack screens (default true). */
  padForPlayer?: boolean;
};

/** Full-screen purple gradient matching web / iOS. */
export function Screen({ children, style, padForPlayer = true }: Props) {
  const { contentPaddingBottom, onTabs } = usePlayerDockState();
  // Tab screens usually pad FlatLists themselves; stack screens need Screen padding.
  const bottomPad = padForPlayer && !onTabs ? contentPaddingBottom : 0;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView
        style={[styles.safe, bottomPad > 0 && { paddingBottom: bottomPad }, style]}
        edges={['top', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
});
