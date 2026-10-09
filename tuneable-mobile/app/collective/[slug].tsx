import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { collectiveAPI, type Collective } from '@/src/api/collectives';
import { Screen } from '@/src/components/Screen';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence } from '@/src/lib/format';
import { collectiveTypeLabel, venueKindLabel } from '@/src/lib/collectiveTypes';
import { getPlaceProfileHref } from '@/src/lib/location';
import { colors } from '@/src/theme/colors';
import { DEFAULT_PROFILE_PIC } from '@/src/types/user';

export default function CollectiveProfileScreen() {
  const { slug: slugParam } = useLocalSearchParams<{ slug: string }>();
  const slug = typeof slugParam === 'string' ? decodeURIComponent(slugParam) : '';
  const { contentPaddingBottom } = usePlayerDockState();

  const [collective, setCollective] = useState<Collective | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await collectiveAPI.getProfile(slug);
      setCollective(data.collective);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Collective not found or failed to load.'
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const openLink = (url?: string) => {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    void Linking.openURL(fullUrl);
  };

  const typeLabel = collective ? collectiveTypeLabel(collective.type) : '';
  const kindLabel = collective?.venueKind ? venueKindLabel(collective.venueKind) : '';
  const displayType =
    collective?.type === 'venue' && kindLabel ? kindLabel : typeLabel;

  return (
    <Screen padForPlayer={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
      </View>

      {loading && !collective ? (
        <ActivityIndicator color={colors.accentLight} style={{ marginTop: 48 }} />
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : collective ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(24, contentPaddingBottom + 24) },
          ]}>
          <View style={styles.hero}>
            <Image
              source={{
                uri: collective.profilePicture || DEFAULT_PROFILE_PIC,
              }}
              style={styles.profilePic}
            />
            {displayType ? (
              <Text style={styles.eyebrow}>{displayType}</Text>
            ) : null}
            <Text style={styles.title}>{collective.name}</Text>

            {collective.location?.display ? (
              <Pressable
                onPress={() => {
                  const href = getPlaceProfileHref(collective.location?.placeId);
                  if (href) router.push(href);
                }}
                style={styles.locationChip}>
                <Ionicons name="location" size={14} color="#38bdf8" />
                <Text style={styles.locationText}>
                  {collective.location.display}
                </Text>
              </Pressable>
            ) : null}

            {collective.description ? (
              <Text style={styles.description}>{collective.description}</Text>
            ) : null}

            {collective.stats?.globalCollectiveAggregate ? (
              <View style={styles.statChips}>
                <View style={styles.statChip}>
                  <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.statChipText}>
                    {formatPoundsFromPence(
                      collective.stats.globalCollectiveAggregate
                    )}{' '}
                    <Text style={styles.statChipMuted}>total support</Text>
                  </Text>
                </View>
                {collective.stats.memberCount ? (
                  <View style={styles.statChip}>
                    <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.statChipText}>
                      {collective.stats.memberCount}{' '}
                      {collective.stats.memberCount === 1 ? 'member' : 'members'}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Social links */}
            {collective.socialMedia ||
            collective.website ||
            collective.email ? (
              <View style={styles.linksSection}>
                <Text style={styles.linksTitle}>Links</Text>
                <View style={styles.linksGrid}>
                  {collective.website ? (
                    <Pressable
                      style={styles.linkBtn}
                      onPress={() => openLink(collective.website)}>
                      <Ionicons name="globe-outline" size={18} color={colors.accent} />
                      <Text style={styles.linkBtnText}>Website</Text>
                    </Pressable>
                  ) : null}
                  {collective.email ? (
                    <Pressable
                      style={styles.linkBtn}
                      onPress={() => openLink(`mailto:${collective.email}`)}>
                      <Ionicons name="mail-outline" size={18} color={colors.accent} />
                      <Text style={styles.linkBtnText}>Email</Text>
                    </Pressable>
                  ) : null}
                  {collective.socialMedia?.instagram ? (
                    <Pressable
                      style={styles.linkBtn}
                      onPress={() =>
                        openLink(
                          `https://instagram.com/${collective.socialMedia?.instagram}`
                        )
                      }>
                      <Ionicons name="logo-instagram" size={18} color={colors.accent} />
                      <Text style={styles.linkBtnText}>Instagram</Text>
                    </Pressable>
                  ) : null}
                  {collective.socialMedia?.facebook ? (
                    <Pressable
                      style={styles.linkBtn}
                      onPress={() => openLink(collective.socialMedia?.facebook)}>
                      <Ionicons name="logo-facebook" size={18} color={colors.accent} />
                      <Text style={styles.linkBtnText}>Facebook</Text>
                    </Pressable>
                  ) : null}
                  {collective.socialMedia?.twitter ? (
                    <Pressable
                      style={styles.linkBtn}
                      onPress={() =>
                        openLink(
                          `https://twitter.com/${collective.socialMedia?.twitter}`
                        )
                      }>
                      <Ionicons name="logo-twitter" size={18} color={colors.accent} />
                      <Text style={styles.linkBtnText}>Twitter</Text>
                    </Pressable>
                  ) : null}
                  {collective.socialMedia?.youtube ? (
                    <Pressable
                      style={styles.linkBtn}
                      onPress={() => openLink(collective.socialMedia?.youtube)}>
                      <Ionicons name="logo-youtube" size={18} color={colors.accent} />
                      <Text style={styles.linkBtnText}>YouTube</Text>
                    </Pressable>
                  ) : null}
                  {collective.socialMedia?.spotify ? (
                    <Pressable
                      style={styles.linkBtn}
                      onPress={() => openLink(collective.socialMedia?.spotify)}>
                      <Ionicons name="musical-note" size={18} color={colors.accent} />
                      <Text style={styles.linkBtnText}>Spotify</Text>
                    </Pressable>
                  ) : null}
                  {collective.socialMedia?.soundcloud ? (
                    <Pressable
                      style={styles.linkBtn}
                      onPress={() => openLink(collective.socialMedia?.soundcloud)}>
                      <Ionicons name="cloud" size={18} color={colors.accent} />
                      <Text style={styles.linkBtnText}>SoundCloud</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {collective.genres && collective.genres.length > 0 ? (
              <View style={styles.genresSection}>
                <Text style={styles.genresTitle}>Genres</Text>
                <View style={styles.genresWrap}>
                  {collective.genres.map((genre, index) => (
                    <View key={index} style={styles.genreChip}>
                      <Text style={styles.genreText}>{genre}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    marginBottom: 4,
  },
  back: { marginLeft: -2 },
  content: {
    paddingHorizontal: 16,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 16,
  },
  profilePic: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  eyebrow: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    borderRadius: 999,
    marginBottom: 12,
  },
  locationText: {
    color: '#bae6fd',
    fontSize: 13,
    fontWeight: '600',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  statChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  statChipMuted: {
    color: colors.textMuted,
    fontSize: 12,
  },
  linksSection: {
    width: '100%',
    marginTop: 8,
    marginBottom: 20,
  },
  linksTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  linksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(126, 34, 206, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    borderRadius: 10,
  },
  linkBtnText: {
    color: '#e9d5ff',
    fontSize: 13,
    fontWeight: '600',
  },
  genresSection: {
    width: '100%',
    marginTop: 8,
  },
  genresTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  genresWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
    borderRadius: 999,
  },
  genreText: {
    color: '#e9d5ff',
    fontSize: 12,
    fontWeight: '600',
  },
  centered: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 48,
    gap: 12,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
  },
});
