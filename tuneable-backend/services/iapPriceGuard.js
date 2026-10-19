const { gbpPerMajorUnit } = require('./fxRateService');

/**
 * Customer payment must be at least this share of the GBP credit.
 * Apple equalizes other storefronts to the UK price before VAT, so a
 * no-tax country lands near 83% of a VAT-inclusive GBP sticker. 80% sits
 * just under that and still refuses a same-digits foreign price.
 */
const DEFAULT_MIN_PAID_RATIO = 0.8;

function minPaidRatio(override) {
  if (override != null) {
    const ratio = Number(override);
    if (Number.isFinite(ratio) && ratio > 0 && ratio <= 1) return ratio;
  }
  const fromEnv = Number(process.env.IAP_MIN_PAID_RATIO);
  if (Number.isFinite(fromEnv) && fromEnv > 0 && fromEnv <= 1) return fromEnv;
  return DEFAULT_MIN_PAID_RATIO;
}

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
 * Compare a store price to the GBP pack credit.
 * `rateFor` is optional so tests can supply a rate without calling Frankfurter.
 */
async function assessStorePrice({
  amountMajor,
  currency,
  creditPence,
  rateFor,
  minRatio,
}) {
  const paidMajor = Number(amountMajor);
  const credit = Number(creditPence);
  if (!Number.isFinite(paidMajor) || paidMajor < 0) {
    const err = new Error('Store price is missing');
    err.status = 422;
    err.code = 'iap_price_missing';
    throw err;
  }
  if (!Number.isFinite(credit) || credit <= 0) {
    const err = new Error('Invalid wallet credit');
    err.status = 500;
    throw err;
  }

  const code = String(currency || '').trim().toUpperCase();
  const lookup = rateFor || gbpPerMajorUnit;
  const rate = code === 'GBP' ? 1 : await lookup(code);
  const ratio = minPaidRatio(minRatio);
  const paidPenceEstimate = Math.round(paidMajor * rate * 100);
  const minPence = Math.ceil(credit * ratio);

  return {
    currency: code,
    amountMajor: paidMajor,
    gbpPerUnit: rate,
    paidPenceEstimate,
    minPence,
    minRatio: ratio,
    accepted: paidPenceEstimate >= minPence,
  };
}

function priceTooLowMessage(assessment, creditPence, platform) {
  const paid = (assessment.paidPenceEstimate / 100).toFixed(2);
  const credit = (creditPence / 100).toFixed(2);
  const charged = `${assessment.amountMajor} ${assessment.currency}`;
  const refund =
    platform === 'ios'
      ? 'Request a refund from Apple (Report a Problem).'
      : 'Google Play refunds an uncredited purchase within 3 days.';
  return `This store charged about £${paid} (${charged}) for a £${credit} wallet credit, so it was not added. ${refund}`;
}

/**
 * Decide whether a verified store purchase may be credited at its GBP face value.
 * Dev bypass and unpaid store grants (Play promo / reward / zero-price test)
 * skip the floor. A real price that converts too low is refused.
 */
async function resolveIapCreditPrice({
  environment,
  priceCheckSkip,
  storePrice,
  creditPence,
  platform,
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

  const assessment = await assessStorePrice({
    amountMajor: storePrice.amountMajor,
    currency: storePrice.currency,
    creditPence,
  });

  if (!assessment.accepted) {
    const err = new Error(priceTooLowMessage(assessment, creditPence, platform));
    err.status = 409;
    err.code = 'iap_price_too_low';
    throw err;
  }

  return {
    priceCheck: 'ok',
    storeCurrency: assessment.currency,
    storeAmountMajor: Math.round(assessment.amountMajor * 10000) / 10000,
    paidPenceEstimate: assessment.paidPenceEstimate,
    minPaidPence: assessment.minPence,
    gbpPerUnit: Number(assessment.gbpPerUnit.toFixed(6)),
    priceSource: storePrice.source || null,
  };
}

module.exports = {
  DEFAULT_MIN_PAID_RATIO,
  storePriceFromApplePayload,
  majorFromGoogleMoney,
  priceFromGoogleOrder,
  assessStorePrice,
  resolveIapCreditPrice,
};
