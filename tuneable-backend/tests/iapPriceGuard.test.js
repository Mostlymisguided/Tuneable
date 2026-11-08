/**
 * Store top-ups credit proceeds after commission and included tax, in pounds.
 * Run: npx jest tests/iapPriceGuard.test.js
 */

const COMMISSION = 0.15;

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

  it('credits GBP proceeds after UK VAT and the store commission', async () => {
    const result = await assessStorePrice({
      amountMajor: 4.99,
      currency: 'GBP',
      commissionRate: COMMISSION,
    });
    expect(result.accepted).toBe(true);
    expect(result.paidPenceEstimate).toBe(499);
    expect(result.includedTaxRate).toBe(0.2);
    expect(result.creditPence).toBe(353);
    expect(result.storeFeePence).toBe(146);
  });

  it('credits Australian proceeds after GST and the store commission', async () => {
    const result = await assessStorePrice({
      amountMajor: 4.99,
      currency: 'AUD',
      rateFor: aud,
      commissionRate: COMMISSION,
    });
    expect(result.paidPenceEstimate).toBe(240);
    expect(result.creditPence).toBe(185);
    expect(result.accepted).toBe(true);
  });

  it('does not take US sales tax out of a dollar price', async () => {
    const result = await assessStorePrice({
      amountMajor: 4.99,
      currency: 'USD',
      storefront: 'USA',
      rateFor: usd,
      commissionRate: COMMISSION,
    });
    expect(result.paidPenceEstimate).toBe(374);
    expect(result.includedTaxRate).toBe(0);
    expect(result.creditPence).toBe(318);
    expect(result.accepted).toBe(true);
  });

  it('refuses a zero price', async () => {
    const result = await assessStorePrice({
      amountMajor: 0,
      currency: 'USD',
      rateFor: usd,
      commissionRate: COMMISSION,
    });
    expect(result.paidPenceEstimate).toBe(0);
    expect(result.creditPence).toBe(0);
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

  it('records an identity rate and credits proceeds when the customer paid pounds', async () => {
    const result = await resolveIapCreditPrice({
      environment: 'Production',
      storePrice: { amountMajor: 5, currency: 'GBP', source: 'apple' },
      storefront: 'GBR',
      commissionRate: COMMISSION,
    });
    expect(result.priceCheck).toBe('ok');
    expect(result.paidPenceEstimate).toBe(500);
    expect(result.creditPence).toBe(354);
    expect(result.fxSource).toBe('identity');
    expect(result.fxAsOf).toBeNull();
  });

  it('credits proceeds below both the pack face and the price charged', async () => {
    const result = await resolveIapCreditPrice({
      environment: 'Production',
      storePrice: { amountMajor: 1, currency: 'GBP', source: 'apple' },
      storefront: 'GBR',
      commissionRate: COMMISSION,
    });
    expect(result.priceCheck).toBe('ok');
    expect(result.paidPenceEstimate).toBe(100);
    expect(result.creditPence).toBe(71);
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
