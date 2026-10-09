import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin, Building2 } from 'lucide-react';
import { locationAPI, collectiveAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import GlobalChartLocationHero, { type LocationQuickPick } from '../components/GlobalChartLocationHero';
import LocationAutocomplete from '../components/LocationAutocomplete';
import EntertainingLoader from '../components/EntertainingLoader';
import { penceToPounds } from '../utils/currency';
import { venueKindLabel } from '../utils/collectiveTypes';
import { DEFAULT_PROFILE_PIC } from '../constants';
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

type VenueItem = {
  _id: string;
  name: string;
  slug: string;
  profilePicture?: string;
  type: string;
  venueKind?: string | null;
  location?: {
    display?: string;
    placeId?: string;
  };
  stats?: {
    globalCollectiveAggregate?: number;
  };
};

const Places: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(null);
  const [locationScope, setLocationScope] = useState<LocationScope>('in');
  const [showLocationFilter, setShowLocationFilter] = useState(false);
  const [places, setPlaces] = useState<PlaceChartItem[]>([]);
  const [venues, setVenues] = useState<VenueItem[]>([]);
  const [totalVenues, setTotalVenues] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parentPlaceId = selectedLocation?.placeId ?? null;
  const FEATURED_VENUES_COUNT = 5;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch location chart
      const placesRes = await locationAPI.getChart({
        parentPlaceId: parentPlaceId ?? undefined,
        scope: locationScope,
        limit: 50,
      });
      setPlaces(placesRes.places ?? []);

      // Fetch venues (only on global view - no parent selected)
      if (!parentPlaceId) {
        const venuesRes = await collectiveAPI.getCollectives({
          type: 'venue',
          sortBy: 'globalCollectiveAggregate',
          sortOrder: 'desc',
          page: 1,
          limit: FEATURED_VENUES_COUNT,
        });
        setVenues(venuesRes.collectives ?? []);
        setTotalVenues(venuesRes.total ?? 0);
      } else {
        // If a location is selected, clear venues (could fetch location-specific venues later)
        setVenues([]);
        setTotalVenues(0);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load places';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [parentPlaceId, locationScope, FEATURED_VENUES_COUNT]);

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

        {loading && places.length === 0 && venues.length === 0 ? (
          <EntertainingLoader
            flavor="music"
            size="section"
            headline="Loading places…"
          />
        ) : null}

        {/* Featured Venues Section */}
        {!loading && !parentPlaceId && venues.length > 0 && totalVenues >= 3 ? (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-amber-400" />
                Featured Venues
                {totalVenues > FEATURED_VENUES_COUNT ? (
                  <span className="text-sm font-normal text-purple-300">
                    ({totalVenues} total)
                  </span>
                ) : null}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {venues.map((venue) => (
                <Link
                  key={venue._id}
                  to={`/collective/${venue.slug}`}
                  className="flex items-center gap-3 bg-black/20 border border-white/10 hover:border-amber-400/50 rounded-xl p-3 no-underline text-white transition-colors"
                >
                  <img
                    src={venue.profilePicture || DEFAULT_PROFILE_PIC}
                    alt={venue.name}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-sm">{venue.name}</div>
                    <div className="text-xs text-amber-200/70 truncate">
                      {venueKindLabel(venue.venueKind) || 'Venue'}
                      {venue.location?.display ? ` · ${venue.location.display}` : ''}
                    </div>
                    {venue.stats?.globalCollectiveAggregate ? (
                      <div className="text-xs text-purple-300 font-semibold mt-1">
                        {penceToPounds(venue.stats.globalCollectiveAggregate)} support
                      </div>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
            <div className="border-t border-white/10 pt-6 mb-2">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-purple-400" />
                Locations
              </h3>
            </div>
          </div>
        ) : null}

        {!loading && places.length === 0 && venues.length === 0 && !error ? (
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
