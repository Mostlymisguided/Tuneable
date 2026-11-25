const DEFAULT_INITIAL_BATCH = 5;
const INITIAL_BATCH_CAP = 10;
const LOAD_MORE_BATCH_CAP = 20;
const SHORT_CATALOG_LIMIT = 15;

function rssText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return rssText(value._ ?? value['#text'] ?? value.text ?? '');
  }
  return '';
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function episodeAudioUrl(episode) {
  const sources = episode?.sources;
  const fromSources = sources instanceof Map
    ? (sources.get('audio_direct') || sources.get('audio') || sources.get('enclosure'))
    : (sources?.audio_direct || sources?.audio || sources?.enclosure);
  if (isHttpUrl(fromSources)) return fromSources.trim();
  if (isHttpUrl(episode?.audioUrl)) return episode.audioUrl.trim();
  if (isHttpUrl(episode?.enclosure?.url)) return episode.enclosure.url.trim();
  return '';
}

function isPlayableRssItem(item) {
  const title = rssText(item?.title);
  if (!title || /^untitled episode$/i.test(title)) return false;
  return isHttpUrl(item?.enclosure?.url);
}

function isUnplayableShell(episode, seriesTitle) {
  if (!episode) return false;
  const tipped = Number(episode.globalMediaAggregate) || 0;
  if (tipped > 0) return false;
  if (episodeAudioUrl(episode)) return false;
  const title = rssText(episode.title);
  if (!title || /^untitled episode$/i.test(title)) return true;
  const show = rssText(seriesTitle).toLowerCase();
  return Boolean(show) && title.toLowerCase() === show;
}

function showImportBatchSize({ loadMore = false, requestedLimit = 0, applyLimit = false } = {}) {
  if (loadMore) {
    const requested = applyLimit ? requestedLimit : 10;
    return Math.min(Math.max(Number(requested) || 10, 1), LOAD_MORE_BATCH_CAP);
  }
  const requested = applyLimit ? requestedLimit : DEFAULT_INITIAL_BATCH;
  return Math.min(Math.max(Number(requested) || DEFAULT_INITIAL_BATCH, 1), INITIAL_BATCH_CAP);
}

/**
 * Whether the show page should offer another feed batch.
 * `flag` is the stored feedBackfill value: "open", "done", or unset.
 */
function feedBackfillOpen({ flag, episodeCount = 0, hasFeed = false } = {}) {
  if (flag === 'done') return false;
  if (flag === 'open') return true;
  if (!hasFeed || episodeCount <= 0 || episodeCount > SHORT_CATALOG_LIMIT) return false;
  return true;
}

function nextFreshEpisodes(episodes, { titles, guids, batchSize }) {
  const knownTitles = titles instanceof Set ? titles : new Set(titles || []);
  const knownGuids = guids instanceof Set ? guids : new Set(guids || []);
  const fresh = [];
  for (const episode of episodes || []) {
    if (!isPlayableRssItem(episode)) continue;
    const title = rssText(episode.title).toLowerCase();
    const guid = rssText(episode.guid).toLowerCase();
    if (guid && knownGuids.has(guid)) continue;
    if (title && knownTitles.has(title)) continue;
    fresh.push(episode);
    if (fresh.length > batchSize) break;
  }
  return {
    episodes: fresh.slice(0, batchSize),
    canImportMore: fresh.length > batchSize,
  };
}

module.exports = {
  DEFAULT_INITIAL_BATCH,
  INITIAL_BATCH_CAP,
  LOAD_MORE_BATCH_CAP,
  SHORT_CATALOG_LIMIT,
  rssText,
  isPlayableRssItem,
  isUnplayableShell,
  showImportBatchSize,
  feedBackfillOpen,
  nextFreshEpisodes,
};
