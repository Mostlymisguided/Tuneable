import React, { useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import LocationAutocomplete from './LocationAutocomplete';
import {
  formatLocation,
  locationPickToResolvedLocation,
  type CountryLocationPick,
  type ResolvedLocation,
} from '../utils/locationHelpers';
import { penceToPounds } from '../utils/currency';

export interface LocationQuickPick extends CountryLocationPick {
  total: number;
  isUser: boolean;
}

interface GlobalChartLocationHeroProps {
  chartLabel: string;
  selectedLocation: ResolvedLocation | null;
  showLocationFilter: boolean;
  onToggleLocationFilter: () => void;
  onLocationChange: (location: ResolvedLocation | null) => void;
  locationQuickPicks: LocationQuickPick[];
  popularLocationsLabel?: string;
}

function chipLabel(loc: LocationQuickPick): string {
  return loc.label || loc.display || loc.country;
}

function LocationQuickPickButtons({
  locationQuickPicks,
  selectedLocation,
  onLocationChange,
}: {
  locationQuickPicks: LocationQuickPick[];
  selectedLocation: ResolvedLocation | null;
  onLocationChange: (location: ResolvedLocation | null) => void;
}) {
  const chipClass =
    'rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors';

  return (
    <>
      <button
        type="button"
        onClick={() => onLocationChange(null)}
        className={`${chipClass} ${
          !selectedLocation?.placeId
            ? 'bg-purple-600 text-white ring-1 ring-purple-400/50'
            : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
        }`}
      >
        Earth
      </button>
      {locationQuickPicks.map((loc) => {
        const selected = selectedLocation?.placeId === loc.placeId;
        const name = chipLabel(loc);
        return (
          <button
            key={loc.placeId}
            type="button"
            onClick={() =>
              onLocationChange(selected ? null : locationPickToResolvedLocation(loc))
            }
            className={`${chipClass} ${
              selected
                ? 'bg-purple-600 text-white ring-1 ring-purple-400/50'
                : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
            }`}
            title={
              loc.total > 0
                ? `${penceToPounds(loc.total)} in tips`
                : loc.isUser
                  ? 'Your home country'
                  : undefined
            }
          >
            {name}
            {loc.isUser && <span className="ml-1 opacity-70">(you)</span>}
          </button>
        );
      })}
    </>
  );
}

const GlobalChartLocationHero: React.FC<GlobalChartLocationHeroProps> = ({
  chartLabel,
  selectedLocation,
  showLocationFilter,
  onToggleLocationFilter,
  onLocationChange,
  locationQuickPicks,
  popularLocationsLabel,
}) => {
  const locationLabel = selectedLocation?.placeId
    ? formatLocation(selectedLocation)
    : 'Earth';

  useEffect(() => {
    if (!showLocationFilter) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleLocationFilter();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showLocationFilter, onToggleLocationFilter]);

  const closeSearch = () => {
    if (showLocationFilter) onToggleLocationFilter();
  };

  const handleSearchChange = (location: ResolvedLocation | null) => {
    onLocationChange(location);
    // Close editor once a place is chosen, or cleared back to Earth
    if (location?.placeId || location === null) closeSearch();
  };

  const handlePillChange = (location: ResolvedLocation | null) => {
    onLocationChange(location);
    closeSearch();
  };

  return (
    <div className="text-center px-3 sm:px-6 pt-6 sm:pt-10 pb-3">
      <p className="text-[10px] sm:text-xs font-semibold tracking-[0.3em] uppercase text-purple-300/80 mb-2">
        {chartLabel}
      </p>
      <p className="text-[10px] sm:text-xs font-semibold tracking-[0.3em] uppercase text-purple-300/80 mb-2">
        Voted From
      </p>

      {showLocationFilter ? (
        <div className="max-w-md mx-auto">
          <LocationAutocomplete
            value={selectedLocation}
            onChange={handleSearchChange}
            placeholder="Search city, town, or region…"
            autoFocus
            showIcon={false}
            inputClassName="w-full text-center text-2xl sm:text-4xl font-black bg-transparent border-0 border-b border-purple-400/40 rounded-none text-white placeholder:text-gray-500 placeholder:font-semibold placeholder:text-lg sm:placeholder:text-2xl focus:outline-none focus:ring-0 focus:border-purple-300 py-2 pr-10"
          />
          <button
            type="button"
            onClick={onToggleLocationFilter}
            className="mt-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Close location search"
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-180" />
            Done
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggleLocationFilter}
          className="group inline-flex flex-col items-center"
          aria-label={`Current location ${locationLabel}. Search for a location.`}
        >
          <h1 className="text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-white to-purple-300 drop-shadow-[0_2px_10px_rgba(168,85,247,0.35)] group-hover:from-purple-200 group-hover:to-purple-200 transition-colors underline decoration-purple-400/0 group-hover:decoration-purple-400/50 underline-offset-8">
            {locationLabel}
          </h1>
          <ChevronDown className="mt-2 h-4 w-4 text-gray-500 opacity-50 group-hover:opacity-90 transition-opacity" />
        </button>
      )}

      {locationQuickPicks.length > 0 && (
        <div className="mt-4">
          {popularLocationsLabel && (
            <p className="text-xs text-gray-500 mb-2">
              Popular · {popularLocationsLabel}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <LocationQuickPickButtons
              locationQuickPicks={locationQuickPicks}
              selectedLocation={selectedLocation}
              onLocationChange={handlePillChange}
            />
          </div>
        </div>
      )}

      {selectedLocation?.placeId && (
        <p className="text-xs text-purple-300 mt-3">
          Showing tips from {formatLocation(selectedLocation)} and below
        </p>
      )}
    </div>
  );
};

export default GlobalChartLocationHero;
