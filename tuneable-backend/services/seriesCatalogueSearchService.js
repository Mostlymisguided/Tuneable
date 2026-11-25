const podcastIndexService = require('./podcastIndexService');
const applePodcastsService = require('./applePodcastsService');
const taddyService = require('./taddyService');
const podcastAdapter = require('./podcastAdapter');
const Media = require('../models/Media');
const {
  getAllRSSFeeds,
  fetchFromAllRSSFeeds,
} = require('../utils/podcastRss');
const {
  MAX_SERIES_CATALOGUE_SEARCH_IMPORTS,
  dedupeIncomingEpisodes,
  normalizeEpisodeTitle,
  normalizeSeriesEpisodeSearch,
  readSeriesExternalIds,
  selectCatalogueSearchMatches,
  seriesEpisodeMatch,
} = require('../utils/podcastSeriesQuery');

const CATALOGUE_RSS_MAX_EPISODES = 5000;
const CATALOGUE_PI_MAX_EPISODES = 1000;
const CATALOGUE_APPLE_LOOKUP_MAX = 200;
const THIN_CATALOGUE_THRESHOLD = 50;
const CATALOGUE_SEARCH_CACHE_TTL_MS = 2 * 60 * 1000;
const catalogueSearchCache = new Map();
const catalogueSearchInflight = new Map();

function mergeCatalogueEpisodes(batches) {
  // Same episode often arrives from RSS and Podcast Index with different ids.
  // Collapse those by title as well as guid before anything is imported.
  return dedupeIncomingEpisodes(batches.flat());
}

function toCatalogueItem(source, episode) {
  return {
    ...episode,
    source,
    title: episode.title || episode.trackName || episode.name,
    description: episode.description || episode.contentSnippet || episode.content || '',
    author: episode.author || episode.feedAuthor || episode.artistName,
    guid: episode.guid || episode.episodeGuid || episode.id || episode.trackId,
  };
}

function isAppleEpisode(result) {
  if (!result) return false;
  if (result.wrapperType === 'collection') return false;
  if (result.kind === 'podcast' && !result.trackTimeMillis && !result.episodeUrl) return false;
  return Boolean(
    result.wrapperType === 'podcastEpisode' ||
    result.kind === 'podcast-episode' ||
    result.trackName ||
    result.episodeGuid
  );
}

