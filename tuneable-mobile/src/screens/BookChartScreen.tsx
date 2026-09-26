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
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/src/components/Screen';
import { ChartFilterToolbar } from '@/src/components/ChartFilterToolbar';
import { ChartTrackRow } from '@/src/components/ChartTrackRow';
import { GlobalChartHero } from '@/src/components/GlobalChartHero';
import { TipSheet } from '@/src/components/TipSheet';
import { booksAPI } from '@/src/api/books';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import {
  computeTopTags,
  filterChartMedia,
  hasActiveChartFilters,
} from '@/src/lib/chartFilters';
import type { ChartMediaKind } from '@/src/lib/chartKind';
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
import { getCreatorDisplay, mediaId } from '@/src/lib/media';
import { colors } from '@/src/theme/colors';
import type { ResolvedLocation } from '@/src/types/user';
import {
  CHART_PAGE_SIZE,
  TIME_PERIODS,
  type ChartMediaItem,
  type TimePeriodKey,
} from '@/src/types/media';

const BOOK_PERIODS = TIME_PERIODS.filter((period) => period.key !== 'today');

type Props = {
  onChartKindChange: (kind: ChartMediaKind) => void;
};

export function BookChartScreen({ onChartKindChange }: Props) {
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
  const [showTagPanel, setShowTagPanel] = useState(false);
  const [showTimePanel, setShowTimePanel] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [books, setBooks] = useState<ChartMediaItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(CHART_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipTarget, setTipTarget] = useState<ChartMediaItem | null>(null);

  const filterState = useMemo(
    () => ({ selectedTagTerms, searchQuery, bpmFilterRange: 'all' as const }),
    [selectedTagTerms, searchQuery]
  );
  const filtersActive = hasActiveChartFilters(filterState);

  useEffect(() => {
    setVisibleCount(CHART_PAGE_SIZE);
  }, [period, locationPlaceId, selectedTagTerms, searchQuery, chartSort, locationScope]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await booksAPI.getChart({
          limit: 50,
          timePeriod: period,
          locationPlaceId: locationPlaceId ?? undefined,
        });
        setBooks(
          (res.books ?? []).map((book) => {
            const periodTotal =
              typeof (book as ChartMediaItem & { periodTotal?: number }).periodTotal ===
              'number'
                ? (book as ChartMediaItem & { periodTotal?: number }).periodTotal
                : undefined;
            return {
              ...book,
              timePeriodBidValue: book.timePeriodBidValue ?? periodTotal,
              partyMediaAggregate:
                book.partyMediaAggregate ?? book.globalMediaAggregate ?? 0,
            };
          })
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load books');
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
    () => computeLocationQuickPicks(books, user?.homeLocation, 5),
    [books, user?.homeLocation]
  );

  const topTags = useMemo(() => computeTopTags(books, period), [books, period]);

  const filteredBooks = useMemo(
    () =>
      sortChartItems(filterChartMedia(books, filterState), chartSort, {
        getTip: (item) =>
          item.timePeriodBidValue ??
          item.globalMediaAggregate ??
          item.partyMediaAggregate ??
          0,
      }),
    [books, filterState, chartSort]
  );

  const visibleBooks = useMemo(
    () => filteredBooks.slice(0, visibleCount),
    [filteredBooks, visibleCount]
  );

  const handleLocationChange = (location: ResolvedLocation | null) => {
    setSelectedLocation(location);
    setLocationPlaceId(location?.placeId ?? null);
  };

  const onConfirmTip = async (amountPounds: number, _tags: string[]) => {
    if (!tipTarget) return;
    const id = mediaId(tipTarget);
    if (!id) throw new Error('Missing book id');
    const res = await booksAPI.boost(id, amountPounds);
    if (typeof res.updatedBalance === 'number') {
      updateBalance(res.updatedBalance);
    }
    setBooks((prev) =>
      prev.map((book) =>
        mediaId(book) === id
          ? {
              ...book,
              globalMediaAggregate:
                (book.globalMediaAggregate ?? 0) + Math.round(amountPounds * 100),
            }
          : book
      )
    );
    return res;
  };

  const hasMore = visibleCount < filteredBooks.length;
  const emptyMessage = filtersActive
    ? 'No books match these filters.'
    : selectedLocation?.placeId
      ? locationScopeEmptyMessage(
          'books',
          formatLocation(selectedLocation),
          locationScope
        )
      : 'No books on the chart yet.';

  return (
    <Screen>
      <FlatList
        data={visibleBooks}
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
              chartKind="books"
              onChartKindChange={onChartKindChange}
              contentNoun="Books"
              selectedLocation={selectedLocation}
              locationScope={locationScope}
              onLocationScopeChange={setLocationScope}
              onLocationChange={handleLocationChange}
              locationQuickPicks={locationQuickPicks}
            />

            <ChartFilterToolbar
              period={period}
              onPeriodChange={(next) => setPeriod(next as TimePeriodKey)}
              periods={BOOK_PERIODS}
              selectedTagTerms={selectedTagTerms}
              onTagTermsChange={setSelectedTagTerms}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              showBpm={false}
              topTags={topTags}
              showTagPanel={showTagPanel}
              showTimePanel={showTimePanel}
              sort={chartSort}
              onSortChange={setChartSort}
              showSortPanel={showSortPanel}
              onToggleSortPanel={() => setShowSortPanel((open) => !open)}
              sortHint={CHART_ADDED_SORT_HINT}
              onToggleTagPanel={() => setShowTagPanel((open) => !open)}
              onToggleTimePanel={() => setShowTimePanel((open) => !open)}
              onClearFilters={() => {
                setSelectedTagTerms([]);
                setSearchQuery('');
              }}
              hasActiveFilters={filtersActive}
              searchPlaceholder="Title, author, or tag…"
              showPlayable={false}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loading && books.length === 0 ? (
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
              onPress={() => setVisibleCount((n) => n + CHART_PAGE_SIZE)}>
              <Text style={styles.showMoreText}>
                Show more ({filteredBooks.length - visibleCount} remaining)
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item, index }) => (
          <ChartTrackRow
            rank={index + 1}
            item={item}
            variant="rich"
            hideCatalogHint
            tipPence={
              item.timePeriodBidValue ??
              item.globalMediaAggregate ??
              item.partyMediaAggregate ??
              0
            }
            onOpen={() => {
              const id = mediaId(item);
              if (id) router.push(`/book/${id}`);
            }}
            onPlay={() => {
              const id = mediaId(item);
              if (id) router.push(`/book/${id}`);
            }}
            onTip={() => setTipTarget(item)}
          />
        )}
      />

      <TipSheet
        visible={Boolean(tipTarget)}
        title={tipTarget?.title || 'Untitled'}
        subtitle={tipTarget ? getCreatorDisplay(tipTarget) : undefined}
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
