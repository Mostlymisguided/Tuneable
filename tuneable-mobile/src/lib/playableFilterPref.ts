import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  chart: 'tuneable.playableOnly.chart',
  library: 'tuneable.playableOnly.library',
} as const;

export type PlayableOnlyScope = keyof typeof KEYS;

export const PLAYABLE_ONLY_DEFAULTS: Record<PlayableOnlyScope, boolean> = {
  chart: true,
  library: false,
};

function parseStored(raw: string | null, fallback: boolean): boolean {
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return fallback;
}

export function readPlayableOnlyPrefSync(scope: PlayableOnlyScope): boolean {
  const fallback = PLAYABLE_ONLY_DEFAULTS[scope];
  if (Platform.OS !== 'web') return fallback;
  try {
    return parseStored(localStorage.getItem(KEYS[scope]), fallback);
  } catch {
    return fallback;
  }
}

export async function readPlayableOnlyPref(
  scope: PlayableOnlyScope
): Promise<boolean> {
  const fallback = PLAYABLE_ONLY_DEFAULTS[scope];
  try {
    const raw =
      Platform.OS === 'web'
        ? localStorage.getItem(KEYS[scope])
        : await SecureStore.getItemAsync(KEYS[scope]);
    return parseStored(raw, fallback);
  } catch {
    return fallback;
  }
}

export async function writePlayableOnlyPref(
  scope: PlayableOnlyScope,
  value: boolean
): Promise<void> {
  const stored = value ? '1' : '0';
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(KEYS[scope], stored);
      return;
    }
    await SecureStore.setItemAsync(KEYS[scope], stored);
  } catch {
    // Ignore storage failures.
  }
}

export function buildChartRankMap<T>(
  items: T[],
  getId: (item: T) => string
): Map<string, number> {
  const ranks = new Map<string, number>();
  items.forEach((item, index) => {
    const id = getId(item);
    if (id) ranks.set(id, index + 1);
  });
  return ranks;
}

export function catalogHiddenLabel(count: number): string {
  if (count <= 0) return '';
  return `${count} catalog ${count === 1 ? 'tune' : 'tunes'} hidden`;
}
