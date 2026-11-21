/**
 * Platform-wide average of active tips (GlobalBidAvg), in pounds.
 * Cached so tip sheets and library import don't aggregate on every open.
 */

const Bid = require('../models/Bid');

const CACHE_MS = 5 * 60 * 1000;
const FALLBACK_POUNDS = 1.11;

let cached = null;
let cachedAt = 0;
let inflight = null;

async function computeGlobalAverageTipPounds() {
  const rows = await Bid.aggregate([
    { $match: { status: 'active', amount: { $gt: 0 } } },
    { $group: { _id: null, average: { $avg: '$amount' } } },
  ]);
  const pence = rows[0]?.average;
  if (typeof pence !== 'number' || !Number.isFinite(pence) || pence <= 0) {
    return FALLBACK_POUNDS;
  }
  return Math.round(pence) / 100;
}

async function getGlobalAverageTipPounds() {
  const now = Date.now();
  if (cached != null && now - cachedAt < CACHE_MS) return cached;
  if (!inflight) {
    inflight = computeGlobalAverageTipPounds()
      .then((pounds) => {
        cached = pounds;
        cachedAt = Date.now();
        return pounds;
      })
      .catch((error) => {
        console.error('Error computing global average tip:', error);
        return cached ?? FALLBACK_POUNDS;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

module.exports = {
  getGlobalAverageTipPounds,
  FALLBACK_TIP_POUNDS: FALLBACK_POUNDS,
};
