/** TuneBytes on a media card. Null when the payload did not include a total. */
export function formatMediaTuneBytes(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const label = value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return label;
}
