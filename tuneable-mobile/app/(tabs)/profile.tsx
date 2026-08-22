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
import { WelcomeCreditClaimCard } from '@/src/components/WelcomeCreditClaimCard';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { canUploadMedia } from '@/src/lib/permissions';
import { colors } from '@/src/theme/colors';
import type {
  MediaChampionTitle,
  TipTagChampion,
  TuneBytesTagRanking,
  User,
  UserLibraryItem,
} from '@/src/types/user';

export default function ProfileScreen() {
  const { user, logout, deleteAccount, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const canUpload = canUploadMedia(user);
  const [profileUser, setProfileUser] = useState<User | null>(null);
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
        setProfileUser(profileRes.user);
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

  const heroUser: User | null = user
    ? {
        ...user,
        ...(profileUser ?? {}),
        // Prefer live auth wallet balance over profile snapshot.
        balance: user.balance,
        id: user.id,
        uuid: user.uuid ?? profileUser?.uuid,
        _id: user._id ?? profileUser?._id,
      }
    : null;

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onLogout = async () => {
    await logout();
    router.replace('/');
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
            {heroUser ? (
              <UserProfileHero
                user={heroUser}
                rankings={rankings}
                tipTagChampions={tipTagChampions}
                mediaChampions={mediaChampions}
                isOwnProfile
                onWalletPress={() => router.push('/wallet')}
              />
            ) : null}
            <WelcomeCreditClaimCard />
            <View style={styles.addRow}>
              <Pressable
                style={styles.addBtn}
                onPress={() => router.push('/music-search')}
                accessibilityRole="button"
                accessibilityLabel="Add Music">
                <Ionicons name="add" size={18} color={colors.text} />
                <Text style={styles.addBtnText}>Add Music</Text>
              </Pressable>
              <Pressable
                style={styles.addBtn}
                onPress={() => router.push('/podcast-search')}
                accessibilityRole="button"
                accessibilityLabel="Add Podcast">
                <Ionicons name="add" size={18} color={colors.text} />
                <Text style={styles.addBtnText}>Add Podcast</Text>
              </Pressable>
            </View>
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
        onDeleteAccount={async () => {
          await deleteAccount();
          router.replace('/');
        }}
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
  addRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addBtnText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  error: {
    color: '#fca5a5',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});
