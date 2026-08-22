/**
 * Expo push delivery for in-app notifications.
 * Failures never block the in-app / Socket.IO path.
 */

const axios = require('axios');
const User = require('../models/User');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;
const CHUNK_SIZE = 100;

function isExpoPushToken(token) {
  return typeof token === 'string' && EXPO_TOKEN_RE.test(token);
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function removeInvalidTokens(tokens) {
  if (!tokens.length) return;
  await User.updateMany(
    { 'pushDevices.token': { $in: tokens } },
    { $pull: { pushDevices: { token: { $in: tokens } } } }
  );
}

/**
 * Send a push to every registered device for a user.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {{ title: string, body: string, data?: Record<string, unknown> }} payload
 */
async function sendPushToUser(userId, payload) {
  try {
    if (!userId || !payload?.title || !payload?.body) return;

    const user = await User.findById(userId).select('pushDevices preferences.notifications');
    if (!user) return;
    if (user.preferences?.notifications?.push === false) return;

    const tokens = (user.pushDevices || [])
      .map((device) => device.token)
      .filter(isExpoPushToken);
    if (!tokens.length) return;

    const messages = tokens.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      sound: 'default',
      data: payload.data || {},
    }));

    const invalid = [];
    for (const group of chunk(messages, CHUNK_SIZE)) {
      const response = await axios.post(EXPO_PUSH_URL, group, {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      const tickets = Array.isArray(response.data?.data) ? response.data.data : [];
      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'error' && ticket?.details?.error === 'DeviceNotRegistered') {
          invalid.push(group[index].to);
        }
      });
    }

    if (invalid.length) {
      await removeInvalidTokens(invalid);
    }
  } catch (error) {
    console.error('Error sending push notification:', error.message);
  }
}

module.exports = {
  isExpoPushToken,
  sendPushToUser,
};
