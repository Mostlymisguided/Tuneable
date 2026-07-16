import type { ChartMediaItem, TimePeriodKey } from '@/src/types/media';
import { formatArtist, getChartTipPence } from '@/src/lib/media';
import { getCanonicalTag } from '@/src/lib/tagNormalizer';

export const BPM_FILTER_OPTIONS = [
  { key: 'all', label: 'All', min: null, max: null },
  { key: 'under-90', label: '<90', min: null, max: 90 },
  { key: '90-110', label: '90–110', min: 90, max: 110 },
  { key: '110-130', label: '110–130', min: 110, max: 130 },
  { key: '130-150', label: '130–150', min: 130, max: 150 },
  { key: '150-plus', label: '150+', min: 150, max: null },
] as const;

export type BpmFilterRange = (typeof BPM_FILTER_OPTIONS)[number]['key'];

export type TopTagEntry = {
  tag: string;
  total: number;
  count: number;
};

export type ChartFilterState = {
  selectedTagTerms: string[];
  searchQuery: string;
  bpmFilterRange: BpmFilterRange;
};

export function formatBpmFilterLabel(range: BpmFilterRange): string {
  return BPM_FILTER_OPTIONS.find((o) => o.key === range)?.label ?? 'All';
}

export function getMediaBpm(item: ChartMediaItem): number | null {
  const bpm = item.bpm;
  return typeof bpm === 'number' && bpm > 0 ? bpm : null;
}

export function mediaMatchesBpmFilter(
  item: ChartMediaItem,
  range: BpmFilterRange
): boolean {
  if (range === 'all') return true;
  const option = BPM_FILTER_OPTIONS.find((o) => o.key === range);
  if (!option) return true;
  const bpm = getMediaBpm(item);
  if (bpm == null) return false;
  if (option.min != null && bpm < option.min) return false;
  if (option.max != null && bpm >= option.max) return false;
  return true;
}

export function computeTopTags(
  media: ChartMediaItem[],
  period: TimePeriodKey,
  limit = 30
): TopTagEntry[] {
  const counts: Record<string, { total: number; count: number }> = {};

  for (const item of media) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const value = getChartTipPence(item, period);

    for (const raw of tags) {
      const t = (raw || '').trim().toLowerCase();
      if (!t) continue;
      if (!counts[t]) counts[t] = { total: 0, count: 0 };
      counts[t].total += value;
      counts[t].count += 1;
    }
  }

  return Object.entries(counts)
    .map(([tag, v]) => ({ tag, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total || b.count - a.count)
    .slice(0, limit);
}

export function getSelectedTagFilters(selectedTagTerms: string[]): string[] {
  return selectedTagTerms
    .filter((t) => t.startsWith('#'))
    .map((t) => t.slice(1).toLowerCase());
}

export function filterChartMedia(
  media: ChartMediaItem[],
  filters: ChartFilterState
): ChartMediaItem[] {
  const { selectedTagTerms, searchQuery, bpmFilterRange } = filters;
  const liveTerm = searchQuery.trim();
  const allTerms = liveTerm ? [...selectedTagTerms, liveTerm] : selectedTagTerms;

  let result = media.filter((item) => item.status !== 'vetoed');

  if (allTerms.length > 0) {
    result = result.filter((item) => {
      const regularTerms = allTerms.filter((term) => !term.startsWith('#'));
      const tagTerms = allTerms
        .filter((term) => term.startsWith('#'))
        .map((term) => term.slice(1));

      const matchesRegularSearch =
        regularTerms.length === 0 ||
        regularTerms.some((term) => {
          const lowerTerm = term.toLowerCase();
          const title = (item.title || '').toLowerCase();
          const artist = formatArtist(item.artist).toLowerCase();
          const category = (item.category || '').toLowerCase();
          const tagHaystack = (item.tags ?? [])
            .join(' ')
            .toLowerCase();
          return (
            title.includes(lowerTerm) ||
            artist.includes(lowerTerm) ||
            category.includes(lowerTerm) ||
            tagHaystack.includes(lowerTerm)
          );
        });

      const matchesTagSearch =
        tagTerms.length === 0 ||
        tagTerms.some((tagTerm) => {
          const canonicalSearchTag = getCanonicalTag(tagTerm);
          const tags = (item.tags ?? [])
            .map((tag) =>
              tag && typeof tag === 'string' ? getCanonicalTag(tag) : ''
            )
            .filter(Boolean);
          return tags.some((tag) => tag === canonicalSearchTag);
        });

      return matchesRegularSearch && matchesTagSearch;
    });
  }

  if (bpmFilterRange !== 'all') {
    result = result.filter((item) =>
      mediaMatchesBpmFilter(item, bpmFilterRange)
    );
  }

  return result;
}

export function hasActiveChartFilters(filters: ChartFilterState): boolean {
  return (
    filters.selectedTagTerms.length > 0 ||
    filters.searchQuery.trim().length > 0 ||
    filters.bpmFilterRange !== 'all'
  );
}
