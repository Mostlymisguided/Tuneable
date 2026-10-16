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
  getTuneBytes = defaultChartTuneBytes
) {
  const key = normalizeChartSort(sortBy);
  const tipA = getTip(a) || 0;
  const tipB = getTip(b) || 0;
  const tuneBytesA = getTuneBytes(a) || 0;
  const tuneBytesB = getTuneBytes(b) || 0;
  const dateA = dateMs(getDate(a));
  const dateB = dateMs(getDate(b));

  if (key === 'newest' || key === 'oldest') {
    if (dateA !== dateB) {
      if (!dateA) return 1;
      if (!dateB) return -1;
      return key === 'newest' ? dateB - dateA : dateA - dateB;
    }
    return tipB - tipA;
  }

  if (key === 'most-tunebytes') {
    if (tuneBytesA !== tuneBytesB) return tuneBytesB - tuneBytesA;
    return dateB - dateA;
  }

  if (tipA !== tipB) return tipB - tipA;
  return dateB - dateA;
}

function sortChartItems(items, sortBy, accessors = {}) {
  const list = Array.isArray(items) ? [...items] : [];
  const getDate = accessors.getDate || defaultChartDate;
  const getTip = accessors.getTip || defaultChartTip;
  const getTuneBytes = accessors.getTuneBytes || defaultChartTuneBytes;
  return list.sort((a, b) => compareChartItems(a, b, sortBy, getDate, getTip, getTuneBytes));
}

function mediaChartMongoSort(sortBy) {
  const key = normalizeChartSort(sortBy);
  if (key === 'newest') return { createdAt: -1, uploadedAt: -1, globalMediaAggregate: -1 };
  if (key === 'oldest') return { createdAt: 1, uploadedAt: 1, globalMediaAggregate: -1 };
  if (key === 'most-tunebytes') return { tuneBytesEarned: -1, createdAt: -1 };
  return { globalMediaAggregate: -1 };
}

module.exports = {
  CHART_SORTS,
  normalizeChartSort,
  dateMs,
  defaultChartDate,
  defaultChartTip,
  defaultChartTuneBytes,
  compareChartItems,
  sortChartItems,
  mediaChartMongoSort,
};
