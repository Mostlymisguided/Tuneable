/**
 * Decode + clarify OAuth error query params (especially Spotify's vague
 * passport-spotify "failed to fetch user profile").
 */
export function clarifyOAuthErrorMessage(
  message: string | null | undefined,
  fallback = 'Connection failed. Please try again.'
): string {
  let decoded = (message || '').trim();
  if (!decoded) return fallback;

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // already decoded or malformed — keep as-is
  }

  if (/failed to fetch user profile/i.test(decoded)) {
    return 'Couldn’t finish connecting — the music service rejected the account lookup after you authorized. For Spotify testing: confirm the app owner has Premium and the exact Spotify account email (from spotify.com/account/overview) is on the developer allowlist.';
  }

  return decoded || fallback;
}
