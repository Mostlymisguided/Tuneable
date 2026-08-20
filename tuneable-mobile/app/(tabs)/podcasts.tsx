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
import { useFocusEffect, router } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { ChartFilterToolbar } from '@/src/components/ChartFilterToolbar';
import { GlobalChartHero } from '@/src/components/GlobalChartHero';
import { PodcastEpisodeRow } from '@/src/components/PodcastEpisodeRow';
import { TipSheet } from '@/src/components/TipSheet';
import { mediaAPI } from '@/src/api/media';
import { podcastsAPI } from '@/src/api/podcasts';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { computeLocationQuickPicks } from '@/src/lib/location';
import {
  computePodcastTopTags,
  episodeId,
  filterPodcastEpisodes,
  hasActivePodcastFilters,
  isEpisodePlayable,
  seriesTitle,
} from '@/src/lib/podcast';
import { usePodcastPlayerStore } from '@/src/stores/podcastPlayerStore';
import { colors } from '@/src/theme/colors';
import type { ResolvedLocation } from '@/src/types/user';
import {
  PODCAST_CHART_PAGE_SIZE,
  PODCAST_TIME_RANGES,
  type PodcastEpisode,
  type PodcastTimeRangeKey,
} from '@/src/types/podcast';

export default function PodcastsScreen() {
  const { user, updateBalance } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [period, setPeriod] = useState<PodcastTimeRangeKey>('all');
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(
    null
  );
  const [selectedTagTerms, setSelectedTagTerms] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [showTimePanel, setShowTimePanel] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [visibleCount, setVisibleCount] = useState(PODCAST_CHART_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<PodcastEpisode | null>(null);
  const setQueueAndPlay = usePodcastPlayerStore((s) => s.setQueueAndPlay);

  const filterState = useMemo(
    () => ({ selectedTagTerms, searchQuery }),
    [selectedTagTerms, searchQuery]
  );

  const filtersActive = hasActivePodcastFilters(filterState);

  useEffect(() => {
    setVisibleCount(PODCAST_CHART_PAGE_SIZE);
  }, [period, locationPlaceId, selectedTagTerms, searchQuery]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await podcastsAPI.getChart({
          limit: 50,
          timeRange: period,
          locationPlaceId: locationPlaceId ?? undefined,
        });
        setEpisodes(res.episodes ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load podcasts'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period, locationPlaceId]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const locationQuickPicks = useMemo(
    () => computeLocationQuickPicks(episodes, user?.homeLocation, 5),
    [episodes, user?.homeLocation]
  );

  const topTags = useMemo(
    () => computePodcastTopTags(episodes),
    [episodes]
  );

  const filteredEpisodes = useMemo(
    () => filterPodcastEpisodes(episodes, filterState),
    [episodes, filterState]
  );

  const visibleEpisodes = useMemo(
    () => filteredEpisodes.slice(0, visibleCount),
    [filteredEpisodes, visibleCount]
  );

  const playableCount = useMemo(
    () => filteredEpisodes.filter(isEpisodePlayable).length,
    [filteredEpisodes]
  );

  const handleLocationChange = (location: ResolvedLocation | null) => {
    setSelectedLocation(location);
    setLocationPlaceId(location?.placeId ?? null);
  };

  const clearClientFilters = () => {
    setSelectedTagTerms([]);
    setSearchQuery('');
  };

  const onPlayItem = (episode: PodcastEpisode) => {
    const index = filteredEpisodes.findIndex(
      (e) => episodeId(e) === episodeId(episode)
    );
    if (index < 0) return;
    void setQueueAndPlay(filteredEpisodes, index);
  };

  const onPlayQueue = () => {
    void setQueueAndPlay(filteredEpisodes, 0);
  };

  const onConfirmTip = async (amountPounds: number, tags: string[]) => {
    if (!tipTarget) return;
    const id = episodeId(tipTarget);
    if (!id) throw new Error('Missing episode id');
    const res = await mediaAPI.placeGlobalBid(id, amountPounds, { tags });
    const tipPence = Math.round(amountPounds * 100);
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    setEpisodes((prev) =>
      prev
        .map((e) =>
          episodeId(e) === id
            ? {
                ...e,
                globalMediaAggregate: (e.globalMediaAggregate ?? 0) + tipPence,
              }
            : e
        )
        .sort(
          (a, b) =>
            (b.globalMediaAggregate ?? 0) - (a.globalMediaAggregate ?? 0)
        )
    );
    return res;
  };

  const hasMore = visibleCount < filteredEpisodes.length;
  const emptyMessage = filtersActive
    ? 'No episodes match these filters.'
    : 'No podcast episodes in this period yet.';

  return (
    <Screen>
      <FlatList
        data={visibleEpisodes}
        keyExtractor={(item, index) => episodeId(item) || String(index)}
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
              chartLabel="The World's Best Podcasts"
              contentNoun="Podcasts"
              selectedLocation={selectedLocation}
              onLocationChange={handleLocationChange}
              locationQuickPicks={locationQuickPicks}
            />

            <Pressable
              style={styles.addPodcastBtn}
              onPress={() => router.push('/podcast-search')}
              accessibilityRole="button"
              accessibilityLabel="Add Podcast">
              <Ionicons name="add" size={18} color={colors.text} />
              <Text style={styles.addPodcastText}>Add Podcast</Text>
            </Pressable>

            <ChartFilterToolbar
              period={period}
              onPeriodChange={(next) => setPeriod(next as PodcastTimeRangeKey)}
              periods={PODCAST_TIME_RANGES}
              selectedTagTerms={selectedTagTerms}
              onTagTermsChange={setSelectedTagTerms}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              showBpm={false}
              topTags={topTags}
              showTagPanel={showTagPanel}
              showTimePanel={showTimePanel}
              showSearchPanel={showSearchPanel}
              onToggleTagPanel={() => setShowTagPanel((open) => !open)}
              onToggleTimePanel={() => setShowTimePanel((open) => !open)}
              onToggleSearchPanel={() => setShowSearchPanel((open) => !open)}
              onClearFilters={clearClientFilters}
              hasActiveFilters={filtersActive}
              searchPlaceholder="Title, series, or tag…"
              searchHint="Filters the current podcast chart."
            />

            {playableCount > 0 ? (
              <Pressable
                style={styles.playBtn}
                onPress={onPlayQueue}
                accessibilityRole="button"
                accessibilityLabel={`Play ${playableCount} episode${playableCount !== 1 ? 's' : ''}`}>
                <Ionicons name="play" size={22} color="#fff" />
              </Pressable>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loading && episodes.length === 0 ? (
              <ActivityIndicator
                color={colors.accentLight}
                style={styles.loader}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>{emptyMessage}</Text> : null
        }
        ListFooterComponent={
          hasMore ? (
            <Pressable
              style={styles.showMoreBtn}
              onPress={() =>
                setVisibleCount((n) => n + PODCAST_CHART_PAGE_SIZE)
              }>
              <Text style={styles.showMoreText}>
                Show more ({filteredEpisodes.length - visibleCount} remaining)
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item, index }) => (
          <PodcastEpisodeRow
            rank={index + 1}
            episode={item}
            tipPence={item.globalMediaAggregate ?? 0}
            onPlay={() => onPlayItem(item)}
            onTip={() => setTipTarget(item)}
            onOpenProfile={() => {
              const tid = episodeId(item);
              if (tid) router.push(`/podcast/${tid}`);
            }}
          />
        )}
      />

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Episode'}
        subtitle={tipTarget ? seriesTitle(tipTarget) : undefined}
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
  addPodcastBtn: {
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
  addPodcastText: {
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
