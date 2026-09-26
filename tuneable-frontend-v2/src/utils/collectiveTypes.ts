import type { ResolvedLocation } from './locationHelpers';
import { getPlaceProfilePath } from './locationHelpers';

export type CollectiveType = 'band' | 'collective' | 'production_company' | 'venue' | 'other';
export type VenueKind = 'bar' | 'club' | 'hostel' | 'cafe' | 'restaurant' | 'festival' | 'other';

const CITY_LIKE = new Set(['place', 'locality', 'neighborhood', 'district']);

export const COLLECTIVE_TYPE_OPTIONS: { value: CollectiveType; label: string }[] = [
  { value: 'collective', label: 'Collective' },
  { value: 'band', label: 'Band' },
  { value: 'production_company', label: 'Production Company' },
  { value: 'venue', label: 'Venue' },
  { value: 'other', label: 'Other' },
];

export const VENUE_KIND_OPTIONS: { value: VenueKind; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'club', label: 'Club' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'festival', label: 'Festival' },
  { value: 'other', label: 'Other' },
];

export function collectiveTypeLabel(type?: string | null): string {
  return COLLECTIVE_TYPE_OPTIONS.find((option) => option.value === type)?.label || 'Collective';
}

export function venueKindLabel(kind?: string | null): string {
  return VENUE_KIND_OPTIONS.find((option) => option.value === kind)?.label || '';
}

export function isVenueCollective(type?: string | null): boolean {
  return type === 'venue';
}

export function collectiveNoun(type?: string | null): string {
  return isVenueCollective(type) ? 'venue' : 'collective';
}

/** Geographic place profile for a collective/venue — city parent for POIs. */
export function getCollectivePlaceProfilePath(
  location: ResolvedLocation | null | undefined
): string | null {
  if (!location) return null;
  const featureType = location.featureType || '';
  if (featureType === 'country' || featureType === 'region' || CITY_LIKE.has(featureType)) {
    return getPlaceProfilePath(location.placeId);
  }
  const ancestors = location.ancestors || [];
  const parent =
    ancestors.find((a) => a && CITY_LIKE.has(a.placetype))
    || ancestors.find((a) => a?.placetype === 'region')
    || ancestors.find((a) => a?.placetype === 'country');
  return getPlaceProfilePath(parent?.placeId);
}
