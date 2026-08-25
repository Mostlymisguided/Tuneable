export const PODCAST_SKIP_BACK_MS = 15_000;
export const PODCAST_SKIP_FORWARD_MS = 30_000;

export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export function nextPlaybackSpeed(current: number): PlaybackSpeed {
  const idx = PLAYBACK_SPEEDS.indexOf(current as PlaybackSpeed);
  if (idx < 0 || idx >= PLAYBACK_SPEEDS.length - 1) return PLAYBACK_SPEEDS[0];
  return PLAYBACK_SPEEDS[idx + 1];
}

export function formatPlaybackSpeed(rate: number): string {
  if (rate === Math.round(rate)) return `${rate}×`;
  return `${rate}×`;
}
