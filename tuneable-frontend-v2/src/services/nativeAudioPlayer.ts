import { Capacitor } from '@capacitor/core';
import { AudioPlayer } from '@mediagrid/capacitor-native-audio';

const AUDIO_ID = 'tuneable-main';

export interface NativeTrackMeta {
  title: string;
  artist: string;
  artwork?: string;
}

type EndedCallback = () => void;

let endedCallback: EndedCallback | null = null;
let listenersRegistered = false;

export function isNativeAudioPlatform(): boolean {
  return Capacitor.isNativePlatform();
}

function ensureListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  AudioPlayer.onAudioEnd({ audioId: AUDIO_ID }, () => {
    if (endedCallback) {
      endedCallback();
    }
  }).catch(() => {
    listenersRegistered = false;
  });
}

export function setNativeAudioEndedCallback(cb: EndedCallback | null) {
  endedCallback = cb;
}

export async function destroyNativeAudio(): Promise<void> {
  try {
    await AudioPlayer.destroy({ audioId: AUDIO_ID });
  } catch {
    // No active player
  }
}

export async function loadNativeTrack(url: string, meta: NativeTrackMeta): Promise<void> {
  ensureListeners();
  await destroyNativeAudio();

  await AudioPlayer.create({
    audioId: AUDIO_ID,
    audioSource: url,
    friendlyTitle: meta.title,
    artistName: meta.artist,
    albumTitle: 'Tuneable',
    artworkSource: meta.artwork,
    useForNotification: true,
    showSeekBackward: true,
    showSeekForward: true,
  });

  await AudioPlayer.initialize({ audioId: AUDIO_ID });
}

export async function playNativeAudio(): Promise<void> {
  await AudioPlayer.play({ audioId: AUDIO_ID });
}

export async function pauseNativeAudio(): Promise<void> {
  await AudioPlayer.pause({ audioId: AUDIO_ID });
}

export async function seekNativeAudio(timeInSeconds: number): Promise<void> {
  await AudioPlayer.seek({ audioId: AUDIO_ID, timeInSeconds });
}

export async function getNativeCurrentTime(): Promise<number> {
  const { currentTime } = await AudioPlayer.getCurrentTime({ audioId: AUDIO_ID });
  return currentTime;
}

export async function getNativeDuration(): Promise<number> {
  const { duration } = await AudioPlayer.getDuration({ audioId: AUDIO_ID });
  return duration;
}
