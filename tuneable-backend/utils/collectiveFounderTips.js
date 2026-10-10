/**
 * Founder tips that count toward a collective's ranking.
 *
 * A founder from the start (or invited as a founder) contributes every active
 * tip, including tips placed before the collective existed.
 * Someone promoted to founder later contributes tips from that promotion on.
 * A founder who has left keeps tips from their founder window, and tips after
 * they left do not count.
 * Admin and member tips do not count.
 */

const ORIGINAL_FOUNDER_SLACK_MS = 2 * 60 * 1000;

function memberUserId(member) {
  const id = member && member.userId;
  if (!id) return null;
  if (typeof id === 'object' && id._id) return String(id._id);
  if (typeof id === 'object' && typeof id.toString === 'function') {
    const asString = id.toString();
    if (asString && asString !== '[object Object]') return asString;
  }
  return String(id);
}

function tipUserId(tip) {
  return memberUserId({ userId: tip.userId });
}

function isOriginalFounderMarker(marker, createdAt) {
  if (!createdAt || !marker) return true;
  return new Date(marker).getTime() <= new Date(createdAt).getTime() + ORIGINAL_FOUNDER_SLACK_MS;
}

/**
 * @returns {{ userId: string, since: Date|null, until: Date|null }[]}
 * since null means every tip up to until. until null means the window is still open.
 */
function freezeFounderTipScope(collective, member) {
  if (!member || member.role !== 'founder' || member.founderTipScope) return false;
  const marker = member.founderSince || member.joinedAt || null;
  const original = isOriginalFounderMarker(marker, collective && collective.createdAt);
  member.founderTipScope = original ? 'all' : 'since';
  if (!member.founderSince && marker) member.founderSince = new Date(marker);
  return true;
}

function founderTipWindows(collective) {
  const merged = new Map();

  for (const member of collective.members || []) {
    if (!member || member.role !== 'founder') continue;
    const userId = memberUserId(member);
    if (!userId) continue;

    const until = member.leftAt ? new Date(member.leftAt) : null;
    let since = null;

    if (member.founderTipScope === 'since') {
      const marker = member.founderSince || member.joinedAt;
      since = marker ? new Date(marker) : null;
    } else if (member.founderTipScope === 'all') {
      since = null;
    } else if (!isOriginalFounderMarker(member.founderSince || member.joinedAt, collective.createdAt)) {
      since = new Date(member.founderSince || member.joinedAt);
    }

    const previous = merged.get(userId);
    if (!previous) {
      merged.set(userId, { userId, since, until });
      continue;
    }

    const openSince = previous.since == null || since == null
      ? null
      : (previous.since < since ? previous.since : since);
    const openUntil = previous.until == null || until == null
      ? null
      : (previous.until > until ? previous.until : until);
    merged.set(userId, { userId, since: openSince, until: openUntil });
  }

  return [...merged.values()];
}

function tipFallsInWindow(tip, window) {
  if (!window || tipUserId(tip) !== window.userId) return false;
  if (tip.status && tip.status !== 'active') return false;
  const at = new Date(tip.createdAt).getTime();
  if (Number.isNaN(at)) return false;
  if (window.since && at < window.since.getTime()) return false;
  if (window.until && at >= window.until.getTime()) return false;
  return true;
}

function founderTipTotal(windows, tips) {
  const byUser = new Map(windows.map((window) => [window.userId, window]));
  let total = 0;
  for (const tip of tips || []) {
    const window = byUser.get(tipUserId(tip));
    if (!tipFallsInWindow(tip, window)) continue;
    total += Number(tip.amount) || 0;
  }
  return total;
}

function sumFounderTipsForCollectives(collectives, tips) {
  const totals = new Map();
  for (const collective of collectives || []) {
    totals.set(String(collective._id), founderTipTotal(founderTipWindows(collective), tips));
  }
  return totals;
}

function collectiveRankingAggregate(mediaAggregatePence, founderTipAggregatePence) {
  return (Number(mediaAggregatePence) || 0) + (Number(founderTipAggregatePence) || 0);
}

module.exports = {
  ORIGINAL_FOUNDER_SLACK_MS,
  freezeFounderTipScope,
  founderTipWindows,
  founderTipTotal,
  sumFounderTipsForCollectives,
  collectiveRankingAggregate,
};
