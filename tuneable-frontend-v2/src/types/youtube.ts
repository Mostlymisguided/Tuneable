// YouTube API types
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number): void;
  setVolume(volume: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoUrl(): string;
  getVideoEmbedCode(): string;
  addEventListener(event: string, listener: () => void): void;
  removeEventListener(event: string, listener: () => void): void;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}

export interface YTPlayerOptions {
  height?: string | number;
  width?: string | number;
  videoId?: string;
  playerVars?: {
    autoplay?: 0 | 1;
    controls?: 0 | 1;
    disablekb?: 0 | 1;
    enablejsapi?: 0 | 1;
    fs?: 0 | 1;
    iv_load_policy?: 1 | 3;
    rel?: 0 | 1;
    showinfo?: 0 | 1;
    start?: number;
    end?: number;
    cc_load_policy?: 0 | 1;
    hl?: string;
    cc_lang_pref?: string;
    widget_referrer?: string;
    playlist?: string;
    playsinline?: 0 | 1;
    modestbranding?: 0 | 1;
    origin?: string;
  };
  events?: {
    onReady?: (event: any) => void;
    onStateChange?: (event: any) => void;
    onPlaybackQualityChange?: (event: any) => void;
    onPlaybackRateChange?: (event: any) => void;
    onError?: (event: any) => void;
    onApiChange?: (event: any) => void;
  };
}

declare global {
  interface Window {
    YT: {
      Player: new (elementId: string | HTMLElement, config: YTPlayerOptions) => YTPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}
