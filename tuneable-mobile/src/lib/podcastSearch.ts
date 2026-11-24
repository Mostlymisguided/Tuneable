import type {
  CatalogShow,
  CatalogShowSource,
  PodcastCatalogSource,
  PodcastEpisode,
} from '@/src/types/podcast';
import { DEFAULT_PODCAST_COVER } from '@/src/types/podcast';
import { seriesTitle } from '@/src/lib/podcast';

export function podcastSearchDedupeKey(episode: PodcastEpisode): string {
  return `${episode.title || ''}|${seriesTitle(episode)}`.toLowerCase();
}

export function podcastSearchEpisodeId(episode: PodcastEpisode): string {
  if (!isExternalSearchEpisode(episode)) {
    return episode._id || episode.id || episode.uuid || '';
  }
  return (
    episode.taddyUuid ||
    (episode.appleId ? String(episode.appleId) : '') ||
    episode.guid ||
    podcastSearchDedupeKey(episode)
  );
}

export function isExternalSearchEpisode(episode: PodcastEpisode): boolean {
  if (episode.isExternal === true) return true;
  if (episode.isExternal === false) return false;
  return Boolean(episode.source && episode.source !== 'local');
}

export function podcastSearchCover(episode: PodcastEpisode): string {
  return (
    episode.coverArt ||
    episode.podcastImage ||
    episode.podcastSeries?.coverArt ||
    DEFAULT_PODCAST_COVER
  );
}

export function podcastSearchSourceLabel(episode: PodcastEpisode): string {
  if (!isExternalSearchEpisode(episode)) return 'Library';
  if (episode.source === 'taddy') return 'Taddy';
  if (episode.source === 'apple') return 'Apple';
  if (episode.source === 'podcastindex') return 'Podcast Index';
  return 'Catalog';
}

export function markSearchEpisode(
  episode: PodcastEpisode,
  source: PodcastCatalogSource
): PodcastEpisode {
  return {
    ...episode,
    source,
    isExternal: source !== 'local',
    coverArt:
      episode.coverArt ||
      episode.podcastImage ||
      episode.podcastSeries?.coverArt,
    podcastTitle: episode.podcastTitle || episode.podcastSeries?.title,
  };
}

function publishedUnixSeconds(episode: PodcastEpisode): number {
  const raw = episode.releaseDate || episode.publishedAt;
  if (raw) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return Math.floor(date.getTime() / 1000);
    }
  }
  return Math.floor(Date.now() / 1000);
}

export function buildEpisodeImportPayload(episode: PodcastEpisode): {
  source: Exclude<PodcastCatalogSource, 'local'>;
  episodeData: Record<string, unknown>;
  seriesData?: Record<string, unknown>;
} {
  const source = episode.source;
  if (!source || source === 'local') {
    throw new Error('This episode is already in the Tuneable library.');
  }

  const podcastTitle = episode.podcastTitle || episode.podcastSeries?.title || '';
  const podcastImage =
    episode.podcastImage || episode.coverArt || episode.podcastSeries?.coverArt || null;
  const podcastAuthor = episode.podcastAuthor || '';

  if (source === 'taddy') {
    const seriesUuid = episode.podcastSeriesUuid || '';
    const rssUrl = episode.rssUrl || '';
    return {
      source,
      episodeData: {
        uuid: episode.taddyUuid || episode.guid,
        name: episode.title,
        description: episode.description || '',
        duration: episode.duration || 0,
        episodeNumber: episode.episodeNumber ?? null,
        seasonNumber: episode.seasonNumber ?? null,
        audioUrl: episode.audioUrl || '',
        datePublished: publishedUnixSeconds(episode),
        podcastSeries: {
          uuid: seriesUuid,
          name: podcastTitle,
          imageUrl: podcastImage,
          rssUrl,
        },
      },
      seriesData: podcastTitle
        ? {
            title: podcastTitle,
            image: podcastImage,
            taddyUuid: seriesUuid || undefined,
            rssUrl: rssUrl || undefined,
            language: 'en',
          }
        : undefined,
    };
  }

  if (source === 'apple') {
    return {
      source,
      episodeData: {
        trackName: episode.title,
        description: episode.description || '',
        collectionName: podcastTitle,
        collectionId: episode.collectionId,
        artworkUrl600: podcastImage,
        artistName: podcastAuthor,
        trackTimeMillis: (episode.duration || 0) * 1000,
        trackId: episode.appleId,
        releaseDate: episode.releaseDate || new Date().toISOString(),
      },
      seriesData: podcastTitle
        ? {
            title: podcastTitle,
            description: '',
            author: podcastAuthor,
            image: podcastImage,
            categories: episode.genres || [],
            language: 'en',
            iTunesId: episode.collectionId,
          }
        : undefined,
    };
  }

  return {
    source: 'podcastindex',
    episodeData: {
      title: episode.title,
      description: episode.description,
      feedTitle: podcastTitle,
      feedId: episode.feedId,
      feedImage: podcastImage,
      feedAuthor: podcastAuthor,
      duration: episode.duration || 0,
      enclosureUrl: episode.audioUrl || '',
      datePublished: publishedUnixSeconds(episode),
      id: episode.podcastIndexId,
      guid: episode.guid || '',
    },
    seriesData: podcastTitle
      ? {
          title: podcastTitle,
          description: '',
          author: podcastAuthor,
          image: podcastImage,
          categories: episode.genres || [],
          language: 'en',
          podcastIndexId: episode.feedId?.toString(),
        }
      : undefined,
  };
}

