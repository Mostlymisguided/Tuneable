/** Canonical BPM for display: nearest whole number. Empty / non-positive → null. */
export function roundBpm(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  const rounded = Math.round(num);
  return rounded > 0 ? rounded : null;
}

export function formatBpmLabel(value: unknown): string | null {
  const bpm = roundBpm(value);
  return bpm == null ? null : `${bpm} BPM`;
}

/** Inclusive picker bounds. The full span means the filter is off.
 *  Keep in sync with tuneable-mobile/src/lib/chartFilters.ts. */
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

export function formatBpmFilterLabel(range: BpmFilterRange): string {
  if (!isBpmFilterActive(range)) return 'All';
  if (range.min === range.max) return String(range.min);
  if (range.min <= BPM_FILTER_MIN) return `≤${range.max}`;
  if (range.max >= BPM_FILTER_MAX) return `${range.min}+`;
  return `${range.min}–${range.max}`;
}

/** Whole-number BPM, inclusive. A wide-open range keeps every tune, including those with no BPM. */
export function bpmMatchesFilter(bpm: number | null | undefined, range: BpmFilterRange): boolean {
  if (!isBpmFilterActive(range)) return true;
  if (typeof bpm !== 'number' || !(bpm > 0)) return false;
  const rounded = Math.round(bpm);
  return rounded >= range.min && rounded <= range.max;
}
