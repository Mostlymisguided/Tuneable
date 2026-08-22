/**
 * Pure TuneBytes math. No DB.
 *
 * TuneBytes reward later growth on a track you already tipped, not your own tip.
 *
 * Formula:
 *   subsequentGrowth = currentTotal − value at (and including) your tip
 *   TuneBytes = subsequentGrowth × ∛(your tip in pence) × discoveryBonus
 *
 * Discovery bonus: 1 + e^(−rank / 10)
 */

const TUNEBYTES_FORMULA =
  '(currentTotal - bidTimeTotal - userBid) * ∛(userBidPence) * discoveryBonus';

function getDiscoveryBonus(rank) {
  return 1 + Math.exp(-rank / 10);
}

function sumAmounts(bids) {
  return bids.reduce((sum, bid) => sum + (bid.amount || 0), 0);
}

function bidIdEquals(left, right) {
  return String(left) === String(right);
}

function inactiveTuneBytesResult(reason = 'bid_not_active') {
  return {
    tuneBytesEarned: 0,
    calculation: {
      currentTotalValue: 0,
      bidTimeTotalValue: 0,
      subsequentGrowth: 0,
      userBidAmount: 0,
      userBidPence: 0,
      discoveryRank: 0,
      discoveryBonus: 1,
      totalBidsOnMedia: 0,
      timeElapsed: 0,
      formula: TUNEBYTES_FORMULA,
      inactiveReason: reason,
    },
  };
}

/**
 * @param {string|object} bidId
 * @param {Array<{ _id: object, amount: number, createdAt?: Date }>} allActiveBidsSorted
 *   Active bids on the media, earliest first.
 * @param {{ now?: Date }} [options]
 */
function computeTuneBytesFromBids(bidId, allActiveBidsSorted, { now = new Date() } = {}) {
  const bids = Array.isArray(allActiveBidsSorted) ? allActiveBidsSorted : [];
  const bidIndex = bids.findIndex((bid) => bidIdEquals(bid._id, bidId));

  if (bidIndex === -1) {
    return inactiveTuneBytesResult('bid_not_active');
  }

  const bid = bids[bidIndex];
  const userBidPence = bid.amount || 0;
  const bidTimeTotalValue = sumAmounts(bids.slice(0, bidIndex));
  const currentTotalValue = sumAmounts(bids);
  const subsequentGrowth = Math.max(0, currentTotalValue - bidTimeTotalValue - userBidPence);
  const discoveryRank = bidIndex + 1;
  const discoveryBonus = getDiscoveryBonus(discoveryRank);
  const tuneBytesEarned = Math.max(
    0,
    subsequentGrowth * Math.cbrt(userBidPence) * discoveryBonus
  );

  const bidTime = bid.createdAt ? new Date(bid.createdAt) : now;
  const timeElapsed = Math.round((now.getTime() - bidTime.getTime()) / (1000 * 60 * 60));

  return {
    tuneBytesEarned,
    calculation: {
      currentTotalValue,
      bidTimeTotalValue,
      subsequentGrowth,
      userBidAmount: userBidPence / 100,
      userBidPence,
      discoveryRank,
      discoveryBonus,
      totalBidsOnMedia: bids.length,
      timeElapsed,
      formula: TUNEBYTES_FORMULA,
    },
  };
}

function discoveryReason(discoveryRank) {
  return discoveryRank > 0 && discoveryRank <= 3 ? 'discovery' : 'popularity_growth';
}

module.exports = {
  TUNEBYTES_FORMULA,
  getDiscoveryBonus,
  computeTuneBytesFromBids,
  inactiveTuneBytesResult,
  discoveryReason,
};
