// Location matching and formatting utilities

import type { MapboxLocationFields } from '../types';

export interface Location {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  display?: string;
  placeId?: string;
  ancestorIds?: string[];
  coordinates?: {
    lat: number;
    lng: number;
  };
  detectedFromIP?: boolean;
}

export type ResolvedLocation = MapboxLocationFields & Location;

export interface CountryLocationPick {
  placeId: string;
  country: string;
  countryCode: string;
  display: string;
  /** Chip label (country name or city/town). Defaults to country when omitted. */
  label?: string;
  kind?: 'country' | 'place';
  featureType?: string;
}

/**
 * Extract country-level Mapbox place from a resolved or home location.
 */
export function getCountryPickFromLocation(
  location: (MapboxLocationFields & Location) | null | undefined
): CountryLocationPick | null {
  if (!location) return null;

  if (location.featureType === 'country' && location.placeId) {
    const name = location.country || location.label || location.display || 'Country';
    return {
      placeId: location.placeId,
      country: name,
      countryCode: location.countryCode || '',
      display: name,
      label: name,
      kind: 'country',
      featureType: 'country',
    };
  }

  const countryAncestor = location.ancestors?.find((a) => a.placetype === 'country');
  if (countryAncestor?.placeId) {
    const name = countryAncestor.label || location.country || 'Country';
    return {
      placeId: countryAncestor.placeId,
      country: name,
      countryCode: countryAncestor.countryCode || location.countryCode || '',
      display: name,
      label: name,
      kind: 'country',
      featureType: 'country',
    };
  }

  return null;
}

/** Build a minimal ResolvedLocation for country-level Tunefeed filtering. */
export function countryPickToResolvedLocation(pick: CountryLocationPick): ResolvedLocation {
  return locationPickToResolvedLocation({
    ...pick,
    kind: pick.kind || 'country',
    featureType: pick.featureType || 'country',
    label: pick.label || pick.country,
  });
}

/** Build a ResolvedLocation from a country or place quick-pick chip. */
export function locationPickToResolvedLocation(pick: CountryLocationPick): ResolvedLocation {
  const kind = pick.kind || 'country';
  const label = pick.label || pick.display || pick.country;
  const display =
    kind === 'country'
      ? pick.country || label
      : pick.display || label;

  return {
    placeProvider: 'mapbox',
    placeId: pick.placeId,
    featureType: pick.featureType || (kind === 'place' ? 'place' : 'country'),
    country: pick.country || undefined,
    countryCode: pick.countryCode || undefined,
    city: kind === 'place' ? label : undefined,
    display,
    label,
    ancestorIds: [pick.placeId],
  };
}

/**
 * Check if user location matches party location filter
 */
export function isLocationMatch(
  partyFilter: { city?: string; countryCode?: string; region?: string; country?: string } | null | undefined,
  userLocation: Location | null | undefined
): boolean {
  // If no party filter or no user location, no match
  if (!partyFilter || !userLocation || !userLocation.countryCode) {
    return false;
  }
  
  // If party filter has no country code, can't match
  if (!partyFilter.countryCode) {
    return false;
  }
  
  // Country code must match
  if (partyFilter.countryCode.toUpperCase() !== userLocation.countryCode.toUpperCase()) {
    return false;
  }
  
  // If party specifies a city, user must match that city
  if (partyFilter.city) {
    return userLocation.city?.toLowerCase() === partyFilter.city.toLowerCase();
  }
  
  // If party specifies a region, user must match that region
  if (partyFilter.region) {
    return userLocation.region?.toLowerCase() === partyFilter.region.toLowerCase();
  }
  
  // If party is country-level, any city in that country matches
  return true;
}

/**
 * Country name for compact UI (chips, meta rows). Prefers Mapbox country place,
 * then falls back to legacy country string. Returns null when unknown.
 */
export function getCountryLabelFromLocation(location: Location | null | undefined): string | null {
  if (!location) return null;
  const pick = getCountryPickFromLocation(location);
  if (pick?.country?.trim()) return pick.country.trim();
  const country = location.country?.trim();
  return country || null;
}

/** Profile path for a Mapbox placeId → `/place/{placeId}` */
export function getPlaceProfilePath(placeId: string | null | undefined): string | null {
  if (!placeId || typeof placeId !== 'string' || !placeId.trim()) return null;
  return `/place/${encodeURIComponent(placeId.trim())}`;
}

/**
 * Country-level place profile path from a media/user location.
 * Returns null when there is no Mapbox country placeId to link.
 */
export function getCountryPlaceProfilePath(
  location: (MapboxLocationFields & Location) | null | undefined
): string | null {
  const pick = getCountryPickFromLocation(location);
  return getPlaceProfilePath(pick?.placeId);
}

