const axios = require('axios');

const FRANKFURTER_URL = 'https://api.frankfurter.app/latest';
const LIVE_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Last-resort GBP value of 1 major unit, used only when Frankfurter has no
 * quote (the feed is down, or the currency is outside the ECB set).
 * Figures are intentionally a little low so a stale rate does not make a
 * cheap foreign price look like a fair one. Live rates replace these.
 */
const FALLBACK_GBP_PER_UNIT = {
  USD: 0.74,
  EUR: 0.84,
  AUD: 0.48,
  CAD: 0.54,
  NZD: 0.44,
  JPY: 0.005,
  CHF: 0.88,
  SEK: 0.072,
  NOK: 0.07,
  DKK: 0.11,
  PLN: 0.19,
  CZK: 0.033,
  HUF: 0.0021,
  CNY: 0.1,
  HKD: 0.095,
  SGD: 0.56,
  INR: 0.0088,
  MXN: 0.037,
  BRL: 0.13,
  ZAR: 0.041,
  KRW: 0.00053,
  THB: 0.022,
  MYR: 0.17,
  IDR: 0.000046,
  PHP: 0.013,
  ILS: 0.21,
  RON: 0.17,
  BGN: 0.43,
  ISK: 0.0055,
  TRY: 0.018,
  AED: 0.2,
  SAR: 0.2,
  QAR: 0.2,
  KWD: 2.4,
  BHD: 1.95,
  OMR: 1.9,
  EGP: 0.015,
  NGN: 0.00048,
  KES: 0.0057,
  TWD: 0.023,
  CLP: 0.00078,
  COP: 0.00018,
  PEN: 0.2,
  VND: 0.000029,
  PKR: 0.0026,
  UAH: 0.018,
  ARS: 0.0007,
  BDT: 0.0062,
  LKR: 0.0025,
  MAD: 0.074,
  JOD: 1.04,
  GHS: 0.048,
  TZS: 0.00028,
  UGX: 0.0002,
  XAF: 0.00125,
  XOF: 0.00125,
  ZMW: 0.027,
  DOP: 0.012,
  CRC: 0.0014,
  GTQ: 0.096,
  HNL: 0.029,
  PAB: 0.74,
  BOB: 0.11,
  PYG: 0.0001,
  UYU: 0.018,
  RSD: 0.007,
  DZD: 0.0055,
  TND: 0.24,
  RUB: 0.008,
};

let cache = null;
const fallbackWarnings = new Set();

function resetFxCacheForTests() {
  cache = null;
  fallbackWarnings.clear();
}

async function loadLiveRates() {
  if (cache && Date.now() - cache.fetchedAt < LIVE_TTL_MS) {
    return cache.gbpPerUnit;
  }

  try {
    const response = await axios.get(FRANKFURTER_URL, {
      params: { from: 'GBP' },
      timeout: 8000,
    });
    const rates = response.data?.rates;
    if (!rates || typeof rates !== 'object') {
      throw new Error('Frankfurter returned no rates');
    }

    const gbpPerUnit = {};
    for (const [code, foreignPerGbp] of Object.entries(rates)) {
      const perGbp = Number(foreignPerGbp);
      if (perGbp > 0) gbpPerUnit[String(code).toUpperCase()] = 1 / perGbp;
    }
    cache = { fetchedAt: Date.now(), gbpPerUnit };
    return gbpPerUnit;
  } catch (err) {
    if (cache && Date.now() - cache.fetchedAt < STALE_TTL_MS) {
      console.warn('FX: Frankfurter unavailable, using cached rates:', err.message);
      return cache.gbpPerUnit;
    }
    console.warn('FX: Frankfurter unavailable:', err.message);
    return null;
  }
}

/**
 * How many pounds one major unit of `currency` is worth (1.00 USD → ~0.74).
 * GBP is 1. Throws status 422 for a bad code and 503 when no rate exists.
 */
async function gbpPerMajorUnit(currency) {
  const code = String(currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    const err = new Error('Store currency is missing');
    err.status = 422;
    err.code = 'iap_price_missing';
    throw err;
  }
  if (code === 'GBP') return 1;

  const live = await loadLiveRates();
  if (live && live[code]) return live[code];

  const fallback = FALLBACK_GBP_PER_UNIT[code];
  if (fallback) {
    if (!fallbackWarnings.has(code)) {
      fallbackWarnings.add(code);
      console.warn(`FX: using fallback GBP rate for ${code}`);
    }
    return fallback;
  }

  const err = new Error(`No GBP exchange rate for ${code}, so the wallet was not credited`);
  err.status = 503;
  err.code = 'iap_fx_unavailable';
  throw err;
}

module.exports = {
  gbpPerMajorUnit,
  resetFxCacheForTests,
  FALLBACK_GBP_PER_UNIT,
};
