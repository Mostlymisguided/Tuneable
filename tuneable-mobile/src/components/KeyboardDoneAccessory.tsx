import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme/colors';

/**
 * iOS-only "Done" bar above the keyboard. Needed for multiline inputs and
 * numeric keypads, which have no return key to dismiss the keyboard.
 * Link inputs to it with `inputAccessoryViewID={nativeID}`.
 */
export function KeyboardDoneAccessory({ nativeID }: { nativeID: string }) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.bar}>
        <Pressable
          onPress={Keyboard.dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss keyboard">
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
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
  done: {
    color: colors.accentLight,
    fontSize: 16,
    fontWeight: '600',
  },
});
