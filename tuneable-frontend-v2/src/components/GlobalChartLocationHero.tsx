import React from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import LocationAutocomplete from './LocationAutocomplete';
import {
  formatLocation,
  countryPickToResolvedLocation,
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

function LocationQuickPickButtons({
  locationQuickPicks,
  selectedLocation,
  onLocationChange,
  size = 'md',
}: {
  locationQuickPicks: LocationQuickPick[];
  selectedLocation: ResolvedLocation | null;
  onLocationChange: (location: ResolvedLocation | null) => void;
  size?: 'sm' | 'md';
}) {
  const chipClass =
    size === 'sm'
      ? 'rounded-full px-3 py-1 text-xs transition-colors'
      : 'rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors';

  return (
    <>
      <button
        type="button"
        onClick={() => onLocationChange(null)}
        className={`${chipClass} ${
          !selectedLocation?.placeId
            ? 'bg-purple-600 text-white ring-1 ring-purple-400/50'
            : size === 'sm'
              ? 'bg-gray-700 text-gray-200 hover:bg-gray-800'
              : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
        }`}
      >
        Earth
      </button>
      {locationQuickPicks.map((loc) => {
        const selected = selectedLocation?.placeId === loc.placeId;
        return (
          <button
            key={loc.placeId}
            type="button"
            onClick={() =>
              onLocationChange(selected ? null : countryPickToResolvedLocation(loc))
            }
            className={`${chipClass} ${
              selected
                ? 'bg-purple-600 text-white ring-1 ring-purple-400/50'
                : size === 'sm'
                  ? 'bg-gray-700 text-gray-200 hover:bg-gray-800'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
            }`}
            title={loc.total > 0 ? `${penceToPounds(loc.total)} in tips` : loc.isUser ? 'Your home country' : undefined}
          >
            {loc.country}
            {loc.isUser && <span className="ml-1 opacity-70">(you)</span>}
            {size === 'sm' && loc.total > 0 && (
              <span className="ml-2 text-[10px] opacity-70">{penceToPounds(loc.total)}</span>
            )}
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
  return (
    <>
      <div className="text-center px-3 sm:px-6 pt-6 sm:pt-10 pb-3">
        <p className="text-[10px] sm:text-xs font-semibold tracking-[0.3em] uppercase text-purple-300/80 mb-2">
          {chartLabel}
        </p>
        <p className="text-[10px] sm:text-xs font-semibold tracking-[0.3em] uppercase text-purple-300/80 mb-2">
          Voted From
        </p>
        <button type="button" onClick={onToggleLocationFilter} className="group">
          <h1 className="text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-white to-purple-300 drop-shadow-[0_2px_10px_rgba(168,85,247,0.35)] group-hover:from-purple-200 group-hover:to-purple-200 transition-colors">
            {selectedLocation?.placeId ? formatLocation(selectedLocation) : 'Earth'}
          </h1>
          <span className="mt-3 inline-flex items-center gap-2 text-xs sm:text-sm text-gray-400 group-hover:text-white transition-colors">
            <MapPin className="h-3.5 w-3.5 text-purple-400" />
            {selectedLocation?.placeId ? 'Change location' : 'Choose a location'}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showLocationFilter ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {!showLocationFilter && locationQuickPicks.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <LocationQuickPickButtons
              locationQuickPicks={locationQuickPicks}
              selectedLocation={selectedLocation}
              onLocationChange={onLocationChange}
            />
          </div>
        )}
      </div>

      {showLocationFilter && (
        <div className="max-w-xl mx-auto px-3 sm:px-6 mb-3 text-center">
          <LocationAutocomplete
            value={selectedLocation}
            onChange={onLocationChange}
            placeholder="Search city, town, or region…"
          />
          {locationQuickPicks.length > 0 && (
            <div className="mt-3">
              {popularLocationsLabel && (
                <p className="text-xs text-gray-500 mb-2">
                  Popular locations · {popularLocationsLabel}
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-2">
                <LocationQuickPickButtons
                  locationQuickPicks={locationQuickPicks}
                  selectedLocation={selectedLocation}
                  onLocationChange={onLocationChange}
                  size={popularLocationsLabel ? 'sm' : 'md'}
                />
              </div>
            </div>
          )}
          {selectedLocation?.placeId && (
            <p className="text-xs text-purple-300 mt-2">
              Showing tips from {formatLocation(selectedLocation)} and below
            </p>
          )}
        </div>
      )}
    </>
  );
};

export default GlobalChartLocationHero;
