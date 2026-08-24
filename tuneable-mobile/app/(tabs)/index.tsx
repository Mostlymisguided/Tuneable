import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { CoverRail, type CoverRailItem } from '@/src/components/CoverRail';
import { DashboardPrompts } from '@/src/components/DashboardPrompts';
import { WelcomeCreditClaimCard } from '@/src/components/WelcomeCreditClaimCard';
import { InviteShareCard } from '@/src/components/InviteShareCard';
import { LibraryImportCards } from '@/src/components/LibraryImportCards';
import { UserLibrarySection } from '@/src/components/UserLibrarySection';
import { partyAPI } from '@/src/api/party';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence, formatTuneBytes } from '@/src/lib/format';
import {
  formatLocationLabel,
  getPlaceProfileHref,
} from '@/src/lib/location';
import {
  formatArtist,
  getChartTipPence,
  mediaId,
} from '@/src/lib/media';
import { hasHomeLocation } from '@/src/lib/onboarding';
import { canUploadMedia } from '@/src/lib/permissions';
import {
  championBadgeHref,
  championBadgeKey,
  championBadgeLocationLabel,
  championBadgePrimaryLabel,
  championBadgesFromResponse,
} from '@/src/lib/championBadges';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { colors } from '@/src/theme/colors';
import {
  GLOBAL_PARTY_ID,
  type ChartMediaItem,
} from '@/src/types/media';
import {
  DEFAULT_PROFILE_PIC,
  type ChampionBadge,
  type UserLibraryItem,
  type UserStats,
} from '@/src/types/user';

const RISING_PREVIEW_COUNT = 10;
const HOME_BADGE_VISIBLE = 3;

function badgeColors(rank: number) {
  if (rank === 1) return { border: '#f59e0b', bg: '#fcd34d', text: '#fde68a' };
  if (rank === 2) return { border: '#94a3b8', bg: '#cbd5e1', text: '#e2e8f0' };
  if (rank === 3) return { border: '#b45309', bg: '#fdba74', text: '#fdba74' };
  return { border: '#7c3aed', bg: '#a855f7', text: '#ddd6fe' };
}

type HomeBadge = {
  key: string;
  rank: number;
  label: string;
  locationLabel: string | null;
  isPlace: boolean;
  href: Href;
};

