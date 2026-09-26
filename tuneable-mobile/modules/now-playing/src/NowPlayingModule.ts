import { NativeModule, requireNativeModule } from 'expo-modules-core';

export type NowPlayingCommand =
  | 'play'
  | 'pause'
  | 'toggle'
  | 'next'
  | 'previous'
  | 'seek'
  | 'skipForward'
  | 'skipBack';

export type NowPlayingCommandEvent = {
  command: NowPlayingCommand;
  positionMs?: number;
  intervalMs?: number;
};

export type NowPlayingParams = {
  title: string;
  artist: string;
  albumTitle?: string;
  artworkUrl?: string | null;
  duration: number;
  elapsed: number;
  playbackRate: number;
  isPlaying: boolean;
  mode: 'music' | 'podcast';
};

declare class NowPlayingNativeModule extends NativeModule<{
  onCommand: (event: NowPlayingCommandEvent) => void;
}> {
  setNowPlaying(params: NowPlayingParams): void;
  updateElapsed(elapsed: number, duration: number, playbackRate: number): void;
  clear(): void;
}

export default requireNativeModule<NowPlayingNativeModule>('NowPlaying');
