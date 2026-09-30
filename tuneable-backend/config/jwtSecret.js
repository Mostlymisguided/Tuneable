/**
 * Single source for the JWT signing secret. There is deliberately no fallback:
 * a guessable default would let anyone forge a login token for any account.
 */

const PLACEHOLDER_SECRETS = new Set([
  'defaultsecretkey',
  'JWT Secret failed to fly',
  'your-secret-key',
  'your-secret-key-here',
  'secret',
  'changeme',
]);

const TEST_SECRET = 'test-only-jwt-secret-not-for-production';
const RECOMMENDED_MIN_LENGTH = 32;

/**
 * Read at call time, not module load, because index.js loads .env after some
 * modules are required.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && !PLACEHOLDER_SECRETS.has(secret)) return secret;
  if (process.env.NODE_ENV === 'test') return TEST_SECRET;
  throw new Error(
    secret
      ? 'JWT_SECRET is set to a known placeholder value. Set it to a long random string.'
      : 'JWT_SECRET is not set. Refusing to sign or verify login tokens without it.'
  );
}

/** Call once at startup so a misconfigured server fails before serving traffic. */
function assertJwtSecretConfigured() {
  const secret = getJwtSecret();
  if (secret.length < RECOMMENDED_MIN_LENGTH && process.env.NODE_ENV !== 'test') {
    console.warn(
      `⚠️  JWT_SECRET is only ${secret.length} characters. Use at least ${RECOMMENDED_MIN_LENGTH} random characters ` +
      '(e.g. `openssl rand -base64 48`). Changing it signs everyone out.'
    );
  }
}

module.exports = { getJwtSecret, assertJwtSecretConfigured };
