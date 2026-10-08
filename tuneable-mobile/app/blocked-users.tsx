import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { userAPI, type BlockedUser } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { useBlockedUsersStore } from '@/src/stores/blockedUsersStore';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';
import { DEFAULT_PROFILE_PIC } from '@/src/types/user';

export default function BlockedUsersScreen() {
  const { isAuthenticated, isLoading } = useAuth();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const markUnblocked = useBlockedUsersStore((s) => s.markUnblocked);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const res = await userAPI.getBlockedUsers();
      setBlocked(res.blocked ?? []);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load blocked users.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated) void load();
    }, [isAuthenticated, load])
  );

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const unblock = async (entry: BlockedUser) => {
    setBusyId(entry.id);
    try {
      await userAPI.unblockUser(entry.id);
      markUnblocked(entry.id, [entry.uuid, entry._id, entry.username]);
      setBlocked((prev) => prev.filter((b) => b.id !== entry.id));
      showToast(`Unblocked @${entry.username ?? 'user'}`);
    } catch (err) {
      Alert.alert('Could not unblock user', getApiErrorMessage(err, 'Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
      </View>
      <Text style={styles.title}>Blocked users</Text>
      <Text style={styles.body}>
        Blocked users can&apos;t see your profile, reply to your comments, or invite you, and
        you won&apos;t see their activity.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.accentLight} style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.accentLight}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>You haven&apos;t blocked anyone.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable
                style={styles.identity}
                onPress={() => router.push(`/user/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open @${item.username ?? 'user'}`}>
                <Image
                  source={{ uri: item.profilePic || DEFAULT_PROFILE_PIC }}
                  style={styles.avatar}
                />
                <Text style={styles.username} numberOfLines={1}>
                  @{item.username ?? 'user'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.unblockBtn, busyId === item.id && styles.disabled]}
                onPress={() => void unblock(item)}
                disabled={busyId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Unblock @${item.username ?? 'user'}`}>
                {busyId === item.id ? (
                  <ActivityIndicator color={colors.accentLight} size="small" />
                ) : (
                  <Text style={styles.unblockText}>Unblock</Text>
                )}
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  back: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  username: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  unblockBtn: {
    minWidth: 84,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unblockText: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '700',
  },
  disabled: { opacity: 0.6 },
  empty: {
    marginTop: 32,
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  centered: {
    paddingHorizontal: 24,
    marginTop: 32,
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
});
