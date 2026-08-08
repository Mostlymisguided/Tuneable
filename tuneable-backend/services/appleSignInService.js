const { createRemoteJWKSet, decodeJwt, jwtVerify } = require('jose');

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

  const audiences = [
    process.env.APPLE_BUNDLE_ID || 'stream.tuneable.app',
    process.env.APPLE_SERVICES_ID,
    process.env.APPLE_WEB_CLIENT_ID,
  ]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);

  return [...new Set(audiences)];
}

function describeVerifyFailure(identityToken, error, audiences) {
  let aud;
  try {
    aud = decodeJwt(identityToken).aud;
  } catch {
    return error.message;
  }

  const audList = Array.isArray(aud) ? aud : aud != null ? [String(aud)] : [];
  const expoGoAud = audList.some(
    (a) => a === 'host.exp.Exponent' || a === 'host.expo.Exponent'
  );
  if (expoGoAud) {
    return (
      'Apple token was issued for Expo Go (host.exp.Exponent). ' +
      'Use a development or TestFlight build so the token audience is the app bundle ID.'
    );
  }

  if (
    error.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' &&
    error.claim === 'aud'
  ) {
    return (
      `Apple token audience mismatch (got ${audList.join(', ') || 'none'}; ` +
      `expected ${audiences.join(', ')}).`
    );
  }

  return error.message;
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

  const audiences = resolveAudiences();

  try {
    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: audiences,
      clockTolerance: 60,
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
    const detail = describeVerifyFailure(identityToken, error, audiences);
    console.error('Apple identity token verification failed:', detail);
    const err = new Error(
      detail.startsWith('Apple token')
        ? detail
        : 'Invalid Apple identity token'
    );
    err.status = 401;
    throw err;
  }
}

module.exports = {
  verifyAppleIdentityToken,
};
