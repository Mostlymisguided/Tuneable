import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { notificationAPI } from '@/src/api/notifications';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { hrefFromNotificationUrl } from '@/src/lib/pushNotifications';
import { useNotificationStore } from '@/src/stores/notificationStore';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';
import type { AppNotification } from '@/src/types/notification';

function formatNotificationTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const delta = Date.now() - then;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return 'Just now';
  if (delta < hour) return `${Math.floor(delta / minute)}m`;
  if (delta < day) return `${Math.floor(delta / hour)}h`;
  if (delta < 7 * day) return `${Math.floor(delta / day)}d`;
  return new Date(then).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export default function NotificationsScreen() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paging = useRef(false);
  const appendFailed = useRef(false);
  const hasItems = useRef(false);
  const listGen = useRef(0);

  const loadPage = useCallback(
    async (nextPage: number, mode: 'replace' | 'append' | 'refresh') => {
      if (mode === 'append') {
        if (paging.current || appendFailed.current) return;
        paging.current = true;
        setLoadingMore(true);
      } else if (mode === 'refresh') {
        appendFailed.current = false;
        setRefreshing(true);
      } else {
        appendFailed.current = false;
        setLoading(true);
      }
      const gen = listGen.current;
      setError(null);
      try {
        const response = await notificationAPI.getNotifications(nextPage);
        const nextItems = response.notifications ?? [];
        setItems((prev) => (mode === 'append' ? [...prev, ...nextItems] : nextItems));
        hasItems.current =
          mode === 'append' ? hasItems.current || nextItems.length > 0 : nextItems.length > 0;
        setPage(nextPage);
        setHasMore(nextPage < (response.pagination?.pages ?? 0));
        if (
          mode !== 'append' &&
          gen === listGen.current &&
          Number.isFinite(response.unreadCount)
        ) {
          // Opening the inbox counts as seeing it; rows keep their dots until the next visit.
          setUnreadCount(0);
          if (response.unreadCount > 0) {
            void notificationAPI
              .markAllRead()
              .catch(() => useNotificationStore.getState().refreshUnreadCount());
          }
        }
      } catch (err) {
        const message = getApiErrorMessage(err, 'Could not load notifications.');
        if (mode === 'append') {
          appendFailed.current = true;
          showToast(message, 'error');
        } else if (hasItems.current) {
          showToast(message, 'error');
        } else {
          setError(message);
        }
      } finally {
        paging.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [setUnreadCount]
  );

  useFocusEffect(
    useCallback(() => {
      void loadPage(1, 'replace');
    }, [loadPage])
  );

  const openItem = (item: AppNotification) => {
    if (!item.isRead) {
      listGen.current += 1;
      setItems((prev) =>
        prev.map((entry) => (entry._id === item._id ? { ...entry, isRead: true } : entry))
      );
      setUnreadCount(Math.max(0, useNotificationStore.getState().unreadCount - 1));
      void notificationAPI
        .markRead(item._id)
        .then(() => useNotificationStore.getState().refreshUnreadCount())
        .catch(() => {
          void loadPage(1, 'replace');
        });
    }
    const href = hrefFromNotificationUrl(item.link);
    if (href) router.push(href);
  };

  const markAllRead = async () => {
    if (markingAll || unreadCount < 1) return;
    setMarkingAll(true);
    listGen.current += 1;
    try {
      await notificationAPI.markAllRead();
      setItems((prev) => prev.map((entry) => ({ ...entry, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not mark notifications as read.'), 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  if (!authLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable
            onPress={() => void markAllRead()}
            disabled={markingAll}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mark all as read">
            {markingAll ? (
              <ActivityIndicator color={colors.accentLight} />
            ) : (
              <Text style={styles.markAll}>Mark all</Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.markAllSpacer} />
        )}
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.accentLight} style={styles.loader} />
      ) : error && items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void loadPage(1, 'replace')} hitSlop={8}>
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadPage(1, 'refresh')}
              tintColor={colors.accentLight}
            />
          }
          onEndReached={() => {
            if (!hasMore || loadingMore || loading || refreshing || paging.current) return;
            void loadPage(page + 1, 'append');
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyBody}>
                Tips, replies, and outtips will show up here.
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.accentLight} style={styles.footer} />
            ) : null
          }
          renderItem={({ item }) => {
            const when = formatNotificationTime(item.createdAt);
            return (
              <Pressable
                onPress={() => openItem(item)}
                style={[styles.row, !item.isRead && styles.rowUnread]}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.message}`}>
                {!item.isRead ? <View style={styles.unreadDot} /> : <View style={styles.dotSpacer} />}
                <View style={styles.rowCopy}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {when ? <Text style={styles.time}>{when}</Text> : null}
                  </View>
                  <Text style={styles.rowMessage}>{item.message}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 4,
  },
  back: { marginLeft: -6 },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  markAll: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '700',
  },
  markAllSpacer: { width: 64 },
  loader: { marginTop: 32 },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
    marginBottom: 8,
  },
  rowUnread: {
    backgroundColor: 'rgba(147, 51, 234, 0.18)',
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: colors.accentLight,
  },
  dotSpacer: { width: 8 },
  rowCopy: { flex: 1, gap: 4 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  time: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  rowMessage: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
    textAlign: 'center',
  },
  retry: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '700',
  },
  footer: { marginVertical: 16 },
});
