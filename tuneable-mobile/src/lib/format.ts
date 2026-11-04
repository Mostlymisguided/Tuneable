/** Format wallet balance stored in pence as £X.XX */
export function formatPoundsFromPence(pence: number | undefined | null): string {
  const value = (pence ?? 0) / 100;
  return `£${value.toFixed(2)}`;
}

/** TuneBytes rounded to the nearest whole number. */
export function formatTuneBytes(value: number | undefined | null): string {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Same whole-number rounding, kept for existing tune and chart call sites. */
export function formatTuneBytesDecimal(value: number | undefined | null): string {
  return formatTuneBytes(value);
}

/** Owner's own library: keeps the tenth behind the public whole number. */
export function formatLibraryTuneBytes(value: number | undefined | null): string {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

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

/** Format duration in seconds as m:ss or h:mm:ss */
export function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Format playback position/duration in milliseconds as m:ss */
export function formatPlaybackMs(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
