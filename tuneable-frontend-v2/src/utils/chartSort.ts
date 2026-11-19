export const CHART_SORT_OPTIONS = [
  { key: 'most-tipped', label: 'Most Tips' },
  { key: 'most-tunebytes', label: 'Most TuneBytes' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
] as const;

export type ChartSortKey = (typeof CHART_SORT_OPTIONS)[number]['key'];

export function normalizeChartSort(sortBy?: string | null): ChartSortKey {
  if (sortBy === 'newest' || sortBy === 'oldest' || sortBy === 'most-tipped' || sortBy === 'most-tunebytes') {
    return sortBy;
  }
  return 'most-tipped';
}

export function chartSortLabel(sortBy?: string | null): string {
  const key = normalizeChartSort(sortBy);
  return CHART_SORT_OPTIONS.find((option) => option.key === key)?.label ?? 'Most Tips';
}

function dateMs(value: unknown): number {
  if (!value) return 0;
  const t = new Date(value as string | number | Date).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function defaultChartDate(item: Record<string, unknown> | null | undefined): unknown {
  if (!item) return null;
  const nested = item.mediaId && typeof item.mediaId === 'object'
    ? (item.mediaId as Record<string, unknown>)
    : null;
  return (
    item.createdAt ||
    item.uploadedAt ||
    item.queuedAt ||
    nested?.createdAt ||
    nested?.uploadedAt ||
    null
  );
}

type ReleaseDateSource = {
  releaseDate?: unknown;
  releaseYear?: unknown;
  media?: ReleaseDateSource | null;
  mediaId?: ReleaseDateSource | string | null;
};

function chartMediaLayers(item: ReleaseDateSource | null | undefined): ReleaseDateSource[] {
  if (!item) return [];
  const layers = [item];
  if (item.media && typeof item.media === 'object') layers.push(item.media);
  if (item.mediaId && typeof item.mediaId === 'object') layers.push(item.mediaId);
  return layers;
}

function releaseYearDate(year: unknown): Date | null {
  const numeric = typeof year === 'number'
    ? year
    : typeof year === 'string' && /^\d{4}$/.test(year)
      ? Number(year)
      : NaN;
  if (!Number.isInteger(numeric) || numeric < 1900 || numeric > 2100) return null;
  return new Date(Date.UTC(numeric, 0, 1));
}

/** Full release date, then a year-only release. Undated tunes sort last. */
export function chartReleaseDate(item: ReleaseDateSource | null | undefined): unknown {
  const layers = chartMediaLayers(item);
  for (const media of layers) {
    if (media.releaseDate) return media.releaseDate;
  }
  for (const media of layers) {
    const yearDate = releaseYearDate(media.releaseYear);
    if (yearDate) return yearDate;
  }
  return null;
}

export function defaultChartTip(item: Record<string, unknown> | null | undefined): number {
  if (!item) return 0;
  const nested = item.mediaId && typeof item.mediaId === 'object'
    ? (item.mediaId as Record<string, unknown>)
    : null;
  const candidates = [
    item.timePeriodBidValue,
    item.partyMediaAggregate,
    item.totalBidValue,
    item.globalMediaAggregate,
    item.globalUserMediaAggregate,
    nested?.globalMediaAggregate,
  ];
  for (const value of candidates) {
    if (typeof value === 'number') return value;
  }
  return 0;
}

export function defaultChartTuneBytes(item: Record<string, unknown> | null | undefined): number {
  if (!item) return 0;
  const nested = item.mediaId && typeof item.mediaId === 'object'
    ? (item.mediaId as Record<string, unknown>)
    : null;
  const candidates = [
    item.tuneBytesEarned,
    nested?.tuneBytesEarned,
  ];
  for (const value of candidates) {
    if (typeof value === 'number') return value;
  }
  return 0;
}

export function sortChartItems<T>(
  items: T[],
  sortBy: string | null | undefined,
  accessors?: {
    getDate?: (item: T) => unknown;
    getReleaseDate?: (item: T) => unknown;
    getTip?: (item: T) => number;
    getTuneBytes?: (item: T) => number;
  }
): T[] {
  const key = normalizeChartSort(sortBy);
  const getDate = accessors?.getDate ?? ((item: T) => defaultChartDate(item as Record<string, unknown>));
  const getReleaseDate = accessors?.getReleaseDate;
  const getTip = accessors?.getTip ?? ((item: T) => defaultChartTip(item as Record<string, unknown>));
  const getTuneBytes = accessors?.getTuneBytes ?? ((item: T) => defaultChartTuneBytes(item as Record<string, unknown>));

  return [...items].sort((a, b) => {
    const tipA = getTip(a) || 0;
    const tipB = getTip(b) || 0;
    const tuneBytesA = getTuneBytes(a) || 0;
    const tuneBytesB = getTuneBytes(b) || 0;
    const addedA = dateMs(getDate(a));
    const addedB = dateMs(getDate(b));
    const releaseA = getReleaseDate ? dateMs(getReleaseDate(a)) : addedA;
    const releaseB = getReleaseDate ? dateMs(getReleaseDate(b)) : addedB;

    if (key === 'newest' || key === 'oldest') {
      if (releaseA !== releaseB) {
        if (!releaseA) return 1;
        if (!releaseB) return -1;
        return key === 'newest' ? releaseB - releaseA : releaseA - releaseB;
      }
      return tipB - tipA;
    }

    if (key === 'most-tunebytes') {
      if (tuneBytesA !== tuneBytesB) return tuneBytesB - tuneBytesA;
      return addedB - addedA;
    }

    if (tipA !== tipB) return tipB - tipA;
    return addedB - addedA;
  });
}

export function toPodcastChartSort(sortBy: string | null | undefined): string {
  const key = normalizeChartSort(sortBy);
  if (key === 'newest') return 'newest';
  if (key === 'oldest') return 'oldest';
  return 'globalMediaAggregate';
}
