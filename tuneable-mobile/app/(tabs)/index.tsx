import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { CoverRail, type CoverRailItem } from '@/src/components/CoverRail';
import { DashboardPrompts } from '@/src/components/DashboardPrompts';
import { InviteShareCard } from '@/src/components/InviteShareCard';
import { partyAPI } from '@/src/api/party';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence, formatTuneBytes } from '@/src/lib/format';
import {
  formatArtist,
  getChartTipPence,
  mediaId,
} from '@/src/lib/media';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { canUploadMedia } from '@/src/lib/permissions';
import { colors } from '@/src/theme/colors';
import {
  GLOBAL_PARTY_ID,
  type ChartMediaItem,
} from '@/src/types/media';
import {
  DEFAULT_PROFILE_PIC,
  type UserLibraryItem,
  type UserStats,
} from '@/src/types/user';

const RISING_PREVIEW_COUNT = 10;
const LIBRARY_PREVIEW_COUNT = 10;

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Hey';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function libraryToChartItem(item: UserLibraryItem): ChartMediaItem {
  return {
    _id: item.mediaId,
    uuid: item.mediaUuid,
    title: item.title,
    artist: item.artist,
    coverArt: item.coverArt ?? undefined,
    duration: item.duration ?? undefined,
    bpm: item.bpm ?? null,
    releaseDate: item.releaseDate ?? null,
    releaseYear: item.releaseYear ?? null,
    primaryLocation: item.primaryLocation ?? null,
    tags: item.tags ?? [],
    sources: item.sources ?? {},
    partyMediaAggregate: item.globalUserMediaAggregate ?? 0,
    globalMediaAggregate: item.globalMediaAggregate ?? 0,
  };
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);
  const canUpload = canUploadMedia(user);

  const [rising, setRising] = useState<ChartMediaItem[]>([]);
  const [library, setLibrary] = useState<UserLibraryItem[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const libraryPreview = useMemo(() => {
    return [...library]
      .sort((a, b) => {
        const aTime = a.lastBidAt ? new Date(a.lastBidAt).getTime() : 0;
        const bTime = b.lastBidAt ? new Date(b.lastBidAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, LIBRARY_PREVIEW_COUNT);
  }, [library]);

  const libraryRail = useMemo<CoverRailItem[]>(
    () =>
      libraryPreview.map((item) => ({
        key: item.mediaId,
        title: item.title || 'Untitled',
        subtitle: item.artist || 'Unknown artist',
        coverArt: item.coverArt,
        meta: formatPoundsFromPence(item.globalUserMediaAggregate),
      })),
    [libraryPreview]
  );

  const risingRail = useMemo<CoverRailItem[]>(
    () =>
      rising.map((item, index) => ({
        key: mediaId(item) || String(index),
        title: item.title || 'Untitled',
        subtitle: formatArtist(item.artist),
        coverArt: item.coverArt,
        meta: formatPoundsFromPence(getChartTipPence(item, 'today')),
        badge: String(index + 1),
      })),
    [rising]
  );

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const userId = user?.uuid || user?.id;
        const [chartRes, libraryRes, profileRes] = await Promise.all([
          partyAPI.getMediaSortedByTime(GLOBAL_PARTY_ID, 'today'),
          userAPI.getTuneLibrary().catch(() => ({ library: [], total: 0 })),
          userId
            ? userAPI.getProfileById(userId).catch(() => null)
            : Promise.resolve(null),
        ]);
        setRising((chartRes.media ?? []).slice(0, RISING_PREVIEW_COUNT));
        setLibrary(libraryRes.library ?? []);
        setStats(profileRes?.stats ?? null);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load home';
        setError(message);
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

  const onPlayRisingItem = (_item: CoverRailItem, index: number) => {
    void setQueueAndPlay(rising, index);
  };

  const onPlayLibraryItem = (_item: CoverRailItem, index: number) => {
    const queue = libraryPreview.map(libraryToChartItem);
    void setQueueAndPlay(queue, index);
  };

  const avgTipPence = stats?.averageBidAmount ?? 0;
  const totalTips = stats?.totalBids ?? library.length;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(96, contentPaddingBottom + 24) },
        ]}
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
              <Image
                source={{ uri: user?.profilePic || DEFAULT_PROFILE_PIC }}
                style={styles.avatar}
              />
            </Pressable>
            <View style={styles.heroCopy}>
              <Text style={styles.greeting}>{greetingForNow()}</Text>
              <Text style={styles.name} numberOfLines={1}>
                {user?.username ?? 'there'}
              </Text>
            </View>
            <Pressable
              style={styles.walletChip}
              onPress={() => router.push('/wallet')}
              accessibilityLabel="Open wallet">
              <Text style={styles.walletChipValue}>
                {formatPoundsFromPence(user?.balance)}
              </Text>
              <Text style={styles.walletChipLabel}>Wallet</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.primaryCta}
            onPress={() => router.push('/music-search')}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.primaryCtaText}>Add a tune</Text>
          </Pressable>

          <View style={styles.secondaryRow}>
            <Pressable
              style={styles.secondaryCta}
              onPress={() => router.push('/import-library')}>
              <Ionicons
                name="cloud-download-outline"
                size={18}
                color={colors.accentLight}
              />
              <Text style={styles.secondaryCtaText}>Import likes</Text>
            </Pressable>
            {canUpload ? (
              <Pressable
                style={styles.secondaryCta}
                onPress={() => router.push('/upload')}>
                <Ionicons
                  name="cloud-upload-outline"
                  size={18}
                  color={colors.accentLight}
                />
                <Text style={styles.secondaryCtaText}>Upload</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.secondaryCta}
                onPress={() => router.push('/(tabs)/music')}>
                <Ionicons
                  name="trending-up"
                  size={18}
                  color={colors.accentLight}
                />
                <Text style={styles.secondaryCtaText}>Music chart</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statsRow}>
              <StatCard
                icon="wallet-outline"
                label="Wallet"
                value={formatPoundsFromPence(user?.balance)}
                onPress={() => router.push('/wallet')}
              />
              <StatCard
                icon="sparkles-outline"
                label="TuneBytes"
                value={formatTuneBytes(user?.tuneBytes)}
              />
            </View>
            <View style={styles.statsRow}>
              <StatCard
                icon="heart-outline"
                label="Avg tip"
                value={formatPoundsFromPence(avgTipPence)}
              />
              <StatCard
                icon="musical-notes-outline"
                label="Tips"
                value={String(totalTips)}
                onPress={() => router.push('/(tabs)/profile')}
              />
            </View>
          </View>

          <DashboardPrompts />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loading && rising.length === 0 && libraryPreview.length === 0 ? (
            <ActivityIndicator
              color={colors.accentLight}
              style={styles.loader}
            />
          ) : null}
        </View>

        <CoverRail
          title="Recently tipped"
          actionLabel="Library"
          onAction={() => router.push('/(tabs)/profile')}
          items={libraryRail}
          emptyTitle="No tipped tunes yet"
          emptyBody="Search a track and send a tip — it lands in your library and on the charts."
          emptyActionLabel="Add your first tip"
          onEmptyAction={() => router.push('/music-search')}
          onOpen={(item) => {
            const match = libraryPreview.find((entry) => entry.mediaId === item.key);
            if (match) {
              router.push(`/tune/${match.mediaUuid || match.mediaId}`);
            }
          }}
          onPlay={onPlayLibraryItem}
        />

        <CoverRail
          title="Rising today"
          actionLabel="Full chart"
          onAction={() => router.push('/(tabs)/music')}
          items={risingRail}
          emptyTitle="Nothing rising yet"
          emptyBody="Be the first to tip the global chart today."
          emptyActionLabel="Add a tune"
          onEmptyAction={() => router.push('/music-search')}
          onOpen={(item) => {
            if (item.key) router.push(`/tune/${item.key}`);
          }}
          onPlay={onPlayRisingItem}
        />

        <View style={styles.padded}>
          <InviteShareCard
            inviteCode={user?.primaryInviteCode || user?.personalInviteCode}
            username={user?.username}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function StatCard({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const inner = (
    <>
      <View style={styles.statTop}>
        <Ionicons name={icon} size={16} color={colors.accentLight} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable style={styles.statCard} onPress={onPress}>
        {inner}
      </Pressable>
    );
  }

  return <View style={styles.statCard}>{inner}</View>;
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 12,
  },
  padded: {
    paddingHorizontal: 16,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
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
  greeting: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  name: {
    marginTop: 1,
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  walletChip: {
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(126, 34, 206, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  walletChipValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  walletChipLabel: {
    marginTop: 1,
    color: colors.accentLight,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  primaryCtaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  secondaryCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  secondaryCtaText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  statsGrid: {
    gap: 8,
    marginBottom: 14,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
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
