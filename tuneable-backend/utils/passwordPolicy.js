/**
 * Password rules shared by registration, reset and change.
 *
 * Follows NIST SP 800-63B: length plus a known-bad check, no composition rules
 * ("must include a symbol") and no forced rotation.
 */

const crypto = require('crypto');

const PASSWORD_MIN_LENGTH = 8;
// bcrypt only reads the first 72 bytes; the cap stops absurd inputs, not weak ones.
const PASSWORD_MAX_LENGTH = 128;

const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const PWNED_TIMEOUT_MS = 2500;

// Fallback when the breach API is unreachable. Only entries >= min length matter.
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000',
  '12341234', '11223344', 'password', 'password1', 'password12', 'password123',
  'passw0rd', 'p@ssw0rd', 'iloveyou', 'sunshine', 'princess', 'football',
  'baseball', 'superman', 'trustno1', 'whatever', 'starwars', 'qwertyuiop',
  'qwerty123', 'qwertyui', 'asdfghjkl', 'zxcvbnm1', '1q2w3e4r', '1qaz2wsx',
  'letmein1', 'welcome1', 'welcome123', 'abc12345', 'abcd1234', 'aa123456',
  'changeme', 'master123', 'michael1', 'jennifer', 'computer', 'internet',
  'liverpool', 'chelsea1', 'arsenal1', 'football1', 'monkey123', 'dragon123',
  'music123', 'musiclover', 'ilovemusic', 'tuneable', 'tuneable1', 'tuneable123',
]);

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Synchronous checks. Returns an error message, or null when acceptable.
 * @param {string} password
 * @param {{ username?: string, email?: string }} [context]
 */
function checkPasswordRules(password, context = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required';
  }
  if ([...password].length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }

  const flat = normalise(password);
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || COMMON_PASSWORDS.has(flat)) {
    return 'That password is too common. Try a few random words instead.';
  }
  if (flat.length > 0 && new Set(flat).size === 1) {
    return 'That password is too easy to guess. Try a few random words instead.';
  }

  const personal = [
    normalise(context.username),
    normalise(String(context.email || '').split('@')[0]),
  ].filter((s) => s.length >= 4);
  if (personal.some((s) => flat.includes(s))) {
    return 'Your password shouldn\u2019t contain your username or email.';
  }

  return null;
}

/**
 * Have I Been Pwned k-anonymity lookup: only the first 5 hex chars of the
 * SHA-1 hash leave the server.
 * @returns {Promise<boolean|null>} null when the service could not be reached
 */
async function isPasswordBreached(password) {
  const hash = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const res = await fetch(PWNED_RANGE_URL + prefix, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'Tuneable-Password-Check' },
      signal: AbortSignal.timeout(PWNED_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = await res.text();
    return body.split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':');
      return candidate === suffix && Number(count) > 0;
    });
  } catch (error) {
    console.warn('Pwned Passwords check unavailable:', error.message);
    return null;
  }
}

/**
 * Full check for a password a user is choosing now. Fails open on the breach
 * lookup so an outage never blocks sign-up.
 * @returns {Promise<string|null>} error message, or null when acceptable
 */
async function validateNewPassword(password, context = {}) {
  const ruleError = checkPasswordRules(password, context);
  if (ruleError) return ruleError;

  if (await isPasswordBreached(password)) {
    return 'That password has appeared in a known data breach. Please choose a different one \u2014 a few random words works well.';
  }
  return null;
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  checkPasswordRules,
  isPasswordBreached,
  validateNewPassword,
};
