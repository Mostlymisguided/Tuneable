import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { ChartTrackRow } from '@/src/components/ChartTrackRow';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { partyAPI } from '@/src/api/party';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence, formatTuneBytes } from '@/src/lib/format';
import {
  formatArtist,
  getChartTipPence,
  isUploadPlayable,
  mediaId,
} from '@/src/lib/media';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { canUploadMedia } from '@/src/lib/permissions';
import { colors } from '@/src/theme/colors';
import {
  GLOBAL_PARTY_ID,
  type ChartMediaItem,
} from '@/src/types/media';
import type { UserLibraryItem } from '@/src/types/user';

const RISING_PREVIEW_COUNT = 8;
const LIBRARY_PREVIEW_COUNT = 5;

function libraryToChartItem(item: UserLibraryItem): ChartMediaItem {
  return {
    _id: item.mediaId,
    uuid: item.mediaUuid,
    title: item.title,
    artist: item.artist,
    coverArt: item.coverArt ?? undefined,
    duration: item.duration ?? undefined,
    tags: item.tags ?? [],
    sources: item.sources ?? {},
    partyMediaAggregate: item.globalUserMediaAggregate ?? 0,
    globalMediaAggregate: item.globalMediaAggregate ?? 0,
  };
}

export default function HomeScreen() {
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);

  const [rising, setRising] = useState<ChartMediaItem[]>([]);
  const [library, setLibrary] = useState<UserLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<ChartMediaItem | null>(null);

  const libraryPreview = useMemo(() => {
    return [...library]
      .sort((a, b) => {
        const aTime = a.lastBidAt ? new Date(a.lastBidAt).getTime() : 0;
        const bTime = b.lastBidAt ? new Date(b.lastBidAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, LIBRARY_PREVIEW_COUNT);
  }, [library]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [chartRes, libraryRes] = await Promise.all([
        partyAPI.getMediaSortedByTime(GLOBAL_PARTY_ID, 'today'),
        userAPI.getTuneLibrary().catch(() => ({ library: [], total: 0 })),
      ]);
      setRising((chartRes.media ?? []).slice(0, RISING_PREVIEW_COUNT));
      setLibrary(libraryRes.library ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load home';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onPlayRisingItem = (item: ChartMediaItem) => {
    const playable = rising.filter(isUploadPlayable);
    const index = playable.findIndex((m) => mediaId(m) === mediaId(item));
    if (index < 0) return;
    void setQueueAndPlay(playable, index);
  };

  const onPlayLibraryItem = (item: UserLibraryItem) => {
    const queue = libraryPreview.map(libraryToChartItem);
    const index = libraryPreview.findIndex((e) => e.mediaId === item.mediaId);
    void setQueueAndPlay(queue, Math.max(0, index));
  };

  const onConfirmTip = async (amountPounds: number) => {
    if (!tipTarget) return;
    const id = mediaId(tipTarget);
    if (!id) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds);
    const tipPence = Math.round(amountPounds * 100);
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    setRising((prev) =>
      prev
        .map((m) =>
          mediaId(m) === id
            ? {
                ...m,
                partyMediaAggregate: (m.partyMediaAggregate ?? 0) + tipPence,
                timePeriodBidValue: (m.timePeriodBidValue ?? 0) + tipPence,
              }
            : m
        )
        .sort(
          (a, b) =>
            getChartTipPence(b, 'today') - getChartTipPence(a, 'today')
        )
    );
  };

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
        <Text style={styles.greeting}>Hey {user?.username ?? 'there'}</Text>
        <Text style={styles.lede}>
          Tip what&apos;s rising, revisit your library, and keep exploring.
        </Text>

        <View style={styles.statsRow}>
          <Pressable
            style={[styles.statCard, styles.statCardFlex]}
            onPress={() => router.push('/wallet')}>
            <Text style={styles.statLabel}>Wallet</Text>
            <Text style={styles.statValue}>
              {formatPoundsFromPence(user?.balance)}
            </Text>
            <Text style={styles.statCta}>Top up →</Text>
          </Pressable>
          {typeof user?.tuneBytes === 'number' ? (
            <View style={[styles.statCard, styles.statCardFlex]}>
              <Text style={styles.statLabel}>TuneBytes</Text>
              <Text style={styles.statValue}>
                {formatTuneBytes(user.tuneBytes)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.quickRow}>
          <QuickLink
            icon="musical-notes"
            label="Music chart"
            onPress={() => router.push('/(tabs)/music')}
          />
          <QuickLink
            icon="add-circle-outline"
            label="Add tunes"
            onPress={() => router.push('/music-search')}
          />
          {canUploadMedia(user) ? (
            <QuickLink
              icon="cloud-upload-outline"
              label="Upload"
              onPress={() => router.push('/upload')}
            />
          ) : (
            <QuickLink
              icon="mic-outline"
              label="Podcasts"
              onPress={() => router.push('/(tabs)/podcasts')}
            />
          )}
        </View>

        <SectionHeader
          title="Rising today"
          actionLabel="Full chart"
          onAction={() => router.push('/(tabs)/music')}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && rising.length === 0 ? (
          <ActivityIndicator
            color={colors.accentLight}
            style={styles.loader}
          />
        ) : rising.length === 0 ? (
          <Text style={styles.empty}>
            No tips on the global chart today yet. Be the first.
          </Text>
        ) : (
          rising.map((item, index) => (
            <ChartTrackRow
              key={mediaId(item) || String(index)}
              rank={index + 1}
              item={item}
              tipPence={getChartTipPence(item, 'today')}
              onOpen={() => {
                const id = mediaId(item);
                if (id) router.push(`/tune/${id}`);
              }}
              onPlay={() => onPlayRisingItem(item)}
              onTip={() => setTipTarget(item)}
            />
          ))
        )}

        <SectionHeader
          title="Your library"
          actionLabel="Profile"
          onAction={() => router.push('/(tabs)/profile')}
        />

        {loading && libraryPreview.length === 0 ? null : libraryPreview.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.empty}>No tipped tunes yet.</Text>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => router.push('/music-search')}>
              <Text style={styles.secondaryBtnText}>Add your first tip</Text>
            </Pressable>
          </View>
        ) : (
          libraryPreview.map((item, index) => (
            <ChartTrackRow
              key={item.mediaId}
              rank={index + 1}
              item={libraryToChartItem(item)}
              onOpen={() =>
                router.push(`/tune/${item.mediaUuid || item.mediaId}`)
              }
              onPlay={() => onPlayLibraryItem(item)}
              onTip={() => setTipTarget(libraryToChartItem(item))}
            />
          ))
        )}
      </ScrollView>

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Untitled'}
        subtitle={tipTarget ? formatArtist(tipTarget.artist) : undefined}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 1.11}
        onClose={() => setTipTarget(null)}
        onConfirm={onConfirmTip}
      />
    </Screen>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={styles.sectionAction}>{actionLabel} →</Text>
      </Pressable>
    </View>
  );
}

function QuickLink({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickLink} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.accentLight} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  lede: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  statCardFlex: {
    flex: 1,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  statCta: {
    marginTop: 6,
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: '500',
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  quickLink: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  quickLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  sectionAction: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: '#fca5a5',
    marginBottom: 8,
  },
  loader: {
    marginVertical: 24,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
  },
  emptyBlock: {
    marginBottom: 16,
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  secondaryBtnText: {
    color: '#e9d5ff',
    fontWeight: '600',
    fontSize: 13,
  },
});
