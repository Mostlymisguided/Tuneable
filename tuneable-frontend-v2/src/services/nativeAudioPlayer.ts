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
let requestId = 0;
let chain: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

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
  const id = ++requestId;
  await enqueue(async () => {
    if (id !== requestId) return;
    try {
      await AudioPlayer.destroy({ audioId: AUDIO_ID });
    } catch {
      // No active player
    }
  });
}

export async function loadNativeTrack(url: string, meta: NativeTrackMeta): Promise<boolean> {
  ensureListeners();
  const id = ++requestId;
  let loaded = false;
  await enqueue(async () => {
    if (id !== requestId) return;
    try {
      await AudioPlayer.destroy({ audioId: AUDIO_ID });
    } catch {
      // No active player
    }
    if (id !== requestId) return;
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
    if (id !== requestId) {
      try {
        await AudioPlayer.destroy({ audioId: AUDIO_ID });
      } catch {
        // superseded
      }
      return;
    }
    await AudioPlayer.initialize({ audioId: AUDIO_ID });
    if (id !== requestId) {
      try {
        await AudioPlayer.destroy({ audioId: AUDIO_ID });
      } catch {
        // superseded
      }
      return;
    }
    loaded = true;
  });
  return loaded;
}

export async function playNativeAudio(): Promise<void> {
  const id = requestId;
  await enqueue(async () => {
    if (id !== requestId) return;
    await AudioPlayer.play({ audioId: AUDIO_ID });
  });
}

export async function pauseNativeAudio(): Promise<void> {
  const id = requestId;
  await enqueue(async () => {
    if (id !== requestId) return;
    await AudioPlayer.pause({ audioId: AUDIO_ID });
  });
}

export async function seekNativeAudio(timeInSeconds: number): Promise<void> {
  const id = requestId;
  await enqueue(async () => {
    if (id !== requestId) return;
    await AudioPlayer.seek({ audioId: AUDIO_ID, timeInSeconds });
  });
}

export async function getNativeCurrentTime(): Promise<number> {
  const { currentTime } = await AudioPlayer.getCurrentTime({ audioId: AUDIO_ID });
  return currentTime;
}

export async function getNativeDuration(): Promise<number> {
  const { duration } = await AudioPlayer.getDuration({ audioId: AUDIO_ID });
  return duration;
}
