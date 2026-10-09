export type CollectiveType = 'band' | 'collective' | 'production_company' | 'venue' | 'other';
export type VenueKind = 'bar' | 'club' | 'hostel' | 'cafe' | 'restaurant' | 'festival' | 'other';

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
