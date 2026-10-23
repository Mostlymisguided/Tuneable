/**
 * Store top-ups credit the pound value of the price charged, not the pack face.
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

  it('credits a GBP price at the amount charged', async () => {
    const result = await assessStorePrice({
      amountMajor: 4.99,
      currency: 'GBP',
    });
    expect(result.accepted).toBe(true);
    expect(result.paidPenceEstimate).toBe(499);
  });

  it('credits a same-digits Australian price at its pound value', async () => {
    const result = await assessStorePrice({
      amountMajor: 4.99,
      currency: 'AUD',
      rateFor: aud,
    });
    expect(result.paidPenceEstimate).toBe(240);
    expect(result.accepted).toBe(true);
  });

  it('credits a US $4.99 charge at its pound value, not £5', async () => {
    const result = await assessStorePrice({
      amountMajor: 4.99,
      currency: 'USD',
      rateFor: usd,
    });
    expect(result.paidPenceEstimate).toBe(374);
    expect(result.accepted).toBe(true);
  });

  it('refuses a zero price', async () => {
    const result = await assessStorePrice({
      amountMajor: 0,
      currency: 'USD',
      rateFor: usd,
    });
    expect(result.paidPenceEstimate).toBe(0);
    expect(result.accepted).toBe(false);
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

  it('records an identity rate when the customer paid pounds', async () => {
    const result = await resolveIapCreditPrice({
      environment: 'Production',
      storePrice: { amountMajor: 5, currency: 'GBP', source: 'apple' },
    });
    expect(result.priceCheck).toBe('ok');
    expect(result.creditPence).toBe(500);
    expect(result.paidPenceEstimate).toBe(500);
    expect(result.fxSource).toBe('identity');
    expect(result.fxAsOf).toBeNull();
  });

  it('credits the pounds charged when that is below the pack face', async () => {
    const result = await resolveIapCreditPrice({
      environment: 'Production',
      storePrice: { amountMajor: 1, currency: 'GBP', source: 'apple' },
    });
    expect(result.priceCheck).toBe('ok');
    expect(result.creditPence).toBe(100);
  });

  it('refuses a zero price', async () => {
    await expect(
      resolveIapCreditPrice({
        environment: 'Production',
        storePrice: { amountMajor: 0, currency: 'GBP', source: 'apple' },
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'iap_price_missing',
    });
  });
});
