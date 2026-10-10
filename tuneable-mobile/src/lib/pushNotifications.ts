import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { router, type Href } from 'expo-router';
import { api } from '@/src/api/client';
import { notificationAPI } from '@/src/api/notifications';
import { userAPI } from '@/src/api/user';
import { useNotificationStore } from '@/src/stores/notificationStore';

/** Must match the Expo push `channelId` and app.json `defaultChannel`. */
export const ANDROID_PUSH_CHANNEL_ID = 'alerts';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });
}

export type PushPermissionResult = 'granted' | 'denied' | 'unavailable';

export async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_PUSH_CHANNEL_ID, {
    name: 'Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Tips, replies, and outtips',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#6D28D9',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
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

export async function getPushPermissionSnapshot(): Promise<{
  status: Notifications.PermissionStatus;
  canAskAgain: boolean;
} | null> {
  if (Platform.OS === 'web') return null;
  const existing = await Notifications.getPermissionsAsync();
  return { status: existing.status, canAskAgain: existing.canAskAgain };
}

export async function requestAndRegisterPush(): Promise<PushPermissionResult> {
  if (Platform.OS === 'web') return 'unavailable';

  await ensureAndroidNotificationChannel();
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

/** Turn push off for this device and stop delivery for the account. */
export async function disablePushOnThisDevice(): Promise<void> {
  if (Platform.OS === 'web') return;
  let token: string | undefined;
  try {
    const existing = await Notifications.getPermissionsAsync();
    const easProjectId = projectId();
    if (existing.status === 'granted' && easProjectId) {
      token = (
        await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })
      ).data;
    }
  } catch {
    // Preference still turns delivery off if the token cannot be read
  }
  if (token) {
    await userAPI.unregisterPushDevice(token);
  }
  await userAPI.updateNotificationPreferences({ push: false });
}

/** Stop this device receiving the signed-out account's pushes. Never prompts. */
export async function unregisterPushOnSignOut(authToken: string | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // Badge permission can be missing
  }
  if (!authToken) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    const easProjectId = projectId();
    if (status !== 'granted' || !easProjectId) return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })).data;
    await api.delete('/users/me/push-devices', {
      data: { token },
      headers: { Authorization: `Bearer ${authToken}` },
    });
  } catch {
    // Signing in elsewhere reassigns the token server-side anyway
  }
}

/** Re-register if the OS already granted permission (no prompt). */
export async function syncPushTokenIfGranted(pushEnabled = true): Promise<void> {
  if (Platform.OS === 'web' || !pushEnabled) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    await requestAndRegisterPush();
  } catch {
    // Push is optional
  }
}

const SITE_ORIGIN = 'https://tuneable.stream';

function notificationTarget(url?: string | null): URL | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return new URL(trimmed, SITE_ORIGIN);
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed);
  } catch {
    return null;
  }
  return null;
}

function isTuneableHost(hostname: string): boolean {
  return (
    hostname === 'tuneable.stream' ||
    hostname === 'www.tuneable.stream' ||
    hostname.endsWith('.tuneable.stream')
  );
}

/** In-app route for notification links the mobile app can open itself. */
export function hrefFromNotificationUrl(url?: string | null): Href | null {
  const target = notificationTarget(url);
  if (!target) return null;
  if (!isTuneableHost(target.hostname) && target.origin !== SITE_ORIGIN) return null;
  const path = target.pathname;

  const tune = path.match(/^\/tune\/([^/]+)$/);
  if (tune) return { pathname: '/tune/[id]', params: { id: decodeURIComponent(tune[1]) } };

  const episode = path.match(/^\/podcasts\/([^/]+)$/);
  if (episode && episode[1] !== 'search') {
    return { pathname: '/podcast/[id]', params: { id: decodeURIComponent(episode[1]) } };
  }

  const series = path.match(/^\/podcast\/([^/]+)$/);
  if (series) return { pathname: '/show/[id]', params: { id: decodeURIComponent(series[1]) } };

  const user = path.match(/^\/user\/([^/]+)$/);
  if (user) return { pathname: '/user/[id]', params: { id: decodeURIComponent(user[1]) } };

  const book = path.match(/^\/book\/([^/]+)$/);
  if (book) return { pathname: '/book/[id]', params: { id: decodeURIComponent(book[1]) } };

  const show = path.match(/^\/show\/([^/]+)$/);
  if (show) return { pathname: '/show/[id]', params: { id: decodeURIComponent(show[1]) } };

  const place = path.match(/^\/place\/([^/]+)$/);
  if (place) {
    return { pathname: '/place/[placeId]', params: { placeId: decodeURIComponent(place[1]) } };
  }

  const tag = path.match(/^\/tag\/([^/]+)$/);
  if (tag) return { pathname: '/tag/[slug]', params: { slug: decodeURIComponent(tag[1]) } };

  if (path === '/wallet') return '/wallet';
  if (path === '/notifications') return '/notifications';
  if (path === '/profile') return '/(tabs)/profile';
  if (path === '/charts') return '/(tabs)/charts';
  if (path === '/places') return '/(tabs)/places';
  if (path === '/podcasts') return '/(tabs)/podcasts';
  if (path === '/' || path === '/explore') return '/(tabs)/music';

  return null;
}

