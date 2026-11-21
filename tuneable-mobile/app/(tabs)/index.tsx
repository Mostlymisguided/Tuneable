import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { ArtworkLoader } from '@/src/components/ArtworkCube';
import { UserAvatar } from '@/src/components/UserAvatar';
import { CoverRail, type CoverRailItem } from '@/src/components/CoverRail';
import { DashboardPrompts } from '@/src/components/DashboardPrompts';
import { WelcomeCreditClaimCard } from '@/src/components/WelcomeCreditClaimCard';
import { InviteShareCard } from '@/src/components/InviteShareCard';
import { LibraryImportCards } from '@/src/components/LibraryImportCards';
import { RecentActivityFeed } from '@/src/components/RecentActivityFeed';
import { partyAPI } from '@/src/api/party';
import { userAPI } from '@/src/api/user';
import { showToast } from '@/src/stores/toastStore';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence, formatTuneBytes } from '@/src/lib/format';
import {
  formatLocationLabel,
  getPlaceProfileHref,
} from '@/src/lib/location';
import {
  getCreatorDisplay,
  getChartTipPence,
  mediaId,
} from '@/src/lib/media';
import { hasHomeLocation } from '@/src/lib/onboarding';
import { canUploadMedia } from '@/src/lib/permissions';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { useNotificationStore } from '@/src/stores/notificationStore';
import { colors } from '@/src/theme/colors';
import {
  GLOBAL_PARTY_ID,
  type ChartMediaItem,
} from '@/src/types/media';

const RISING_PREVIEW_COUNT = 10;

export default function HomeScreen() {
  const { user, updateBalance } = useAuth();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const { contentPaddingBottom } = usePlayerDockState();
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);
  const canUpload = canUploadMedia(user);

  const [rising, setRising] = useState<ChartMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityRevision, setActivityRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const risingRail = useMemo<CoverRailItem[]>(
    () =>
      rising.map((item, index) => ({
        key: mediaId(item) || String(index),
        title: item.title || 'Untitled',
        subtitle: getCreatorDisplay(item),
        coverArt: item.coverArt,
        meta: formatPoundsFromPence(getChartTipPence(item, 'this-week')),
        badge: String(index + 1),
      })),
    [rising]
  );

  const homeLabel = formatLocationLabel(user?.homeLocation);
  const locationSet = hasHomeLocation(user?.homeLocation);
  const placeHref = getPlaceProfileHref(user?.homeLocation?.placeId);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const shell = (async () => {
        try {
          const chartRes = await partyAPI.getMediaSortedByTime(GLOBAL_PARTY_ID, 'this-week');
          setRising((chartRes.media ?? []).slice(0, RISING_PREVIEW_COUNT));
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Failed to load home';
          setError(message);
        } finally {
          setLoading(false);
        }
      })();

      try {
        await shell;
      } finally {
        setRefreshing(false);
        setActivityRevision((current) => current + 1);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onPlayRisingItem = (_item: CoverRailItem, index: number) => {
    void setQueueAndPlay(rising, index);
  };

  const onQueueRisingItem = async (item: CoverRailItem) => {
    if (!item.key) return;
    try {
      await userAPI.addToPlaybackQueue({
        mediaId: item.key,
        sourceType: 'direct',
        position: 'start',
      });
      showToast(`Added ${item.title} to your queue`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add that tune');
    }
  };

  const onLocationPress = () => {
    if (placeHref) {
      router.push(placeHref);
      return;
    }
    router.push('/set-home-location');
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(96, contentPaddingBottom + 24) },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accentLight}
          />
        }>
        <View style={styles.padded}>
          <View style={styles.hero}>
            <Pressable
              onPress={() => router.push('/(tabs)/profile')}
              accessibilityRole="button"
              accessibilityLabel="Open profile">
              <UserAvatar
                username={user?.username}
                profilePic={user?.profilePic}
                style={styles.avatar}
              />
            </Pressable>
            <View style={styles.heroCopy}>
              <Pressable
                onPress={onLocationPress}
                style={styles.locationRow}
                accessibilityRole="button"
                accessibilityLabel={
                  locationSet && homeLabel
                    ? `Home location ${homeLabel}`
                    : 'Add home location'
                }>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={locationSet ? colors.textMuted : colors.accentLight}
                />
                <Text
                  style={[
                    styles.location,
                    !locationSet && styles.locationPrompt,
                  ]}
                  numberOfLines={1}>
                  {locationSet && homeLabel ? homeLabel : 'Add home location'}
                </Text>
              </Pressable>
              <Text style={styles.name} numberOfLines={1}>
                {user?.username ?? 'there'}
              </Text>
              <View style={styles.tbRow}>
                <Ionicons
                  name="sparkles-outline"
                  size={13}
                  color={colors.accentLight}
                />
                <Text style={styles.tbValue}>
                  {formatTuneBytes(user?.tuneBytes)}
                </Text>
                <Text style={styles.tbLabel}>TuneBytes</Text>
              </View>
            </View>
            <Pressable
              onPress={() => router.push('/notifications')}
              style={styles.bell}
              accessibilityRole="button"
              accessibilityLabel={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : 'Notifications'
              }>
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              {unreadCount > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <WelcomeCreditClaimCard />

          <LibraryImportCards showUpload={canUpload} />

          <DashboardPrompts />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loading && rising.length === 0 ? (
            <ArtworkLoader size="section" style={styles.loader} />
          ) : null}
        </View>

        <View style={styles.librarySection}>
          <RecentActivityFeed
            userId={user?.uuid || user?.id}
            revision={activityRevision}
            balancePence={user?.balance}
            onBalanceUpdate={(balance) => {
              updateBalance(balance);
              setActivityRevision((current) => current + 1);
            }}
          />
        </View>

        <CoverRail
          title="Rising this week"
          actionLabel="Full chart"
          onAction={() =>
            router.push({ pathname: '/(tabs)/charts', params: { kind: 'music' } })
          }
          items={risingRail}
          emptyTitle="Nothing rising yet"
          emptyBody="Be the first to tip the global chart this week."
          emptyActionLabel="Add a tune"
          onEmptyAction={() => router.push('/music-search')}
          onOpen={(item) => {
            if (item.key) router.push(`/tune/${item.key}`);
          }}
          onPlay={onPlayRisingItem}
          onQueue={(item) => {
            void onQueueRisingItem(item);
          }}
        />

        <View style={styles.padded}>
          <InviteShareCard
            inviteCode={user?.primaryInviteCode || user?.personalInviteCode}
            username={user?.username}
            isFoundingCreator={Boolean(user?.isFoundingCreator)}
            ambassadorStatus={user?.ambassador?.status || null}
            collapsible
            defaultCollapsed
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 12,
  },
  padded: {
    paddingHorizontal: 16,
  },
  librarySection: {
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  location: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  locationPrompt: {
    color: colors.accentLight,
  },
  name: {
    marginTop: 1,
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  tbRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tbValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tbLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  bellBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  error: {
    color: '#fca5a5',
    marginBottom: 8,
  },
  loader: {
    marginVertical: 20,
  },
});
