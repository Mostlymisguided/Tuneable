import { useCallback, useMemo, useState } from 'react';
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
import { GlobalChartHero } from '@/src/components/GlobalChartHero';
import { LocationAutocomplete } from '@/src/components/LocationAutocomplete';
import { locationAPI, type PlaceChartItem } from '@/src/api/locations';
import { useAuth } from '@/src/auth/AuthContext';
import { usePlayerDockState } from '@/src/hooks/usePlayerDock';
import { formatPoundsFromPence } from '@/src/lib/format';
import {
  getCountryPickFromLocation,
  getPlaceProfileHref,
  locationScopeEmptyMessage,
  type LocationQuickPick,
  type LocationScope,
} from '@/src/lib/location';
import { colors } from '@/src/theme/colors';
import type { ResolvedLocation } from '@/src/types/user';

export default function PlacesScreen() {
  const { user } = useAuth();
  const { contentPaddingBottom } = usePlayerDockState();
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(
    null
  );
  const [locationScope, setLocationScope] = useState<LocationScope>('in');
  const [places, setPlaces] = useState<PlaceChartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentPlaceId = selectedLocation?.placeId ?? null;

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await locationAPI.getChart({
          parentPlaceId: parentPlaceId ?? undefined,
          scope: locationScope,
          limit: 50,
        });
        setPlaces(res.places ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load places');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [parentPlaceId, locationScope]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const locationQuickPicks = useMemo(() => {
    const home = getCountryPickFromLocation(user?.homeLocation);
    if (!home) return [] as LocationQuickPick[];
    return [{ ...home, total: 0, isUser: true }];
  }, [user?.homeLocation]);

  const emptyMessage = selectedLocation?.placeId
    ? locationScopeEmptyMessage(
        'places',
        selectedLocation.display || selectedLocation.country || 'this place',
        locationScope === 'in' ? 'from' : locationScope
      )
    : 'No places with support yet.';

  const onSearchLocation = (location: ResolvedLocation | null) => {
    const href = getPlaceProfileHref(location?.placeId);
    if (href) router.push(href);
  };

  return (
    <Screen>
      <FlatList
        data={places}
        keyExtractor={(item) => item.placeId}
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
              chartKind="places"
              contentNoun="Places"
              selectedLocation={selectedLocation}
              locationScope={locationScope}
              onLocationScopeChange={setLocationScope}
              onLocationChange={setSelectedLocation}
              locationQuickPicks={locationQuickPicks}
            />

            <View style={styles.search}>
              <LocationAutocomplete
                value={null}
                onChange={onSearchLocation}
                label=""
                placeholder="Find a place…"
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loading && places.length === 0 ? (
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
        renderItem={({ item, index }) => (
          <PlaceChartRow
            rank={index + 1}
            place={item}
            onOpen={() => {
              const href = getPlaceProfileHref(item.placeId);
              if (href) router.push(href);
            }}
          />
        )}
      />
    </Screen>
  );
}

function PlaceChartRow({
  rank,
  place,
  onOpen,
}: {
  rank: number;
  place: PlaceChartItem;
  onOpen: () => void;
}) {
  const subtitle =
    place.featureType === 'country'
      ? 'Country'
      : [place.country].filter(Boolean).join(' · ') ||
        (place.featureType ? place.featureType : 'Place');

  return (
    <Pressable
      onPress={onOpen}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${formatPoundsFromPence(place.supportPence)}`}>
      <View style={styles.rankCircle}>
        <Text style={[styles.rank, rank >= 100 && styles.rankSmall]}>{rank}</Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.tips}>{formatPoundsFromPence(place.supportPence)}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 8,
  },
  search: {
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  rankCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rank: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  rankSmall: {
    fontSize: 11,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tips: {
    color: colors.accentLight,
    fontWeight: '700',
    fontSize: 13,
  },
});
