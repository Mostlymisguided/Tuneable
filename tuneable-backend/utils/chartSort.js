const CHART_SORTS = ['most-tipped', 'newest', 'oldest'];

function normalizeChartSort(sortBy) {
  if (sortBy === 'newest' || sortBy === 'oldest' || sortBy === 'most-tipped') {
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

function compareChartItems(
  a,
  b,
  sortBy,
  getDate = defaultChartDate,
  getTip = defaultChartTip
) {
  const key = normalizeChartSort(sortBy);
  const tipA = getTip(a) || 0;
  const tipB = getTip(b) || 0;
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

  if (tipA !== tipB) return tipB - tipA;
  return dateB - dateA;
}

function sortChartItems(items, sortBy, accessors = {}) {
  const list = Array.isArray(items) ? [...items] : [];
  const getDate = accessors.getDate || defaultChartDate;
  const getTip = accessors.getTip || defaultChartTip;
  return list.sort((a, b) => compareChartItems(a, b, sortBy, getDate, getTip));
}

function mediaChartMongoSort(sortBy) {
  const key = normalizeChartSort(sortBy);
  if (key === 'newest') return { createdAt: -1, globalMediaAggregate: -1 };
  if (key === 'oldest') return { createdAt: 1, globalMediaAggregate: -1 };
  return { globalMediaAggregate: -1 };
}

module.exports = {
  CHART_SORTS,
  normalizeChartSort,
  dateMs,
  defaultChartDate,
  defaultChartTip,
  compareChartItems,
  sortChartItems,
  mediaChartMongoSort,
};
