const { gbpPerMajorUnit } = require('./fxRateService');

/** Store commission taken before the wallet is credited. Small-business rate unless overridden. */
const DEFAULT_STORE_COMMISSION = 0.15;

/**
 * VAT/GST already inside the sticker price. Apple storefronts are alpha-3;
 * Google region codes are alpha-2. Countries that add tax on top are absent.
 */
const INCLUDED_TAX_BY_CODE = {
  GB: 0.20, GBR: 0.20,
  DE: 0.19, DEU: 0.19,
  FR: 0.20, FRA: 0.20,
  IT: 0.22, ITA: 0.22,
  ES: 0.21, ESP: 0.21,
  NL: 0.21, NLD: 0.21,
  IE: 0.23, IRL: 0.23,
  BE: 0.21, BEL: 0.21,
  AT: 0.20, AUT: 0.20,
  PT: 0.23, PRT: 0.23,
  FI: 0.255, FIN: 0.255,
  SE: 0.25, SWE: 0.25,
  DK: 0.25, DNK: 0.25,
  NO: 0.25, NOR: 0.25,
  PL: 0.23, POL: 0.23,
  HU: 0.27, HUN: 0.27,
  CZ: 0.21, CZE: 0.21,
  GR: 0.24, GRC: 0.24,
  RO: 0.19, ROU: 0.19,
  AU: 0.10, AUS: 0.10,
  NZ: 0.15, NZL: 0.15,
  CH: 0.081, CHE: 0.081,
  JP: 0.10, JPN: 0.10,
  IN: 0.18, IND: 0.18,
  ZA: 0.15, ZAF: 0.15,
  KR: 0.10, KOR: 0.10,
  SG: 0.09, SGP: 0.09,
  MX: 0.16, MEX: 0.16,
};

/** Used only when the receipt has no storefront. EUR uses 20% so a preview does not over-credit. */
const INCLUDED_TAX_BY_CURRENCY = {
  GBP: 0.20,
  EUR: 0.20,
  SEK: 0.25,
  NOK: 0.25,
  DKK: 0.25,
  AUD: 0.10,
  NZD: 0.15,
  CHF: 0.081,
  JPY: 0.10,
  PLN: 0.23,
  HUF: 0.27,
  CZK: 0.21,
  INR: 0.18,
  ZAR: 0.15,
  KRW: 0.10,
  SGD: 0.09,
  MXN: 0.16,
};

function storeCommissionRate(override) {
  if (override != null && override !== '') {
    const n = Number(override);
    if (Number.isFinite(n) && n >= 0 && n < 1) return n;
  }
  const fromEnv = Number(process.env.IAP_STORE_COMMISSION_RATE);
  if (Number.isFinite(fromEnv) && fromEnv >= 0 && fromEnv < 1) return fromEnv;
  return DEFAULT_STORE_COMMISSION;
}

function includedTaxRate({ storefront, currency } = {}) {
  if (storefront) {
    const code = String(storefront).trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(INCLUDED_TAX_BY_CODE, code)
      ? INCLUDED_TAX_BY_CODE[code]
      : 0;
  }
  const cur = String(currency || '').trim().toUpperCase();
  return INCLUDED_TAX_BY_CURRENCY[cur] || 0;
}

/**
 * Pence Tuneable actually receives from a customer price already converted to GBP.
 * Tax-inclusive storefronts are divided back out before the store commission.
 */
function proceedsPenceFromCustomerPence(customerPence, { storefront, currency, commissionRate } = {}) {
  const gross = Math.max(0, Math.round(Number(customerPence) || 0));
  const tax = includedTaxRate({ storefront, currency });
  const commission = storeCommissionRate(commissionRate);
  const proceeds = (gross / (1 + tax)) * (1 - commission);
  return {
    creditPence: Math.max(0, Math.round(proceeds)),
    includedTaxRate: tax,
    commissionRate: commission,
  };
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
 * Pound value of a store price, at the mid-market rate, then the proceeds
 * after the store's commission and any tax included in that price.
 * `rateFor` is optional so tests can supply a rate without calling Frankfurter.
 * The wallet is credited `creditPence`, not the pack face and not the
 * customer's sticker price. Crediting either would promise artists money
 * the store never paid us.
 */
async function assessStorePrice({
  amountMajor,
  currency,
  storefront,
  commissionRate,
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
  const proceeds = proceedsPenceFromCustomerPence(paidPenceEstimate, {
    storefront,
    currency: code,
    commissionRate,
  });

  return {
    currency: code,
    amountMajor: paidMajor,
    gbpPerUnit: rate,
    paidPenceEstimate,
    creditPence: proceeds.creditPence,
    storeFeePence: Math.max(0, paidPenceEstimate - proceeds.creditPence),
    includedTaxRate: proceeds.includedTaxRate,
    commissionRate: proceeds.commissionRate,
    accepted: proceeds.creditPence > 0,
  };
}

/**
 * Pounds to credit for a verified store purchase: proceeds after store
 * commission and included tax, in pounds. Dev bypass and unpaid store grants
 * (Play promo / reward / zero-price test) leave the credit to the caller,
 * which uses the pack face value. A real charge of zero is refused.
 */
async function resolveIapCreditPrice({
  environment,
  priceCheckSkip,
  storePrice,
  storefront,
  commissionRate,
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
    storefront: storefront || storePrice.storefront || null,
    commissionRate,
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
    creditPence: assessment.creditPence,
    storeFeePence: assessment.storeFeePence,
    commissionRate: assessment.commissionRate,
    includedTaxRate: assessment.includedTaxRate,
    storeCurrency: assessment.currency,
    storeAmountMajor: Math.round(assessment.amountMajor * 10000) / 10000,
    paidPenceEstimate: assessment.paidPenceEstimate,
    gbpPerUnit: Number(assessment.gbpPerUnit.toFixed(6)),
    fxAsOf: quote.asOf,
    fxSource: quote.source,
    priceSource: storePrice.source || null,
    storefront: storefront || storePrice.storefront || null,
  };
}

module.exports = {
  storePriceFromApplePayload,
  majorFromGoogleMoney,
  priceFromGoogleOrder,
  assessStorePrice,
  resolveIapCreditPrice,
  proceedsPenceFromCustomerPence,
  DEFAULT_STORE_COMMISSION,
};
