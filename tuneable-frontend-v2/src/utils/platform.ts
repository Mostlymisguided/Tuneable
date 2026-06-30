import { Capacitor } from '@capacitor/core';

/** Custom URL scheme — must match appId `stream.tuneable.app` and native project config. */
export const NATIVE_AUTH_SCHEME = 'stream.tuneable.app';

const DEFAULT_DEV_API = 'http://localhost:8000/api';
const DEFAULT_PROD_API = 'https://tuneable.stream/api';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** API base including `/api` suffix, e.g. `https://tuneable.stream/api` */
export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
  if (env) return env.endsWith('/api') ? env : `${env}/api`;
  if (import.meta.env.PROD) return DEFAULT_PROD_API;
  return DEFAULT_DEV_API;
}

/** Origin without `/api`, for sockets and stripe key fetch */
export function getApiOrigin(): string {
  return getApiBaseUrl().replace(/\/api\/?$/, '');
}

/** OAuth return URL passed to backend `redirect` query param */
export function getOAuthCallbackRedirect(): string {
  if (isNativeApp()) {
    return `${NATIVE_AUTH_SCHEME}://auth/callback?oauth_success=true`;
  }
  return `${window.location.origin}/auth/callback?oauth_success=true`;
}

export function buildOAuthStartUrl(provider: 'facebook' | 'google' | 'instagram' | 'soundcloud', options?: {
  inviteCode?: string;
  linkAccount?: boolean;
  token?: string;
  customRedirect?: string;
}): string {
  const params = new URLSearchParams();
  params.set('redirect', options?.customRedirect || getOAuthCallbackRedirect());
  if (options?.inviteCode) params.set('invite', options.inviteCode);
  if (options?.linkAccount) params.set('link_account', 'true');
  if (options?.token) params.set('token', options.token);

  const path = provider;
  return `${getApiBaseUrl()}/auth/${path}?${params.toString()}`;
}
