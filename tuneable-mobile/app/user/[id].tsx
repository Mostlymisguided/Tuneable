import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { UserLibrarySection } from '@/src/components/UserLibrarySection';
import { UserProfileHero } from '@/src/components/UserProfileHero';
import { ReportSheet } from '@/src/components/ReportSheet';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { useBlockedUsersStore } from '@/src/stores/blockedUsersStore';
import { colors } from '@/src/theme/colors';
import { championBadgesFromResponse } from '@/src/lib/championBadges';
import type {
  ChampionBadge,
  TuneBytesTagRanking,
  User,
  UserLibraryItem,
} from '@/src/types/user';

export default function PublicUserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: authUser, updateBalance, isAuthenticated } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [library, setLibrary] = useState<UserLibraryItem[]>([]);
  const [rankings, setRankings] = useState<TuneBytesTagRanking[]>([]);
  const [championBadges, setChampionBadges] = useState<ChampionBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const markBlocked = useBlockedUsersStore((s) => s.markBlocked);
  const markUnblocked = useBlockedUsersStore((s) => s.markUnblocked);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [profileRes, libraryRes, rankingsRes, championsRes] =
          await Promise.all([
            userAPI.getProfileById(id),
            userAPI.getTuneLibraryByUserId(id),
            userAPI.getTuneBytesTagRankings(id, 5).catch(() => ({
              tuneBytesTagRankings: [],
            })),
            userAPI
              .getChampionTitles(id, {
                mediaLimit: 8,
                checkMediaLimit: 40,
                badgeLimit: 8,
              })
              .catch(() => ({ tags: [], media: [], badges: [] })),
          ]);
        setUser(profileRes.user);
        setLibrary(libraryRes.library ?? []);
        setRankings(rankingsRes.tuneBytesTagRankings ?? []);
        setChampionBadges(championBadgesFromResponse(championsRes));
        setBlockedByMe(Boolean(profileRes.blockedByMe));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const isOwnProfile = Boolean(
    user &&
      authUser &&
      ((authUser._id && authUser._id === user._id) ||
        (authUser.uuid && authUser.uuid === user.uuid) ||
        authUser.id === user.id)
  );

  useEffect(() => {
    if (isOwnProfile) {
      router.replace('/(tabs)/profile');
    }
  }, [isOwnProfile]);

  if (isOwnProfile) return null;

  const targetId = user?.uuid || user?.id || user?._id || id || '';

  const confirmBlock = () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    Alert.alert(
      'Block this user?',
      'You will no longer see their profile activity. You can unblock them later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBlockBusy(true);
              try {
                await userAPI.blockUser(targetId);
                setBlockedByMe(true);
                markBlocked(targetId, [user?.uuid, user?.id, user?._id, user?.username]);
              } catch (err) {
                Alert.alert(
                  'Could not block user',
                  getApiErrorMessage(err, 'Please try again.')
                );
              } finally {
                setBlockBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  const unblock = async () => {
    setBlockBusy(true);
    try {
      await userAPI.unblockUser(targetId);
      setBlockedByMe(false);
      markUnblocked(targetId, [user?.uuid, user?.id, user?._id, user?.username]);
    } catch (err) {
      Alert.alert(
        'Could not unblock user',
        getApiErrorMessage(err, 'Please try again.')
      );
    } finally {
      setBlockBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
      </View>

      {loading && !user ? (
        <ActivityIndicator color={colors.accentLight} style={{ marginTop: 48 }} />
      ) : error && !user ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : user ? (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accentLight}
            />
          }
          contentContainerStyle={styles.content}>
          <UserProfileHero
            user={user}
            rankings={rankings}
            championBadges={championBadges}
            onReportPress={() => setReportOpen(true)}
          />
          {blockedByMe ? (
            <View style={styles.blockedBanner}>
              <Text style={styles.blockedText}>You blocked this user</Text>
              <Pressable onPress={() => void unblock()} disabled={blockBusy}>
                <Text style={styles.unblockText}>
                  {blockBusy ? 'Working…' : 'Unblock'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.blockBtn}
              onPress={confirmBlock}
              disabled={blockBusy}
              accessibilityRole="button"
              accessibilityLabel="Block user">
              <Ionicons name="ban-outline" size={16} color="#fca5a5" />
              <Text style={styles.blockBtnText}>
                {blockBusy ? 'Working…' : 'Block user'}
              </Text>
            </Pressable>
          )}
          {blockedByMe ? (
            <Text style={styles.hiddenNote}>
              Their library is hidden while they are blocked.
            </Text>
          ) : (
            <UserLibrarySection
              items={library}
              user={authUser}
              onBalanceUpdate={updateBalance}
              emptyLabel="This user has not tipped any tunes yet."
            />
          )}
          <ReportSheet
            visible={reportOpen}
            reportType="user"
            targetId={targetId}
            targetTitle={`@${user.username}`}
            onClose={() => setReportOpen(false)}
          />
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
    paddingBottom: 24,
  },
  centered: {
    paddingHorizontal: 24,
    marginTop: 48,
    alignItems: 'center',
  },
  error: {
    color: '#fca5a5',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  blockBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
    backgroundColor: 'rgba(127, 29, 29, 0.25)',
    paddingVertical: 12,
  },
  blockBtnText: {
    color: '#fecaca',
    fontSize: 15,
    fontWeight: '600',
  },
  blockedBanner: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
    backgroundColor: 'rgba(127, 29, 29, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  blockedText: {
    color: '#fecaca',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  unblockText: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '700',
  },
  hiddenNote: {
    marginTop: 16,
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});
