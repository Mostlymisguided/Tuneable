import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors } from '@/src/theme/colors';

type Props = {
  showUpload?: boolean;
};

/** Upload entry for audio the user owns. Catalogue import stays on the website. */
export function LibraryImportCards({ showUpload = false }: Props) {
  if (!showUpload) return null;

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.uploadCard}
        onPress={() => router.push('/upload')}
        accessibilityRole="button"
        accessibilityLabel="Upload">
        <View style={styles.uploadIcon}>
          <Ionicons
            name="cloud-upload-outline"
            size={20}
            color={colors.accentLight}
          />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.uploadTitle}>Upload</Text>
          <Text style={styles.sub}>Audio you own or have rights to</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  sub: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  uploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  uploadIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.25)',
  },
  rowCopy: {
    flex: 1,
  },
  uploadTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
