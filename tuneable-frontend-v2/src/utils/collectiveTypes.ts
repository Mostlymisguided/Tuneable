import type { ResolvedLocation } from './locationHelpers';
import { getPlaceProfilePath } from './locationHelpers';

// Venue types are now top-level types alongside band, collective, etc.
export type CollectiveType = 
  | 'band' 
  | 'collective' 
  | 'production_company'
  | 'bar'
  | 'club'
  | 'hostel'
  | 'cafe'
  | 'restaurant'
  | 'festival'
  | 'other';

export type CollectiveTypes = CollectiveType | CollectiveType[];

// Venue types (for checking if a collective is a venue)
export const VENUE_TYPES: CollectiveType[] = ['bar', 'club', 'hostel', 'cafe', 'restaurant', 'festival'];
export type VenueKind = 'bar' | 'club' | 'hostel' | 'cafe' | 'restaurant' | 'festival' | 'other';

const CITY_LIKE = new Set(['place', 'locality', 'neighborhood', 'district']);

export const COLLECTIVE_TYPE_OPTIONS: { value: CollectiveType; label: string }[] = [
  { value: 'band', label: 'Band' },
  { value: 'collective', label: 'Collective' },
  { value: 'production_company', label: 'Production Company' },
  { value: 'bar', label: 'Bar' },
  { value: 'club', label: 'Club' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'festival', label: 'Festival' },
  { value: 'other', label: 'Other' },
];

// Deprecated: venueKind is no longer used (venue types are now top-level)
export const VENUE_KIND_OPTIONS: { value: VenueKind; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'club', label: 'Club' },
  { value: 'hostel', label: 'Hostel' },
  { value: 'cafe', label: 'Cafe' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'festival', label: 'Festival' },
  { value: 'other', label: 'Other' },
];

export function collectiveTypeLabel(type?: CollectiveTypes | string | null): string {
  if (!type) return 'Collective';
  
  if (Array.isArray(type)) {
    if (type.length === 0) return 'Collective';
    const labels = type
      .map(t => COLLECTIVE_TYPE_OPTIONS.find((option) => option.value === t)?.label)
      .filter(Boolean);
    return labels.length > 0 ? labels.join(' · ') : 'Collective';
  }
  
  return COLLECTIVE_TYPE_OPTIONS.find((option) => option.value === type)?.label || 'Collective';
}

export function venueKindLabel(kind?: string | null): string {
  return VENUE_KIND_OPTIONS.find((option) => option.value === kind)?.label || '';
}

export function isVenueCollective(type?: CollectiveTypes | string | null): boolean {
  if (!type) return false;
  if (Array.isArray(type)) {
    return type.some(t => VENUE_TYPES.includes(t as CollectiveType));
  }
  return VENUE_TYPES.includes(type as CollectiveType);
}

export function hasCollectiveType(types?: CollectiveTypes | string | null, targetType?: CollectiveType): boolean {
  if (!types || !targetType) return false;
  if (Array.isArray(types)) {
    return types.includes(targetType);
  }
  return types === targetType;
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
