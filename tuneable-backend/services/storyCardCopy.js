/**
 * Copy + mode selection for shareable story / OG cards.
 * Pure functions — no I/O. Amounts on media aggregates are pence.
 */

const { isPodcastMedia, isPodcastSeries } = require('./mediaTagRankingsService');
const { isWrittenMedia } = require('../utils/mediaKinds');

const MAX_CHART_RANK = 10;
const MIN_CHART_POOL = 3;
const MIN_TIP_POUNDS = 0.01;
const TIP_STEP_POUNDS = 0.01;

const CITY_FEATURE_TYPES = new Set([
  'place',
  'locality',
  'district',
  'neighborhood',
  'neighbourhood',
]);

function penceToPounds(pence) {
  const n = typeof pence === 'number' && Number.isFinite(pence) ? pence : 0;
  return Math.round(n) / 100;
}

function formatPounds(pounds) {
  const n = typeof pounds === 'number' && Number.isFinite(pounds) ? pounds : 0;
  return `£${n.toFixed(2)}`;
}

function amountToTakeChampion(
  championAggregate,
  viewerAggregate = 0,
  minTip = MIN_TIP_POUNDS,
  step = TIP_STEP_POUNDS
) {
  const raw = championAggregate - viewerAggregate + step;
  return Math.max(minTip, Math.round(raw * 100) / 100);
}

function detectMediaKind(media) {
  if (isPodcastSeries(media)) return 'series';
  if (isPodcastMedia(media)) return 'episode';
  if (isWrittenMedia(media)) return 'book';
  return 'tune';
}

function kindLabel(kind) {
  if (kind === 'series') return 'PODCAST';
  if (kind === 'episode') return 'EPISODE';
  if (kind === 'book') return 'BOOK';
  return 'TUNE';
}

function canonicalMediaPath(kind, mediaId) {
  const id = mediaId == null ? '' : String(mediaId);
  if (kind === 'series') return `/podcast/${id}`;
  if (kind === 'episode') return `/podcasts/${id}`;
  if (kind === 'book') return `/book/${id}`;
  return `/tune/${id}`;
}

function creatorLabel(media) {
  if (!media) return '';
  if (typeof media.creatorDisplay === 'string' && media.creatorDisplay.trim()) {
    return media.creatorDisplay.trim();
  }

  const fromList = (list) => {
    if (!Array.isArray(list) || list.length === 0) return '';
    return list
      .map((entry) => (typeof entry === 'string' ? entry : entry?.name))
      .filter(Boolean)
      .join(', ');
  };

  return (
    fromList(media.host) ||
    fromList(media.author) ||
    fromList(media.artist) ||
    (typeof media.artist === 'string' ? media.artist : '') ||
    ''
  );
}

function isUsableRanking(row) {
  if (!row || typeof row.rank !== 'number' || typeof row.total !== 'number') return false;
  return row.rank >= 1 && row.rank <= MAX_CHART_RANK && row.total >= MIN_CHART_POOL;
}

function rankingScore(row, { isLocation = false } = {}) {
  if (!isUsableRanking(row)) return Number.POSITIVE_INFINITY;
  let score = row.rank;
  if (isLocation && CITY_FEATURE_TYPES.has(String(row.featureType || '').toLowerCase())) {
    score -= 0.25;
  }
  return score;
}

function pickBestChartRanking(tagRankings, locationRankings) {
  const tags = (Array.isArray(tagRankings) ? tagRankings : [])
    .filter(isUsableRanking)
    .map((row) => ({
      kind: 'tag',
      label: String(row.tag || '').trim(),
      rank: row.rank,
      total: row.total,
      score: rankingScore(row),
    }))
    .filter((row) => row.label);

  const locations = (Array.isArray(locationRankings) ? locationRankings : [])
    .filter(isUsableRanking)
    .map((row) => ({
      kind: 'location',
      label: String(row.name || '').trim(),
      rank: row.rank,
      total: row.total,
      featureType: row.featureType || null,
      score: rankingScore(row, { isLocation: true }),
    }))
    .filter((row) => row.label);

  const candidates = [...tags, ...locations].sort(
    (a, b) => a.score - b.score || (a.kind === 'tag' ? -1 : 1)
  );
  return candidates[0] || null;
}

function buildStoryCardCopy(input) {
  const kind = input?.kind || 'tune';
  const title = (input?.title && String(input.title).trim()) || 'Untitled';
  const artist = (input?.artist && String(input.artist).trim()) || '';
  const championPounds = penceToPounds(input?.championPence);
  const takeAmount =
    championPounds > 0 ? amountToTakeChampion(championPounds, 0) : 0;
  const chart = pickBestChartRanking(input?.tagRankings, input?.locationRankings);

  let mode = 'nowplaying';
  let kicker = kindLabel(kind);
  let stat = '';
  let cta = kind === 'tune' ? 'Listen & tip on Tuneable' : 'Listen & tip on Tuneable';

  if (chart) {
    mode = 'chart';
    kicker = chart.kind === 'location' ? 'NEAR YOU' : 'CHART';
    stat = `#${chart.rank} in ${chart.label}`;
    cta =
      takeAmount > 0
        ? `Tip ${formatPounds(takeAmount)} to take #1`
        : chart.kind === 'location'
          ? 'Tip to influence the charts near you'
          : 'Tip to climb the charts';
  } else if (takeAmount > 0) {
    mode = 'champion';
    kicker = 'CHAMPION';
    stat = `Tip ${formatPounds(takeAmount)} to take #1`;
    cta = 'Influence the charts on Tuneable';
  }

  return {
    mode,
    kind,
    kicker,
    title,
    artist,
    stat,
    cta,
    takeAmount,
    chart,
    kindLabel: kindLabel(kind),
  };
}

function buildShareCaption(copy, shareUrl) {
  const who = copy.artist ? `${copy.title} — ${copy.artist}` : copy.title;
  const hook = copy.stat || copy.cta;
  const url = shareUrl || 'https://tuneable.stream';
  return `${who}\n${hook}\n${url}`;
}

module.exports = {
  MAX_CHART_RANK,
  MIN_CHART_POOL,
  penceToPounds,
  formatPounds,
  amountToTakeChampion,
  detectMediaKind,
  kindLabel,
  canonicalMediaPath,
  creatorLabel,
  pickBestChartRanking,
  buildStoryCardCopy,
  buildShareCaption,
};
