import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin } from 'lucide-react';
import { locationAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import GlobalChartLocationHero, { type LocationQuickPick } from '../components/GlobalChartLocationHero';
import LocationAutocomplete from '../components/LocationAutocomplete';
import EntertainingLoader from '../components/EntertainingLoader';
import { penceToPounds } from '../utils/currency';
import {
  getCountryPickFromLocation,
  getPlaceProfilePath,
  locationScopeEmptyMessage,
  type LocationScope,
  type ResolvedLocation,
} from '../utils/locationHelpers';

type PlaceChartItem = {
  placeId: string;
  name: string;
  featureType?: string | null;
  country?: string | null;
  countryCode?: string | null;
  supportPence: number;
  mediaCount?: number;
  bidCount?: number;
};

const Places: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(null);
  const [locationScope, setLocationScope] = useState<LocationScope>('in');
  const [showLocationFilter, setShowLocationFilter] = useState(false);
  const [places, setPlaces] = useState<PlaceChartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parentPlaceId = selectedLocation?.placeId ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await locationAPI.getChart({
        parentPlaceId: parentPlaceId ?? undefined,
        scope: locationScope,
        limit: 50,
      });
      setPlaces(res.places ?? []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load places';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [parentPlaceId, locationScope]);

  useEffect(() => {
    void load();
  }, [load]);

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
    const path = getPlaceProfilePath(location?.placeId);
    if (path) navigate(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white pb-24">
      <div>
        <GlobalChartLocationHero
          chartKind="places"
          contentNoun="Places"
          selectedLocation={selectedLocation}
          locationScope={locationScope}
          onLocationScopeChange={setLocationScope}
          showLocationFilter={showLocationFilter}
          onToggleLocationFilter={() => setShowLocationFilter((open) => !open)}
          onLocationChange={setSelectedLocation}
          locationQuickPicks={locationQuickPicks}
        />
      </div>

      <div className="max-w-3xl mx-auto px-3 sm:px-6">
        <div className="mb-6 max-w-md mx-auto">
          <LocationAutocomplete
            value={null}
            onChange={onSearchLocation}
            placeholder="Find a place…"
            variant="dark"
            showIcon
          />
        </div>

        {error ? <p className="text-red-400 text-center mb-4">{error}</p> : null}

        {loading && places.length === 0 ? (
          <EntertainingLoader
            flavor="music"
            size="section"
            headline="Loading places…"
          />
        ) : null}

        {!loading && places.length === 0 && !error ? (
          <p className="text-center text-purple-200/80 py-12">{emptyMessage}</p>
        ) : null}

        <ol className="space-y-2">
          {places.map((place, index) => {
            const path = getPlaceProfilePath(place.placeId);
            const subtitle =
              place.featureType === 'country'
                ? 'Country'
                : place.country || place.featureType || 'Place';
            if (!path) return null;
            return (
              <li key={place.placeId}>
                <Link
                  to={path}
                  className="flex items-center gap-3 sm:gap-4 bg-black/20 border border-white/10 hover:border-purple-400/50 rounded-xl px-3 py-3 no-underline text-white transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-purple-700/60 text-sm font-bold flex items-center justify-center flex-shrink-0">
                    {index + 1}
                  </span>
                  <MapPin className="h-4 w-4 text-purple-300 flex-shrink-0 hidden sm:block" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{place.name}</div>
                    <div className="text-xs text-purple-200/70 capitalize truncate">{subtitle}</div>
                  </div>
                  <div className="text-purple-200 font-semibold text-sm tabular-nums">
                    {penceToPounds(place.supportPence || 0)}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

export default Places;
