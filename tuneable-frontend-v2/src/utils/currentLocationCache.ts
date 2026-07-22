import type { ResolvedLocation } from './locationHelpers';

const CACHE_KEY = 'tuneable_current_location_v1';
const DISMISS_KEY = 'tuneable_current_location_prompt_dismissed';
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

function readSessionCache(): CachedCurrentLocation | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCurrentLocation;
    if (!parsed?.location || !parsed.resolvedAt) return null;
    if (Date.now() - parsed.resolvedAt > TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCache(entry: CachedCurrentLocation | null) {
  try {
    if (!entry) {
      sessionStorage.removeItem(CACHE_KEY);
      return;
    }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore quota / private mode
  }
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

export function getTipCurrentLocation(): ResolvedLocation | null {
  if (memoryCache && Date.now() - memoryCache.resolvedAt <= TTL_MS) {
    return memoryCache.location;
  }
  const fromSession = readSessionCache();
  if (fromSession) {
    memoryCache = fromSession;
    return fromSession.location;
  }
  return null;
}

export function isCurrentLocationPromptDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissCurrentLocationPrompt() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // ignore
  }
  notify();
}

export function clearCurrentLocationPromptDismiss() {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    // ignore
  }
  notify();
}

function setStatus(next: CurrentLocationStatus, error: string | null = null) {
  status = next;
  lastError = error;
  notify();
}

function setCachedLocation(location: ResolvedLocation) {
  const entry: CachedCurrentLocation = {
    location,
    resolvedAt: Date.now(),
  };
  memoryCache = entry;
  writeSessionCache(entry);
  setStatus('ready');
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not available in this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 5 * 60 * 1000,
    });
  });
}

/**
 * Request browser location, reverse-geocode via Mapbox, and cache for tip stamps.
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
    const position = await getPosition();
    const { longitude, latitude } = position.coords;
    // Dynamic import avoids circular dependency with api.ts tip helpers
    const { locationAPI } = await import('../lib/api');
    const { location } = await locationAPI.reverse(longitude, latitude);
    if (!location?.placeId && !location?.city && !location?.country) {
      setStatus('error', 'Could not resolve your current place');
      return null;
    }
    setCachedLocation(location as ResolvedLocation);
    clearCurrentLocationPromptDismiss();
    return location as ResolvedLocation;
  } catch (error: unknown) {
    const geoError = error as GeolocationPositionError & { message?: string };
    if (geoError?.code === 1) {
      setStatus('denied', 'Location permission denied');
      return null;
    }
    if (geoError?.code === 2 || geoError?.code === 3 || !navigator.geolocation) {
      setStatus('unavailable', geoError?.message || 'Location unavailable');
      return null;
    }
    setStatus('error', geoError?.message || 'Failed to detect current location');
    return null;
  }
}

/**
 * Silently refresh if the browser already granted permission (no prompt).
 */
export async function maybeRefreshCurrentLocationIfGranted(): Promise<void> {
  if (!navigator.geolocation || !navigator.permissions?.query) {
    return;
  }
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    if (result.state === 'granted') {
      await refreshCurrentLocation({ force: false });
    } else if (result.state === 'denied') {
      setStatus('denied', 'Location permission denied');
    }
  } catch {
    // Permissions API unsupported — leave idle until user opts in
  }
}

// Hydrate memory from session on module load
memoryCache = readSessionCache();
if (memoryCache) {
  status = 'ready';
}
