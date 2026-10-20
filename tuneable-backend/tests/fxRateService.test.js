/**
 * Pound conversion used for payout quotes and the top-up price record.
 * Run: npx jest tests/fxRateService.test.js
 */

const { foreignMajorFromGbpPence, quoteGbp } = require('../services/fxRateService');

describe('foreignMajorFromGbpPence', () => {
  it('converts a pound balance into foreign units', () => {
    expect(foreignMajorFromGbpPence(500, 0.75, 'USD')).toBe(6.67);
  });

  it('rounds zero-decimal currencies to a whole unit', () => {
    expect(foreignMajorFromGbpPence(500, 0.005, 'JPY')).toBe(1000);
  });

  it('returns null when the rate is missing', () => {
    expect(foreignMajorFromGbpPence(500, 0, 'USD')).toBeNull();
  });
});

describe('quoteGbp', () => {
  it('treats pounds as one pound per pound', async () => {
    await expect(quoteGbp('gbp')).resolves.toEqual({
      currency: 'GBP',
      gbpPerUnit: 1,
      asOf: null,
      source: 'identity',
    });
  });
});
