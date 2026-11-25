import { artistCatalogAPI } from '../lib/api';

export function normalizeArtistCatalogName(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

type CatalogIndex = Map<string, string>;

let current: CatalogIndex = new Map();
let hasLoaded = false;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeArtistCatalogIndex(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getArtistCatalogIndex(): CatalogIndex {
  return current;
}

export function catalogPathForName(name: string, index: CatalogIndex = current): string | null {
  const slug = index.get(normalizeArtistCatalogName(name));
  return slug ? `/artist/${encodeURIComponent(slug)}` : null;
}

export function refreshArtistCatalogIndex(force = false): Promise<void> {
  if (!force && hasLoaded && Date.now() - loadedAt < 60_000) return Promise.resolve();
  if (inflight) return inflight;

  inflight = artistCatalogAPI.getIndex()
    .then((data) => {
      const next: CatalogIndex = new Map();
      (data.artists || []).forEach((artist) => {
        if (!artist?.slug) return;
        [artist.name, ...(artist.aliases || [])].forEach((label) => {
          const key = normalizeArtistCatalogName(label || '');
          if (key) next.set(key, artist.slug);
        });
      });
      current = next;
      hasLoaded = true;
      loadedAt = Date.now();
      emit();
    })
    .catch(() => {
      hasLoaded = true;
      loadedAt = Date.now();
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
