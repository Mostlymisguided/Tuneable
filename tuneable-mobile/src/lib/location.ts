import type { ChartMediaItem } from '@/src/types/media';
import type { ResolvedLocation } from '@/src/types/user';

export interface CountryLocationPick {
  placeId: string;
  country: string;
  countryCode: string;
  display: string;
}

export type LocationQuickPick = CountryLocationPick & {
  total: number;
  isUser: boolean;
};

export function formatLocation(location: ResolvedLocation | null | undefined): string {
  if (!location) return 'Earth';
  return location.display || location.country || location.city || 'Earth';
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

export function computeLocationQuickPicks(
  media: ChartMediaItem[],
  userHomeLocation?: ResolvedLocation | null,
  maxPicks = 5
): LocationQuickPick[] {
  const counts: Record<
    string,
    { pick: CountryLocationPick; total: number; count: number }
  > = {};

  for (const item of media) {
    for (const bid of item.bids ?? []) {
      if (bid.status === 'vetoed') continue;
      const countryPick = getCountryPickFromLocation(bid.userId?.homeLocation);
      if (!countryPick?.placeId) continue;

      const key = countryPick.placeId;
      const amount = typeof bid.amount === 'number' ? bid.amount : 0;
      if (!counts[key]) counts[key] = { pick: countryPick, total: 0, count: 0 };
      counts[key].total += amount;
      counts[key].count += 1;
    }
  }

  const topLocations = Object.values(counts).sort(
    (a, b) => b.total - a.total || b.count - a.count
  );

  const userPick = getCountryPickFromLocation(userHomeLocation);
  const picks: LocationQuickPick[] = [];

  if (userPick) {
    const userStats = topLocations.find((loc) => loc.pick.placeId === userPick.placeId);
    picks.push({
      ...userPick,
      total: userStats?.total ?? 0,
      isUser: true,
    });
  }

  for (const { pick, total } of topLocations) {
    if (picks.length >= maxPicks) break;
    if (picks.some((p) => p.placeId === pick.placeId)) continue;
    picks.push({ ...pick, total, isUser: false });
  }

  return picks;
}
