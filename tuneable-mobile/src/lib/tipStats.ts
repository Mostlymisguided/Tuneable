/** Tip / champion helpers. Bid amounts are in pence. */

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
  championAggregate: number;
  viewerAggregate: number;
  viewerIsChampion: boolean;
};

export type TipStatChip =
  | { kind: 'set'; label: string; value: number; title: string }
  | {
      kind: 'champion';
      label: string;
      value: number;
      displayValue?: number;
      title: string;
      disabled?: boolean;
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
    const viewerIsChampion = Boolean(
      viewerAgg && keysOverlap(champion.keys, viewerAgg.keys)
    );

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
    viewerKeys.size > 0 &&
    championUserKeys.size > 0 &&
    keysOverlap(viewerKeys, championUserKeys);

  return {
    championAggregate: fallbackPence / 100,
    viewerAggregate: viewerIsChampion ? fallbackPence / 100 : 0,
    viewerIsChampion,
  };
}

export function amountToTakeChampion(
  championAggregate: number,
  viewerAggregate: number,
  minTip = 0.01,
  step = 0.01
): number {
  const raw = championAggregate - viewerAggregate + step;
  return Math.max(minTip, Math.round(raw * 100) / 100);
}

export function buildTipStatChips(options: {
  minTip: number;
  avgTip?: number;
  championAggregate?: number;
  viewerAggregate?: number;
  viewerIsChampion?: boolean;
}): TipStatChip[] {
  const {
    minTip,
    avgTip,
    championAggregate,
    viewerAggregate = 0,
    viewerIsChampion = false,
  } = options;

  const chips: TipStatChip[] = [
    {
      kind: 'set',
      label: 'Min',
      value: minTip,
      title: `Set tip to £${minTip.toFixed(2)}`,
    },
  ];

  if (typeof avgTip === 'number' && avgTip > 0) {
    chips.push({
      kind: 'set',
      label: 'Avg',
      value: avgTip,
      title: `Set tip to £${avgTip.toFixed(2)}`,
    });
  }

  const hasChampion =
    typeof championAggregate === 'number' &&
    Number.isFinite(championAggregate) &&
    championAggregate > 0;

  if (hasChampion) {
    if (viewerIsChampion) {
      chips.push({
        kind: 'champion',
        label: "You're #1",
        value: championAggregate,
        title: `You hold #1 with £${championAggregate.toFixed(2)} total tipped`,
        disabled: true,
      });
    } else {
      const takeChampionAmount = amountToTakeChampion(
        championAggregate,
        viewerAggregate,
        minTip
      );
      chips.push({
        kind: 'champion',
        label: 'Champion',
        value: takeChampionAmount,
        displayValue: championAggregate,
        title: `Tip £${takeChampionAmount.toFixed(2)} to take #1 (currently £${championAggregate.toFixed(2)})`,
      });
    }
  }

  return chips;
}

export function averageTipPounds(bids: TipBidLike[] | null | undefined): number | undefined {
  const list = (bids ?? []).filter(
    (b) => typeof b.amount === 'number' && (b.amount ?? 0) > 0
  );
  if (list.length === 0) return undefined;
  const total = list.reduce((sum, b) => sum + (b.amount ?? 0), 0);
  return Math.round((total / list.length / 100) * 100) / 100;
}
