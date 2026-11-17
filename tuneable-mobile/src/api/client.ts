import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { clearSession, loadRefreshToken, saveTokenPair } from '@/src/auth/storage';

/**
 * API origin without trailing slash or `/api`.
 * Set EXPO_PUBLIC_API_URL in `.env` (e.g. http://localhost:8000 or https://tuneable.stream).
 * On a physical device, use your Mac's LAN IP, not localhost.
 */
function resolveApiOrigin(): string {
  const raw =
    process.env.EXPO_PUBLIC_API_URL ||
    Constants.expoConfig?.extra?.apiUrl ||
    'http://localhost:8000';
  return String(raw).replace(/\/api\/?$/, '').replace(/\/$/, '');
}

export const API_ORIGIN = resolveApiOrigin();

export const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

let authTokenGetter: (() => string | null) | null = null;

export function setAuthTokenGetter(getter: (() => string | null) | null) {
  authTokenGetter = getter;
}

export function getAuthToken(): string | null {
  return authTokenGetter?.() ?? null;
}

api.interceptors.request.use((config) => {
  const token = authTokenGetter?.() ?? null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Let the runtime set multipart boundary — default JSON Content-Type breaks uploads.
  if (
    typeof FormData !== 'undefined' &&
    config.data instanceof FormData
  ) {
    if (typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type');
    } else {
      delete (config.headers as Record<string, unknown>)['Content-Type'];
    }
  }
  return config;
});

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
let onTokenRefreshed: ((token: string) => void) | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

export function setTokenRefreshedHandler(handler: ((token: string) => void) | null) {
  onTokenRefreshed = handler;
}

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function isSessionEndpoint(url: string): boolean {
  return (
    url.includes('/users/login') ||
    url.includes('/users/register') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/exchange') ||
    url.includes('/auth/logout')
  );
}

let refreshPromise: Promise<string | null> | null = null;

/** Tell the server this device is done, then the caller clears local storage. */
export async function revokeStoredSession(
  accessToken: string | null,
  refreshToken: string | null
): Promise<void> {
  if (!refreshToken && !accessToken) return;
  await axios.post(
    `${API_ORIGIN}/api/auth/logout`,
    { refreshToken },
    {
      timeout: 5000,
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    }
  );
}

/** Renew the access token from the device refresh token. Null means the session is over. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await loadRefreshToken();
      if (!refreshToken) return null;
      try {
        const response = await axios.post<{ token?: string; refreshToken?: string }>(
          `${API_ORIGIN}/api/auth/refresh`,
          { refreshToken },
          { timeout: 30000 }
        );
        const token = response.data?.token;
        const nextRefresh = response.data?.refreshToken;
        if (!token || !nextRefresh) return null;
        await saveTokenPair(token, nextRefresh);
        onTokenRefreshed?.(token);
        return token;
      } catch (error) {
        const status = (error as AxiosError)?.response?.status;
        if (status === 401 || status === 403) {
          await clearSession().catch(() => undefined);
          return null;
        }
        throw error;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    const url = config?.url ?? '';
    if (error.response?.status !== 401 || !config || config._retry || isSessionEndpoint(url)) {
      return Promise.reject(error);
    }
    const hadToken = Boolean(authTokenGetter?.());
    if (!hadToken) return Promise.reject(error);
    try {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        onUnauthorized?.();
        return Promise.reject(error);
      }
      config._retry = true;
      config.headers.Authorization = `Bearer ${newToken}`;
      return api(config);
    } catch {
      return Promise.reject(error);
    }
  }
);
