/** Global tune podium: top 3 tippers by active bid total. Pure helpers, no database. */

const PODIUM_SIZE = 3;
const MIN_TIP_PENCE = 1;

function userKey(userId) {
  if (userId == null) return '';
  return String(userId);
}

function rankTotals(rows) {
  return [...(rows || [])]
    .filter((row) => row && userKey(row.userId) && Number(row.totalAmount) > 0)
    .map((row) => ({
      userId: row.userId,
      totalAmount: Number(row.totalAmount) || 0,
      bidCount: Number(row.bidCount) || 0,
    }))
    .sort((a, b) => {
      if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
      if (b.bidCount !== a.bidCount) return b.bidCount - a.bidCount;
      return userKey(a.userId).localeCompare(userKey(b.userId));
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function topPodium(rows, size = PODIUM_SIZE) {
  return rankTotals(rows).slice(0, size);
}

/**
 * Apply a pence/bid-count change to one tipper. Used to rebuild the podium
 * from before a single bid write when no snapshot exists yet.
 */
function shiftTotals(rows, userId, deltaPence, deltaBids) {
  const map = new Map();
  for (const row of rows || []) {
    const key = userKey(row.userId);
    if (!key) continue;
    map.set(key, {
      userId: row.userId,
      totalAmount: Number(row.totalAmount) || 0,
      bidCount: Number(row.bidCount) || 0,
    });
  }

  const key = userKey(userId);
  const pence = Number(deltaPence) || 0;
  const bids = Number(deltaBids) || 0;
  if (key && (pence !== 0 || bids !== 0)) {
    const row = map.get(key) || { userId, totalAmount: 0, bidCount: 0 };
    row.totalAmount += pence;
    row.bidCount += bids;
    if (row.totalAmount <= 0) map.delete(key);
    else map.set(key, row);
  }

  return [...map.values()];
}

/**
 * Rank changes on a tune's top 3.
 * Improving or entering writes `earned` for the new rank.
 * Dropping or leaving writes `lost` for the rank that was held.
 */
function diffPodium(previousTop, nextTop) {
  const previous = new Map((previousTop || []).map((row) => [userKey(row.userId), row.rank]));
  const next = new Map((nextTop || []).map((row) => [userKey(row.userId), row.rank]));
  const ids = new Set([...previous.keys(), ...next.keys()]);
  const events = [];

  for (const id of ids) {
    if (!id) continue;
    const oldRank = previous.has(id) ? previous.get(id) : null;
    const newRank = next.has(id) ? next.get(id) : null;
    if (oldRank === newRank) continue;

    const userId = (nextTop || []).find((row) => userKey(row.userId) === id)?.userId
      || (previousTop || []).find((row) => userKey(row.userId) === id)?.userId;

    if (newRank && (oldRank == null || newRank < oldRank)) {
      events.push({
        userId,
        kind: 'earned',
        rank: newRank,
        previousRank: oldRank,
        nextRank: newRank,
      });
    }
    if (oldRank && (newRank == null || newRank > oldRank)) {
      events.push({
        userId,
        kind: 'lost',
        rank: oldRank,
        previousRank: oldRank,
        nextRank: newRank,
      });
    }
  }

  return events;
}

/**
 * Pence required to hold `targetRank` again. Null when the tipper already
 * holds that rank or a better one.
 */
function regainPence(rows, userId, targetRank) {
  const rank = Number(targetRank);
  if (!userKey(userId) || !Number.isInteger(rank) || rank < 1 || rank > PODIUM_SIZE) {
    return null;
  }

  const ranked = rankTotals(rows);
  const viewer = ranked.find((row) => userKey(row.userId) === userKey(userId));
  const viewerTotal = viewer?.totalAmount || 0;
  if (viewer && viewer.rank <= rank) return null;

  const holder = ranked.find((row) => row.rank === rank);
  if (!holder) {
    return ranked.length < rank ? MIN_TIP_PENCE : null;
  }
  if (userKey(holder.userId) === userKey(userId)) return null;

  return Math.max(MIN_TIP_PENCE, holder.totalAmount - viewerTotal + MIN_TIP_PENCE);
}

module.exports = {
  PODIUM_SIZE,
  MIN_TIP_PENCE,
  rankTotals,
  topPodium,
  shiftTotals,
  diffPodium,
  regainPence,
};
