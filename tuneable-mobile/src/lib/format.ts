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

/** Format playback position/duration in milliseconds as m:ss */
export function formatPlaybackMs(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
