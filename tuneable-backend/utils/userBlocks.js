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

const ANONYMOUS_USERNAME = 'Supporter';
const DEFAULT_PROFILE_PIC = 'https://uploads.tuneable.stream/profile-pictures/default-profile.png';
const USER_ID_KEYS = ['_id', 'id', 'uuid', 'userId', 'user_uuid', 'userId_uuid'];
const IDENTITY_KEYS = [
  'email',
  'givenName',
  'familyName',
  'bio',
  'artistName',
  'creatorProfile',
  'socialMedia',
  'homeLocation',
  'secondaryLocation',
];

function isIdLike(value) {
  return typeof value === 'string' || value instanceof mongoose.Types.ObjectId;
}

/**
 * Replaces the name and avatar of every blocked user in a plain JSON payload
 * with an anonymous placeholder, in place. Ids are kept so tip totals and
 * ranks still add up; the profile endpoint already 404s for blocked viewers.
 * Matches populated user refs and flattened rows such as Bid.username.
 */
function maskBlockedUsers(value, blockedIds) {
  if (!blockedIds || blockedIds.size === 0 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    value.forEach((item) => maskBlockedUsers(item, blockedIds));
    return value;
  }
  if (typeof value.username === 'string') {
    const hit = USER_ID_KEYS.some((key) => isIdLike(value[key]) && blockedIds.has(String(value[key])));
    if (hit) {
      value.username = ANONYMOUS_USERNAME;
      if ('profilePic' in value) value.profilePic = DEFAULT_PROFILE_PIC;
      for (const key of IDENTITY_KEYS) delete value[key];
      value.anonymous = true;
    }
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') maskBlockedUsers(child, blockedIds);
  }
  return value;
}

module.exports = {
  isBlockedBetween,
  getBlockState,
  getBlockedUserIds,
  assertNotBlocked,
  maskBlockedUsers,
  ANONYMOUS_USERNAME,
};
