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

export function readPlayableOnlyPref(scope: PlayableOnlyScope): boolean {
  const fallback = PLAYABLE_ONLY_DEFAULTS[scope];
  try {
    return parseStored(localStorage.getItem(KEYS[scope]), fallback);
  } catch {
    return fallback;
  }
}

export function writePlayableOnlyPref(scope: PlayableOnlyScope, value: boolean): void {
  try {
    localStorage.setItem(KEYS[scope], value ? '1' : '0');
  } catch {
    // Ignore quota / private-mode failures.
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
