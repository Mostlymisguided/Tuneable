// Venue types are now top-level types alongside band, collective, etc.
export type CollectiveType = 
  | 'band' 
  | 'collective' 
  | 'production_company'
  | 'promoter'
  | 'radio'
  | 'studio'
  | 'record_store'
  | 'venue'
  | 'bar'
  | 'club'
  | 'hostel'
  | 'cafe'
  | 'restaurant'
  | 'festival'
  | 'other';

export type CollectiveTypes = CollectiveType | CollectiveType[];

// Venue types (for checking if a collective is a venue)
export const VENUE_TYPES: CollectiveType[] = ['venue', 'bar', 'club', 'hostel', 'cafe', 'restaurant', 'festival'];
export type VenueKind = 'bar' | 'club' | 'hostel' | 'cafe' | 'restaurant' | 'festival' | 'other';

export const COLLECTIVE_TYPE_OPTIONS: { value: CollectiveType; label: string }[] = [
  { value: 'band', label: 'Band' },
  { value: 'collective', label: 'Collective' },
  { value: 'production_company', label: 'Production Company' },
  { value: 'promoter', label: 'Promoter' },
  { value: 'radio', label: 'Radio' },
  { value: 'studio', label: 'Studio' },
  { value: 'record_store', label: 'Record Store' },
  { value: 'venue', label: 'Venue' },
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
