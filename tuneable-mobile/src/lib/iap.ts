import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { Product, Purchase } from 'expo-iap';

export type { Product, Purchase };

export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export function canUseNativeIap(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/** Native store billing is the mobile path; unavailable inside Expo Go. */
export function shouldUseStoreIap(): boolean {
  return canUseNativeIap();
}

type ExpoIapModule = typeof import('expo-iap');

let cached: ExpoIapModule | null | undefined;

/**
 * Lazily load expo-iap so Expo Go (no native module) does not crash on import.
 */
export function getExpoIap(): ExpoIapModule | null {
  if (!canUseNativeIap() || isExpoGo()) return null;
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-iap') as ExpoIapModule;
    return cached;
  } catch (err) {
    console.warn('expo-iap unavailable:', err);
    cached = null;
    return null;
  }
}
