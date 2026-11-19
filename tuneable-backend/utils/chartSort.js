const CHART_SORTS = ['most-tipped', 'most-tunebytes', 'newest', 'oldest'];

function normalizeChartSort(sortBy) {
  if (sortBy === 'newest' || sortBy === 'oldest' || sortBy === 'most-tipped' || sortBy === 'most-tunebytes') {
    return sortBy;
  }
  return 'most-tipped';
}

function dateMs(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function defaultChartDate(item) {
  if (!item || typeof item !== 'object') return null;
  return item.createdAt || item.uploadedAt || item.queuedAt || null;
}

function chartMediaLayers(item) {
  if (!item || typeof item !== 'object') return [];
  const layers = [item];
  if (item.media && typeof item.media === 'object') layers.push(item.media);
  if (item.mediaId && typeof item.mediaId === 'object') layers.push(item.mediaId);
  return layers;
}

function releaseYearDate(year) {
  const numeric = typeof year === 'number'
    ? year
    : typeof year === 'string' && /^\d{4}$/.test(year)
      ? Number(year)
      : NaN;
  if (!Number.isInteger(numeric) || numeric < 1900 || numeric > 2100) return null;
  return new Date(Date.UTC(numeric, 0, 1));
}

/** Full release date, then a year-only release, for newest/oldest tune charts. */
function chartReleaseDate(item) {
  const layers = chartMediaLayers(item);
  for (const media of layers) {
    if (media.releaseDate) return media.releaseDate;
  }
  for (const media of layers) {
    const yearDate = releaseYearDate(media.releaseYear);
    if (yearDate) return yearDate;
  }
  return null;
}

function defaultChartTip(item) {
  if (!item || typeof item !== 'object') return 0;
  if (typeof item.timePeriodBidValue === 'number') return item.timePeriodBidValue;
  if (typeof item.partyMediaAggregate === 'number') return item.partyMediaAggregate;
  if (typeof item.totalBidValue === 'number') return item.totalBidValue;
  if (typeof item.globalMediaAggregate === 'number') return item.globalMediaAggregate;
  return 0;
}

function defaultChartTuneBytes(item) {
  if (!item || typeof item !== 'object') return 0;
  if (typeof item.tuneBytesEarned === 'number') return item.tuneBytesEarned;
  return 0;
}

function compareChartItems(
  a,
  b,
  sortBy,
  getDate = defaultChartDate,
  getTip = defaultChartTip,
  getTuneBytes = defaultChartTuneBytes,
  getReleaseDate = null
) {
  const key = normalizeChartSort(sortBy);
  const tipA = getTip(a) || 0;
  const tipB = getTip(b) || 0;
  const tuneBytesA = getTuneBytes(a) || 0;
  const tuneBytesB = getTuneBytes(b) || 0;
  const addedA = dateMs(getDate(a));
  const addedB = dateMs(getDate(b));
  const useRelease = typeof getReleaseDate === 'function';
  const releaseA = useRelease ? dateMs(getReleaseDate(a)) : addedA;
  const releaseB = useRelease ? dateMs(getReleaseDate(b)) : addedB;

  if (key === 'newest' || key === 'oldest') {
    if (releaseA !== releaseB) {
      if (!releaseA) return 1;
      if (!releaseB) return -1;
      return key === 'newest' ? releaseB - releaseA : releaseA - releaseB;
    }
    return tipB - tipA;
  }

  if (key === 'most-tunebytes') {
    if (tuneBytesA !== tuneBytesB) return tuneBytesB - tuneBytesA;
    return addedB - addedA;
  }

  if (tipA !== tipB) return tipB - tipA;
  return addedB - addedA;
}

function sortChartItems(items, sortBy, accessors = {}) {
  const list = Array.isArray(items) ? [...items] : [];
  const getDate = accessors.getDate || defaultChartDate;
  const getTip = accessors.getTip || defaultChartTip;
  const getTuneBytes = accessors.getTuneBytes || defaultChartTuneBytes;
  const getReleaseDate = accessors.getReleaseDate || null;
  return list.sort((a, b) => compareChartItems(
    a,
    b,
    sortBy,
    getDate,
    getTip,
    getTuneBytes,
    getReleaseDate
  ));
}

function mediaChartMongoSort(sortBy) {
  const key = normalizeChartSort(sortBy);
  // Newest and oldest follow the release. Year-only and missing dates are
  // ordered by the chart query, which folds releaseYear into the same key and
  // keeps undated tunes last. Tip tie-breaks stay on createdAt.
  if (key === 'newest') return { releaseDate: -1, releaseYear: -1, globalMediaAggregate: -1 };
  if (key === 'oldest') return { releaseDate: 1, releaseYear: 1, globalMediaAggregate: -1 };
  if (key === 'most-tunebytes') return { tuneBytesEarned: -1, createdAt: -1, _id: 1 };
  // Newest tips win ties. Without createdAt, Mongo returns an arbitrary slice
  // of the many tunes that share the minimum tip, and those tunes vanish from
  // the capped chart and from search over that page.
  return { globalMediaAggregate: -1, createdAt: -1, _id: 1 };
}

module.exports = {
  CHART_SORTS,
  normalizeChartSort,
  dateMs,
  defaultChartDate,
  chartReleaseDate,
  defaultChartTip,
  defaultChartTuneBytes,
  compareChartItems,
  sortChartItems,
  mediaChartMongoSort,
};
