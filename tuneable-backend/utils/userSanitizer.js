const SENSITIVE_USER_FIELDS = [
  'password',
  'passwordResetToken',
  'passwordResetExpires',
  'emailVerificationToken',
  'emailVerificationExpires',
  'unsubscribeToken',
  'unsubscribeTokenExpires',
  'facebookAccessToken',
  'googleAccessToken',
  'googleRefreshToken',
  'soundcloudAccessToken',
  'soundcloudRefreshToken',
  'instagramAccessToken',
  'spotifyAccessToken',
  'spotifyRefreshToken',
];

/**
 * Removes credentials from a plain user object before it is sent to a client.
 * Adds `hasPassword` when the password field was loaded.
 */
function stripSensitiveUserFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if ('password' in obj) {
    obj.hasPassword = Boolean(obj.password);
  }
  for (const field of SENSITIVE_USER_FIELDS) {
    delete obj[field];
  }
  return obj;
}

module.exports = { SENSITIVE_USER_FIELDS, stripSensitiveUserFields };
