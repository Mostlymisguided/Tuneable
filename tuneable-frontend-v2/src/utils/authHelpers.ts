export const DEFAULT_POST_AUTH_PATH = '/party/global?period=all-time';

/** Only allow same-origin relative paths to prevent open redirects. */
export function sanitizeReturnUrl(url: string | null, fallback = DEFAULT_POST_AUTH_PATH): string {
  if (!url) return fallback;
  if (!url.startsWith('/') || url.startsWith('//')) return fallback;
  return url;
}

export function getReturnUrlFromSearch(search: string, fallback = DEFAULT_POST_AUTH_PATH): string {
  return sanitizeReturnUrl(new URLSearchParams(search).get('returnUrl'), fallback);
}

export function buildLoginUrl(returnPath?: string): string {
  if (!returnPath) return '/login';
  return `/login?returnUrl=${encodeURIComponent(returnPath)}`;
}

export function buildRegisterUrl(options?: { returnPath?: string; inviteCode?: string }): string {
  const params = new URLSearchParams();
  if (options?.returnPath) params.set('returnUrl', options.returnPath);
  if (options?.inviteCode) params.set('invite', options.inviteCode);
  const qs = params.toString();
  return qs ? `/register?${qs}` : '/register';
}

export function getCurrentReturnPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}
