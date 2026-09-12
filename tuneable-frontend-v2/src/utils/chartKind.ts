export const CHART_MEDIA_KINDS = ['music', 'podcasts', 'books'] as const;
export type ChartMediaKind = (typeof CHART_MEDIA_KINDS)[number];

export const CHART_KIND_OPTIONS: { id: ChartMediaKind; label: string }[] = [
  { id: 'music', label: 'Music' },
  { id: 'podcasts', label: 'Podcasts' },
  { id: 'books', label: 'Books' },
];

export function normalizeChartKind(value: unknown): ChartMediaKind {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'podcasts' || raw === 'podcast') return 'podcasts';
  if (raw === 'books' || raw === 'book') return 'books';
  return 'music';
}

export function chartKindLabel(kind: ChartMediaKind): string {
  return CHART_KIND_OPTIONS.find((option) => option.id === kind)?.label || 'Music';
}

export function chartKindPath(kind: ChartMediaKind): string {
  if (kind === 'podcasts') return '/podcasts';
  if (kind === 'books') return '/books';
  return '/party/global?period=all-time';
}
