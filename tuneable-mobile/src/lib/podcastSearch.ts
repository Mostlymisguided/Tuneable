import type { PodcastCatalogSource, PodcastEpisode } from '@/src/types/podcast';
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
