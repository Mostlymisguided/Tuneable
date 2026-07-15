/** Format wallet balance stored in pence as £X.XX */
export function formatPoundsFromPence(pence: number | undefined | null): string {
  const value = (pence ?? 0) / 100;
  return `£${value.toFixed(2)}`;
}

/** Format duration in seconds as m:ss */
export function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
