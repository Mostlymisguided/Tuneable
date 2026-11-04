/**
 * Pure TuneBytes math. No DB.
 *
 * One seat per tipper. The first tip seats you and fixes your discovery rank.
 * Every tip earns its value in pence. When someone else tips, each person
 * already seated earns that amount once, scaled by the stake they had
 * committed before that tip. Your own later tips add pence and raise the
 * stake that faces the next opposing tip. They do not grow your earlier tips,
 * and they do not resize growth you have already earned.
 *
 *   growth += opposingTip × ∛(stake already committed) × discoveryBonus(seat rank)
 *   TuneBytes = your tips in pence + growth
 *
 * Discovery bonus: 1 + e^(−rank / 10). Rank is first-tipper order, not bid count.
 */

const TUNEBYTES_FORMULA =
  'pence + Σ opposingTip × ∛(stakeBeforeThatTip) × discoveryBonus(seatRank)';

function getDiscoveryBonus(rank) {
  return 1 + Math.exp(-rank / 10);
}

function sumAmounts(bids) {
  return bids.reduce((sum, bid) => sum + (bid.amount || 0), 0);
}

function bidIdEquals(left, right) {
  return String(left) === String(right);
}

function tipperKey(bid) {
  const user = bid?.userId;
  if (user == null || user === '') return null;
  if (typeof user === 'object') {
    // ObjectId's `_id` is itself. A populated user document's `_id` is the id.
    const inner = user._id && user._id !== user ? user._id : user;
    if (typeof inner.toString === 'function') {
      const key = inner.toString();
      if (key && key !== '[object Object]') return key;
    }
    return null;
  }
  return String(user);
}

function seatKey(bid) {
  const key = tipperKey(bid);
  // Bids with no user each sit alone, so older callers that omit userId
  // still treat every bid as a different tipper.
  return key ? `user:${key}` : `bid:${String(bid._id)}`;
}

/**
 * Replay active bids in time order. Growth from an opposing tip is kept on
 * the tipper's first bid so a seat is paid once.
 */
function replaySeats(bids) {
  const seats = new Map();
  const awarded = new Map();
  let nextRank = 1;

  for (const bid of bids) {
    const key = seatKey(bid);
    let seat = seats.get(key);
    const isSeatBid = !seat;
    if (isSeatBid) {
      seat = {
        rank: nextRank,
        stake: 0,
        opposing: 0,
        growth: 0,
      };
      nextRank += 1;
      seats.set(key, seat);
    }

    const amount = bid.amount || 0;
    for (const [otherKey, other] of seats) {
      if (otherKey === key || other.stake <= 0) continue;
      other.growth += amount * Math.cbrt(other.stake) * getDiscoveryBonus(other.rank);
      other.opposing += amount;
    }

    seat.stake += amount;
    awarded.set(String(bid._id), { pence: amount, isSeatBid, seat });
  }

  return awarded;
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
  const awarded = replaySeats(bids).get(String(bid._id));
  const userBidPence = awarded.pence;
  const bidTimeTotalValue = sumAmounts(bids.slice(0, bidIndex));
  const currentTotalValue = sumAmounts(bids);
  const subsequentGrowth = awarded.isSeatBid ? awarded.seat.opposing : 0;
  const growthTuneBytes = awarded.isSeatBid ? awarded.seat.growth : 0;
  const discoveryRank = awarded.seat.rank;
  const discoveryBonus = getDiscoveryBonus(discoveryRank);
  const tuneBytesEarned = Math.max(0, userBidPence + growthTuneBytes);

  const bidTime = bid.createdAt ? new Date(bid.createdAt) : now;
  const timeElapsed = Math.round((now.getTime() - bidTime.getTime()) / (1000 * 60 * 60));

  return {
    tuneBytesEarned,
    calculation: {
      currentTotalValue,
      bidTimeTotalValue,
      subsequentGrowth,
      growthTuneBytes,
      committedStake: awarded.seat.stake,
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
