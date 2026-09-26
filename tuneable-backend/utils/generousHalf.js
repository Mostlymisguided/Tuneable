/**
 * The artist chooses what share of tippers can keep a copy.
 * 100 = everyone who tipped. 1 = the top 1%. Default 50.
 * Totals are in pence. Ties at the cutoff stay in.
 * The count rounds up, and at least one tipper qualifies when anyone has tipped.
 */

const DEFAULT_COPY_SHARE_PERCENT = 50;

function normalizeCopySharePercent(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_COPY_SHARE_PERCENT;
  return Math.min(100, Math.max(1, n));
}

function generousShareThreshold(totals, sharePercent = DEFAULT_COPY_SHARE_PERCENT) {
  const positive = totals.filter((amount) => amount > 0).sort((a, b) => b - a);
  if (positive.length === 0) return null;
  const share = normalizeCopySharePercent(sharePercent);
  const keepCount = Math.max(1, Math.ceil((positive.length * share) / 100));
  return positive[Math.min(keepCount, positive.length) - 1];
}

function generousHalfThreshold(totals) {
  return generousShareThreshold(totals, DEFAULT_COPY_SHARE_PERCENT);
}

function isInGenerousHalf(total, totals, sharePercent = DEFAULT_COPY_SHARE_PERCENT) {
  const threshold = generousShareThreshold(totals, sharePercent);
  if (threshold == null || total <= 0) return false;
  return total >= threshold;
}

/**
 * Replay tips in time order.
 * A tipper who clears the line keeps the copy if later tips raise it.
 * They lose it only when their own remaining total falls under the line they cleared
 * and they are no longer in the current half.
 *
 * events: { at: number, type: 'tip' | 'reverse', userId: string, amount: number }
 * sharePercent: artist setting in force for the replay (default 50)
 */
function replayCopyUnlocks(events, sharePercent = DEFAULT_COPY_SHARE_PERCENT) {
  const sorted = [...events].sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    if (a.type === b.type) return 0;
    return a.type === 'tip' ? -1 : 1;
  });

  const totals = new Map();
  const unlocks = new Map();

  for (const event of sorted) {
    const prev = totals.get(event.userId) || 0;
    const next = event.type === 'tip' ? prev + event.amount : prev - event.amount;
    if (next > 0) totals.set(event.userId, next);
    else totals.delete(event.userId);

    const threshold = generousShareThreshold([...totals.values()], sharePercent);
    if (threshold == null) {
      for (const [userId, unlock] of unlocks) {
        const total = totals.get(userId) || 0;
        if (total < unlock.thresholdAtGrant) unlocks.delete(userId);
      }
      continue;
    }

    for (const [userId, total] of totals) {
      if (total >= threshold && !unlocks.has(userId)) {
        unlocks.set(userId, {
          thresholdAtGrant: threshold,
          totalAtGrant: total,
          unlockedAt: event.at,
        });
      }
    }

    for (const [userId, unlock] of unlocks) {
      const total = totals.get(userId) || 0;
      const inHalf = total >= threshold;
      if (!inHalf && total < unlock.thresholdAtGrant) {
        unlocks.delete(userId);
      }
    }
  }

  return [...unlocks.entries()].map(([userId, unlock]) => ({
    userId,
    ...unlock,
  }));
}

module.exports = {
  DEFAULT_COPY_SHARE_PERCENT,
  normalizeCopySharePercent,
  generousShareThreshold,
  generousHalfThreshold,
  isInGenerousHalf,
  replayCopyUnlocks,
};
