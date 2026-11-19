import type { ChartMediaItem, TimePeriodKey } from '@/src/types/media';
import { getChartTipPence, getCreatorDisplay } from '@/src/lib/media';
import { getCanonicalTag } from '@/src/lib/tagNormalizer';

/** Inclusive picker bounds. The full span means the filter is off.
 *  Keep in sync with tuneable-frontend-v2/src/utils/bpm.ts. */
export const BPM_FILTER_MIN = 40;
export const BPM_FILTER_MAX = 220;

export type BpmFilterRange = {
  min: number;
  max: number;
};

export const BPM_FILTER_ALL: BpmFilterRange = {
  min: BPM_FILTER_MIN,
  max: BPM_FILTER_MAX,
};

export function isBpmFilterActive(range: BpmFilterRange): boolean {
  return range.min > BPM_FILTER_MIN || range.max < BPM_FILTER_MAX;
}

export function clampBpmBound(value: number): number {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return BPM_FILTER_MIN;
  return Math.max(BPM_FILTER_MIN, Math.min(BPM_FILTER_MAX, rounded));
}

/** Same object when nothing changed, so callers can skip extra renders. */
export function bpmFilterWithMin(range: BpmFilterRange, min: number): BpmFilterRange {
  const nextMin = clampBpmBound(min);
  const nextMax = Math.max(range.max, nextMin);
  if (nextMin === range.min && nextMax === range.max) return range;
  return { min: nextMin, max: nextMax };
}

export function bpmFilterWithMax(range: BpmFilterRange, max: number): BpmFilterRange {
  const nextMax = clampBpmBound(max);
  const nextMin = Math.min(range.min, nextMax);
  if (nextMin === range.min && nextMax === range.max) return range;
  return { min: nextMin, max: nextMax };
}

export type TopTagEntry = {
  tag: string;
  total: number;
  count: number;
};

export type ChartFilterState = {
  selectedTagTerms: string[];
  searchQuery: string;
  bpmFilterRange: BpmFilterRange;
  /** Profile library uses AND; Music chart uses OR (default). */
  requireAllTags?: boolean;
};

export function formatBpmFilterLabel(range: BpmFilterRange): string {
  if (!isBpmFilterActive(range)) return 'All';
  if (range.min === range.max) return String(range.min);
  if (range.min <= BPM_FILTER_MIN) return `≤${range.max}`;
  if (range.max >= BPM_FILTER_MAX) return `${range.min}+`;
  return `${range.min}–${range.max}`;
}

export function getMediaBpm(item: ChartMediaItem): number | null {
  const bpm = item.bpm;
  return typeof bpm === 'number' && bpm > 0 ? bpm : null;
}

export function mediaMatchesBpmFilter(
  item: ChartMediaItem,
  range: BpmFilterRange
): boolean {
  if (!isBpmFilterActive(range)) return true;
  const bpm = getMediaBpm(item);
  if (bpm == null) return false;
  const rounded = Math.round(bpm);
  return rounded >= range.min && rounded <= range.max;
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
  const {
    selectedTagTerms,
    searchQuery,
    bpmFilterRange,
    requireAllTags = false,
  } = filters;
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
          const artist = getCreatorDisplay(item).toLowerCase();
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

      const tags = (item.tags ?? [])
        .map((tag) =>
          tag && typeof tag === 'string' ? getCanonicalTag(tag) : ''
        )
        .filter(Boolean);

      const matchesTagSearch =
        tagTerms.length === 0 ||
        (requireAllTags
          ? tagTerms.every((tagTerm) => {
              const canonicalSearchTag = getCanonicalTag(tagTerm);
              return tags.some((tag) => tag === canonicalSearchTag);
            })
          : tagTerms.some((tagTerm) => {
              const canonicalSearchTag = getCanonicalTag(tagTerm);
              return tags.some((tag) => tag === canonicalSearchTag);
            }));

      return matchesRegularSearch && matchesTagSearch;
    });
  }

  if (isBpmFilterActive(bpmFilterRange)) {
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
    isBpmFilterActive(filters.bpmFilterRange)
  );
}
