const MIN_SERIES_EPISODE_SEARCH_LENGTH = 2;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  escapeRegex,
  normalizeSeriesEpisodeSearch,
  seriesEpisodeMatch,
  buildSeriesEpisodeMatch,
};
