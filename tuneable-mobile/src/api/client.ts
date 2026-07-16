import axios from 'axios';
import Constants from 'expo-constants';

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

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url: string = error.config?.url ?? '';
      const isAuthEndpoint =
        url.includes('/users/login') || url.includes('/users/register');
      const hadToken = Boolean(authTokenGetter?.());
      if (!isAuthEndpoint && hadToken) {
        onUnauthorized?.();
      }
    }
    return Promise.reject(error);
  }
);
