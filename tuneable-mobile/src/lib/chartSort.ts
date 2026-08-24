export const CHART_SORT_OPTIONS = [
  { key: 'most-tipped', label: 'Most Tipped' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
] as const;

export type ChartSortKey = (typeof CHART_SORT_OPTIONS)[number]['key'];

export function normalizeChartSort(sortBy?: string | null): ChartSortKey {
  if (sortBy === 'newest' || sortBy === 'oldest' || sortBy === 'most-tipped') {
    return sortBy;
  }
  return 'most-tipped';
}

export function chartSortLabel(sortBy?: string | null): string {
  const key = normalizeChartSort(sortBy);
  return CHART_SORT_OPTIONS.find((option) => option.key === key)?.label ?? 'Most Tipped';
}

function dateMs(value: unknown): number {
  if (!value) return 0;
  const t = new Date(value as string | number | Date).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function defaultChartDate(item: Record<string, unknown> | null | undefined): unknown {
  if (!item) return null;
  return item.createdAt || item.uploadedAt || item.queuedAt || item.lastBidAt || null;
}

export function defaultChartTip(item: Record<string, unknown> | null | undefined): number {
  if (!item) return 0;
  const candidates = [
    item.timePeriodBidValue,
    item.partyMediaAggregate,
    item.totalBidValue,
    item.globalMediaAggregate,
    item.globalUserMediaAggregate,
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
    getTip?: (item: T) => number;
  }
): T[] {
  const key = normalizeChartSort(sortBy);
  const getDate =
    accessors?.getDate ?? ((item: T) => defaultChartDate(item as Record<string, unknown>));
  const getTip =
    accessors?.getTip ?? ((item: T) => defaultChartTip(item as Record<string, unknown>));

  return [...items].sort((a, b) => {
    const tipA = getTip(a) || 0;
    const tipB = getTip(b) || 0;
    const dateA = dateMs(getDate(a));
    const dateB = dateMs(getDate(b));

    if (key === 'newest' || key === 'oldest') {
      if (dateA !== dateB) {
        if (!dateA) return 1;
        if (!dateB) return -1;
        return key === 'newest' ? dateB - dateA : dateA - dateB;
      }
      return tipB - tipA;
    }

    if (tipA !== tipB) return tipB - tipA;
    return dateB - dateA;
  });
}

export function toPodcastChartSort(sortBy: string | null | undefined): string {
  const key = normalizeChartSort(sortBy);
  if (key === 'newest') return 'newest';
  if (key === 'oldest') return 'oldest';
  return 'globalMediaAggregate';
}

export const CHART_ADDED_SORT_HINT =
  'Newest and oldest are when the tune was added to Tuneable.';

export const CHART_LIBRARY_SORT_HINT =
  'Newest and oldest are when this library last tipped the tune.';

export const CHART_PODCAST_SORT_HINT =
  'Newest and oldest use the episode publish date.';
