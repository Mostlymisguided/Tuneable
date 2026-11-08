/**
 * Run: npx jest tests/revenueSplit.test.js
 */

const {
  ARTIST_SHARE_PERCENTAGE,
  PLATFORM_SHARE_PERCENTAGE,
  normalizePerkFundTipPercent,
  planPerkFundSplit,
} = require('../utils/revenueSplit');

describe('revenue split', () => {
  it('keeps 80% for artists and 20% for the platform', () => {
    expect(ARTIST_SHARE_PERCENTAGE).toBe(0.8);
    expect(PLATFORM_SHARE_PERCENTAGE).toBe(0.2);
    expect(ARTIST_SHARE_PERCENTAGE + PLATFORM_SHARE_PERCENTAGE).toBe(1);
  });

  it('accepts a whole-number perk-fund share inside the artist 80%', () => {
    expect(normalizePerkFundTipPercent(0)).toBe(0);
    expect(normalizePerkFundTipPercent('40')).toBe(40);
    expect(normalizePerkFundTipPercent(80)).toBe(80);
    expect(normalizePerkFundTipPercent(null)).toBe(0);
  });

  it('refuses a share above the artist 80% or a fraction', () => {
    expect(() => normalizePerkFundTipPercent(81)).toThrow(/0 to 80/);
    expect(() => normalizePerkFundTipPercent(12.5)).toThrow(/whole number/);
    expect(() => normalizePerkFundTipPercent(-1)).toThrow(/0 to 80/);
  });

  it('earmarks only the paid artist share, and leaves the rest as cash', () => {
    const split = planPerkFundSplit({
      bidAmountPence: 100,
      artistSharePence: 80,
      paidArtistSharePence: 40,
      perkFundTipPercent: 80,
    });
    expect(split.fundPence).toBe(40);
    expect(split.cashPence).toBe(40);
  });

  it('puts nothing in the fund when the creator leaves the dial at zero', () => {
    const split = planPerkFundSplit({
      bidAmountPence: 250,
      artistSharePence: 200,
      perkFundTipPercent: 0,
    });
    expect(split.fundPence).toBe(0);
    expect(split.cashPence).toBe(200);
  });
});
