import * as Location from 'expo-location';
import { locationAPI } from '@/src/api/locations';
import type { ResolvedLocation } from '@/src/types/user';

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export type CurrentLocationStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'error';

interface CachedCurrentLocation {
  location: ResolvedLocation;
  resolvedAt: number;
}

type Listener = () => void;

let memoryCache: CachedCurrentLocation | null = null;
let status: CurrentLocationStatus = 'idle';
let lastError: string | null = null;
let canAskAgain = true;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

function setStatus(next: CurrentLocationStatus, error: string | null = null) {
  status = next;
  lastError = error;
  notify();
}

function setCachedLocation(location: ResolvedLocation) {
  memoryCache = {
    location,
    resolvedAt: Date.now(),
  };
  setStatus('ready');
}

export function subscribeCurrentLocation(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrentLocationStatus(): CurrentLocationStatus {
  return status;
}

export function getCurrentLocationError(): string | null {
  return lastError;
}

export function canRequestLocationPermission(): boolean {
  return canAskAgain;
}

export async function getForegroundLocationPermission() {
  return Location.getForegroundPermissionsAsync();
}

export function getTipCurrentLocation(): ResolvedLocation | null {
  if (memoryCache && Date.now() - memoryCache.resolvedAt <= TTL_MS) {
    return memoryCache.location;
  }
  memoryCache = null;
  return null;
}

const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;
const LAST_KNOWN_ACCURACY_M = 5000;
const POSITION_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Only city-level precision is needed. Android's getCurrentPositionAsync can
 * wait indefinitely for a fresh fix, so prefer a recent cached fix and cap the wait.
 */
async function getDevicePosition(): Promise<Location.LocationObject | null> {
  const recent = await Location.getLastKnownPositionAsync({
    maxAge: LAST_KNOWN_MAX_AGE_MS,
    requiredAccuracy: LAST_KNOWN_ACCURACY_M,
  }).catch(() => null);
  if (recent) return recent;

  const fresh = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
    POSITION_TIMEOUT_MS
  );
  if (fresh) return fresh;

  return Location.getLastKnownPositionAsync().catch(() => null);
}

/**
 * Request device location, reverse-geocode via Mapbox, and cache for tip stamps.
 */
export async function refreshCurrentLocation(options?: {
  force?: boolean;
}): Promise<ResolvedLocation | null> {
  if (!options?.force) {
    const existing = getTipCurrentLocation();
    if (existing) {
      setStatus('ready');
      return existing;
    }
  }

  setStatus('loading');

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    canAskAgain = permission.canAskAgain !== false;
    if (!permission.granted) {
      setStatus('denied', 'Location permission denied');
      return null;
    }

    if (!(await Location.hasServicesEnabledAsync())) {
      setStatus('unavailable', 'Location services are disabled');
      return null;
    }

    const position = await getDevicePosition();
    if (!position) {
      setStatus('unavailable', 'Location timeout');
      return null;
    }
    const { longitude, latitude } = position.coords;
    const { location } = await locationAPI.reverse(longitude, latitude);
    if (!location?.placeId && !location?.city && !location?.country) {
      setStatus('error', 'Could not resolve your current place');
      return null;
    }
    setCachedLocation(location);
    return location;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to detect current location';
    if (/denied|permission/i.test(message)) {
      setStatus('denied', 'Location permission denied');
      return null;
    }
    if (/unavailable|disabled|timeout/i.test(message)) {
      setStatus('unavailable', message);
      return null;
    }
    setStatus('error', message);
    return null;
  }
}

/**
 * Re-read OS permission without prompting.
 * If access was turned back on, refresh quietly.
 */
export async function recheckLocationPermission(): Promise<void> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    canAskAgain = permission.canAskAgain !== false;
    if (permission.granted) {
      await refreshCurrentLocation({ force: false });
      return;
    }
    if (
      permission.status === Location.PermissionStatus.DENIED &&
      permission.canAskAgain === false
    ) {
      setStatus('denied', 'Location permission denied');
      return;
    }
    if (status === 'denied') {
      setStatus('idle');
    }
  } catch {
    // Leave idle until user opts in
  }
}

/**
 * Silently refresh if the OS already granted permission (no prompt).
 */
export async function maybeRefreshCurrentLocationIfGranted(): Promise<void> {
  await recheckLocationPermission();
}
