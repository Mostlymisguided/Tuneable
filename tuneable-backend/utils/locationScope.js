const LOCATION_SCOPES = ['in', 'from', 'supported-by'];

function normalizeLocationScope(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'from') return 'from';
  if (raw === 'supported-by' || raw === 'supported_by' || raw === 'supportedby') {
    return 'supported-by';
  }
  return 'in';
}

function locationScopeIncludesOrigin(scope) {
  const normalized = normalizeLocationScope(scope);
  return normalized === 'in' || normalized === 'from';
}

function locationScopeIncludesTips(scope) {
  const normalized = normalizeLocationScope(scope);
  return normalized === 'in' || normalized === 'supported-by';
}

function locationScopeRanksByLocalTips(scope) {
  return normalizeLocationScope(scope) === 'supported-by';
}

module.exports = {
  LOCATION_SCOPES,
  normalizeLocationScope,
  locationScopeIncludesOrigin,
  locationScopeIncludesTips,
  locationScopeRanksByLocalTips,
};
