import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { userAPI } from '@/src/api/user';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type PushPermissionResult = 'granted' | 'denied' | 'unavailable';

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Tuneable',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function projectId(): string | null {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

export async function getNotificationPermissionStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

export async function requestAndRegisterPush(): Promise<PushPermissionResult> {
  if (Platform.OS === 'web') return 'unavailable';

  await ensureAndroidChannel();
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== 'granted') return 'denied';

  const easProjectId = projectId();
  if (!easProjectId) return 'unavailable';

  try {
    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })
    ).data;
    await userAPI.registerPushDevice({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    return 'granted';
  } catch (error) {
    console.warn('Could not register push token', error);
    return 'unavailable';
  }
}

/** Re-register if the OS already granted permission (no prompt). */
export async function syncPushTokenIfGranted(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await requestAndRegisterPush();
  } catch {
    // Push is optional
  }
}

export function hrefFromNotificationUrl(url?: string | null): Href | null {
  if (!url || typeof url !== 'string') return null;
  const path = url.startsWith('http')
    ? (() => {
        try {
          return new URL(url).pathname;
        } catch {
          return url;
        }
      })()
    : url;

  const tune = path.match(/^\/tune\/([^/?#]+)/);
  if (tune) {
    return { pathname: '/tune/[id]', params: { id: tune[1] } };
  }
  const podcast = path.match(/^\/podcast\/([^/?#]+)/);
  if (podcast) {
    return { pathname: '/podcast/[id]', params: { id: podcast[1] } };
  }
  const user = path.match(/^\/user\/([^/?#]+)/);
  if (user) {
    return { pathname: '/user/[id]', params: { id: user[1] } };
  }
  return null;
}

export function openNotificationUrl(url?: string | null) {
  const href = hrefFromNotificationUrl(url);
  if (href) {
    router.push(href);
  }
}

export function subscribeNotificationResponses() {
  const received = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const url = response.notification.request.content.data?.url;
      openNotificationUrl(typeof url === 'string' ? url : null);
    }
  );
  return () => received.remove();
}
