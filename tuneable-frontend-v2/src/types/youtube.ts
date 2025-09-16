// YouTube API types
declare global {
  interface Window {
    YT: {
      Player: new (elementId: string | HTMLElement, config: any) => any;
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

export {};
