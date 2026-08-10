import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { colors } from '@/src/theme/colors';
import { useToastStore } from '@/src/stores/toastStore';

/** Non-blocking notice, sits above the player dock / tab bar. */
export function AppToast() {
  const message = useToastStore((s) => s.message);
  const tone = useToastStore((s) => s.tone);
  const clear = useToastStore((s) => s.clear);
  const { visible: dockVisible, height: dockHeight, bottomOffset } =
    usePlayerDockState();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start();
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [message, opacity]);

  if (!message) return null;

  const bottom = bottomOffset + (dockVisible ? dockHeight : 0) + 10;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom, opacity }]}>
      <Pressable
        onPress={clear}
        style={[styles.toast, tone === 'error' && styles.toastError]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite">
        <Text style={styles.text}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 60,
  },
  toast: {
    backgroundColor: 'rgba(15, 15, 28, 0.96)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toastError: {
    borderColor: 'rgba(239, 68, 68, 0.45)',
  },
  text: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
