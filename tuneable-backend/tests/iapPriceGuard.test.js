/**
 * IAP store-price floor. Wallet credit stays a fixed GBP amount; a local
 * price that converts far below that credit is refused.
 * Run: npx jest tests/iapPriceGuard.test.js
 */

const {
  assessStorePrice,
  storePriceFromApplePayload,
  priceFromGoogleOrder,
  resolveIapCreditPrice,
} = require('../services/iapPriceGuard');

describe('store price parsing', () => {
  it('reads Apple milliunits as major currency units', () => {
    expect(storePriceFromApplePayload({ price: 4990, currency: 'aud' })).toEqual({
      amountMajor: 4.99,
      currency: 'AUD',
      source: 'apple',
    });
  });

  it('reads a Google order total', () => {
    expect(
      priceFromGoogleOrder({
        total: { currencyCode: 'CAD', units: '4', nanos: 990000000 },
      })
    ).toEqual({
      amountMajor: 4.99,
      currency: 'CAD',
      source: 'google_order',
    });
  });
});

describe('assessStorePrice', () => {
  const aud = async () => 0.48;
  const usd = async () => 0.75;

  it('accepts a GBP price at the pack value', async () => {
    const result = await assessStorePrice({
      amountMajor: 4.99,
      currency: 'GBP',
      creditPence: 500,
    });
    expect(result.accepted).toBe(true);
    expect(result.paidPenceEstimate).toBe(499);
  });

  it('rejects a same-digits Australian price for a £5 credit', async () => {
    const result = await assessStorePrice({
      amountMajor: 4.99,
      currency: 'AUD',
      creditPence: 500,
      rateFor: aud,
    });
    expect(result.paidPenceEstimate).toBe(240);
    expect(result.accepted).toBe(false);
  });

  it('rejects a same-digits US $4.99 tier against a £5 credit', async () => {
    const result = await assessStorePrice({
      amountMajor: 4.99,
      currency: 'USD',
      creditPence: 500,
      rateFor: usd,
    });
    expect(result.paidPenceEstimate).toBe(374);
    expect(result.accepted).toBe(false);
  });

  it('accepts a US price near the pre-tax value of a £5 sticker', async () => {
    const result = await assessStorePrice({
      amountMajor: 6.49,
      currency: 'USD',
      creditPence: 500,
      rateFor: usd,
    });
    expect(result.paidPenceEstimate).toBe(487);
    expect(result.accepted).toBe(true);
  });

  it('accepts an equalised Australian price', async () => {
    const result = await assessStorePrice({
      amountMajor: 9.99,
      currency: 'AUD',
      creditPence: 500,
      rateFor: aud,
    });
    expect(result.paidPenceEstimate).toBe(480);
    expect(result.accepted).toBe(true);
  });
});

describe('resolveIapCreditPrice', () => {
  it('skips the floor for dev bypass', async () => {
    await expect(
      resolveIapCreditPrice({
        environment: 'dev_bypass',
        creditPence: 500,
        platform: 'ios',
      })
    ).resolves.toEqual({ priceCheck: 'dev_bypass' });
  });

  it('refuses a price under the floor without calling FX for GBP', async () => {
    await expect(
      resolveIapCreditPrice({
        environment: 'Production',
        storePrice: { amountMajor: 1, currency: 'GBP', source: 'apple' },
        creditPence: 500,
        platform: 'ios',
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'iap_price_too_low',
      message: expect.stringContaining('Apple'),
    });
  });
});
