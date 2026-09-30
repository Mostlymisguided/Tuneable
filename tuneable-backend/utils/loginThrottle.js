/**
 * Failed-login throttling.
 *
 * Failures are counted per (account, client IP), so someone guessing a
 * password only locks themselves out, not the account owner. A higher
 * account-wide limit (stored on the user) covers guessing spread across many IPs.
 * Unknown identifiers are counted the same way so responses can't reveal
 * whether an account exists.
 *
 * The per-IP counters live in memory, so they are per server instance.
 */

const PAIR_MAX_FAILURES = 6;
const PAIR_WINDOW_MS = 15 * 60 * 1000;
const PAIR_LOCK_MS = 15 * 60 * 1000;

const ACCOUNT_MAX_FAILURES = 30;
const ACCOUNT_WINDOW_MS = 60 * 60 * 1000;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

const pairs = new Map();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pairs) {
    const expired = entry.lockedUntil
      ? entry.lockedUntil <= now
      : entry.firstFailureAt + PAIR_WINDOW_MS <= now;
    if (expired) pairs.delete(key);
  }
}, PAIR_WINDOW_MS);
sweep.unref?.();

function pairKey({ user, identifier, ip }) {
  const who = user ? `u:${user._id}` : `i:${String(identifier || '').trim().toLowerCase()}`;
  return `${who}|${ip || 'unknown'}`;
}

function activeEntry(key, now = Date.now()) {
  const entry = pairs.get(key);
  if (!entry) return null;
  if (entry.lockedUntil && entry.lockedUntil <= now) {
    pairs.delete(key);
    return null;
  }
  if (!entry.lockedUntil && entry.firstFailureAt + PAIR_WINDOW_MS <= now) {
    pairs.delete(key);
    return null;
  }
  return entry;
}

/** @returns {Date|null} when this (account, IP) pair may try again */
function getPairLock(key) {
  const entry = activeEntry(key);
  return entry?.lockedUntil ? new Date(entry.lockedUntil) : null;
}

/** @returns {{ failedAttempts: number, remainingAttempts: number, lockedUntil: Date|null }} */
function recordPairFailure(key) {
  const now = Date.now();
  const entry = activeEntry(key, now) || { count: 0, firstFailureAt: now, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= PAIR_MAX_FAILURES) {
    entry.lockedUntil = now + PAIR_LOCK_MS;
  }
  pairs.set(key, entry);
  return {
    failedAttempts: entry.count,
    remainingAttempts: Math.max(0, PAIR_MAX_FAILURES - entry.count),
    lockedUntil: entry.lockedUntil ? new Date(entry.lockedUntil) : null,
  };
}

function clearPair(key) {
  pairs.delete(key);
}

/** @returns {Date|null} account-wide lock, if one is active */
function getAccountLock(user, now = new Date()) {
  return user?.accountLockedUntil && user.accountLockedUntil > now ? user.accountLockedUntil : null;
}

/**
 * Updates the account-wide counters on the user document (caller saves).
 * Old failures outside the window don't count.
 */
function recordAccountFailure(user, now = new Date()) {
  const last = user.lastFailedLoginAttempt;
  const withinWindow = last && now - last < ACCOUNT_WINDOW_MS;
  user.failedLoginAttempts = (withinWindow ? user.failedLoginAttempts || 0 : 0) + 1;
  user.lastFailedLoginAttempt = now;
  if (user.failedLoginAttempts >= ACCOUNT_MAX_FAILURES) {
    user.accountLockedUntil = new Date(now.getTime() + ACCOUNT_LOCK_MS);
    user.failedLoginAttempts = 0;
  }
}

function lockedResponse(lockedUntil) {
  const minutesRemaining = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));
  return {
    error: `Too many failed sign-in attempts. Try again in ${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''}, or reset your password.`,
    lockedUntil,
    minutesRemaining,
    failedAttempts: PAIR_MAX_FAILURES,
  };
}

function _resetForTests() {
  pairs.clear();
}

module.exports = {
  PAIR_MAX_FAILURES,
  ACCOUNT_MAX_FAILURES,
  pairKey,
  getPairLock,
  recordPairFailure,
  clearPair,
  getAccountLock,
  recordAccountFailure,
  lockedResponse,
  _resetForTests,
};
