const Media = require('../models/Media');
const applePodcastsService = require('./applePodcastsService');
const podcastAdapter = require('./podcastAdapter');
const { parseRSSFeed, getAllRSSFeeds } = require('../utils/podcastRss');
const { readSeriesExternalIds, seriesEpisodeMatch, episodeGuid, normalizeEpisodeTitle } = require('../utils/podcastSeriesQuery');
const { nextFreshEpisodes } = require('../utils/podcastFeedBatch');

function sourceValue(sources, key) {
  if (!sources) return null;
  if (typeof sources.get === 'function') return sources.get(key) || null;
  return sources[key] || null;
}

function ensureSourceMap(series) {
  if (series.sources && typeof series.sources.set === 'function') return series.sources;
  const current = series.sources && typeof series.sources === 'object'
    ? { ...series.sources }
    : {};
  series.sources = new Map(Object.entries(current));
  return series.sources;
}

function setSource(series, key, value) {
  ensureSourceMap(series).set(key, value);
  if (typeof series.markModified === 'function') series.markModified('sources');
}

async function resolveFeedUrl(series) {
  const stored = getAllRSSFeeds(series);
  if (stored[0]?.url) return stored[0].url;
  const { iTunesId } = readSeriesExternalIds(series);
  if (!iTunesId) return null;
  try {
    const result = await applePodcastsService.getPodcastById(iTunesId);
    const feedUrl = result?.podcast?.feedUrl;
    if (typeof feedUrl === 'string' && /^https?:\/\//i.test(feedUrl)) return feedUrl.trim();
  } catch (error) {
    console.warn('Could not resolve podcast RSS from Apple:', error.message);
  }
  return null;
}

function knownEpisodeKeys(episodes) {
  const titles = new Set();
  const guids = new Set();
  for (const episode of episodes) {
    const title = normalizeEpisodeTitle(episode.title);
    if (title && title !== 'untitled episode') titles.add(title);
    const ids = episode.externalIds instanceof Map
      ? Object.fromEntries(episode.externalIds)
      : (episode.externalIds || {});
    for (const value of [ids.rssGuid, ids.iTunes, ids.podcastIndex, ids.taddy, episodeGuid(episode)]) {
      if (value) guids.add(String(value).toLowerCase());
    }
  }
  return { titles, guids };
}

async function removeUnplayableShells(seriesId, seriesTitle) {
  const { isUnplayableShell } = require('../utils/podcastFeedBatch');
  const episodes = await Media.find(seriesEpisodeMatch(seriesId))
    .select('title sources globalMediaAggregate')
    .lean();
  const ids = episodes
    .filter((episode) => isUnplayableShell(episode, seriesTitle))
    .map((episode) => episode._id);
  if (!ids.length) return 0;
  await Media.deleteMany({ _id: { $in: ids } });
  console.log(`Removed ${ids.length} unplayable podcast shell(s) from ${seriesTitle || seriesId}`);
  return ids.length;
}

/**
 * Import the next small batch of playable RSS episodes for a show.
 * Returns handled:false when no feed could be resolved, so callers can fall back.
 */
async function importRecentFeedEpisodes({ series, addedBy, batchSize, onProgress }) {
  const feedUrl = await resolveFeedUrl(series);
  if (!feedUrl) {
    return { imported: 0, canImportMore: false, handled: false };
  }

  if (!sourceValue(series.sources, 'rss')) {
    setSource(series, 'rss', feedUrl);
  }

  const existing = await Media.find(seriesEpisodeMatch(series._id))
    .select('title externalIds guid')
    .lean();
  const { titles, guids } = knownEpisodeKeys(existing);
  const fetchCount = Math.min(existing.length + batchSize + 1, 200);

  let rss;
  try {
    rss = await parseRSSFeed(feedUrl, fetchCount);
  } catch (error) {
    console.warn(`RSS batch import failed for ${series.title}:`, error.message);
    return { imported: 0, canImportMore: false, handled: false };
  }

  const fresh = nextFreshEpisodes(rss.episodes || [], { titles, guids, batchSize });
  const truncated = (rss.episodes || []).length >= fetchCount;
  const canImportMore = fresh.canImportMore || (truncated && fresh.episodes.length === batchSize);
  const ids = readSeriesExternalIds(series);
  const seriesData = {
    title: series.title,
    description: series.description || rss.channel?.description || '',
    author: (series.host && series.host[0] && series.host[0].name) || rss.channel?.author || '',
    image: series.coverArt || null,
    categories: (series.genres && series.genres.length) ? series.genres : (rss.channel?.categories || []),
    language: series.language || rss.channel?.language || 'en',
    rssUrl: feedUrl,
    taddyUuid: ids.taddyUuid,
    podcastIndexId: ids.podcastIndexId,
    iTunesId: ids.iTunesId,
  };

  let imported = 0;
  for (let i = 0; i < fresh.episodes.length; i += 1) {
    const item = fresh.episodes[i];
    if (typeof onProgress === 'function') onProgress(i + 1, fresh.episodes.length);
    try {
      const result = await podcastAdapter.importEpisodeWithSeries(
        'rss',
        { ...item, guid: episodeGuid(item) || item.guid },
        seriesData,
        addedBy
      );
      if (result?.episode) imported += 1;
    } catch (error) {
      console.error(`Failed to import RSS episode ${item.title}:`, error.message);
    }
  }

  setSource(series, 'feedBackfill', canImportMore ? 'open' : 'done');
  if (typeof series.save === 'function') {
    await series.save();
  }

  console.log(`Imported ${imported} recent episodes for ${series.title} (more: ${canImportMore})`);
  return { imported, canImportMore, handled: true, feedUrl };
}

module.exports = {
  removeUnplayableShells,
  importRecentFeedEpisodes,
  sourceValue,
};
