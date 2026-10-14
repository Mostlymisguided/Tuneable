type MediaSessionHandlers = {
  play?: () => void;
  pause?: () => void;
  seekbackward?: (offsetSeconds: number) => void;
  seekforward?: (offsetSeconds: number) => void;
  seekto?: (timeSeconds: number) => void;
  previoustrack?: () => void;
  nexttrack?: () => void;
};

type MediaSessionMeta = {
  title: string;
  artist: string;
  artwork?: string;
  duration?: number;
  position?: number;
  playbackRate?: number;
  playing?: boolean;
  handlers?: MediaSessionHandlers;
};

let ownerToken = 0;
let suppressPlayUntil = 0;

/** Newest mounted player wins. Stale players must not overwrite lock-screen metadata. */
export function suppressMediaSessionPlay(ms = 800) {
  suppressPlayUntil = Date.now() + ms;
}

export function claimMediaSession(): number {
  ownerToken += 1;
  return ownerToken;
}

export function clearMediaSession(token?: number) {
  if (token != null && token !== ownerToken) return;
  const session = getSession();
  if (!session) return;
  session.metadata = null;
  session.playbackState = 'none';
  (
    [
      'play',
      'pause',
      'previoustrack',
      'nexttrack',
      'seekbackward',
      'seekforward',
      'seekto',
    ] as MediaSessionAction[]
  ).forEach((action) => bindHandler(session, action, null));
}

function getSession(): MediaSession | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return null;
  }
  return navigator.mediaSession;
}

function bindHandler(
  session: MediaSession,
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null
) {
  try {
    session.setActionHandler(action, handler);
  } catch {
    // Browser may not support this action.
  }
}

export function updateMediaSession(meta: MediaSessionMeta, token?: number) {
  if (token != null && token !== ownerToken) return;
  const session = getSession();
  if (!session) return;

  // iOS fires a play action when playbackState flips to paused. Ignore that echo.
  if (meta.playing === false) {
    suppressPlayUntil = Date.now() + 800;
  }

  session.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.artist,
    album: 'Tuneable',
    artwork: meta.artwork
      ? [{ src: meta.artwork, sizes: '512x512' }]
      : [],
  });
  session.playbackState = meta.playing ? 'playing' : 'paused';

  const handlers = meta.handlers;
  if (handlers) {
    bindHandler(
      session,
      'play',
      handlers.play
        ? () => {
            if (Date.now() < suppressPlayUntil) return;
            handlers.play!();
          }
        : null
    );
    bindHandler(session, 'pause', handlers.pause ?? null);
    bindHandler(session, 'previoustrack', handlers.previoustrack ?? null);
    bindHandler(session, 'nexttrack', handlers.nexttrack ?? null);
    bindHandler(
      session,
      'seekbackward',
      handlers.seekbackward
        ? (details) => handlers.seekbackward!(details.seekOffset || 15)
        : null
    );
    bindHandler(
      session,
      'seekforward',
      handlers.seekforward
        ? (details) => handlers.seekforward!(details.seekOffset || 30)
        : null
    );
    bindHandler(
      session,
      'seekto',
      handlers.seekto
        ? (details) => {
            if (typeof details.seekTime === 'number') {
              handlers.seekto!(details.seekTime);
            }
          }
        : null
    );
  }

  if (
    typeof meta.duration === 'number' &&
    meta.duration > 0 &&
    typeof meta.position === 'number' &&
    Number.isFinite(meta.position)
  ) {
    try {
      session.setPositionState({
        duration: meta.duration,
        playbackRate: meta.playing
          ? meta.playbackRate && meta.playbackRate > 0
            ? meta.playbackRate
            : 1
          : 0,
        position: Math.max(0, Math.min(meta.position, meta.duration)),
      });
    } catch {
      // Invalid position state is ignored.
    }
  }
}

