const MIN_SERIES_EPISODE_SEARCH_LENGTH = 2;
const MAX_SERIES_CATALOGUE_SEARCH_IMPORTS = 25;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readMapOrObject(value, key) {
  if (!value) return null;
  if (value instanceof Map) return value.get(key) || null;
  if (typeof value === 'object') return value[key] || null;
  return null;
}

function readSeriesExternalIds(series) {
  const raw = series?.externalIds;
  return {
    taddyUuid: readMapOrObject(raw, 'taddy'),
    podcastIndexId: readMapOrObject(raw, 'podcastIndex'),
    iTunesId: readMapOrObject(raw, 'iTunes'),
  };
}

function catalogueEpisodeText(episode) {
  if (!episode || typeof episode !== 'object') return '';
  const hostNames = Array.isArray(episode.host)
    ? episode.host.map((h) => h?.name).filter(Boolean).join(' ')
    : '';
  return [
    episode.title,
    episode.trackName,
    episode.name,
    episode.description,
    episode.content,
    episode.contentSnippet,
    episode.summary,
    episode.author,
    episode.artistName,
    episode.feedAuthor,
    hostNames,
    Array.isArray(episode.creatorNames) ? episode.creatorNames.join(' ') : episode.creatorNames,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/<[^>]+>/g, ' ');
}

function catalogueEpisodeMatchesSearch(episode, q) {
  const query = normalizeSeriesEpisodeSearch(q);
  if (!query) return false;
  return catalogueEpisodeText(episode).toLowerCase().includes(query.toLowerCase());
}

function catalogueEpisodeMatchRank(episode, q) {
  const query = normalizeSeriesEpisodeSearch(q).toLowerCase();
  if (!query) return 0;
  const title = `${episode?.title || episode?.trackName || episode?.name || ''}`.toLowerCase();
  if (title.includes(query)) return 3;
  const host = [
    ...(Array.isArray(episode?.host) ? episode.host.map((h) => h?.name) : []),
    episode?.author,
    episode?.artistName,
    episode?.feedAuthor,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (host.includes(query)) return 2;
  return catalogueEpisodeMatchesSearch(episode, q) ? 1 : 0;
}

function selectCatalogueSearchMatches(episodes, q, limit = MAX_SERIES_CATALOGUE_SEARCH_IMPORTS) {
  const cap = Math.max(1, Number(limit) || MAX_SERIES_CATALOGUE_SEARCH_IMPORTS);
  return (Array.isArray(episodes) ? episodes : [])
    .map((ep) => ({ ep, rank: catalogueEpisodeMatchRank(ep, q) }))
    .filter((item) => item.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, cap)
    .map((item) => item.ep);
}

function normalizeSeriesEpisodeSearch(q) {
  if (typeof q !== 'string') return '';
  const trimmed = q.trim();
  return trimmed.length >= MIN_SERIES_EPISODE_SEARCH_LENGTH ? trimmed : '';
}

function seriesEpisodeMatch(seriesId) {
  return {
    podcastSeries: seriesId,
    contentType: { $in: ['spoken'] },
    contentForm: { $in: ['podcastepisode'] },
  };
}

function buildSeriesEpisodeMatch(seriesId, q) {
  const match = seriesEpisodeMatch(seriesId);
  const query = normalizeSeriesEpisodeSearch(q);
  if (!query) {
    return { match, query: '' };
  }

  const regex = escapeRegex(query);
  return {
    match: {
      ...match,
      $or: [
        { title: { $regex: regex, $options: 'i' } },
        { description: { $regex: regex, $options: 'i' } },
        { 'host.name': { $regex: regex, $options: 'i' } },
        { creatorNames: { $regex: regex, $options: 'i' } },
      ],
    },
    query,
  };
}

module.exports = {
  MIN_SERIES_EPISODE_SEARCH_LENGTH,
  MAX_SERIES_CATALOGUE_SEARCH_IMPORTS,
  escapeRegex,
  normalizeSeriesEpisodeSearch,
  seriesEpisodeMatch,
  buildSeriesEpisodeMatch,
  readSeriesExternalIds,
  catalogueEpisodeText,
  catalogueEpisodeMatchesSearch,
  catalogueEpisodeMatchRank,
  selectCatalogueSearchMatches,
};
