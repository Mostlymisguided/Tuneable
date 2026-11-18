const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const AuthSession = require('../models/AuthSession');
const User = require('../models/User');
const { getJwtSecret } = require('../config/jwtSecret');

const ACCESS_TTL = '1h';
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const EXCHANGE_TTL_MS = 2 * 60 * 1000;
/** A second tab can present the same refresh token once, just after rotation. */
const ROTATION_GRACE_MS = 15 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function newSecret() {
  return crypto.randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signAccessToken(user, sessionId) {
  return jwt.sign({
    userId: user.uuid,
    email: user.email,
    username: user.username,
    sid: String(sessionId),
  }, getJwtSecret(), { expiresIn: ACCESS_TTL });
}

function refreshExpiry() {
  return new Date(Date.now() + REFRESH_TTL_MS);
}

/**
 * @param {object} user mongoose user
 * @param {{ exchange?: boolean }} [options] exchange holds the refresh token for a one-time code
 *   so OAuth redirects do not put it in the URL.
 */
async function issueAuthSession(user, options = {}) {
  if (!user?._id || !user?.uuid) {
    throw new Error('Cannot issue a session without a user id');
  }
  const refreshToken = newSecret();
  const doc = {
    userId: user._id,
    familyId: newSecret(),
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiry(),
  };
  let exchangeCode;
  if (options.exchange) {
    exchangeCode = newSecret();
    doc.exchangeCodeHash = hashToken(exchangeCode);
    doc.exchangeExpiresAt = new Date(Date.now() + EXCHANGE_TTL_MS);
    doc.heldRefreshToken = refreshToken;
  }
  const session = await AuthSession.create(doc);
  return {
    token: signAccessToken(user, session._id),
    refreshToken: options.exchange ? undefined : refreshToken,
    exchangeCode,
  };
}

async function activeUser(userId) {
  const user = await User.findById(userId);
  if (!user || user.isActive === false) return null;
  return user;
}

async function killFamily(familyId) {
  if (!familyId) return;
  await AuthSession.updateMany(
    { familyId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: 'reuse' } }
  );
}

/**
 * Exchange a refresh token for a new access token and a new refresh token.
 * The previous refresh token works for a few seconds so two tabs can refresh
 * together. A later replay revokes the whole device family.
 */
async function rotateAuthSession(presented) {
  if (!presented || typeof presented !== 'string') return { ok: false };
  const tokenHash = hashToken(presented);
  const now = new Date();
  const claimed = await AuthSession.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now, revokeReason: 'rotated' } }
  );
  if (claimed) {
    const user = await activeUser(claimed.userId);
    if (!user) return { ok: false };
    const refreshToken = newSecret();
    const next = await AuthSession.create({
      userId: claimed.userId,
      familyId: claimed.familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiry(),
    });
    await AuthSession.updateOne({ _id: claimed._id }, { $set: { replacedBy: next._id } });
    return {
      ok: true,
      token: signAccessToken(user, next._id),
      refreshToken,
    };
  }

  const stale = await AuthSession.findOne({ tokenHash });
  if (!stale) return { ok: false };
  const rotatedAt = stale.revokedAt ? new Date(stale.revokedAt).getTime() : 0;
  if (
    stale.revokeReason === 'rotated'
    && rotatedAt
    && Date.now() - rotatedAt < ROTATION_GRACE_MS
  ) {
    const user = await activeUser(stale.userId);
    if (!user) return { ok: false };
    const refreshToken = newSecret();
    const next = await AuthSession.create({
      userId: stale.userId,
      familyId: stale.familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiry(),
    });
    return {
      ok: true,
      token: signAccessToken(user, next._id),
      refreshToken,
    };
  }
  if (stale.revokeReason === 'rotated' || stale.revokeReason === 'reuse') {
    await killFamily(stale.familyId);
    return { ok: false, reason: 'reuse' };
  }
  return { ok: false };
}

async function redeemExchangeCode(code) {
  if (!code || typeof code !== 'string') return { ok: false };
  const session = await AuthSession.findOne({
    exchangeCodeHash: hashToken(code),
    exchangeExpiresAt: { $gt: new Date() },
  });
  if (!session?.heldRefreshToken) return { ok: false };
  const refreshToken = session.heldRefreshToken;
  // Unset, do not write null. Null collides on the unique exchange-code index
  // and then blocks every email and Apple login.
  await AuthSession.updateOne(
    { _id: session._id },
    { $unset: { heldRefreshToken: '', exchangeCodeHash: '', exchangeExpiresAt: '' } }
  );
  const user = await activeUser(session.userId);
  if (!user) return { ok: false };
  return {
    ok: true,
    token: signAccessToken(user, session._id),
    refreshToken,
  };
}

async function revokeAuthSessionByRefreshToken(refreshToken) {
  if (!refreshToken) return;
  await AuthSession.updateOne(
    { tokenHash: hashToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: 'logout' } }
  );
}

async function revokeAuthSessionById(sessionId) {
  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) return;
  await AuthSession.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: 'logout' } }
  );
}

async function revokeAllAuthSessions(userId) {
  if (!userId) return;
  await AuthSession.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: 'logout_all' } }
  );
}

/** Tokens issued before device sessions existed have no sid and stay valid until they expire. */
async function isAccessSessionActive(sessionId) {
  if (!sessionId) return true;
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return false;
  const session = await AuthSession.findById(sessionId).select('revokedAt expiresAt');
  if (!session || session.revokedAt) return false;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

module.exports = {
  ACCESS_TTL,
  REFRESH_TTL_MS,
  ROTATION_GRACE_MS,
  issueAuthSession,
  rotateAuthSession,
  redeemExchangeCode,
  revokeAuthSessionByRefreshToken,
  revokeAuthSessionById,
  revokeAllAuthSessions,
  isAccessSessionActive,
};
