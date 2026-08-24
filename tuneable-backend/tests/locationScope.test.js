const {
  LOCATION_SCOPES,
  normalizeLocationScope,
  locationScopeIncludesOrigin,
  locationScopeIncludesTips,
  locationScopeRanksByLocalTips,
} = require('../utils/locationScope');

describe('locationScope', () => {
  it('exposes the three chart scopes', () => {
    expect(LOCATION_SCOPES).toEqual(['in', 'from', 'supported-by']);
  });

  it('defaults unknown values to in', () => {
    expect(normalizeLocationScope(undefined)).toBe('in');
    expect(normalizeLocationScope('')).toBe('in');
    expect(normalizeLocationScope('nope')).toBe('in');
    expect(normalizeLocationScope('IN')).toBe('in');
  });

  it('accepts from and supported-by aliases', () => {
    expect(normalizeLocationScope('From')).toBe('from');
    expect(normalizeLocationScope('supported-by')).toBe('supported-by');
    expect(normalizeLocationScope('supported_by')).toBe('supported-by');
    expect(normalizeLocationScope('supportedBy')).toBe('supported-by');
  });

  it('treats in as the union of origin and tips', () => {
    expect(locationScopeIncludesOrigin('in')).toBe(true);
    expect(locationScopeIncludesTips('in')).toBe(true);
    expect(locationScopeRanksByLocalTips('in')).toBe(false);
  });

  it('treats from as origin only', () => {
    expect(locationScopeIncludesOrigin('from')).toBe(true);
    expect(locationScopeIncludesTips('from')).toBe(false);
    expect(locationScopeRanksByLocalTips('from')).toBe(false);
  });

  it('treats supported-by as local tips only', () => {
    expect(locationScopeIncludesOrigin('supported-by')).toBe(false);
    expect(locationScopeIncludesTips('supported-by')).toBe(true);
    expect(locationScopeRanksByLocalTips('supported-by')).toBe(true);
  });
});