/**
 * Format location for display
 */
export function formatLocation(location: Location | null | undefined): string {
  if (!location) {
    return 'Unknown Location';
  }

  if (location.display) {
    return location.display;
  }
  
  if (location.city && location.country) {
    return `${location.city}, ${location.country}`;
  }
  if (location.city && location.countryCode) {
    return `${location.city}, ${location.countryCode}`;
  }
  if (location.city) {
    return location.city;
  }
  if (location.country) {
    return location.country;
  }
  if (location.countryCode) {
    return location.countryCode;
  }
  
  return 'Unknown Location';
}

/**
 * Format location filter for display
 */
export function formatLocationFilter(filter: { city?: string; country?: string; countryCode?: string }): string {
  if (filter.city && filter.country) {
    return `${filter.city}, ${filter.country}`;
  }
  if (filter.city && filter.countryCode) {
    return `${filter.city}, ${filter.countryCode}`;
  }
  if (filter.city) {
    return filter.city;
  }
  if (filter.country) {
    return filter.country;
  }
  if (filter.countryCode) {
    return filter.countryCode;
  }
  
  return 'Unknown Location';
}

/** Place types allowed as Champion scopes (excludes street / postcode). */
const CHAMPION_SCOPE_PLACETYPES = new Set([
  'country',
  'region',
  'district',
  'place',
  'locality',
  'neighborhood',
]);

export interface ChampionScopePick {
  placeId: string;
  label: string;
  placetype?: string;
}

/**
 * Build coarse→fine Champion scope chips from a resolved home location.
 * Skips address/postcode levels.
 */
export function getChampionScopePicksFromLocation(
  location: (MapboxLocationFields & Location) | null | undefined
): ChampionScopePick[] {
  if (!location) return [];

  const picks: ChampionScopePick[] = [];
  const seen = new Set<string>();

  const add = (placeId?: string, label?: string, placetype?: string) => {
    if (!placeId || !label || seen.has(placeId)) return;
    if (placetype && !CHAMPION_SCOPE_PLACETYPES.has(placetype)) return;
    seen.add(placeId);
    picks.push({ placeId, label, placetype });
  };

  const ancestors = Array.isArray(location.ancestors) ? [...location.ancestors] : [];
  const order = ['country', 'region', 'district', 'place', 'locality', 'neighborhood'];
  ancestors.sort((a, b) => {
    const ai = order.indexOf(a.placetype || '');
    const bi = order.indexOf(b.placetype || '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const ancestor of ancestors) {
    add(ancestor.placeId, ancestor.label, ancestor.placetype);
  }

  add(
    location.placeId,
    location.label || location.city || location.display || location.country,
    location.featureType
  );

  return picks;
}

/**
 * Minimal ResolvedLocation for Champion place filtering.
 */
export function championPickToResolvedLocation(pick: ChampionScopePick): ResolvedLocation {
  return {
    placeProvider: 'mapbox',
    placeId: pick.placeId,
    featureType: pick.placetype,
    display: pick.label,
    label: pick.label,
    ancestorIds: [pick.placeId],
  };
}

export const LOCATION_SCOPES = ['in', 'from', 'supported-by'] as const;
export type LocationScope = (typeof LOCATION_SCOPES)[number];

export const LOCATION_SCOPE_OPTIONS: { id: LocationScope; label: string }[] = [
  { id: 'in', label: 'In' },
  { id: 'from', label: 'From' },
  { id: 'supported-by', label: 'Supported by' },
];

export function normalizeLocationScope(value: string | null | undefined): LocationScope {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'from') return 'from';
  if (raw === 'supported-by' || raw === 'supported_by' || raw === 'supportedby') {
    return 'supported-by';
  }
  return 'in';
}

export function locationScopeLabel(scope: LocationScope): string {
  return LOCATION_SCOPE_OPTIONS.find((option) => option.id === scope)?.label || 'In';
}

export function locationScopeFilterNote(
  noun: string,
  placeLabel: string,
  scope: LocationScope
): string {
  switch (scope) {
    case 'from':
      return `${noun} from ${placeLabel} and below`;
    case 'supported-by':
      return `${noun} supported by people in ${placeLabel} and below`;
    default:
      return `${noun} in ${placeLabel} and below`;
  }
}

export function locationScopeEmptyMessage(
  nounPlural: string,
  placeLabel: string,
  scope: LocationScope
): string {
  switch (scope) {
    case 'from':
      return `No ${nounPlural} from ${placeLabel} yet.`;
    case 'supported-by':
      return `Nothing supported by people in ${placeLabel} yet.`;
    default:
      return `No ${nounPlural} connected to ${placeLabel} yet.`;
  }
}

