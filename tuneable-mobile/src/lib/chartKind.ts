export const CHART_MEDIA_KINDS = ['music', 'podcasts', 'books'] as const;
export type ChartMediaKind = (typeof CHART_MEDIA_KINDS)[number];

export type ChartHeroKind = ChartMediaKind | 'places';

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

export function chartKindLabel(kind: ChartHeroKind): string {
  if (kind === 'places') return 'Places';
  return CHART_KIND_OPTIONS.find((option) => option.id === kind)?.label || 'Music';
}

export function chartKindNoun(kind: ChartHeroKind): string {
  return chartKindLabel(kind);
}

let lastChartKind: ChartMediaKind = 'music';

export function rememberChartKind(kind: ChartMediaKind) {
  lastChartKind = kind;
}

export function getLastChartKind(): ChartMediaKind {
  return lastChartKind;
}
