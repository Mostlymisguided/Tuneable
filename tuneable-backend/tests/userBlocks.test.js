/**
 * Two-way user blocking helper and notification suppression (mocked models).
 * Run: npx jest tests/userBlocks.test.js
 */

const mongoose = require('mongoose');

// blocker id -> Set of blocked ids
const mockBlocks = new Map();

function mockIsBlocked(a, b) {
  return Boolean(mockBlocks.get(String(a))?.has(String(b)));
}

function mockMatches(clause) {
  return mockIsBlocked(clause._id, clause.blockedUsers);
}

jest.mock('../models/User', () => ({
  exists: jest.fn(async (query) => {
    const clauses = query.$or || [query];
    return clauses.some((c) => mockMatches(c)) ? { _id: 'hit' } : null;
  }),
  findById: jest.fn((id) => ({
    select: () => ({
      lean: async () => ({
        _id: id,
        blockedUsers: [...(mockBlocks.get(String(id)) || [])],
      }),
    }),
  })),
  find: jest.fn((query) => ({
    select: () => ({
      lean: async () =>
        [...mockBlocks.entries()]
          .filter(([, set]) => set.has(String(query.blockedUsers)))
          .map(([blocker]) => ({ _id: blocker })),
    }),
  })),
}));

const mockSaved = [];
jest.mock('../models/Notification', () => {
  function Notification(doc) {
    Object.assign(this, doc, { _id: 'notif-1' });
    this.save = jest.fn(async () => mockSaved.push(doc));
  }
  const chain = {
    populate() {
      return chain;
    },
    lean: async () => ({ _id: 'notif-1', type: 'x', title: 't', message: 'm' }),
  };
  Notification.findById = jest.fn(() => chain);
  Notification.countDocuments = jest.fn(async () => 1);
  return Notification;
});

jest.mock('../utils/socketIO', () => ({
  sendNotification: jest.fn(),
  sendUnreadCount: jest.fn(),
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn(async () => undefined),
}));

const {
  isBlockedBetween,
  getBlockState,
  getBlockedUserIds,
  assertNotBlocked,
} = require('../utils/userBlocks');
const { createNotification } = require('../services/notificationService');

const alice = new mongoose.Types.ObjectId();
const bob = new mongoose.Types.ObjectId();
const carol = new mongoose.Types.ObjectId();

beforeEach(() => {
  mockBlocks.clear();
  mockSaved.length = 0;
  // Alice blocked Bob. Nobody blocked Carol.
  mockBlocks.set(String(alice), new Set([String(bob)]));
});

describe('userBlocks', () => {
  test('isBlockedBetween is true in both directions', async () => {
    expect(await isBlockedBetween(alice, bob)).toBe(true);
    expect(await isBlockedBetween(bob, alice)).toBe(true);
    expect(await isBlockedBetween(alice, carol)).toBe(false);
  });

  test('isBlockedBetween ignores self and missing ids', async () => {
    expect(await isBlockedBetween(alice, alice)).toBe(false);
    expect(await isBlockedBetween(null, bob)).toBe(false);
    expect(await isBlockedBetween(alice, 'not-an-id')).toBe(false);
  });

  test('getBlockState reports which side blocked', async () => {
    expect(await getBlockState(alice, bob)).toEqual({ blockedByMe: true, blockedMe: false });
    expect(await getBlockState(bob, alice)).toEqual({ blockedByMe: false, blockedMe: true });
    expect(await getBlockState(alice, carol)).toEqual({ blockedByMe: false, blockedMe: false });
  });

  test('getBlockedUserIds merges blocked and blocked-by', async () => {
    mockBlocks.set(String(carol), new Set([String(alice)]));
    const ids = await getBlockedUserIds(alice);
    expect([...ids].sort()).toEqual([String(bob), String(carol)].sort());
    expect([...(await getBlockedUserIds(bob))]).toEqual([String(alice)]);
  });

  test('assertNotBlocked throws a 403 without naming the blocker', async () => {
    await expect(assertNotBlocked(bob, alice)).rejects.toMatchObject({
      status: 403,
      code: 'USER_BLOCKED',
    });
    await expect(assertNotBlocked(alice, carol)).resolves.toBeUndefined();
  });
});

describe('createNotification with blocks', () => {
  const base = { title: 'Title', message: 'Message' };

  test('drops member-triggered notifications between blocked users', async () => {
    const result = await createNotification({
      ...base,
      userId: alice,
      type: 'bid_received',
      relatedUserId: bob,
    });
    expect(result).toBeNull();
    expect(mockSaved).toHaveLength(0);
  });

  test('drops them when the recipient was the one blocked', async () => {
    const result = await createNotification({
      ...base,
      userId: bob,
      type: 'comment_reply',
      relatedUserId: alice,
    });
    expect(result).toBeNull();
    expect(mockSaved).toHaveLength(0);
  });

  test('still delivers admin notices that name a related user', async () => {
    const result = await createNotification({
      ...base,
      userId: alice,
      type: 'warning',
      relatedUserId: bob,
    });
    expect(result).not.toBeNull();
    expect(mockSaved).toHaveLength(1);
  });

  test('delivers member-triggered notifications between unblocked users', async () => {
    const result = await createNotification({
      ...base,
      userId: alice,
      type: 'bid_received',
      relatedUserId: carol,
    });
    expect(result).not.toBeNull();
    expect(mockSaved).toHaveLength(1);
  });
});
