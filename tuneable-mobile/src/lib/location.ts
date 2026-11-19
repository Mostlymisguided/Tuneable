import type { ResolvedLocation } from '@/src/types/user';

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

export type LocationQuickPick = CountryLocationPick & {
  total: number;
  isUser: boolean;
};

/** Popular chart location from the server aggregate. */
export interface ChartTopLocation {
  placeId?: string | null;
  label?: string | null;
  country?: string | null;
  countryCode?: string | null;
  display?: string | null;
  kind?: string | null;
  featureType?: string | null;
  total?: number;
  count?: number;
}

export function formatLocation(location: ResolvedLocation | null | undefined): string {
  if (!location) return 'Earth';
  if (location.display) return location.display;
  if (location.city && location.country) {
    return `${location.city}, ${location.country}`;
  }
  if (location.city && location.countryCode) {
    return `${location.city}, ${location.countryCode}`;
  }
  if (location.city) return location.city;
  if (location.country) return location.country;
  if (location.countryCode) return location.countryCode;
  return location.label || 'Earth';
}

/** Expo Router href for a Mapbox placeId → `/place/{placeId}` */
export function getPlaceProfileHref(
  placeId: string | null | undefined
): `/place/${string}` | null {
  if (!placeId || typeof placeId !== 'string' || !placeId.trim()) return null;
  return `/place/${encodeURIComponent(placeId.trim())}`;
}

/** @deprecated Prefer getPlaceProfileHref for typed router.push */
export function getPlaceProfilePath(placeId: string | null | undefined): string | null {
  return getPlaceProfileHref(placeId);
}

/** Tip / profile labels — prefer "Not set" over chart fallback "Earth". */
export function formatLocationLabel(
  location: ResolvedLocation | null | undefined
): string | null {
  if (!location) return null;
  const label = formatLocation(location);
  return label === 'Earth' ? null : label;
}

/**
 * Country name for compact UI (chips, meta rows). Prefers Mapbox country place,
 * then falls back to legacy country string. Returns null when unknown.
 */
export function getCountryLabelFromLocation(
  location: ResolvedLocation | null | undefined
): string | null {
  if (!location) return null;
  const pick = getCountryPickFromLocation(location);
  if (pick?.country?.trim()) return pick.country.trim();
  const country = location.country?.trim();
  return country || null;
}

/** Country-level place profile href from a media/user location. */
export function getCountryPlaceProfileHref(
  location: ResolvedLocation | null | undefined
): `/place/${string}` | null {
  const pick = getCountryPickFromLocation(location);
  return getPlaceProfileHref(pick?.placeId);
}

export function getCountryPickFromLocation(
  location: ResolvedLocation | null | undefined
): CountryLocationPick | null {
  if (!location) return null;

  if (location.featureType === 'country' && location.placeId) {
    const name = location.country || location.label || location.display || 'Country';
    return {
      placeId: location.placeId,
      country: name,
      countryCode: location.countryCode || '',
      display: name,
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
    };
  }

  return null;
}

type QuickPickBid = {
  status?: string;
  amount?: number;
  bidderHomePlaceId?: string | null;
  bidderCountryPlaceId?: string | null;
  bidderCountry?: string | null;
  bidderCountryCode?: string | null;
  bidderPlaceLabel?: string | null;
  bidderFeatureType?: string | null;
  bidderLocationDisplay?: string | null;
  userId?: {
    homeLocation?: ResolvedLocation | null;
    secondaryLocation?: ResolvedLocation | null;
  } | null;
};

function userPlaceIds(userHome?: ResolvedLocation | null): Set<string> {
  const ids = new Set<string>();
  if (!userHome) return ids;
  if (userHome.placeId) ids.add(userHome.placeId);
  const country = getCountryPickFromLocation(userHome);
  if (country?.placeId) ids.add(country.placeId);
  return ids;
}

function pickKind(loc: {
  kind?: string | null;
  featureType?: string | null;
}): 'country' | 'place' {
  if (loc.kind === 'place') return 'place';
  if (loc.kind === 'country') return 'country';
  if (loc.featureType && loc.featureType !== 'country') return 'place';
  return 'country';
}

