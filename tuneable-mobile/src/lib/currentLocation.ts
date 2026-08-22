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
    if (!permission.granted) {
      setStatus('denied', 'Location permission denied');
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
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
 * Silently refresh if the OS already granted permission (no prompt).
 */
export async function maybeRefreshCurrentLocationIfGranted(): Promise<void> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.granted) {
      await refreshCurrentLocation({ force: false });
    } else if (permission.status === Location.PermissionStatus.DENIED) {
      setStatus('denied', 'Location permission denied');
    }
  } catch {
    // Leave idle until user opts in
  }
}
