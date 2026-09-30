import { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
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
import { championBadgesFromResponse } from '@/src/lib/championBadges';
import { canUploadMedia } from '@/src/lib/permissions';
import { colors } from '@/src/theme/colors';
import type {
  ChampionBadge,
  TuneBytesTagRanking,
  User,
  UserLibraryItem,
} from '@/src/types/user';

export default function ProfileScreen() {
  const { user, logout, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const canUpload = canUploadMedia(user);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [library, setLibrary] = useState<UserLibraryItem[]>([]);
  const [rankings, setRankings] = useState<TuneBytesTagRanking[]>([]);
  const [championBadges, setChampionBadges] = useState<ChampionBadge[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [badgesLoading, setBadgesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addMediaOpen, setAddMediaOpen] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!user?.uuid && !user?.id) return;
      if (isRefresh) setRefreshing(true);
      setLibraryLoading(true);
      setBadgesLoading(true);
      setError(null);
      const userId = user.uuid || user.id;

      const profileLoad = userAPI
        .getProfileById(userId)
        .then((res) => setProfileUser(res.user))
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load profile');
        });
      const rankingsLoad = userAPI
        .getTuneBytesTagRankings(userId, 5)
        .then((res) => setRankings(res.tuneBytesTagRankings ?? []))
        .catch(() => {});
      const championsLoad = userAPI
        .getChampionTitles(userId, {
          mediaLimit: 8,
          checkMediaLimit: 40,
          badgeLimit: 8,
        })
        .then((res) => setChampionBadges(championBadgesFromResponse(res)))
        .catch(() => {});
      const badgesLoad = Promise.all([rankingsLoad, championsLoad]).finally(() => {
        setBadgesLoading(false);
      });

      const libraryLoad = (async () => {
        try {
          const libraryRes = await userAPI.getTuneLibrary();
          setLibrary(libraryRes.library ?? []);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load library');
        } finally {
          setLibraryLoading(false);
        }
      })();

      try {
        await Promise.all([profileLoad, badgesLoad, libraryLoad]);
      } finally {
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
        tuneBytes: profileUser?.tuneBytes ?? user.tuneBytes,
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

  const onLogout = () => {
    void logout();
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
            {heroUser ? (
              <UserProfileHero
                user={heroUser}
                rankings={rankings}
                championBadges={championBadges}
                badgesLoading={badgesLoading}
                isOwnProfile
                onWalletPress={() => router.push('/wallet')}
                onSettingsPress={() => setSettingsOpen(true)}
              />
            ) : null}
            <WelcomeCreditClaimCard />
            <View style={styles.addRow}>
              <Pressable
                style={styles.addBtn}
                onPress={() => setAddMediaOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Add Media">
                <Ionicons name="add" size={18} color={colors.text} />
                <Text style={styles.addBtnText}>Add Media</Text>
              </Pressable>
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        renderItem={() => (
          <UserLibrarySection
            items={library}
            user={user}
            loading={libraryLoading}
            onBalanceUpdate={updateBalance}
            contentPaddingBottom={12}
          />
        )}
      />

      <Modal
        visible={addMediaOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setAddMediaOpen(false)}>
        <Pressable
          style={styles.addSheetBackdrop}
          onPress={() => setAddMediaOpen(false)}>
          <Pressable
            style={styles.addSheet}
            onPress={(e) => e.stopPropagation()}>
            <View style={styles.addSheetHandle} />
            <View style={styles.addSheetHeader}>
              <Text style={styles.addSheetTitle}>Add Media</Text>
              <Pressable
                onPress={() => setAddMediaOpen(false)}
                hitSlop={10}
                accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>
            <Pressable
              style={styles.addSheetRow}
              onPress={() => {
                setAddMediaOpen(false);
                router.push('/music-search');
              }}
              accessibilityRole="button"
              accessibilityLabel="Add Music">
              <Ionicons
                name="musical-notes-outline"
                size={20}
                color={colors.accentLight}
              />
              <View style={styles.addSheetCopy}>
                <Text style={styles.addSheetRowText}>Music</Text>
                <Text style={styles.addSheetRowHint}>
                  Search and tip to add a tune
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={[
                styles.addSheetRow,
                !canUpload && styles.addSheetRowLast,
              ]}
              onPress={() => {
                setAddMediaOpen(false);
                router.push('/podcast-search');
              }}
              accessibilityRole="button"
              accessibilityLabel="Add Podcast">
              <Ionicons
                name="mic-outline"
                size={20}
                color={colors.accentLight}
              />
              <View style={styles.addSheetCopy}>
                <Text style={styles.addSheetRowText}>Podcast</Text>
                <Text style={styles.addSheetRowHint}>
                  Search and tip to add an episode
                </Text>
              </View>
            </Pressable>
            {canUpload ? (
              <Pressable
                style={[styles.addSheetRow, styles.addSheetRowLast]}
                onPress={() => {
                  setAddMediaOpen(false);
                  router.push('/upload');
                }}
                accessibilityRole="button"
                accessibilityLabel="Upload audio">
                <Ionicons
                  name="cloud-upload-outline"
                  size={20}
                  color={colors.accentLight}
                />
                <View style={styles.addSheetCopy}>
                  <Text style={styles.addSheetRowText}>Upload</Text>
                  <Text style={styles.addSheetRowHint}>
                    Upload your own audio
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <ProfileSettingsSheet
        visible={settingsOpen}
        inviteCode={user?.primaryInviteCode || user?.personalInviteCode}
        username={user?.username}
        isFoundingCreator={Boolean(user?.isFoundingCreator)}
        canUpload={canUpload}
        onClose={() => setSettingsOpen(false)}
        onWallet={() => {
          setSettingsOpen(false);
          router.push('/wallet');
        }}
        onEditProfile={() => {
          setSettingsOpen(false);
          router.push('/edit-profile');
        }}
        onChangePassword={() => {
          setSettingsOpen(false);
          router.push('/change-password');
        }}
        onUpload={() => {
          setSettingsOpen(false);
          router.push('/upload');
        }}
        onSignOut={() => void onLogout()}
        onDeleteAccount={() => userAPI.deleteAccount()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
  addSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  addSheet: {
    backgroundColor: colors.gradientStart,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 36,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  addSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 12,
  },
  addSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  addSheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  addSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  addSheetRowLast: {
    borderBottomWidth: 0,
  },
  addSheetCopy: {
    flex: 1,
    gap: 2,
  },
  addSheetRowText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  addSheetRowHint: {
    color: colors.textMuted,
    fontSize: 13,
  },
  error: {
    color: '#fca5a5',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});
