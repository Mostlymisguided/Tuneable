import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ChartFilterToolbar } from '@/src/components/ChartFilterToolbar';
import { ChartTrackRow } from '@/src/components/ChartTrackRow';
import { GlobalChartHero } from '@/src/components/GlobalChartHero';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { partyAPI } from '@/src/api/party';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import {
  type BpmFilterRange,
  computeTopTags,
  filterChartMedia,
  hasActiveChartFilters,
} from '@/src/lib/chartFilters';
import {
  CHART_ADDED_SORT_HINT,
  sortChartItems,
  type ChartSortKey,
} from '@/src/lib/chartSort';
import {
  computeLocationQuickPicks,
  formatLocation,
  locationScopeEmptyMessage,
  type LocationScope,
} from '@/src/lib/location';
import {
  formatArtist,
  getChartTipPence,
  isUploadPlayable,
  mediaId,
} from '@/src/lib/media';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { colors } from '@/src/theme/colors';
import type { ResolvedLocation } from '@/src/types/user';
import {
  CHART_PAGE_SIZE,
  GLOBAL_PARTY_ID,
  type ChartMediaItem,
  type TimePeriodKey,
} from '@/src/types/media';

export default function MusicScreen() {
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [period, setPeriod] = useState<TimePeriodKey>('all-time');
  const [chartSort, setChartSort] = useState<ChartSortKey>('most-tipped');
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(
    null
  );
  const [locationScope, setLocationScope] = useState<LocationScope>('in');
  const [selectedTagTerms, setSelectedTagTerms] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [bpmFilterRange, setBpmFilterRange] = useState<BpmFilterRange>('all');
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [showTimePanel, setShowTimePanel] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [showBpmPanel, setShowBpmPanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [media, setMedia] = useState<ChartMediaItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(CHART_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<ChartMediaItem | null>(null);
  const setQueueAndPlay = useMusicPlayerStore((s) => s.setQueueAndPlay);

  const filterState = useMemo(
    () => ({ selectedTagTerms, searchQuery, bpmFilterRange }),
    [selectedTagTerms, searchQuery, bpmFilterRange]
  );

  const filtersActive = hasActiveChartFilters(filterState);

  useEffect(() => {
    setVisibleCount(CHART_PAGE_SIZE);
  }, [period, locationPlaceId, selectedTagTerms, searchQuery, bpmFilterRange, chartSort, locationScope]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await partyAPI.getMediaSortedByTime(GLOBAL_PARTY_ID, period, {
        locationPlaceId: locationPlaceId ?? undefined,
        locationScope: locationPlaceId ? locationScope : undefined,
        sortBy: chartSort,
      });
      setMedia(res.media ?? []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load chart';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, locationPlaceId, chartSort, locationScope]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const locationQuickPicks = useMemo(
    () => computeLocationQuickPicks(media, user?.homeLocation, 5),
    [media, user?.homeLocation]
  );

  const topTags = useMemo(
    () => computeTopTags(media, period),
    [media, period]
  );

  const filteredMedia = useMemo(
    () =>
      sortChartItems(filterChartMedia(media, filterState), chartSort, {
        getTip: (item) => getChartTipPence(item, period),
      }),
    [media, filterState, chartSort, period]
  );

  const visibleMedia = useMemo(
    () => filteredMedia.slice(0, visibleCount),
    [filteredMedia, visibleCount]
  );

  const playableCount = useMemo(
    () => filteredMedia.filter(isUploadPlayable).length,
    [filteredMedia]
  );

  const handleLocationChange = (location: ResolvedLocation | null) => {
    setSelectedLocation(location);
    setLocationPlaceId(location?.placeId ?? null);
  };

  const clearClientFilters = () => {
    setSelectedTagTerms([]);
    setSearchQuery('');
    setBpmFilterRange('all');
  };

  const onPlayItem = (item: ChartMediaItem) => {
    const index = filteredMedia.findIndex((m) => mediaId(m) === mediaId(item));
    if (index < 0) return;
    void setQueueAndPlay(filteredMedia, index);
  };

  const onPlayQueue = () => {
    void setQueueAndPlay(filteredMedia, 0);
  };

  const onConfirmTip = async (amountPounds: number, tags: string[]) => {
    if (!tipTarget) return;
    const id = mediaId(tipTarget);
    if (!id) throw new Error('Missing media id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds, { tags });
    const tipPence = Math.round(amountPounds * 100);
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    setMedia((prev) =>
      prev.map((m) => {
        if (mediaId(m) !== id) return m;
        return {
          ...m,
          partyMediaAggregate: (m.partyMediaAggregate ?? 0) + tipPence,
          timePeriodBidValue: (m.timePeriodBidValue ?? 0) + tipPence,
        };
      })
    );
    return res;
  };

  const hasMore = visibleCount < filteredMedia.length;
  const emptyMessage = filtersActive
    ? 'No tunes match these filters.'
    : selectedLocation?.placeId
      ? locationScopeEmptyMessage(
          'tunes',
          formatLocation(selectedLocation),
          locationScope
        )
      : 'No tunes in this period yet.';

  return (
    <Screen>
      <FlatList
        data={visibleMedia}
        keyExtractor={(item, index) => mediaId(item) || String(index)}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(96, contentPaddingBottom + 24) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.accentLight}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <GlobalChartHero
              selectedLocation={selectedLocation}
              locationScope={locationScope}
              onLocationScopeChange={setLocationScope}
              onLocationChange={handleLocationChange}
              locationQuickPicks={locationQuickPicks}
            />

            <Pressable
              style={styles.addTunesBtn}
              onPress={() => router.push('/music-search')}
              accessibilityRole="button"
              accessibilityLabel="Add Media">
              <Ionicons name="add" size={18} color={colors.text} />
              <Text style={styles.addTunesText}>Add Media</Text>
            </Pressable>

            <ChartFilterToolbar
              period={period}
              onPeriodChange={(next) => setPeriod(next as TimePeriodKey)}
              selectedTagTerms={selectedTagTerms}
              onTagTermsChange={setSelectedTagTerms}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              bpmFilterRange={bpmFilterRange}
              onBpmFilterChange={setBpmFilterRange}
              topTags={topTags}
              showTagPanel={showTagPanel}
              showTimePanel={showTimePanel}
              sort={chartSort}
              onSortChange={setChartSort}
              showSortPanel={showSortPanel}
              onToggleSortPanel={() => setShowSortPanel((open) => !open)}
              sortHint={CHART_ADDED_SORT_HINT}
              showBpmPanel={showBpmPanel}
              showSearchPanel={showSearchPanel}
              onToggleTagPanel={() => setShowTagPanel((open) => !open)}
              onToggleTimePanel={() => setShowTimePanel((open) => !open)}
              onToggleBpmPanel={() => setShowBpmPanel((open) => !open)}
              onToggleSearchPanel={() => setShowSearchPanel((open) => !open)}
              onClearFilters={clearClientFilters}
              hasActiveFilters={filtersActive}
            />

            {playableCount > 0 ? (
              <Pressable
                style={styles.playBtn}
                onPress={onPlayQueue}
                accessibilityRole="button"
                accessibilityLabel={`Play ${playableCount} upload${playableCount !== 1 ? 's' : ''}`}>
                <Ionicons name="play" size={22} color="#fff" />
              </Pressable>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loading && media.length === 0 ? (
              <ActivityIndicator
                color={colors.accentLight}
                style={styles.loader}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>{emptyMessage}</Text>
          ) : null
        }
        ListFooterComponent={
          hasMore ? (
            <Pressable
              style={styles.showMoreBtn}
              onPress={() => setVisibleCount((n) => n + CHART_PAGE_SIZE)}>
              <Text style={styles.showMoreText}>
                Show more ({filteredMedia.length - visibleCount} remaining)
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ChartTrackRow
            rank={index + 1}
            item={item}
            variant="rich"
            tipPence={getChartTipPence(item, period)}
            onOpen={() => {
              const id = mediaId(item);
              if (id) router.push(`/tune/${id}`);
            }}
            onPlay={() => onPlayItem(item)}
            onTip={() => setTipTarget(item)}
          />
        )}
      />

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Untitled'}
        subtitle={tipTarget ? formatArtist(tipTarget.artist) : undefined}
        balancePence={user?.balance ?? 0}
        defaultTipPounds={user?.preferences?.defaultTip ?? 1.11}
        tipMedia={tipTarget}
        onClose={() => setTipTarget(null)}
        onConfirm={onConfirmTip}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 8,
  },
  addTunesBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  addTunesText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  playBtn: {
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  error: {
    color: '#fca5a5',
    marginTop: 8,
    marginBottom: 4,
  },
  loader: {
    marginVertical: 24,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 32,
  },
  showMoreBtn: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  showMoreText: {
    color: '#e9d5ff',
    fontWeight: '600',
    fontSize: 14,
  },
});
