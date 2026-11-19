import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';

export function AddMediaPrompt({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>Can't find it?</Text>
      <Pressable
        onPress={onPress}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="Add Media">
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.label}>Add Media</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    gap: 8,
  },
  prompt: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
