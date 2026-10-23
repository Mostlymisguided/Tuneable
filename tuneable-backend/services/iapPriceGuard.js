const { gbpPerMajorUnit } = require('./fxRateService');

/**
 * Apple StoreKit price is milliunits of the major currency unit (4990 → 4.99).
 */
function storePriceFromApplePayload(payload) {
  if (!payload || payload.price == null || !payload.currency) return null;
  const milli = Number(payload.price);
  if (!Number.isFinite(milli)) return null;
  return {
    amountMajor: milli / 1000,
    currency: String(payload.currency).toUpperCase(),
    source: 'apple',
  };
}

function majorFromGoogleMoney(money) {
  if (!money || typeof money !== 'object') return null;
  const currency = money.currencyCode || money.currency;
  if (!currency) return null;
  const units = money.units == null || money.units === '' ? 0 : Number(money.units);
  const nanos = money.nanos == null ? 0 : Number(money.nanos);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  return {
    amountMajor: units + nanos / 1e9,
    currency: String(currency).toUpperCase(),
  };
}

function priceFromGoogleOrder(order) {
  const total = majorFromGoogleMoney(order?.total);
  if (total) return { ...total, source: 'google_order' };

  const items = Array.isArray(order?.lineItems) ? order.lineItems : [];
  let amountMajor = 0;
  let currency = null;
  for (const item of items) {
    const money = majorFromGoogleMoney(item?.total) || majorFromGoogleMoney(item?.listingPrice);
    if (!money) continue;
    if (currency && currency !== money.currency) return null;
    currency = money.currency;
    amountMajor += money.amountMajor;
  }
  if (!currency) return null;
  return { amountMajor, currency, source: 'google_order' };
}

/**
 * Pound value of a store price, at the mid-market rate.
 * `rateFor` is optional so tests can supply a rate without calling Frankfurter.
 * The wallet is credited this amount, not the pack's face value. A US $4.99
 * pack is worth less than £5 while the pound is strong, and crediting £5
 * would be a balance we had not been paid.
 */
async function assessStorePrice({
  amountMajor,
  currency,
  rateFor,
}) {
  const paidMajor = Number(amountMajor);
  if (!Number.isFinite(paidMajor) || paidMajor < 0) {
    const err = new Error('Store price is missing');
    err.status = 422;
    err.code = 'iap_price_missing';
    throw err;
  }

  const code = String(currency || '').trim().toUpperCase();
  const lookup = rateFor || gbpPerMajorUnit;
  const rate = code === 'GBP' ? 1 : await lookup(code);
  const paidPenceEstimate = Math.round(paidMajor * rate * 100);

  return {
    currency: code,
    amountMajor: paidMajor,
    gbpPerUnit: rate,
    paidPenceEstimate,
    accepted: paidPenceEstimate > 0,
  };
}

/**
 * Pounds to credit for a verified store purchase: the mid-market value of
 * the price the customer was charged. Dev bypass and unpaid store grants
 * (Play promo / reward / zero-price test) leave the credit to the caller,
 * which uses the pack face value. A real charge of zero is refused.
 */
async function resolveIapCreditPrice({
  environment,
  priceCheckSkip,
  storePrice,
}) {
  if (environment === 'dev_bypass') {
    return { priceCheck: 'dev_bypass' };
  }
  if (priceCheckSkip) {
    return { priceCheck: priceCheckSkip };
  }
  if (!storePrice || !Number.isFinite(Number(storePrice.amountMajor))) {
    const err = new Error(
      'The store did not include a price for this purchase, so the wallet was not credited.'
    );
    err.status = 422;
    err.code = 'iap_price_missing';
    throw err;
  }

  const { quoteGbp } = require('./fxRateService');
  const quote = await quoteGbp(storePrice.currency);
  const assessment = await assessStorePrice({
    amountMajor: storePrice.amountMajor,
    currency: storePrice.currency,
    rateFor: async () => quote.gbpPerUnit,
  });

  if (!assessment.accepted) {
    const err = new Error('This store purchase had no price, so the wallet was not credited.');
    err.status = 409;
    err.code = 'iap_price_missing';
    throw err;
  }

  return {
    priceCheck: 'ok',
    creditPence: assessment.paidPenceEstimate,
    storeCurrency: assessment.currency,
    storeAmountMajor: Math.round(assessment.amountMajor * 10000) / 10000,
    paidPenceEstimate: assessment.paidPenceEstimate,
    gbpPerUnit: Number(assessment.gbpPerUnit.toFixed(6)),
    fxAsOf: quote.asOf,
    fxSource: quote.source,
    priceSource: storePrice.source || null,
  };
}

module.exports = {
  storePriceFromApplePayload,
  majorFromGoogleMoney,
  priceFromGoogleOrder,
  assessStorePrice,
  resolveIapCreditPrice,
};
