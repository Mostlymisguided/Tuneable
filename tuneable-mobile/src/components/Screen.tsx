import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { colors } from '@/src/theme/colors';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Clear space for the sticky player dock and tab bar on stack screens (default true). */
  padForPlayer?: boolean;
};

const GRADIENT_COLORS = [
  colors.gradientStart,
  colors.gradientMid,
  colors.gradientEnd,
] as const;

// Same stops as expo-linear-gradient with start (0,0) → end (1,1).
const CSS_GRADIENT = `linear-gradient(to bottom right, ${colors.gradientStart} 0%, ${colors.gradientMid} 50%, ${colors.gradientEnd} 100%)`;

/** Native LinearGradient is bundled in Expo Go / web; TestFlight new-arch builds are not. */
const useNativeLinearGradient =
  Platform.OS === 'web' || Constants.appOwnership === 'expo';

function ScreenGradient() {
  if (useNativeLinearGradient) {
    return (
      <LinearGradient
        colors={GRADIENT_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    );
  }

  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cssGradient]} />;
}

/** Full-screen purple gradient matching web / iOS. */
export function Screen({ children, style, padForPlayer = true }: Props) {
  const { contentPaddingBottom, onTabs } = usePlayerDockState();
  // Tab screens pad FlatLists themselves; stack screens need Screen padding.
  const bottomPad = padForPlayer && !onTabs ? contentPaddingBottom : 0;

  return (
    <View style={styles.root}>
      <ScreenGradient />
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
  cssGradient: {
    backgroundColor: colors.background,
    experimental_backgroundImage: CSS_GRADIENT,
  },
  safe: {
    flex: 1,
  },
});
