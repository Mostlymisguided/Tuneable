const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { getJwtSecret } = require('../config/jwtSecret');
const { getBlockedUserIds, maskBlockedUsers } = require('../utils/userBlocks');

/**
 * Many routes on these routers are public and never set req.user, so the
 * viewer is read from the bearer token when needed. Token revocation is not
 * checked: masking only ever hides more.
 */
async function resolveViewerId(req) {
  if (req.user?._id) return req.user._id;
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    const { userId } = jwt.verify(token, getJwtSecret());
    if (!userId) return null;
    if (mongoose.Types.ObjectId.isValid(userId) && !String(userId).includes('-')) return userId;
    const user = await User.findOne({ uuid: userId }).select('_id').lean();
    return user?._id || null;
  } catch {
    return null;
  }
}

/**
 * Hides the name and avatar of users the viewer blocked or was blocked by in
 * every JSON response from the router it is mounted on.
 */
module.exports = function maskBlockedUsersMiddleware(req, res, next) {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (!body || typeof body !== 'object') return sendJson(body);
    resolveViewerId(req)
      .then((viewerId) => (viewerId ? getBlockedUserIds(viewerId) : new Set()))
      .then((blockedIds) => {
        if (blockedIds.size === 0) return sendJson(body);
        return sendJson(maskBlockedUsers(JSON.parse(JSON.stringify(body)), blockedIds));
      })
      .catch((error) => {
        console.error('maskBlockedUsers failed:', error);
        if (!res.headersSent) sendJson(body);
      });
    return res;
  };
  next();
};