export function locationPickToResolvedLocation(pick: CountryLocationPick): ResolvedLocation {
  const kind = pick.kind || pickKind(pick);
  const label = pick.label || pick.display || pick.country;
  const display = kind === 'country' ? pick.country || label : pick.display || label;
  return {
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

function picksFromBid(bid: QuickPickBid): CountryLocationPick[] {
  const snapshots: CountryLocationPick[] = [];
  if (bid.bidderCountryPlaceId && (bid.bidderCountry || bid.bidderCountryCode)) {
    const country = bid.bidderCountry || bid.bidderCountryCode || 'Country';
    snapshots.push({
      placeId: bid.bidderCountryPlaceId,
      country,
      countryCode: bid.bidderCountryCode || '',
      display: country,
      label: country,
      kind: 'country',
      featureType: 'country',
    });
  }

  const placeLabel = bid.bidderPlaceLabel?.trim();
  const featureType = bid.bidderFeatureType || '';
  if (
    bid.bidderHomePlaceId &&
    placeLabel &&
    featureType &&
    featureType !== 'country' &&
    bid.bidderHomePlaceId !== bid.bidderCountryPlaceId
  ) {
    snapshots.push({
      placeId: bid.bidderHomePlaceId,
      country: bid.bidderCountry || '',
      countryCode: bid.bidderCountryCode || '',
      display: bid.bidderLocationDisplay || placeLabel,
      label: placeLabel,
      kind: 'place',
      featureType,
    });
  }
  if (snapshots.length > 0) return snapshots;

  const home = bid.userId?.homeLocation || bid.userId?.secondaryLocation;
  const country = getCountryPickFromLocation(home);
  if (!country?.placeId) return [];
  return [
    {
      ...country,
      label: country.label || country.country,
      kind: 'country',
      featureType: 'country',
    },
  ];
}

/** Locations ranked by tip volume. Does not pin the viewer's home ahead of more popular places. */
export function quickPicksFromTopLocations(
  locations: ChartTopLocation[] | null | undefined,
  userHome?: ResolvedLocation | null
): LocationQuickPick[] {
  const mine = userPlaceIds(userHome);
  const seen = new Set<string>();
  const sorted = [...(locations ?? [])].sort(
    (a, b) => (b.total ?? 0) - (a.total ?? 0) || (b.count ?? 0) - (a.count ?? 0)
  );
  const picks: LocationQuickPick[] = [];

  for (const loc of sorted) {
    const placeId = typeof loc.placeId === 'string' ? loc.placeId.trim() : '';
    if (!placeId || seen.has(placeId)) continue;
    seen.add(placeId);
    const kind = pickKind(loc);
    const label = (loc.label || loc.display || loc.country || '').trim() || 'Unknown';
    picks.push({
      placeId,
      country: loc.country || (kind === 'country' ? label : ''),
      countryCode: loc.countryCode || '',
      display: loc.display || label,
      label,
      kind,
      featureType: loc.featureType || kind,
      total: loc.total ?? 0,
      isUser: mine.has(placeId),
    });
  }

  return picks;
}

export function computeLocationQuickPicks(
  media: Array<{ bids?: QuickPickBid[] | null }>,
  userHomeLocation?: ResolvedLocation | null,
  maxPicks = 18
): LocationQuickPick[] {
  const counts: Record<
    string,
    { pick: CountryLocationPick; total: number; count: number }
  > = {};

  for (const item of media) {
    for (const bid of item.bids ?? []) {
      if (bid.status === 'vetoed') continue;
      const amount = typeof bid.amount === 'number' ? bid.amount : 0;
      for (const pick of picksFromBid(bid)) {
        if (!pick.placeId) continue;
        const existing = counts[pick.placeId];
        if (!existing) counts[pick.placeId] = { pick, total: 0, count: 0 };
        counts[pick.placeId].total += amount;
        counts[pick.placeId].count += 1;
      }
    }
  }

  const mine = userPlaceIds(userHomeLocation);
  return Object.values(counts)
    .sort((a, b) => b.total - a.total || b.count - a.count)
    .slice(0, maxPicks)
    .map(({ pick, total }) => ({
      ...pick,
      total,
      isUser: mine.has(pick.placeId),
    }));
}

/** Prefer the server popularity aggregate; otherwise rank locations on the loaded chart. */
export function chartLocationQuickPicks(
  topLocations: ChartTopLocation[] | null | undefined,
  media: Array<{ bids?: QuickPickBid[] | null }>,
  userHome?: ResolvedLocation | null
): LocationQuickPick[] {
  if (Array.isArray(topLocations) && topLocations.length > 0) {
    return quickPicksFromTopLocations(topLocations, userHome);
  }
  return computeLocationQuickPicks(media, userHome);
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

