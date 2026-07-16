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
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { UserLibrarySection } from '@/src/components/UserLibrarySection';
import { UserProfileHero } from '@/src/components/UserProfileHero';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { colors } from '@/src/theme/colors';
import type {
  TuneBytesTagRanking,
  UserLibraryItem,
  UserStats,
} from '@/src/types/user';

export default function ProfileScreen() {
  const { user, logout, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [library, setLibrary] = useState<UserLibraryItem[]>([]);
  const [rankings, setRankings] = useState<TuneBytesTagRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!user?.uuid && !user?.id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const userId = user.uuid || user.id;
        const [profileRes, libraryRes, rankingsRes] = await Promise.all([
          userAPI.getProfileById(userId),
          userAPI.getTuneLibrary(),
          userAPI.getTuneBytesTagRankings(userId, 5).catch(() => ({
            tuneBytesTagRankings: [],
          })),
        ]);
        setStats(profileRes.stats);
        setLibrary(libraryRes.library ?? []);
        setRankings(rankingsRes.tuneBytesTagRankings ?? []);
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
            <Text style={styles.title}>Profile</Text>
            {user ? (
              <UserProfileHero
                user={user}
                stats={stats}
                rankings={rankings}
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
        ListFooterComponent={
          <Pressable style={styles.button} onPress={() => void onLogout()}>
            <Text style={styles.buttonText}>Sign out</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  error: {
    color: '#fca5a5',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  button: {
    marginTop: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fecaca', fontSize: 16, fontWeight: '600' },
});
