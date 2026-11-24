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

function normalizeEpisodeTitle(title) {
  return String(title || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function episodeGuid(episode) {
  const raw = episode?.guid ?? episode?.episodeGuid ?? episode?.id ?? episode?.trackId;
  if (raw == null || raw === '') return '';
  if (typeof raw === 'object') {
    return episodeGuid({ guid: raw._ || raw.id || raw.value || '' });
  }
  const text = String(raw).trim();
  if (!text || text === '[object Object]') return '';
  return text;
}

function episodeIdentityKeys(episode) {
  const keys = [];
  const title = normalizeEpisodeTitle(
    episode?.title || episode?.trackName || episode?.name
  );
  if (title) keys.push(`title:${title}`);
  const guid = episodeGuid(episode);
  if (guid) keys.push(`guid:${guid.toLowerCase()}`);
  return keys;
}

function dedupeIncomingEpisodes(episodes, { preferLast = false } = {}) {
  const kept = [];
  const index = new Map();
  for (const episode of episodes || []) {
    if (!episode) continue;
    const keys = episodeIdentityKeys(episode);
    if (!keys.length) continue;
    const existingAt = keys.map((key) => index.get(key)).find((at) => at != null);
    if (existingAt == null) {
      const at = kept.length;
      kept.push(episode);
      keys.forEach((key) => index.set(key, at));
      continue;
    }
    if (preferLast) kept[existingAt] = episode;
    keys.forEach((key) => index.set(key, existingAt));
  }
  return kept;
}

function episodeTipTotal(episode) {
  const value = Number(episode?.globalMediaAggregate);
  return Number.isFinite(value) ? value : 0;
}

function episodeHasAudio(episode) {
  const sources = episode?.sources;
  const audio = sources instanceof Map ? sources.get('audio_direct') : sources?.audio_direct;
  return Boolean(audio || episode?.audioUrl || episode?.enclosure?.url);
}

function episodeCreatedAt(episode) {
  if (!episode?.createdAt) return Number.POSITIVE_INFINITY;
  const time = new Date(episode.createdAt).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function preferSeriesEpisode(current, incoming) {
  const tipDiff = episodeTipTotal(incoming) - episodeTipTotal(current);
  if (tipDiff) return tipDiff > 0 ? incoming : current;
  const audioDiff = Number(episodeHasAudio(incoming)) - Number(episodeHasAudio(current));
  if (audioDiff) return audioDiff > 0 ? incoming : current;
  const currentCreated = episodeCreatedAt(current);
  const incomingCreated = episodeCreatedAt(incoming);
  if (currentCreated !== incomingCreated) {
    return incomingCreated < currentCreated ? incoming : current;
  }
  return String(incoming?._id || '') < String(current?._id || '') ? incoming : current;
}

function seriesEpisodeDedupeKey(episode) {
  const title = normalizeEpisodeTitle(episode?.title);
  if (title) return `title:${title}`;
  const id = episode?._id || episode?.id || episode?.uuid;
  return id ? `id:${id}` : '';
}

function dedupeSeriesEpisodes(episodes) {
  const kept = new Map();
  const untitled = [];
  for (const episode of episodes || []) {
    if (!episode) continue;
    const key = seriesEpisodeDedupeKey(episode);
    if (!key) {
      untitled.push(episode);
      continue;
    }
    const previous = kept.get(key);
    kept.set(key, previous ? preferSeriesEpisode(previous, episode) : episode);
  }
  return [...kept.values(), ...untitled];
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
  normalizeEpisodeTitle,
  episodeGuid,
  dedupeIncomingEpisodes,
  dedupeSeriesEpisodes,
  seriesEpisodeMatch,
  buildSeriesEpisodeMatch,
  readSeriesExternalIds,
  catalogueEpisodeText,
  catalogueEpisodeMatchesSearch,
  catalogueEpisodeMatchRank,
  selectCatalogueSearchMatches,
};
