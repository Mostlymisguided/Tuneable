function finiteTuneBytes(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatRoundedTuneBytes(value: unknown, fractionDigits: number): string {
  return finiteTuneBytes(value).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** TuneBytes shown to anyone else: nearest whole number. */
export function formatTuneBytes(value: unknown): string {
  return formatRoundedTuneBytes(value, 0);
}

/** TuneBytes on a media card. Null when the payload did not include a total. */
export function formatMediaTuneBytes(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return formatTuneBytes(value);
}

/**
 * Owner's own library. Keeps the tenth so they can check the figure
 * behind the public whole number.
 */
export function formatLibraryTuneBytes(value: unknown): string {
  return formatRoundedTuneBytes(value, 1);
}
