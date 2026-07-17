/** Tip / champion helpers for BidConfirmationModal shortcuts. Amounts on bids are pence. */

export type TipBidLike = {
  amount?: number;
  userId?: string | { _id?: string; uuid?: string; id?: string } | null;
};

export type TipViewerLike = {
  _id?: string;
  uuid?: string;
  id?: string;
} | null | undefined;

export type ChampionTipContext = {
  /** #1 tipper aggregate in pounds */
  championAggregate: number;
  /** Current viewer's aggregate on this media in pounds */
  viewerAggregate: number;
  /** True when the viewer currently holds #1 */
  viewerIsChampion: boolean;
};

function userKeys(user: TipViewerLike | TipBidLike['userId']): Set<string> {
  const keys = new Set<string>();
  if (!user) return keys;
  if (typeof user === 'string') {
    const trimmed = user.trim();
    if (trimmed) keys.add(trimmed);
    return keys;
  }
  for (const value of [user._id, user.uuid, user.id]) {
    if (value == null) continue;
    const asString = String(value).trim();
    if (asString) keys.add(asString);
  }
  return keys;
}

function keysOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const key of a) {
    if (b.has(key)) return true;
  }
  return false;
}

/**
 * Derive champion (#1 aggregate tipper) context from media bids.
 * Falls back to media.globalMediaAggregateTop (pence) when bids are missing.
 */
export function computeChampionTipContext(
  bids: TipBidLike[] | null | undefined,
  viewer?: TipViewerLike,
  options?: {
    fallbackChampionAggregatePence?: number;
    fallbackChampionUser?: TipViewerLike | string;
  }
): ChampionTipContext | null {
  const list = Array.isArray(bids) ? bids : [];
  const viewerKeys = userKeys(viewer);

  type Agg = { totalPence: number; bidCount: number; keys: Set<string> };
  const byUser = new Map<string, Agg>();

  for (const bid of list) {
    const amount = typeof bid?.amount === 'number' && bid.amount > 0 ? bid.amount : 0;
    if (amount <= 0) continue;
    const keys = userKeys(bid.userId);
    if (keys.size === 0) continue;
    const mapKey = [...keys].sort().join('|');
    const existing = byUser.get(mapKey);
    if (existing) {
      existing.totalPence += amount;
      existing.bidCount += 1;
      keys.forEach((k) => existing.keys.add(k));
    } else {
      byUser.set(mapKey, { totalPence: amount, bidCount: 1, keys });
    }
  }

  if (byUser.size > 0) {
    const ranked = [...byUser.values()].sort((a, b) => {
      if (b.totalPence !== a.totalPence) return b.totalPence - a.totalPence;
      return b.bidCount - a.bidCount;
    });
    const champion = ranked[0];
    const viewerAgg = ranked.find((row) => keysOverlap(row.keys, viewerKeys));
    const viewerAggregatePence = viewerAgg?.totalPence ?? 0;
    const viewerIsChampion = Boolean(viewerAgg && keysOverlap(champion.keys, viewerAgg.keys));

    return {
      championAggregate: champion.totalPence / 100,
      viewerAggregate: viewerAggregatePence / 100,
      viewerIsChampion,
    };
  }

  const fallbackPence =
    typeof options?.fallbackChampionAggregatePence === 'number'
      ? options.fallbackChampionAggregatePence
      : 0;
  if (fallbackPence <= 0) return null;

  const championUserKeys = userKeys(options?.fallbackChampionUser);
  const viewerIsChampion =
    viewerKeys.size > 0 && championUserKeys.size > 0 && keysOverlap(viewerKeys, championUserKeys);

  return {
    championAggregate: fallbackPence / 100,
    viewerAggregate: viewerIsChampion ? fallbackPence / 100 : 0,
    viewerIsChampion,
  };
}

/** Amount (pounds) needed to take #1 given current aggregates. */
export function amountToTakeChampion(
  championAggregate: number,
  viewerAggregate: number,
  minTip = 0.01,
  step = 0.01
): number {
  const raw = championAggregate - viewerAggregate + step;
  return Math.max(minTip, Math.round(raw * 100) / 100);
}
