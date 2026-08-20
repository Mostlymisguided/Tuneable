/**
 * Rank a media item within each of its tags by tip aggregate.
 * Music ranks among music; podcast episodes among episodes; series among series
 * (series sort key = summed episode tips).
 */

const Media = require('../models/Media');
const { getCanonicalTag } = require('../utils/tagNormalizer');
const {
  collectTagVariants,
  catalogMatchOr,
  itemMatchesTag,
  PODCAST_FORMS,
} = require('./tagProfileService');

const MAX_RANKING_TAGS = 8;
const EPISODE_FORMS = ['podcastepisode', 'podcast', 'episode'];
const SERIES_FORMS = ['podcastseries'];

function mediaForms(media) {
  if (!media) return [];
  return Array.isArray(media.contentForm)
    ? media.contentForm.filter(Boolean)
    : [media.contentForm].filter(Boolean);
}

function isPodcastMedia(media) {
  const forms = mediaForms(media);
  if (forms.some((form) => PODCAST_FORMS.includes(form))) return true;
  const types = Array.isArray(media?.contentType)
    ? media.contentType
    : [media?.contentType].filter(Boolean);
  return types.includes('spoken');
}

function isPodcastSeries(media) {
  return mediaForms(media).includes('podcastseries');
}

function uniqueTagLabels(labels) {
  const seen = new Set();
  const out = [];
  for (const raw of labels || []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const canonical = getCanonicalTag(raw) || raw.trim().toLowerCase();
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(raw.trim());
  }
  return out;
}

function collectRankingTags(media) {
  if (!media) return [];

  if (isPodcastMedia(media)) {
    const series =
      media.podcastSeries && typeof media.podcastSeries === 'object'
        ? media.podcastSeries
        : null;
    const labels = [
      ...(Array.isArray(media.genres) ? media.genres : []),
      ...(Array.isArray(series?.genres) ? series.genres : []),
      ...(media.category ? [media.category] : []),
      ...(Array.isArray(media.tags) ? media.tags : []),
      ...(Array.isArray(series?.tags) ? series.tags : []),
    ];
    return uniqueTagLabels(labels).slice(0, MAX_RANKING_TAGS);
  }

  return uniqueTagLabels(media.tags || []).slice(0, MAX_RANKING_TAGS);
}

function percentileFor(rank, total) {
  if (!total || total <= 0) return 0;
  return parseFloat((((total - rank) / total) * 100).toFixed(1));
}

function rankingRow(tag, rank, total, aggregate) {
  return {
    tag,
    rank,
    total,
    percentile: percentileFor(rank, total),
    aggregate: aggregate || 0,
  };
}

const spokenActive = {
  contentType: { $in: ['spoken'] },
  status: { $nin: ['vetoed', 'deleted'] },
};

async function matchingSeriesIdsForTag(tag) {
  const canonical = getCanonicalTag(tag) || tag.toLowerCase();
  const variants = collectTagVariants(tag, canonical);
  const seriesQuery = {
    ...spokenActive,
    contentForm: { $in: SERIES_FORMS },
    $or: catalogMatchOr(variants),
  };

  const seriesPool = await Media.find(seriesQuery)
    .select('_id tags genres category')
    .lean();

  return seriesPool
    .filter((item) => itemMatchesTag(item, tag, { includeCatalogFields: true }))
    .map((item) => item._id);
}

async function rankMusicForTag(media, tag) {
  const aggregate = media.globalMediaAggregate || 0;
  const query = {
    tags: tag,
    contentType: { $in: ['music'] },
  };
  const [higherCount, total] = await Promise.all([
    Media.countDocuments({ ...query, globalMediaAggregate: { $gt: aggregate } }),
    Media.countDocuments(query),
  ]);
  const pool = Math.max(total, 1);
  const rank = Math.min(higherCount + 1, pool);
  return rankingRow(tag, rank, pool, aggregate);
}

async function rankPodcastEpisodeForTag(media, tag) {
  const canonical = getCanonicalTag(tag) || tag.toLowerCase();
  const variants = collectTagVariants(tag, canonical);
  const matchingSeriesIds = await matchingSeriesIdsForTag(tag);
  const episodeOr = catalogMatchOr(variants);
  if (matchingSeriesIds.length > 0) {
    episodeOr.push({ podcastSeries: { $in: matchingSeriesIds } });
  }

  const query = {
    ...spokenActive,
    contentForm: { $in: EPISODE_FORMS },
    $or: episodeOr,
  };
  const aggregate = media.globalMediaAggregate || 0;
  const [higherCount, total] = await Promise.all([
    Media.countDocuments({ ...query, globalMediaAggregate: { $gt: aggregate } }),
    Media.countDocuments(query),
  ]);
  const pool = Math.max(total, 1);
  const rank = Math.min(higherCount + 1, pool);
  return rankingRow(tag, rank, pool, aggregate);
}

async function seriesTipTotals(seriesIds) {
  if (!seriesIds.length) return new Map();
  const rows = await Media.aggregate([
    {
      $match: {
        podcastSeries: { $in: seriesIds },
        contentType: { $in: ['spoken'] },
        contentForm: { $in: EPISODE_FORMS },
        status: { $nin: ['vetoed', 'deleted'] },
      },
    },
    {
      $group: {
        _id: '$podcastSeries',
        total: { $sum: { $ifNull: ['$globalMediaAggregate', 0] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.total]));
}

async function rankPodcastSeriesForTag(series, tag) {
  const matchingIds = await matchingSeriesIdsForTag(tag);
  const seriesId = series._id;
  if (seriesId && !matchingIds.some((id) => String(id) === String(seriesId))) {
    matchingIds.push(seriesId);
  }
  if (matchingIds.length === 0) return null;

  const totals = await seriesTipTotals(matchingIds);
  const myTotal = totals.get(String(seriesId)) || 0;
  const higher = matchingIds.filter(
    (id) => (totals.get(String(id)) || 0) > myTotal
  ).length;
  return rankingRow(tag, higher + 1, matchingIds.length, myTotal);
}

async function getMediaTagRankings(media, { limit = 10 } = {}) {
  if (!media) return [];
  const tags = collectRankingTags(media);
  if (tags.length === 0) return [];

  const max = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 20);
  const rankings = [];

  if (isPodcastSeries(media)) {
    for (const tag of tags) {
      const row = await rankPodcastSeriesForTag(media, tag);
      if (row) rankings.push(row);
    }
  } else if (isPodcastMedia(media)) {
    for (const tag of tags) {
      rankings.push(await rankPodcastEpisodeForTag(media, tag));
    }
  } else {
    for (const tag of tags) {
      rankings.push(await rankMusicForTag(media, tag));
    }
  }

  rankings.sort((a, b) => a.rank - b.rank || b.aggregate - a.aggregate);
  return rankings.slice(0, max);
}

module.exports = {
  getMediaTagRankings,
  collectRankingTags,
  uniqueTagLabels,
  isPodcastMedia,
  isPodcastSeries,
  MAX_RANKING_TAGS,
  EPISODE_FORMS,
  SERIES_FORMS,
};
