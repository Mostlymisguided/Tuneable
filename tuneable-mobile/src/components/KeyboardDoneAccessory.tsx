import { useCallback, useId, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';

type AccessoryProps = {
  nativeID: string;
  /** Text on the bar. Defaults to "Done". */
  label?: string;
  /** Leading icon. `chevron-down` is the hide-keyboard control. */
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
};

/**
 * iOS bar above the keyboard. Needed for multiline inputs, numeric keypads,
 * and search fields whose return key submits instead of just dismissing.
 * Link inputs to it with `inputAccessoryViewID={nativeID}`.
 */
export function KeyboardDoneAccessory({
  nativeID,
  label = 'Done',
  icon,
  accessibilityLabel,
}: AccessoryProps) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.bar}>
        <Pressable
          onPress={Keyboard.dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? (icon ? 'Hide keyboard' : 'Dismiss keyboard')}>
          <View style={styles.hideRow}>
            {icon ? (
              <Ionicons name={icon} size={18} color={colors.accentLight} />
            ) : null}
            <Text style={styles.done}>{label}</Text>
          </View>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/** Stable accessory id plus focus tracking for a search field. */
export function useHideKeyboardAccessory() {
  const rawId = useId();
  const nativeID = `hide-kb-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);
  return { nativeID, focused, onFocus, onBlur };
}

/**
 * Android has no keyboard accessory bar. Show this beside a focused search
 * field so the keyboard can be dismissed without submitting.
 * Uses press-in so the tap lands before focus blur unmounts the button.
 */
export function KeyboardHideButton({ visible }: { visible: boolean }) {
  if (Platform.OS === 'ios' || !visible) return null;
  return (
    <Pressable
      onPressIn={() => Keyboard.dismiss()}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Hide keyboard">
      <Ionicons name="chevron-down" size={22} color={colors.accentLight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.gradientStart,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
  },
  hideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  done: {
    color: colors.accentLight,
    fontSize: 16,
    fontWeight: '600',
  },
});