export default function HomeScreen() {
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);
  const canUpload = canUploadMedia(user);

  const [rising, setRising] = useState<ChartMediaItem[]>([]);
  const [library, setLibrary] = useState<UserLibraryItem[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [championBadges, setChampionBadges] = useState<ChampionBadge[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const homeBadges = useMemo<HomeBadge[]>(
    () =>
      championBadges.flatMap((badge, index) => {
        const href = championBadgeHref(badge);
        if (!href) return [];
        return [
          {
            key: championBadgeKey(badge, index),
            rank: badge.rank,
            label: championBadgePrimaryLabel(badge),
            locationLabel: championBadgeLocationLabel(badge),
            isPlace: badge.entityType === 'place',
            href,
          },
        ];
      }),
    [championBadges]
  );

  const visibleBadges = homeBadges.slice(0, HOME_BADGE_VISIBLE);
  const extraBadgeCount = Math.max(0, homeBadges.length - visibleBadges.length);

  const homeLabel = formatLocationLabel(user?.homeLocation);
  const locationSet = hasHomeLocation(user?.homeLocation);
  const placeHref = getPlaceProfileHref(user?.homeLocation?.placeId);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const userId = user?.uuid || user?.id;
        const [chartRes, libraryRes, profileRes, championsRes] =
          await Promise.all([
            partyAPI.getMediaSortedByTime(GLOBAL_PARTY_ID, 'today'),
            userAPI.getTuneLibrary().catch(() => ({ library: [], total: 0 })),
            userId
              ? userAPI.getProfileById(userId).catch(() => null)
              : Promise.resolve(null),
            userId
              ? userAPI
                  .getChampionTitles(userId, {
                    mediaLimit: 8,
                    checkMediaLimit: 40,
                    badgeLimit: 8,
                  })
                  .catch(() => ({ tags: [], media: [], badges: [] }))
              : Promise.resolve({ tags: [], media: [], badges: [] }),
          ]);
        setRising((chartRes.media ?? []).slice(0, RISING_PREVIEW_COUNT));
        setLibrary(libraryRes.library ?? []);
        setStats(profileRes?.stats ?? null);
        setChampionBadges(championBadgesFromResponse(championsRes));
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

  const openSearch = () => {
    const q = searchQuery.trim();
    if (q) {
      router.push({ pathname: '/music-search', params: { q } });
      return;
    }
    router.push('/music-search');
  };

  const onLocationPress = () => {
    if (placeHref) {
      router.push(placeHref);
      return;
    }
    router.push('/set-home-location');
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
              <Image
                source={{ uri: user?.profilePic || DEFAULT_PROFILE_PIC }}
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
              style={styles.walletChip}
              onPress={() => router.push('/wallet')}
              accessibilityLabel="Open wallet">
              <Text style={styles.walletChipValue}>
                {formatPoundsFromPence(user?.balance)}
              </Text>
              <Text style={styles.walletChipLabel}>Wallet</Text>
            </Pressable>
          </View>

          <WelcomeCreditClaimCard />

          {visibleBadges.length > 0 ? (
            <View style={styles.badgeRow}>
              {visibleBadges.map((badge) => {
                const palette = badgeColors(badge.rank);
                return (
                  <Pressable
                    key={badge.key}
                    onPress={() => router.push(badge.href)}
                    style={[
                      styles.badge,
                      {
                        borderColor: palette.border,
                        backgroundColor: `${palette.bg}22`,
                      },
                    ]}>
                    <Ionicons
                      name={badge.isPlace ? 'location' : 'trophy'}
                      size={11}
                      color={palette.border}
                    />
                    <Text style={styles.badgeRank}>#{badge.rank}</Text>
                    <Text
                      style={[styles.badgeLabel, { color: palette.text }]}
                      numberOfLines={1}>
                      {badge.label}
                    </Text>
                    {badge.locationLabel ? (
                      <Text
                        style={[styles.badgeLabel, { color: palette.text }]}
                        numberOfLines={1}>
                        {badge.locationLabel}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
              {extraBadgeCount > 0 ? (
                <Pressable
                  onPress={() => router.push('/(tabs)/profile')}
                  style={styles.badgeMore}
                  accessibilityLabel={`See ${extraBadgeCount} more badges`}>
                  <Text style={styles.badgeMoreText}>+{extraBadgeCount}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.catalogLinks}>
            <Pressable
              style={styles.catalogChip}
              onPress={() => router.push('/books')}
              accessibilityRole="button"
              accessibilityLabel="Open books"
            >
              <Ionicons name="book-outline" size={16} color={colors.accentLight} />
              <Text style={styles.catalogChipText}>Books</Text>
            </Pressable>
            <Pressable
              style={styles.catalogChip}
              onPress={() => router.push('/(tabs)/podcasts')}
              accessibilityRole="button"
              accessibilityLabel="Open podcasts"
            >
              <Ionicons name="mic-outline" size={16} color={colors.accentLight} />
              <Text style={styles.catalogChipText}>Podcasts</Text>
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search title or artist"
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={openSearch}
              />
            </View>
            <Pressable style={styles.searchBtn} onPress={openSearch}>
              <Text style={styles.searchBtnText}>Search</Text>
            </Pressable>
          </View>

          <LibraryImportCards showUpload={canUpload} />

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

          <DashboardPrompts />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loading && rising.length === 0 && library.length === 0 ? (
            <ActivityIndicator
              color={colors.accentLight}
              style={styles.loader}
            />
          ) : null}
        </View>

        <View style={styles.librarySection}>
          <UserLibrarySection
            items={library}
            user={user}
            onBalanceUpdate={updateBalance}
            title="Recently tipped"
            actionLabel="Library"
            onAction={() => router.push('/(tabs)/profile')}
            showTime={false}
            showBpm={false}
            sortBy="recent"
            previewLimit={10}
            compactHeader
            searchHint="Filters your recently tipped tunes."
            emptyTitle="No tipped tunes yet"
            emptyBody="Search a track and send a tip — it lands in your library and on the charts."
            emptyActionLabel="Add your first tip"
            onEmptyAction={() => router.push('/music-search')}
          />
        </View>

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
            collapsible
            defaultCollapsed
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
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '70%',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeRank: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  badgeMore: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  badgeMoreText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  catalogLinks: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  catalogChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  catalogChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  searchBtn: {
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  searchBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
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