function sameId(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

async function fetchRssCatalogue(series) {
  const feeds = getAllRSSFeeds(series);
  if (!feeds.length) return [];
  const results = await fetchFromAllRSSFeeds(feeds, CATALOGUE_RSS_MAX_EPISODES);
  const best = results[0];
  return (best?.episodes || []).map((ep) => toCatalogueItem('rss', ep));
}

async function fetchPodcastIndexCatalogue(podcastIndexId) {
  if (!podcastIndexId) return [];
  const result = await podcastIndexService.getPodcastEpisodes(
    podcastIndexId,
    CATALOGUE_PI_MAX_EPISODES
  );
  if (!result.success || !Array.isArray(result.episodes)) return [];
  return result.episodes.map((ep) => toCatalogueItem('podcastindex', ep));
}

async function fetchAppleLookupCatalogue(iTunesId) {
  if (!iTunesId) return [];
  const result = await applePodcastsService.getPodcastEpisodes(
    iTunesId,
    CATALOGUE_APPLE_LOOKUP_MAX
  );
  if (!result.success || !Array.isArray(result.episodes)) return [];
  return result.episodes
    .filter(isAppleEpisode)
    .map((ep) => toCatalogueItem('apple', ep));
}

async function fetchTargetedCatalogueSearch({ query, podcastIndexId }) {
  if (!podcastIndexId) return [];
  try {
    const result = await podcastIndexService.searchEpisodesByTitle(query, 50);
    if (!result.success || !Array.isArray(result.episodes)) return [];
    return result.episodes
      .filter((ep) => sameId(ep.feedId, podcastIndexId))
      .map((ep) => toCatalogueItem('podcastindex', ep));
  } catch (error) {
    console.error('Show catalogue Podcast Index title search failed:', error.message);
    return [];
  }
}

async function fetchSeriesCatalogueEpisodes(series, query) {
  const { podcastIndexId, iTunesId } = readSeriesExternalIds(series);
  const [rssResult, targetedResult] = await Promise.allSettled([
    fetchRssCatalogue(series),
    fetchTargetedCatalogueSearch({ query, podcastIndexId }),
  ]);

  const rssEpisodes = rssResult.status === 'fulfilled' ? rssResult.value : [];
  const targetedEpisodes = targetedResult.status === 'fulfilled' ? targetedResult.value : [];

  let apiEpisodes = [];
  if (rssEpisodes.length < THIN_CATALOGUE_THRESHOLD) {
    const fallbacks = [];
    if (podcastIndexId) fallbacks.push(fetchPodcastIndexCatalogue(podcastIndexId));
    if (!rssEpisodes.length && !podcastIndexId && iTunesId) {
      fallbacks.push(fetchAppleLookupCatalogue(iTunesId));
    }
    const settled = await Promise.allSettled(fallbacks);
    apiEpisodes = settled.flatMap((item) => (item.status === 'fulfilled' ? item.value : []));
  }

  return mergeCatalogueEpisodes([rssEpisodes, targetedEpisodes, apiEpisodes]);
}

function buildSeriesData(series) {
  const { taddyUuid, podcastIndexId, iTunesId } = readSeriesExternalIds(series);
  const sources = series.sources instanceof Map
    ? Object.fromEntries(series.sources)
    : (series.sources || {});
  const hostName = Array.isArray(series.host) && series.host[0]?.name
    ? series.host[0].name
    : '';

  return {
    title: series.title,
    description: series.description || '',
    author: hostName,
    image: series.coverArt || null,
    categories: series.genres || [],
    language: series.language || 'en',
    rssUrl: sources.rss || '',
    taddyUuid,
    podcastIndexId,
    iTunesId,
    appleId: iTunesId,
  };
}

async function existingSeriesEpisodeKeys(seriesId) {
  const existing = await Media.find(seriesEpisodeMatch(seriesId))
    .select('title externalIds')
    .lean();
  const titles = new Set();
  const ids = new Set();
  existing.forEach((ep) => {
    const title = normalizeEpisodeTitle(ep.title);
    if (title) titles.add(title);
    const ext = ep.externalIds && typeof ep.externalIds === 'object' ? ep.externalIds : {};
    ['rssGuid', 'podcastIndex', 'iTunes', 'apple', 'taddy'].forEach((key) => {
      if (ext[key]) ids.add(String(ext[key]));
    });
  });
  return { titles, ids };
}

function rememberImportedEpisode(existing, episode) {
  const title = normalizeEpisodeTitle(episode?.title || episode?.trackName || episode?.name);
  if (title) existing.titles.add(title);
  [episode?.guid, episode?.episodeGuid, episode?.id, episode?.trackId, episode?.podcastIndexId]
    .filter(Boolean)
    .forEach((id) => existing.ids.add(String(id)));
}

function isAlreadyImported(episode, existing) {
  const title = normalizeEpisodeTitle(episode.title || episode.trackName || episode.name);
  if (title && existing.titles.has(title)) return true;
  const candidates = [
    episode.guid,
    episode.episodeGuid,
    episode.id,
    episode.trackId,
    episode.podcastIndexId,
  ]
    .filter(Boolean)
    .map((value) => String(value));
  return candidates.some((id) => existing.ids.has(id));
}

function importSourceFor(episode) {
  if (episode.source === 'apple') return 'apple';
  if (episode.source === 'taddy') return 'taddy';
  if (episode.source === 'podcastindex') return 'podcastIndex';
  return 'rss';
}

function titlesMatch(left, right) {
  const a = normalizeEpisodeTitle(left);
  const b = normalizeEpisodeTitle(right);
  return Boolean(a && b && a === b);
}

function externalEpisodeMatchesSeries(episode, ids) {
  const iTunesId = ids?.iTunesId;
  const podcastIndexId = ids?.podcastIndexId;
  const taddyUuid = ids?.taddyUuid;
  const title = ids?.title;
  if (episode?.source === 'apple') {
    if (iTunesId) return sameId(episode.collectionId, iTunesId);
    return titlesMatch(episode.collectionName, title);
  }
  if (episode?.source === 'taddy') {
    const seriesId = episode.podcastSeries?.uuid || episode.podcastSeriesUuid || episode.podcastId;
    if (taddyUuid) return sameId(seriesId, taddyUuid);
    return titlesMatch(episode.podcastSeries?.name || episode.podcastTitle, title);
  }
  if (episode?.source === 'podcastindex') {
    if (podcastIndexId) return sameId(episode.feedId, podcastIndexId);
    return titlesMatch(episode.feedTitle || episode.podcastTitle, title);
  }
  return false;
}

function taddySearchEpisode(episode) {
  const published = episode.releaseDate || episode.publishedAt || episode.datePublished;
  const datePublished = published instanceof Date ? published.toISOString() : published;
  return {
    ...episode,
    name: episode.name || episode.title,
    uuid: episode.uuid || episode.taddyUuid || episode.guid,
    datePublished,
    audioUrl: episode.audioUrl,
    podcastSeries: episode.podcastSeries || {
      uuid: episode.podcastSeriesUuid || episode.podcastId,
      name: episode.podcastTitle,
      authorName: episode.podcastAuthor,
      author: episode.podcastAuthor,
      imageUrl: episode.podcastImage,
      rssUrl: episode.rssUrl,
      language: episode.language,
    },
  };
}

async function fetchExternalSeriesEpisodes(series, query) {
  const ids = readSeriesExternalIds(series);
  const seriesIds = { ...ids, title: series?.title };
  const [appleResult, taddyResult, indexResult] = await Promise.allSettled([
    applePodcastsService.searchEpisodes(query, 50),
    taddyService.searchEpisodes(query, 25, 1),
    podcastIndexService.searchEpisodesByTitle(query, 50),
  ]);

  const appleEpisodes = appleResult.status === 'fulfilled' && appleResult.value?.success
    ? appleResult.value.episodes.map((ep) => toCatalogueItem('apple', ep))
    : [];
  const taddyEpisodes = taddyResult.status === 'fulfilled' && taddyResult.value?.success
    ? taddyResult.value.episodes.map((ep) => toCatalogueItem('taddy', taddySearchEpisode(ep)))
    : [];
  const indexEpisodes = indexResult.status === 'fulfilled' && indexResult.value?.success
    ? indexResult.value.episodes.map((ep) => toCatalogueItem('podcastindex', ep))
    : [];

  return mergeCatalogueEpisodes([appleEpisodes, taddyEpisodes, indexEpisodes])
    .filter((episode) => externalEpisodeMatchesSeries(episode, seriesIds));
}

async function importEpisodeIntoExistingSeries(episode, series, addedBy) {
  const seriesData = buildSeriesData(series);
  const source = importSourceFor(episode);
  const title = episode.title || episode.trackName || episode.name;
  const alreadyInSeries = await podcastAdapter.findEpisodeInSeriesByTitle(series._id, title);
  if (alreadyInSeries) return alreadyInSeries;
  const imported = await podcastAdapter.importEpisode(source, episode, addedBy, seriesData);
  if (!imported) return null;

  const seriesId = series._id.toString();
  const current = imported.podcastSeries
    ? imported.podcastSeries.toString()
    : '';
  let dirty = false;
  if (current !== seriesId) {
    imported.podcastSeries = series._id;
    if (!imported.relationships) imported.relationships = [];
    const hasRelationship = imported.relationships.some(
      (rel) => rel.type === 'same_series' && rel.targetId && rel.targetId.toString() === seriesId
    );
    if (!hasRelationship) {
      imported.relationships.push({
        type: 'same_series',
        targetId: series._id,
        description: `Part of ${series.title}`,
      });
    }
    dirty = true;
  }
  if (!imported.creatorDisplay && series.title) {
    imported.creatorDisplay = series.title;
    dirty = true;
  }
  if (dirty) await imported.save();
  return imported;
}

async function importMatchingSeriesCatalogueEpisodes({
  series,
  query,
  addedBy,
  maxImport = MAX_SERIES_CATALOGUE_SEARCH_IMPORTS,
}) {
  const q = normalizeSeriesEpisodeSearch(query);
  if (!q || !series?._id) {
    return { imported: 0, catalogHits: 0 };
  }

  const cacheKey = `${series._id}|${q.toLowerCase()}`;
  const cached = catalogueSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CATALOGUE_SEARCH_CACHE_TTL_MS) {
    return { imported: 0, catalogHits: cached.catalogHits, cached: true };
  }
  const inflight = catalogueSearchInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = importCatalogueMatches({ series, query: q, addedBy, maxImport, cacheKey })
    .finally(() => {
      catalogueSearchInflight.delete(cacheKey);
    });
  catalogueSearchInflight.set(cacheKey, promise);
  return promise;
}

