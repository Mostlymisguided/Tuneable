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
