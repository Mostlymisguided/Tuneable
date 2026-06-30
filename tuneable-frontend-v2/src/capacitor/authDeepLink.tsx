import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { NATIVE_AUTH_SCHEME } from '../utils/platform';

function routeFromDeepLink(url: string): string | null {
  if (!url.startsWith(`${NATIVE_AUTH_SCHEME}://`)) return null;

  try {
    const parsed = new URL(url);
    const routePath = parsed.host
      ? `/${parsed.host}${parsed.pathname || ''}`
      : parsed.pathname || '/auth/callback';
    return `${routePath}${parsed.search}`;
  } catch {
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
    return `/auth/callback${query}`;
  }
}

async function handleDeepLink(url: string, navigate: (path: string) => void) {
  const route = routeFromDeepLink(url);
  if (!route) return;
  await Browser.close().catch(() => {});
  navigate(route);
}

/** Routes native OAuth callbacks (`stream.tuneable.app://auth/callback?...`) into React Router. */
export function AuthDeepLinkListener() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener: { remove: () => Promise<void> } | undefined;

    const setup = async () => {
      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        await handleDeepLink(launch.url, navigate);
      }

      listener = await App.addListener('appUrlOpen', (event) => {
        handleDeepLink(event.url, navigate);
      });
    };

    setup().catch((err) => console.warn('Auth deep link setup failed:', err));

    return () => {
      listener?.remove();
    };
  }, [navigate]);

  return null;
}