async function importCatalogueMatches({ series, query: q, addedBy, maxImport, cacheKey }) {
  const catalogue = await fetchSeriesCatalogueEpisodes(series, q);
  const matches = selectCatalogueSearchMatches(catalogue, q, Math.max(maxImport * 3, maxImport));
  if (!matches.length) {
    catalogueSearchCache.set(cacheKey, { at: Date.now(), catalogHits: 0 });
    return { imported: 0, catalogHits: 0 };
  }

  const existing = await existingSeriesEpisodeKeys(series._id);
  const toImport = matches.filter((ep) => !isAlreadyImported(ep, existing)).slice(0, maxImport);
  let imported = 0;

  for (const episode of toImport) {
    if (isAlreadyImported(episode, existing)) continue;
    try {
      const result = await importEpisodeIntoExistingSeries(episode, series, addedBy);
      if (result) {
        imported += 1;
        rememberImportedEpisode(existing, episode);
        rememberImportedEpisode(existing, result);
      }
    } catch (error) {
      console.error(`Show catalogue import failed for "${episode.title}":`, error.message);
    }
  }

  if (imported > 0) {
    console.log(`🔎 Imported ${imported} catalogue episode${imported === 1 ? '' : 's'} for series search "${q}"`);
  }

  catalogueSearchCache.set(cacheKey, { at: Date.now(), catalogHits: matches.length });

  return { imported, catalogHits: matches.length };
}

