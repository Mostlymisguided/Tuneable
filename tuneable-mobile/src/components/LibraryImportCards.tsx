import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { userAPI } from '@/src/api/user';
import { colors } from '@/src/theme/colors';

type Props = {
  showUpload?: boolean;
};

/** SoundCloud / YouTube import status cards, plus optional upload row. */
export function LibraryImportCards({ showUpload = false }: Props) {
  const [soundcloudConnected, setSoundcloudConnected] = useState(false);
  const [soundcloudImported, setSoundcloudImported] = useState(0);
  const [youtubeImported, setYoutubeImported] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await userAPI.getImportStats();
      setSoundcloudConnected(Boolean(stats.soundcloud?.connected));
      setSoundcloudImported(stats.soundcloud?.imported ?? 0);
      setYoutubeImported(stats.youtube?.imported ?? 0);
    } catch {
      const soundcloud = await userAPI
        .getSoundCloudStatus()
        .catch(() => ({ connected: false }));
      setSoundcloudConnected(Boolean(soundcloud?.connected));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const soundcloudSub = loading
    ? 'Checking…'
    : !soundcloudConnected
      ? 'Import your liked tracks'
      : soundcloudImported > 0
        ? `${soundcloudImported} in your library`
        : 'Connected · none imported yet';

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Bring in your library</Text>
      <Pressable
        style={styles.soundcloudCard}
        onPress={() =>
          router.push({
            pathname: '/import-library',
            params: { source: 'soundcloud' },
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Import from SoundCloud">
        <View style={styles.soundcloudIcon}>
          <FontAwesome name="soundcloud" size={18} color="#fdba74" />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.titleSoundcloud}>SoundCloud</Text>
          <Text style={styles.sub}>{soundcloudSub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      <Pressable
        style={styles.youtubeCard}
        onPress={() =>
          router.push({
            pathname: '/import-library',
            params: { source: 'youtube' },
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Import from a public YouTube playlist">
        <View style={styles.youtubeIcon}>
          <Ionicons name="logo-youtube" size={20} color="#fca5a5" />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.youtubeTitle}>YouTube</Text>
          <Text style={styles.sub}>
            {loading
              ? 'Checking…'
              : youtubeImported > 0
                ? `${youtubeImported} in your library · public playlist`
                : 'Paste a public playlist URL'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      {showUpload ? (
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
    gap: 10,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  soundcloudCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.4)',
  },
  soundcloudIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.25)',
  },
  titleSoundcloud: {
    color: '#fdba74',
    fontSize: 15,
    fontWeight: '700',
  },
  sub: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  youtubeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  youtubeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  youtubeTitle: {
    color: '#fca5a5',
    fontSize: 15,
    fontWeight: '700',
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
