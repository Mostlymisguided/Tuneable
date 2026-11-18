/**
 * Device sessions: short access tokens, rotating refresh tokens.
 * Run: npx jest tests/authSessions.test.js
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { getJwtSecret } = require('../config/jwtSecret');

jest.mock('../models/AuthSession', () => {
  const mongooseLib = require('mongoose');
  const store = [];
  global.__authSessionStore = store;

  function matches(doc, query) {
    if (!query) return true;
    if (query.tokenHash && doc.tokenHash !== query.tokenHash) return false;
    if (query._id && String(doc._id) !== String(query._id)) return false;
    if (query.familyId && doc.familyId !== query.familyId) return false;
    if (query.userId && String(doc.userId) !== String(query.userId)) return false;
    if (query.exchangeCodeHash && doc.exchangeCodeHash !== query.exchangeCodeHash) return false;
    if (Object.prototype.hasOwnProperty.call(query, 'revokedAt') && query.revokedAt === null && doc.revokedAt != null) {
      return false;
    }
    if (query.expiresAt?.$gt && !(new Date(doc.expiresAt) > new Date(query.expiresAt.$gt))) return false;
    if (query.exchangeExpiresAt?.$gt && !(new Date(doc.exchangeExpiresAt) > new Date(query.exchangeExpiresAt.$gt))) {
      return false;
    }
    return true;
  }

  function applyUpdate(doc, update) {
    if (update?.$set) Object.assign(doc, update.$set);
    if (update?.$unset) {
      for (const key of Object.keys(update.$unset)) delete doc[key];
    }
    return doc;
  }

  function wrap(doc) {
    if (!doc) return doc;
    doc.save = async function save() { return this; };
    return doc;
  }

  return {
    create: jest.fn(async (doc) => {
      const created = wrap({
        _id: new mongooseLib.Types.ObjectId(),
        revokedAt: null,
        ...doc,
      });
      store.push(created);
      return created;
    }),
    findOne: jest.fn(async (query) => wrap(store.find((doc) => matches(doc, query)) || null)),
    findOneAndUpdate: jest.fn(async (query, update) => {
      const doc = store.find((item) => matches(item, query));
      if (!doc) return null;
      applyUpdate(doc, update);
      return doc;
    }),
    updateOne: jest.fn(async (query, update) => {
      const doc = store.find((item) => matches(item, query));
      if (doc) applyUpdate(doc, update);
      return { matchedCount: doc ? 1 : 0 };
    }),
    updateMany: jest.fn(async (query, update) => {
      store.filter((doc) => matches(doc, query)).forEach((doc) => applyUpdate(doc, update));
    }),
    findById: jest.fn((id) => ({
      select: () => Promise.resolve(store.find((doc) => String(doc._id) === String(id)) || null),
    })),
  };
});

jest.mock('../models/User', () => ({
  findById: jest.fn(),
}));

const User = require('../models/User');
const {
  issueAuthSession,
  rotateAuthSession,
  redeemExchangeCode,
  revokeAuthSessionByRefreshToken,
  revokeAllAuthSessions,
  isAccessSessionActive,
  ROTATION_GRACE_MS,
} = require('../utils/authSessions');

const user = {
  _id: new mongoose.Types.ObjectId(),
  uuid: '0191f3a2-1111-7222-8333-944455556666',
  email: 'listener@example.com',
  username: 'listener',
  isActive: true,
};

beforeEach(() => {
  global.__authSessionStore.splice(0, global.__authSessionStore.length);
  User.findById.mockResolvedValue(user);
});

function decoded(token) {
  return jwt.verify(token, getJwtSecret());
}

describe('auth sessions', () => {
  it('issues an hour-long access token and a refresh token', async () => {
    const issued = await issueAuthSession(user);
    const access = decoded(issued.token);
    expect(access.sid).toBeTruthy();
    expect(access.exp - access.iat).toBe(60 * 60);
    expect(issued.refreshToken).toEqual(expect.any(String));
    expect(await isAccessSessionActive(access.sid)).toBe(true);
    expect(global.__authSessionStore[0].exchangeCodeHash).toBeUndefined();
  });

  it('issues a second password session without an exchange code', async () => {
    await issueAuthSession(user);
    await issueAuthSession(user);
    expect(global.__authSessionStore).toHaveLength(2);
    expect(global.__authSessionStore.every((doc) => doc.exchangeCodeHash == null)).toBe(true);
  });

  it('rotates the refresh token and keeps the device signed in', async () => {
    const issued = await issueAuthSession(user);
    const firstSid = decoded(issued.token).sid;
    const next = await rotateAuthSession(issued.refreshToken);
    expect(next.ok).toBe(true);
    expect(next.refreshToken).not.toBe(issued.refreshToken);
    expect(decoded(next.token).sid).not.toBe(firstSid);
    expect(await isAccessSessionActive(firstSid)).toBe(false);
    expect(await isAccessSessionActive(decoded(next.token).sid)).toBe(true);
  });

  it('allows one immediate replay from another tab, then revokes the family', async () => {
    const issued = await issueAuthSession(user);
    const first = await rotateAuthSession(issued.refreshToken);
    const replay = await rotateAuthSession(issued.refreshToken);
    expect(replay.ok).toBe(true);
    expect(await rotateAuthSession(first.refreshToken)).toMatchObject({ ok: true });

    const stale = global.__authSessionStore.find((doc) => doc.revokeReason === 'rotated');
    stale.revokedAt = new Date(Date.now() - ROTATION_GRACE_MS - 1000);
    const theft = await rotateAuthSession(issued.refreshToken);
    expect(theft.ok).toBe(false);
    expect(theft.reason).toBe('reuse');
    expect(await rotateAuthSession(replay.refreshToken)).toMatchObject({ ok: false });
  });

  it('logout kills that refresh token and leaves other devices alone', async () => {
    const phone = await issueAuthSession(user);
    const laptop = await issueAuthSession(user);
    await revokeAuthSessionByRefreshToken(phone.refreshToken);
    expect(await rotateAuthSession(phone.refreshToken)).toMatchObject({ ok: false });
    expect(await isAccessSessionActive(decoded(phone.token).sid)).toBe(false);
    expect((await rotateAuthSession(laptop.refreshToken)).ok).toBe(true);
  });

  it('a password change signs every device out', async () => {
    const phone = await issueAuthSession(user);
    const laptop = await issueAuthSession(user);
    await revokeAllAuthSessions(user._id);
    expect(await isAccessSessionActive(decoded(phone.token).sid)).toBe(false);
    expect(await rotateAuthSession(laptop.refreshToken)).toMatchObject({ ok: false });
  });

  it('an expired refresh token is refused', async () => {
    const issued = await issueAuthSession(user);
    global.__authSessionStore[0].expiresAt = new Date(Date.now() - 1000);
    expect(await rotateAuthSession(issued.refreshToken)).toMatchObject({ ok: false });
  });

  it('redeems an OAuth code once', async () => {
    const issued = await issueAuthSession(user, { exchange: true });
    expect(issued.refreshToken).toBeUndefined();
    const redeemed = await redeemExchangeCode(issued.exchangeCode);
    expect(redeemed.ok).toBe(true);
    expect(redeemed.refreshToken).toEqual(expect.any(String));
    expect(await redeemExchangeCode(issued.exchangeCode)).toMatchObject({ ok: false });
    expect((await rotateAuthSession(redeemed.refreshToken)).ok).toBe(true);
  });

  it('treats tokens with no session id as still valid', async () => {
    expect(await isAccessSessionActive(undefined)).toBe(true);
  });
});