export function localSeriesId(episode: PodcastEpisode): string {
  return episode.podcastSeries?._id || '';
}

export function buildSeriesCreatePayload(
  episode: PodcastEpisode
): Record<string, unknown> {
  const podcastTitle =
    episode.podcastTitle || episode.podcastSeries?.title || '';
  if (!podcastTitle) {
    throw new Error('Unable to determine the podcast show.');
  }
  const podcastImage =
    episode.podcastImage ||
    episode.coverArt ||
    episode.podcastSeries?.coverArt ||
    null;
  const payload: Record<string, unknown> = {
    title: podcastTitle,
    description: '',
    author: episode.podcastAuthor || '',
    image: podcastImage,
    categories: episode.genres || [],
    language: 'en',
  };
  if (episode.podcastSeriesUuid) payload.taddyUuid = episode.podcastSeriesUuid;
  if (episode.rssUrl) payload.rssUrl = episode.rssUrl;
  if (episode.feedId) payload.podcastIndexId = String(episode.feedId);
  if (episode.collectionId) payload.iTunesId = episode.collectionId;
  return payload;
}

export function importedEpisodeFromSearch(
  searchEpisode: PodcastEpisode,
  imported: PodcastEpisode
): PodcastEpisode {
  const series =
    imported.podcastSeries && typeof imported.podcastSeries === 'object'
      ? imported.podcastSeries
      : undefined;
  return {
    ...searchEpisode,
    ...imported,
    source: 'local',
    isExternal: false,
    coverArt:
      imported.coverArt ||
      series?.coverArt ||
      searchEpisode.podcastImage ||
      searchEpisode.coverArt,
    podcastTitle: series?.title || imported.podcastTitle || searchEpisode.podcastTitle,
    podcastSeries: series || searchEpisode.podcastSeries,
  };
}

const CATALOG_SOURCE_LABEL: Record<CatalogShowSource, string> = {
  apple: 'Apple',
  taddy: 'Taddy',
  podcastindex: 'Podcast Index',
};

export function catalogShowSourceLabel(sources: CatalogShowSource[]): string {
  return sources.map((source) => CATALOG_SOURCE_LABEL[source]).join(' · ');
}

function catalogReleaseIso(raw: Record<string, unknown>): string | undefined {
  const value = raw.releaseDate ?? raw.publishedAt;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function normalizeCatalogShow(
  raw: Record<string, unknown>,
  source: CatalogShowSource
): CatalogShow | null {
  const title = String(raw.title || '').trim();
  if (!title) return null;
  const author = String(raw.author || '').trim();
  const externalId = raw.iTunesId ?? raw.appleId ?? raw.podcastIndexId ?? raw.taddyUuid ?? title;
  const appleId = raw.iTunesId ?? raw.appleId;
  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((item) => String(item))
    : [];
  return {
    key: `${source}:${String(externalId)}`,
    title,
    author,
    description: String(raw.description || ''),
    image: typeof raw.image === 'string' ? raw.image : null,
    categories,
    language: typeof raw.language === 'string' ? raw.language : 'en',
    rssUrl: typeof raw.rssUrl === 'string' ? raw.rssUrl : '',
    sources: [source],
    releaseDate: catalogReleaseIso(raw),
    appleId: appleId != null ? String(appleId) : undefined,
    iTunesId: appleId != null ? String(appleId) : undefined,
    taddyUuid: raw.taddyUuid ? String(raw.taddyUuid) : undefined,
    podcastIndexId: raw.podcastIndexId != null ? String(raw.podcastIndexId) : undefined,
  };
}

export function mergeCatalogShows(shows: CatalogShow[]): CatalogShow[] {
  const merged = new Map<string, CatalogShow>();
  for (const show of shows) {
    const key = `${show.title}|${show.author}`.toLowerCase().replace(/\s+/g, ' ').trim();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...show, sources: [...show.sources] });
      continue;
    }
    existing.sources = Array.from(new Set([...existing.sources, ...show.sources]));
    existing.rssUrl = existing.rssUrl || show.rssUrl;
    existing.image = existing.image || show.image;
    existing.description = existing.description || show.description;
    existing.appleId = existing.appleId || show.appleId;
    existing.iTunesId = existing.iTunesId || show.iTunesId;
    existing.taddyUuid = existing.taddyUuid || show.taddyUuid;
    existing.podcastIndexId = existing.podcastIndexId || show.podcastIndexId;
    existing.releaseDate = existing.releaseDate || show.releaseDate;
    if (!existing.categories.length) existing.categories = show.categories;
  }
  return Array.from(merged.values()).slice(0, 12);
}

export function seriesDataFromCatalogShow(show: CatalogShow): Record<string, unknown> {
  const language = /^[a-z]{2}$/i.test(show.language) ? show.language : 'en';
  return {
    title: show.title,
    description: show.description,
    author: show.author,
    image: show.image,
    categories: show.categories,
    language,
    ...(show.rssUrl ? { rssUrl: show.rssUrl } : {}),
    ...(show.taddyUuid ? { taddyUuid: show.taddyUuid } : {}),
    ...(show.podcastIndexId ? { podcastIndexId: show.podcastIndexId } : {}),
    ...(show.iTunesId
      ? { iTunesId: show.iTunesId, appleId: show.appleId || show.iTunesId }
      : {}),
  };
}
