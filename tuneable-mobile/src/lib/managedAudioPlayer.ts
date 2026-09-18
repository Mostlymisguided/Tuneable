import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioLockScreenOptions,
  type AudioMetadata,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

let audioModeReady = false;

export async function ensurePlaybackAudioMode() {
  if (audioModeReady) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    allowsRecording: false,
  });
  audioModeReady = true;
}

export function lockScreenArtworkUrl(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

export function isPlaybackFailed(status: AudioStatus): boolean {
  const state = (status.playbackState || '').toLowerCase();
  return state === 'failed' || state === 'error' || state.includes('fail');
}

export function statusMillis(status: AudioStatus): {
  positionMs: number;
  durationMs: number;
} {
  const position = Number.isFinite(status.currentTime) ? status.currentTime : 0;
  const duration = Number.isFinite(status.duration) ? status.duration : 0;
  return {
    positionMs: Math.max(0, position * 1000),
    durationMs: Math.max(0, duration * 1000),
  };
}

export class ManagedAudioPlayer {
  private player: AudioPlayer | null = null;
  private statusSub: { remove: () => void } | null = null;

  get isReady() {
    return this.player != null;
  }

  async loadAndPlay(params: {
    uri: string;
    metadata: AudioMetadata;
    lockScreen?: AudioLockScreenOptions;
    onStatus: (status: AudioStatus) => void;
    playbackRate?: number;
  }): Promise<void> {
    await ensurePlaybackAudioMode();
    const { uri, metadata, lockScreen, onStatus, playbackRate } = params;

    if (!this.player) {
      this.player = createAudioPlayer(
        { uri },
        { updateInterval: 500, keepAudioSessionActive: true }
      );
    } else {
      this.player.replace({ uri });
    }

    this.statusSub?.remove();
    this.statusSub = this.player.addListener('playbackStatusUpdate', onStatus);
    this.player.setActiveForLockScreen(true, metadata, lockScreen);

    if (typeof playbackRate === 'number' && playbackRate > 0) {
      this.player.shouldCorrectPitch = true;
      this.player.setPlaybackRate(playbackRate);
    }

    this.player.play();
  }

  play() {
    this.player?.play();
  }

  pause() {
    this.player?.pause();
  }

  async seekToSeconds(seconds: number) {
    if (!this.player) return;
    await this.player.seekTo(Math.max(0, seconds));
  }

  setPlaybackRate(rate: number) {
    if (!this.player) return;
    this.player.shouldCorrectPitch = true;
    this.player.setPlaybackRate(rate);
  }

  release() {
    const player = this.player;
    this.player = null;
    this.statusSub?.remove();
    this.statusSub = null;
    if (!player) return;
    try {
      player.clearLockScreenControls();
    } catch {
      // Player may already be torn down.
    }
    try {
      player.pause();
    } catch {
      // ignore
    }
    try {
      player.remove();
    } catch {
      // ignore
    }
  }
}
