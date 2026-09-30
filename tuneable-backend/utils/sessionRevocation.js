/**
 * A JWT is revoked when it was issued before the user's last password change.
 * `iat` has one-second resolution, so a token issued in the same second as the
 * change (the one handed back to the device that changed it) stays valid.
 * @param {{ iat?: number }} decoded - verified JWT payload
 * @param {{ passwordChangedAt?: Date|null }} user - must have passwordChangedAt selected
 */
function isTokenRevoked(decoded, user) {
  if (!user || !user.passwordChangedAt || typeof decoded?.iat !== 'number') return false;
  const changedAtSeconds = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
  return decoded.iat < changedAtSeconds;
}

module.exports = { isTokenRevoked };
