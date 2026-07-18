import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { ProfileSettingsSheet } from '@/src/components/ProfileSettingsSheet';
import { UserLibrarySection } from '@/src/components/UserLibrarySection';
import { UserProfileHero } from '@/src/components/UserProfileHero';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { canUploadMedia } from '@/src/lib/permissions';
import { colors } from '@/src/theme/colors';
import type {
  MediaChampionTitle,
  TipTagChampion,
  TuneBytesTagRanking,
  UserLibraryItem,
  UserStats,
} from '@/src/types/user';

export default function ProfileScreen() {
  const { user, logout, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const canUpload = canUploadMedia(user);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [library, setLibrary] = useState<UserLibraryItem[]>([]);
  const [rankings, setRankings] = useState<TuneBytesTagRanking[]>([]);
  const [tipTagChampions, setTipTagChampions] = useState<TipTagChampion[]>([]);
  const [mediaChampions, setMediaChampions] = useState<MediaChampionTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!user?.uuid && !user?.id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const userId = user.uuid || user.id;
        const [profileRes, libraryRes, rankingsRes, championsRes] =
          await Promise.all([
            userAPI.getProfileById(userId),
            userAPI.getTuneLibrary(),
            userAPI.getTuneBytesTagRankings(userId, 5).catch(() => ({
              tuneBytesTagRankings: [],
            })),
            userAPI
              .getChampionTitles(userId, {
                mediaLimit: 8,
                checkMediaLimit: 40,
              })
              .catch(() => ({ tags: [], media: [] })),
          ]);
        setStats(profileRes.stats);
        setLibrary(libraryRes.library ?? []);
        setRankings(rankingsRes.tuneBytesTagRankings ?? []);
        setTipTagChampions(championsRes.tags ?? []);
        setMediaChampions(championsRes.media ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, user?.uuid]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <View style={{ width: 36 }} />
        <Pressable
          style={styles.gearBtn}
          onPress={() => setSettingsOpen(true)}
          hitSlop={10}>
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <FlatList
        data={[{ key: 'library' }]}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(24, contentPaddingBottom) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accentLight}
          />
        }
        ListHeaderComponent={
          <View>
            {user ? (
              <UserProfileHero
                user={user}
                stats={stats}
                rankings={rankings}
                tipTagChampions={tipTagChampions}
                mediaChampions={mediaChampions}
                isOwnProfile
                onWalletPress={() => router.push('/wallet')}
              />
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading && !library.length ? (
              <ActivityIndicator
                color={colors.accentLight}
                style={{ marginTop: 8, marginBottom: 20 }}
              />
            ) : null}
          </View>
        }
        renderItem={() => (
          <UserLibrarySection
            items={library}
            user={user}
            onBalanceUpdate={updateBalance}
            contentPaddingBottom={12}
          />
        )}
      />

      <ProfileSettingsSheet
        visible={settingsOpen}
        inviteCode={user?.primaryInviteCode || user?.personalInviteCode}
        username={user?.username}
        canUpload={canUpload}
        onClose={() => setSettingsOpen(false)}
        onWallet={() => {
          setSettingsOpen(false);
          router.push('/wallet');
        }}
        onUpload={() => {
          setSettingsOpen(false);
          router.push('/upload');
        }}
        onSignOut={() => void onLogout()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 4,
    marginBottom: 4,
  },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  error: {
    color: '#fca5a5',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});
