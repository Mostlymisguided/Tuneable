import * as Linking from 'expo-linking';
import { authAPI } from '@/src/api/auth';
import { API_ORIGIN } from '@/src/api/client';

export type OAuthProvider = 'google' | 'facebook' | 'spotify';

/** Deep link returned after backend OAuth completes. */
export function getOAuthCallbackRedirect(): string {
  return Linking.createURL('auth/callback', {
    queryParams: { oauth_success: 'true' },
  });
}

export function buildOAuthStartUrl(
  provider: OAuthProvider,
  options?: {
    inviteCode?: string;
    linkAccount?: boolean;
    token?: string;
    customRedirect?: string;
  }
): string {
  const params = new URLSearchParams();
  params.set('redirect', options?.customRedirect || getOAuthCallbackRedirect());
  if (options?.inviteCode) params.set('invite', options.inviteCode);
  if (options?.linkAccount) params.set('link_account', 'true');
  if (options?.token) params.set('token', options.token);
  return `${API_ORIGIN}/api/auth/${provider}?${params.toString()}`;
}

function queryValue(url: string, key: string): string | null {
  const parsed = Linking.parse(url);
  const value = parsed.queryParams?.[key];
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(value) && value[0]) return String(value[0]);
  return null;
}

export function extractTokenFromUrl(url: string): string | null {
  return queryValue(url, 'token');
}

export function extractCodeFromUrl(url: string): string | null {
  return queryValue(url, 'code');
}

/** Access token from the redirect, plus the device refresh token when the code is still valid. */
export async function sessionFromOAuthRedirect(
  url: string
): Promise<{ token: string; refreshToken?: string }> {
  const token = extractTokenFromUrl(url);
  const code = extractCodeFromUrl(url);
  if (code) {
    try {
      const exchanged = await authAPI.exchangeCode(code);
      return {
        token: exchanged.token || token || '',
        refreshToken: exchanged.refreshToken,
      };
    } catch {
      if (token) return { token };
      throw new Error('Sign-in link expired. Please try again.');
    }
  }
  if (!token) throw new Error('Missing auth token.');
  return { token };
}

export function extractOAuthError(url: string): string | null {
  const parsed = Linking.parse(url);
  const error = parsed.queryParams?.error;
  if (typeof error === 'string') return error;
  if (Array.isArray(error) && error[0]) return String(error[0]);
  return null;
}
