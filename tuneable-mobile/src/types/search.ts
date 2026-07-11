export interface SearchResultItem {
  id?: string;
  _id?: string;
  uuid?: string;
  title?: string;
  artist?: string | Array<string | { name?: string }>;
  coverArt?: string;
  duration?: number;
  sources?: Record<string, string>;
  isLocal?: boolean;
  tags?: string[];
  category?: string;
}

export interface SearchResponse {
  source?: 'local' | 'external' | string;
  videos?: SearchResultItem[];
  nextPageToken?: string;
  hasMoreExternal?: boolean;
}

export function searchResultId(item: SearchResultItem): string {
  return item.id || item._id || item.uuid || item.sources?.youtube || '';
}

export function searchResultUrl(item: SearchResultItem): string | null {
  const s = item.sources;
  if (!s) return null;
  return s.youtube || s.upload || Object.values(s).find(Boolean) || null;
}

export function searchResultPlatform(item: SearchResultItem): 'youtube' | 'upload' {
  if (item.sources?.youtube) return 'youtube';
  if (item.sources?.upload) return 'upload';
  return 'youtube';
}

export function formatSearchArtist(
  artist: SearchResultItem['artist']
): string {
  if (!artist) return 'Unknown Artist';
  if (typeof artist === 'string') return artist || 'Unknown Artist';
  if (Array.isArray(artist)) {
    const names = artist
      .map((a) => (typeof a === 'string' ? a : a?.name))
      .filter(Boolean) as string[];
    return names.length ? names.join(', ') : 'Unknown Artist';
  }
  return 'Unknown Artist';
}
