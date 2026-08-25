import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioMetadata,
  type AudioPlayer,
} from 'expo-audio';

export const PODCAST_SKIP_BACK_MS = 15_000;
export const PODCAST_SKIP_FORWARD_MS = 30_000;

export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

const LOCK_SCREEN_OPTIONS = {
  showSeekForward: true,
  showSeekBackward: true,
} as const;

let audioModeReady = false;

export function nextPlaybackSpeed(current: number): PlaybackSpeed {
  const idx = PLAYBACK_SPEEDS.indexOf(current as PlaybackSpeed);
  if (idx < 0 || idx >= PLAYBACK_SPEEDS.length - 1) return PLAYBACK_SPEEDS[0];
  return PLAYBACK_SPEEDS[idx + 1];
}

export function formatPlaybackSpeed(rate: number): string {
  if (rate === Math.round(rate)) return `${rate}×`;
  return `${rate}×`;
}

export async function ensurePlaybackAudioMode() {
  if (audioModeReady) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    allowsRecording: false,
    shouldRouteThroughEarpiece: false,
  });
  audioModeReady = true;
}

export function createPersistentAudioPlayer(): AudioPlayer {
  return createAudioPlayer(null, {
    updateInterval: 500,
    keepAudioSessionActive: true,
  });
}

export function publishLockScreen(player: AudioPlayer, metadata: AudioMetadata) {
  player.setActiveForLockScreen(true, metadata, LOCK_SCREEN_OPTIONS);
}

export function destroyAudioPlayer(player: AudioPlayer | null) {
  if (!player) return;
  try {
    player.pause();
    player.clearLockScreenControls();
    player.remove();
  } catch {
    // ignore
  }
}
