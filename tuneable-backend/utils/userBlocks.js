const mongoose = require('mongoose');
const User = require('../models/User');

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const raw = value._id || value;
  return mongoose.Types.ObjectId.isValid(raw) ? new mongoose.Types.ObjectId(String(raw)) : null;
}

/**
 * True when either user has blocked the other.
 */
async function isBlockedBetween(userA, userB) {
  const a = toObjectId(userA);
  const b = toObjectId(userB);
  if (!a || !b || a.equals(b)) return false;
  const hit = await User.exists({
    $or: [
      { _id: a, blockedUsers: b },
      { _id: b, blockedUsers: a },
    ],
  });
  return Boolean(hit);
}

/**
 * Block state from the viewer's side: whether they blocked the target, and
 * whether the target blocked them.
 */
async function getBlockState(viewer, target) {
  const v = toObjectId(viewer);
  const t = toObjectId(target);
  if (!v || !t || v.equals(t)) return { blockedByMe: false, blockedMe: false };
  const [blockedByMe, blockedMe] = await Promise.all([
    User.exists({ _id: v, blockedUsers: t }),
    User.exists({ _id: t, blockedUsers: v }),
  ]);
  return { blockedByMe: Boolean(blockedByMe), blockedMe: Boolean(blockedMe) };
}

/**
 * String ids of every user the viewer blocked or was blocked by.
 */
async function getBlockedUserIds(viewer) {
  const v = toObjectId(viewer);
  if (!v) return new Set();
  const [self, blockers] = await Promise.all([
    User.findById(v).select('blockedUsers').lean(),
    User.find({ blockedUsers: v }).select('_id').lean(),
  ]);
  const ids = new Set();
  for (const id of self?.blockedUsers || []) ids.add(String(id));
  for (const u of blockers) ids.add(String(u._id));
  return ids;
}

/**
 * Throws a 403 when the two users have blocked each other in either direction.
 * The message never says who blocked whom.
 */
async function assertNotBlocked(userA, userB, message = 'You cannot interact with this user') {
  if (await isBlockedBetween(userA, userB)) {
    throw Object.assign(new Error(message), { status: 403, code: 'USER_BLOCKED' });
  }
}

module.exports = {
  isBlockedBetween,
  getBlockState,
  getBlockedUserIds,
  assertNotBlocked,
};
