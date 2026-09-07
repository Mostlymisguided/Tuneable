import { toast } from './toast';
import { buildLoginUrl, getCurrentReturnPath } from './authHelpers';

type PlayAuthRedirect = (url: string) => void;

let playAuthRedirect: PlayAuthRedirect | null = null;
let lastPlayAuthPromptAt = 0;
const PLAY_AUTH_PROMPT_MS = 400;

export function setPlayAuthRedirect(fn: PlayAuthRedirect | null): void {
  playAuthRedirect = fn;
}

export function hasAuthToken(): boolean {
  try {
    return Boolean(localStorage.getItem('token'));
  } catch {
    return false;
  }
}

/** Returns true when the user can start playback. Guests are sent to login. */
export function requireAuthToPlay(): boolean {
  if (hasAuthToken()) return true;

  const now = Date.now();
  if (now - lastPlayAuthPromptAt > PLAY_AUTH_PROMPT_MS) {
    lastPlayAuthPromptAt = now;
    toast.info('Please log in to play');
    const url = buildLoginUrl(getCurrentReturnPath());
    if (playAuthRedirect) {
      playAuthRedirect(url);
    } else {
      window.location.assign(url);
    }
  }
  return false;
}
