/**
 * Collapse location-chart rows into the places where a creator ranks best.
 * Lowest rank wins. Equal ranks are listed coarse to fine (country, then city).
 * Podium ranks (#1–#3) are kept. A weaker best rank is used only when nothing charts that high.
 */

const PLACE_TYPE_ORDER = ['country', 'region', 'district', 'place', 'locality', 'neighborhood'];

function placeTypeIndex(placetype) {
  const index = PLACE_TYPE_ORDER.indexOf(placetype || '');
  return index === -1 ? PLACE_TYPE_ORDER.length : index;
}

function mergeBestLocationPlaces(rows, limit = 4) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 4, 1), 8);
  const best = new Map();

  for (const row of rows || []) {
    const placeId = typeof row?.placeId === 'string' ? row.placeId.trim() : '';
    const label = typeof row?.name === 'string' ? row.name.trim() : '';
    const rank = Number(row?.rank);
    if (!placeId || !label || !Number.isFinite(rank) || rank < 1) continue;

    const aggregate = Number(row.aggregate) || 0;
    const current = best.get(placeId);
    if (
      !current
      || rank < current.rank
      || (rank === current.rank && aggregate > current.aggregate)
    ) {
      best.set(placeId, {
        placeId,
        label,
        rank,
        aggregate,
        placetype: row.featureType || null,
      });
    }
  }

  const sorted = [...best.values()].sort(
    (a, b) => a.rank - b.rank
      || placeTypeIndex(a.placetype) - placeTypeIndex(b.placetype)
      || a.label.localeCompare(b.label)
  );
  const podium = sorted.filter((place) => place.rank <= 3);
  const chosen = (podium.length ? podium : sorted.slice(0, 1)).slice(0, cap);

  return chosen.map(({ placeId, label, rank, placetype }) => ({
    placeId,
    label,
    rank,
    placetype,
  }));
}

module.exports = { mergeBestLocationPlaces };
