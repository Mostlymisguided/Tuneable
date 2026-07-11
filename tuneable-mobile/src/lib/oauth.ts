import * as Linking from 'expo-linking';
import { API_ORIGIN } from '@/src/api/client';

export type OAuthProvider = 'google' | 'facebook' | 'soundcloud';

/** Deep link returned after backend OAuth completes. */
export function getOAuthCallbackRedirect(): string {
  return Linking.createURL('auth/callback', {
    queryParams: { oauth_success: 'true' },
  });
}

export function buildOAuthStartUrl(
  provider: OAuthProvider,
  options?: { inviteCode?: string }
): string {
  const params = new URLSearchParams();
  params.set('redirect', getOAuthCallbackRedirect());
  if (options?.inviteCode) params.set('invite', options.inviteCode);
  return `${API_ORIGIN}/api/auth/${provider}?${params.toString()}`;
}

export function extractTokenFromUrl(url: string): string | null {
  const parsed = Linking.parse(url);
  const token = parsed.queryParams?.token;
  if (typeof token === 'string' && token.length > 0) return token;
  if (Array.isArray(token) && token[0]) return String(token[0]);
  return null;
}

export function extractOAuthError(url: string): string | null {
  const parsed = Linking.parse(url);
  const error = parsed.queryParams?.error;
  if (typeof error === 'string') return error;
  if (Array.isArray(error) && error[0]) return String(error[0]);
  return null;
}
