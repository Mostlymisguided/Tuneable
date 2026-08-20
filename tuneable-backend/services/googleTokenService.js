const axios = require('axios');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

function googleClientCredentials() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET,
  };
}

function youtubeLikesConnected(user) {
  return Boolean(
    user?.oauthVerified?.youtube
    && (user.googleAccessToken || user.googleRefreshToken)
  );
}

function reauthError(message) {
  const err = new Error(message || 'YouTube access expired. Please reconnect YouTube.');
  err.status = 400;
  err.code = 'PROVIDER_REAUTH_REQUIRED';
  return err;
}

async function refreshGoogleAccessToken(user) {
  if (!user?.googleRefreshToken) {
    throw reauthError('YouTube access expired. Please reconnect YouTube.');
  }
  const { clientId, clientSecret } = googleClientCredentials();
  if (!clientId || !clientSecret) {
    const err = new Error('Google OAuth is not configured on the server.');
    err.status = 500;
    throw err;
  }

  try {
    const res = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: user.googleRefreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );
    const accessToken = res.data?.access_token;
    if (!accessToken) {
      throw reauthError('YouTube token refresh failed. Please reconnect YouTube.');
    }
    user.googleAccessToken = accessToken;
    if (res.data.refresh_token) user.googleRefreshToken = res.data.refresh_token;
    await user.save();
    return accessToken;
  } catch (error) {
    if (error.code === 'PROVIDER_REAUTH_REQUIRED' || error.status === 500) throw error;
    throw reauthError('YouTube access expired. Please reconnect YouTube.');
  }
}

function isInsufficientYoutubeScope(error) {
  const status = error.response?.status;
  if (status !== 401 && status !== 403) return false;
  const reason = error.response?.data?.error?.errors?.[0]?.reason
    || error.response?.data?.error?.status
    || '';
  return /insufficient|authError|UNAUTHENTICATED|PERMISSION_DENIED/i.test(String(reason))
    || /insufficientPermissions|youtube.readonly/i.test(JSON.stringify(error.response?.data || {}));
}

/**
 * GET with the user's Google access token; refresh once on 401.
 */
async function googleGet(user, url, config = {}) {
  let accessToken = user.googleAccessToken;
  if (!accessToken && user.googleRefreshToken) {
    accessToken = await refreshGoogleAccessToken(user);
  }
  if (!accessToken) {
    throw reauthError('Connect YouTube to import liked videos.');
  }

  const headers = {
    ...(config.headers || {}),
    Authorization: `Bearer ${accessToken}`,
  };

  try {
    return await axios.get(url, { ...config, headers });
  } catch (error) {
    if (error.response?.status === 401 && user.googleRefreshToken) {
      try {
        accessToken = await refreshGoogleAccessToken(user);
        return await axios.get(url, {
          ...config,
          headers: { ...(config.headers || {}), Authorization: `Bearer ${accessToken}` },
        });
      } catch (retryError) {
        if (isInsufficientYoutubeScope(retryError)) {
          throw reauthError('Reconnect YouTube with permission to read liked videos.');
        }
        throw retryError;
      }
    }
    if (isInsufficientYoutubeScope(error)) {
      throw reauthError('Reconnect YouTube with permission to read liked videos.');
    }
    throw error;
  }
}

module.exports = {
  YOUTUBE_READONLY_SCOPE,
  youtubeLikesConnected,
  refreshGoogleAccessToken,
  googleGet,
};
