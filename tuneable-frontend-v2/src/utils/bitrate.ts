/** Canonical bitrate in kbps. music-metadata uses bits/second (320 kbps → 320000). */
const BITS_PER_SECOND_THRESHOLD = 20000;

export function bitrateToKbps(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number.parseFloat(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  const kbps = num >= BITS_PER_SECOND_THRESHOLD ? num / 1000 : num;
  const rounded = Math.round(kbps);
  return rounded > 0 ? rounded : null;
}

export function formatBitrateKbps(value: unknown): string | null {
  const kbps = bitrateToKbps(value);
  return kbps == null ? null : `${kbps} kbps`;
}
