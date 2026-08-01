const { createRemoteJWKSet, jwtVerify } = require('jose');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys')
);

function resolveAudiences() {
  const fromEnv = (process.env.APPLE_CLIENT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return [process.env.APPLE_BUNDLE_ID || 'stream.tuneable.app'];
}

/**
 * Verify an Apple identity token from Sign in with Apple.
 * @param {string} identityToken
 * @returns {Promise<{ appleId: string, email: string|null, emailVerified: boolean }>}
 */
async function verifyAppleIdentityToken(identityToken) {
  if (!identityToken || typeof identityToken !== 'string') {
    const err = new Error('Apple identity token is required');
    err.status = 400;
    throw err;
  }

  try {
    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: resolveAudiences(),
    });

    if (!payload.sub) {
      const err = new Error('Apple token missing subject');
      err.status = 401;
      throw err;
    }

    const emailVerified =
      payload.email_verified === true || payload.email_verified === 'true';

    return {
      appleId: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified,
    };
  } catch (error) {
    if (error.status) throw error;
    console.error('Apple identity token verification failed:', error.message);
    const err = new Error('Invalid Apple identity token');
    err.status = 401;
    throw err;
  }
}

module.exports = {
  verifyAppleIdentityToken,
};