async function importExternalSeriesEpisodeMatches({
  series,
  query,
  addedBy,
  maxImport = MAX_SERIES_CATALOGUE_SEARCH_IMPORTS,
}) {
  const q = normalizeSeriesEpisodeSearch(query);
  if (!q || !series?._id) {
    return { imported: 0, catalogHits: 0 };
  }

  const cacheKey = `${series._id}|${q.toLowerCase()}|external`;
  const cached = catalogueSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CATALOGUE_SEARCH_CACHE_TTL_MS) {
    return { imported: 0, catalogHits: cached.catalogHits, cached: true };
  }
  const inflight = catalogueSearchInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const catalogue = await fetchExternalSeriesEpisodes(series, q);
    const matches = selectCatalogueSearchMatches(catalogue, q, Math.max(maxImport * 3, maxImport));
    if (!matches.length) {
      catalogueSearchCache.set(cacheKey, { at: Date.now(), catalogHits: 0 });
      return { imported: 0, catalogHits: 0 };
    }

    const existing = await existingSeriesEpisodeKeys(series._id);
    const toImport = matches.filter((ep) => !isAlreadyImported(ep, existing)).slice(0, maxImport);
    let imported = 0;
    for (const episode of toImport) {
      if (isAlreadyImported(episode, existing)) continue;
      try {
        const result = await importEpisodeIntoExistingSeries(episode, series, addedBy);
        if (result) {
          imported += 1;
          rememberImportedEpisode(existing, episode);
          rememberImportedEpisode(existing, result);
        }
      } catch (error) {
        console.error(`External show search import failed for "${episode.title}":`, error.message);
      }
    }

    if (imported > 0) {
      console.log(`🔎 Imported ${imported} external episode${imported === 1 ? '' : 's'} for series search "${q}"`);
    }
    catalogueSearchCache.set(cacheKey, { at: Date.now(), catalogHits: matches.length });
    return { imported, catalogHits: matches.length };
  })().finally(() => {
    catalogueSearchInflight.delete(cacheKey);
  });

  catalogueSearchInflight.set(cacheKey, promise);
  return promise;
}

module.exports = {
  CATALOGUE_RSS_MAX_EPISODES,
  externalEpisodeMatchesSeries,
  fetchSeriesCatalogueEpisodes,
  importExternalSeriesEpisodeMatches,
  importMatchingSeriesCatalogueEpisodes,
  mergeCatalogueEpisodes,
};
