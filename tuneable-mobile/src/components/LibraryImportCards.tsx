import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { userAPI } from '@/src/api/user';
import { colors } from '@/src/theme/colors';

type Props = {
  showUpload?: boolean;
};

/** Spotify / SoundCloud import status cards, plus optional upload row. */
export function LibraryImportCards({ showUpload = false }: Props) {
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [soundcloudConnected, setSoundcloudConnected] = useState(false);
  const [spotifyImported, setSpotifyImported] = useState(0);
  const [soundcloudImported, setSoundcloudImported] = useState(0);
  const [youtubeImported, setYoutubeImported] = useState(0);
  const [spotifyOauthAvailable, setSpotifyOauthAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const stats = await userAPI.getImportStats();
      setSpotifyConnected(Boolean(stats.spotify?.connected));
      setSoundcloudConnected(Boolean(stats.soundcloud?.connected));
      setSpotifyImported(stats.spotify?.imported ?? 0);
      setSoundcloudImported(stats.soundcloud?.imported ?? 0);
      setYoutubeImported(stats.youtube?.imported ?? 0);
      setSpotifyOauthAvailable(
        Boolean(stats.spotify?.oauthAvailable) || Boolean(stats.spotify?.connected)
      );
    } catch {
      const [spotify, soundcloud] = await Promise.all([
        userAPI.getSpotifyStatus().catch(() => ({ connected: false, oauthAvailable: false })),
        userAPI.getSoundCloudStatus().catch(() => ({ connected: false })),
      ]);
      setSpotifyConnected(Boolean(spotify?.connected));
      setSoundcloudConnected(Boolean(soundcloud?.connected));
      setSpotifyOauthAvailable(Boolean(spotify?.oauthAvailable) || Boolean(spotify?.connected));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const subtitle = (
    connected: boolean,
    imported: number,
    disconnectedHint: string
  ) => {
    if (loading) return 'Checking…';
    if (!connected) return disconnectedHint;
    if (imported > 0) return `${imported} in your library`;
    return 'Connected · none imported yet';
  };

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Bring in your library</Text>
      <View style={styles.grid}>
        <Pressable
          style={[styles.card, styles.spotifyCard]}
          onPress={() =>
            router.push({
              pathname: '/import-library',
              params: { source: 'spotify' },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Import from Spotify">
          <View style={styles.iconRow}>
            <Ionicons name="logo-spotify" size={20} color="#86efac" />
            <Text style={styles.titleSpotify}>Spotify</Text>
          </View>
          <Text style={styles.countSpotify}>
            {loading ? '—' : spotifyConnected ? String(spotifyImported) : '—'}
          </Text>
          <Text style={styles.sub}>
            {subtitle(
              spotifyConnected,
              spotifyImported,
              spotifyOauthAvailable
                ? 'Import your saved tracks'
                : 'Request tester access'
            )}
          </Text>
          <Text style={styles.ctaSpotify}>
            {spotifyConnected
              ? 'Import more →'
              : spotifyOauthAvailable
                ? 'Connect →'
                : 'Request →'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.card, styles.soundcloudCard]}
          onPress={() =>
            router.push({
              pathname: '/import-library',
              params: { source: 'soundcloud' },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Import from SoundCloud">
          <View style={styles.iconRow}>
            <FontAwesome name="soundcloud" size={18} color="#fdba74" />
            <Text style={styles.titleSoundcloud}>SoundCloud</Text>
          </View>
          <Text style={styles.countSoundcloud}>
            {loading
              ? '—'
              : soundcloudConnected
                ? String(soundcloudImported)
                : '—'}
          </Text>
          <Text style={styles.sub}>
            {subtitle(
              soundcloudConnected,
              soundcloudImported,
              'Import your liked tracks'
            )}
          </Text>
          <Text style={styles.ctaSoundcloud}>
            {soundcloudConnected ? 'Import more →' : 'Connect →'}
          </Text>
        </Pressable>
      </View>
      <Pressable
        style={styles.youtubeCard}
        onPress={() =>
          router.push({
            pathname: '/import-library',
            params: { source: 'youtube' },
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Import from a YouTube playlist">
        <View style={styles.youtubeIcon}>
          <Ionicons name="logo-youtube" size={20} color="#fca5a5" />
        </View>
        <View style={styles.uploadCopy}>
          <Text style={styles.youtubeTitle}>YouTube playlist</Text>
          <Text style={styles.uploadSub}>
            {loading
              ? 'Checking…'
              : youtubeImported > 0
                ? `${youtubeImported} in your library · paste a public playlist`
                : 'Match a public playlist via MusicBrainz'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
      {showUpload ? (
        <Pressable
          style={styles.uploadCard}
          onPress={() => router.push('/upload')}
          accessibilityRole="button"
          accessibilityLabel="Upload a track">
          <View style={styles.uploadIcon}>
            <Ionicons
              name="cloud-upload-outline"
              size={20}
              color={colors.accentLight}
            />
          </View>
          <View style={styles.uploadCopy}>
            <Text style={styles.uploadTitle}>Upload a track</Text>
            <Text style={styles.uploadSub}>MP3 you own or have rights to</Text>
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
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  spotifyCard: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  soundcloudCard: {
    borderColor: 'rgba(249, 115, 22, 0.4)',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleSpotify: {
    color: '#86efac',
    fontSize: 14,
    fontWeight: '700',
  },
  titleSoundcloud: {
    color: '#fdba74',
    fontSize: 14,
    fontWeight: '700',
  },
  countSpotify: {
    marginTop: 10,
    color: '#bbf7d0',
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  countSoundcloud: {
    marginTop: 10,
    color: '#fed7aa',
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  sub: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  ctaSpotify: {
    marginTop: 10,
    color: '#86efac',
    fontSize: 12,
    fontWeight: '700',
  },
  ctaSoundcloud: {
    marginTop: 10,
    color: '#fdba74',
    fontSize: 12,
    fontWeight: '700',
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
  uploadCopy: {
    flex: 1,
  },
  uploadTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  uploadSub: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
});
