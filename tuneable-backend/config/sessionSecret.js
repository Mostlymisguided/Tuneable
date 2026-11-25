/**
 * OAuth session cookie secret. There is deliberately no public fallback:
 * the old default let anyone forge a session cookie if the env var was missing.
 */

const PLACEHOLDER_SECRETS = new Set([
  'your-session-secret-key',
  'your-secret-key',
  'your-secret-key-here',
  'secret',
  'changeme',
  'defaultsecretkey',
]);

const TEST_SECRET = 'test-only-session-secret-not-for-production';
const RECOMMENDED_MIN_LENGTH = 32;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && !PLACEHOLDER_SECRETS.has(secret)) return secret;
  if (process.env.NODE_ENV === 'test') return TEST_SECRET;
  throw new Error(
    secret
      ? 'SESSION_SECRET is set to a known placeholder value. Set it to a long random string.'
      : 'SESSION_SECRET is not set. Refusing to sign OAuth session cookies without it.'
  );
}

function assertSessionSecretConfigured() {
  const secret = getSessionSecret();
  if (secret.length < RECOMMENDED_MIN_LENGTH && process.env.NODE_ENV !== 'test') {
    console.warn(
      `⚠️  SESSION_SECRET is only ${secret.length} characters. Use at least ${RECOMMENDED_MIN_LENGTH} random characters ` +
      '(e.g. `openssl rand -base64 48`). Changing it signs OAuth flows out.'
    );
  }
}

module.exports = { getSessionSecret, assertSessionSecretConfigured };