/** Website URL for notification links that live on the platform, such as a collective. */
export function webUrlForNotification(url?: string | null): string | null {
  const target = notificationTarget(url);
  if (!target || hrefFromNotificationUrl(url)) return null;
  if (!isTuneableHost(target.hostname)) return target.href;
  return target.href;
}

export async function openNotificationUrl(url?: string | null): Promise<boolean> {
  const href = hrefFromNotificationUrl(url);
  if (href) {
    router.push(href);
    return true;
  }
  const web = webUrlForNotification(url);
  if (!web) return false;
  try {
    await WebBrowser.openBrowserAsync(web);
    return true;
  } catch {
    try {
      await Linking.openURL(web);
      return true;
    } catch {
      return false;
    }
  }
}

const handledResponseIds = new Set<string>();
let pendingResponse: Notifications.NotificationResponse | null = null;
let routingReady = false;
let didReadInitialResponse = false;

function responseId(response: Notifications.NotificationResponse): string {
  return response.notification.request.identifier || '';
}

function stringData(
  data: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = data?.[key];
  return typeof value === 'string' && value ? value : null;
}

function queueNotificationResponse(response: Notifications.NotificationResponse) {
  const id = responseId(response);
  if (id && handledResponseIds.has(id)) return;
  pendingResponse = response;
  if (routingReady) void flushNotificationResponse();
}

async function flushNotificationResponse() {
  if (!routingReady || !pendingResponse) return;
  const response = pendingResponse;
  const id = responseId(response);
  if (id && handledResponseIds.has(id)) {
    pendingResponse = null;
    return;
  }
  if (id) handledResponseIds.add(id);
  pendingResponse = null;

  const data = response.notification.request.content.data as
    | Record<string, unknown>
    | undefined;
  const url = stringData(data, 'url');
  const notificationId = stringData(data, 'notificationId');
  if (notificationId) {
    try {
      await notificationAPI.markRead(notificationId);
    } catch {
      // Still open the target if marking read fails.
    }
    void useNotificationStore.getState().refreshUnreadCount();
  }
  if (!routingReady) return;
  openNotificationUrl(url);
}

/** Allow deep links only after the session is restored. */
export function setNotificationRoutingReady(ready: boolean) {
  routingReady = ready;
  if (ready) void flushNotificationResponse();
}

export function subscribeNotificationResponses() {
  if (Platform.OS === 'web') return () => {};
  const received = Notifications.addNotificationResponseReceivedListener(
    queueNotificationResponse
  );
  return () => received.remove();
}

export function subscribeForegroundNotifications(onReceived: () => void) {
  if (Platform.OS === 'web') return () => {};
  const received = Notifications.addNotificationReceivedListener(() => {
    onReceived();
  });
  return () => received.remove();
}

/** Open the notification that cold-started the app, once per launch. */
export function openInitialNotificationResponse() {
  if (Platform.OS === 'web' || didReadInitialResponse) return;
  didReadInitialResponse = true;
  const response = Notifications.getLastNotificationResponse();
  if (!response) return;
  Notifications.clearLastNotificationResponse();
  queueNotificationResponse(response);
}
