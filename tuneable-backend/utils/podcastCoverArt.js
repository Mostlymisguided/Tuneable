/**
 * Normalize podcast artwork values from RSS / APIs / Mongo into a usable http(s) URL.
 * RSS parsers often yield `{ href }` / `{ url }` objects, which Mongoose then stores as "[object Object]".
 */

function normalizeCoverArtUrl(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[object Object]') return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return null;
  }
  if (typeof value === 'object') {
    return normalizeCoverArtUrl(value.url || value.href || value.src || value.uri);
  }
  return null;
}

function extractRssItemImage(item) {
  if (!item || typeof item !== 'object') return null;
  const itunesImage = item['itunes:image'];
  const fromItunes = normalizeCoverArtUrl(
    (itunesImage && (itunesImage.href || itunesImage.url)) || itunesImage
  );
  const fromItem = normalizeCoverArtUrl(
    item.image?.url || item.image?.href || item.image
  );
  return fromItunes || fromItem;
}

function withSeriesCoverArt(episode, seriesCoverArt) {
  const coverArt =
    normalizeCoverArtUrl(episode?.coverArt) ||
    normalizeCoverArtUrl(episode?.podcastSeries?.coverArt) ||
    normalizeCoverArtUrl(seriesCoverArt) ||
    null;
  if (!episode) return { coverArt };
  if (coverArt === episode.coverArt) return episode;
  return { ...episode, coverArt };
}

function getSeriesEpisodeSort(sortBy) {
  switch (sortBy) {
    case 'newest':
    case 'releaseDate':
      return { releaseDate: -1, _id: -1 };
    case 'oldest':
      return { releaseDate: 1, _id: 1 };
    case 'duration':
    case 'longest':
      return { duration: -1, globalMediaAggregate: -1 };
    case 'episodeNumber':
      return { seasonNumber: 1, episodeNumber: 1, releaseDate: 1 };
    case 'mostTipped':
    case 'globalMediaAggregate':
    default:
      return { globalMediaAggregate: -1, releaseDate: -1 };
  }
}

module.exports = {
  normalizeCoverArtUrl,
  extractRssItemImage,
  withSeriesCoverArt,
  getSeriesEpisodeSort,
};
