export type EnrichmentGroup = 'review' | 'in_progress' | 'done' | 'ignored';

export interface EnrichmentArtistRef {
  name?: string;
  relationToNext?: string | null;
}

export interface EnrichmentCandidate {
  musicbrainzId?: string;
  title?: string;
  artist?: string;
  artists?: EnrichmentArtistRef[];
  featuring?: Array<{ name?: string }>;
  album?: string | null;
  duration?: number;
  releaseDate?: string | null;
  releaseDatePrecision?: string | null;
  releaseYear?: number | null;
  isrc?: string | null;
  tags?: string[];
  genres?: string[];
  score?: number;
  matchType?: string;
  detailsFetched?: boolean;
}

export interface EnrichmentItem {
  _id: string;
  mediaId: string;
  mediaUuid?: string;
  importSource?: string;
  importSourceUrl?: string | null;
  status: string;
  confidence?: string | null;
  enrichTagsOnly?: boolean;
  original?: {
    title?: string;
    artist?: string;
    album?: string | null;
    duration?: number;
    releaseYear?: number | null;
    isrc?: string | null;
    tags?: string[];
    genres?: string[];
  };
  suggestion?: (EnrichmentCandidate & { musicbrainzId?: string }) | null;
  candidates?: EnrichmentCandidate[];
  currentTags?: string[];
  currentGenres?: string[];
  currentReleaseYear?: number | null;
  currentReleaseDate?: string | null;
  currentReleaseDatePrecision?: string | null;
  currentIsrc?: string | null;
  newTags?: string[];
  error?: string | null;
  importedBy?: { username?: string; uuid?: string } | null;
  createdAt?: string;
  processedAt?: string;
}

export interface EnrichmentCoverage {
  total: number;
  linked: number;
  tagged: number;
  withRelease: number;
  withLocation: number;
  mapboxEnabled?: boolean;
}

export const REVIEWABLE_STATUSES = ['needs_review', 'skipped', 'failed'];

export function formatDuration(sec?: number) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Prefer structured MB artists/featuring; fall back to legacy artist string. */
export function formatSuggestionArtist(
  suggestion?: {
    artist?: string;
    artists?: EnrichmentArtistRef[];
    featuring?: Array<{ name?: string }>;
  } | null
): string {
  if (!suggestion) return '—';
  const artists = Array.isArray(suggestion.artists) ? suggestion.artists : [];
  const featuring = Array.isArray(suggestion.featuring) ? suggestion.featuring : [];

  if (artists.length > 0) {
    let display = '';
    artists.forEach((artist, index) => {
      const name = artist?.name?.trim();
      if (!name) return;
      display += name;
      if (index < artists.length - 1) {
        const relation = artist.relationToNext || '&';
        display += relation === ',' ? ', ' : ` ${String(relation).trim()} `;
      }
    });
    const featNames = featuring.map((f) => f?.name?.trim()).filter(Boolean);
    if (featNames.length > 0) {
      display += ` ft. ${featNames.join(', ')}`;
    }
    if (display.trim()) return display.trim();
  }

  return suggestion.artist?.trim() || '—';
}

/** Render a release date at its stored precision (2017, 2017-03, 2017-03-04). */
export function formatRelease(
  date?: string | null,
  precision?: string | null,
  year?: number | null
): string | null {
  if (date) {
    const iso = String(date).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      if (precision === 'year') return iso.slice(0, 4);
      if (precision === 'month') return iso.slice(0, 7);
      return iso;
    }
    if (/^\d{4}(-\d{2})?$/.test(String(date))) return String(date);
  }
  return year ? String(year) : null;
}
