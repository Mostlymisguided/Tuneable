import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin, Building2, Sparkles } from 'lucide-react';
import { locationAPI, collectiveAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import GlobalChartLocationHero, { type LocationQuickPick } from '../components/GlobalChartLocationHero';
import LocationAutocomplete from '../components/LocationAutocomplete';
import EntertainingLoader from '../components/EntertainingLoader';
import { penceToPounds } from '../utils/currency';
import { collectiveTypeLabel } from '../utils/collectiveTypes';
import { DEFAULT_PROFILE_PIC } from '../constants';
import TagList from '../components/TagList';
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

type CollectiveChartItem = {
  _id: string;
  name: string;
  slug: string;
  profilePicture?: string;
  type?: string | string[];
  genres?: string[];
  location?: {
    display?: string;
    label?: string;
    placeId?: string;
  };
  stats?: {
    globalCollectiveAggregate?: number;
    rankingAggregate?: number;
    tuneBytesAggregate?: number;
  };
};

function formatTuneBytes(value: number | null | undefined): string {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

const COLLECTIVES_CHART_LIMIT = 20;

function CollectiveChartCard({
  collective,
  rank,
}: {
  collective: CollectiveChartItem;
  rank: number;
}) {
  const typeLabel = collectiveTypeLabel(collective.type);
  const locationLabel =
    collective.location?.display?.trim() || collective.location?.label?.trim() || '';
  const placePath = getPlaceProfilePath(collective.location?.placeId);
  const genres = Array.isArray(collective.genres) ? collective.genres.filter(Boolean) : [];
  const href = `/collective/${collective.slug}`;

  return (
    <div className="rounded-2xl overflow-hidden backdrop-blur-md bg-gray-900/50 border border-white/10 shadow-2xl hover:shadow-[0_0_30px_rgba(251,191,36,0.12)] transition-shadow p-1.5 md:p-4">
      <div className="flex items-start gap-2 md:gap-4">
        <div className="relative w-12 h-12 md:w-20 md:h-20 rounded overflow-hidden flex-shrink-0">
          <Link to={href} className="block w-full h-full" tabIndex={-1} aria-hidden>
            <img
              src={collective.profilePicture || DEFAULT_PROFILE_PIC}
              alt=""
              className="w-full h-full object-cover"
            />
          </Link>
          <span
            className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 text-white font-bold tabular-nums leading-none ${
              rank >= 100 ? 'text-xs md:text-sm' : 'text-sm md:text-lg'
            }`}
          >
            {rank}
          </span>
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-white text-sm truncate">
                <Link to={href} className="text-white hover:text-amber-200 transition-colors no-underline">
                  {collective.name}
                </Link>
              </h3>
              <p className="text-xs text-amber-200/80 truncate mt-0.5">{typeLabel}</p>
              {locationLabel ? (
                <p className="text-xs truncate">
                  {placePath ? (
                    <Link
                      to={placePath}
                      className="text-gray-300 hover:text-white hover:underline underline-offset-2 no-underline"
                    >
                      {locationLabel}
                    </Link>
                  ) : (
                    <span className="text-gray-400">{locationLabel}</span>
                  )}
                </p>
              ) : null}
            </div>
            <div
              className="flex flex-shrink-0 items-center gap-1 pt-0.5 text-sm font-semibold tabular-nums text-purple-200"
              title="TuneBytes"
              aria-label={`${formatTuneBytes(collective.stats?.tuneBytesAggregate)} TuneBytes`}
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-400" aria-hidden />
              <span>{formatTuneBytes(collective.stats?.tuneBytesAggregate)}</span>
            </div>
          </div>
          {genres.length > 0 ? (
            <>
              <div className="hidden md:block mt-1.5">
                <TagList tags={genres} limit={5} />
              </div>
              <div className="md:hidden mt-1.5">
                <TagList tags={genres} limit={3} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const Places: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(null);
  const [locationScope, setLocationScope] = useState<LocationScope>('in');
  const [showLocationFilter, setShowLocationFilter] = useState(false);
  const [places, setPlaces] = useState<PlaceChartItem[]>([]);
  const [collectives, setCollectives] = useState<CollectiveChartItem[]>([]);
  const [collectivesForPlaceId, setCollectivesForPlaceId] = useState<string | null>(null);
  const [totalCollectives, setTotalCollectives] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parentPlaceId = selectedLocation?.placeId ?? null;
  const visibleCollectives = collectivesForPlaceId === parentPlaceId ? collectives : [];
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const placesRes = await locationAPI.getChart({
        parentPlaceId: parentPlaceId ?? undefined,
        scope: locationScope,
        limit: 50,
      });
      const collectivesRes = await collectiveAPI.getCollectives({
        sortBy: 'tuneBytes',
        sortOrder: 'desc',
        page: 1,
        limit: COLLECTIVES_CHART_LIMIT,
        ...(parentPlaceId ? { placeId: parentPlaceId } : {}),
      });
      if (seq !== loadSeq.current) return;
      setPlaces(placesRes.places ?? []);
      setCollectives(collectivesRes.collectives ?? []);
      setTotalCollectives(collectivesRes.total ?? 0);
      setCollectivesForPlaceId(parentPlaceId);
    } catch (err: unknown) {
      if (seq !== loadSeq.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load places';
      setError(message);
      setCollectives([]);
      setTotalCollectives(0);
      setCollectivesForPlaceId(parentPlaceId);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
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

        {loading && places.length === 0 && visibleCollectives.length === 0 ? (
          <EntertainingLoader
            flavor="music"
            size="section"
            headline="Loading places…"
          />
        ) : null}

        {visibleCollectives.length > 0 ? (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-amber-400" />
                Collectives
                {totalCollectives > visibleCollectives.length ? (
                  <span className="text-sm font-normal text-purple-300">
                    ({totalCollectives} total)
                  </span>
                ) : null}
              </h2>
            </div>
            <ol className="space-y-2">
              {visibleCollectives.map((collective, index) => (
                <li key={collective._id || collective.slug}>
                  <CollectiveChartCard collective={collective} rank={index + 1} />
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {!loading && places.length === 0 && visibleCollectives.length === 0 && !error ? (
          <p className="text-center text-purple-200/80 py-12">{emptyMessage}</p>
        ) : null}

        {visibleCollectives.length > 0 && places.length > 0 ? (
          <div className="border-t border-white/10 pt-6 mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-purple-400" />
              Locations
            </h3>
          </div>
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
