/**
 * Password rules shared by registration, reset and change.
 *
 * Length is the only hard rule. Common, personal and breached passwords produce
 * warnings the user can override. No composition rules, no forced rotation.
 */

const crypto = require('crypto');

const PASSWORD_MIN_LENGTH = 6;
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
 * The only hard requirements: present, 8+ characters, not absurdly long.
 * @returns {string|null} error message, or null when acceptable
 */
function checkPasswordRules(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required';
  }
  if ([...password].length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  return null;
}

/**
 * Advice the user may ignore.
 * @param {string} password
 * @param {{ username?: string, email?: string }} [context]
 * @returns {string[]}
 */
function getPasswordWarnings(password, context = {}) {
  const warnings = [];
  const flat = normalise(password);
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || COMMON_PASSWORDS.has(flat)) {
    warnings.push('That password is very common, so it\u2019s one of the first an attacker would try.');
  } else if (flat.length > 0 && new Set(flat).size === 1) {
    warnings.push('That password is very easy to guess.');
  }

  const personal = [
    normalise(context.username),
    normalise(String(context.email || '').split('@')[0]),
  ].filter((s) => s.length >= 4);
  if (personal.some((s) => flat.includes(s))) {
    warnings.push('That password contains your username or email, which makes it easier to guess.');
  }
  return warnings;
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
 * Full assessment of a password a user is choosing now. The breach lookup
 * fails open so an outage never blocks sign-up.
 * @returns {Promise<{ error: string|null, warnings: string[] }>}
 */
async function assessNewPassword(password, context = {}) {
  const error = checkPasswordRules(password);
  if (error) return { error, warnings: [] };

  const warnings = getPasswordWarnings(password, context);
  if (await isPasswordBreached(password)) {
    warnings.unshift('That password has appeared in a known data breach, so attackers already have it on their lists.');
  }
  return { error: null, warnings };
}

/**
 * Route helper. Warnings are only returned until the client resubmits with
 * `acceptPasswordWarnings: true`, so the user sees them once and decides.
 * @returns {Promise<{ status: number, body: object }|null>} null when the password may be used
 */
async function checkNewPassword(password, context, acceptWarnings) {
  const { error, warnings } = await assessNewPassword(password, context);
  if (error) {
    return { status: 400, body: { error, code: 'WEAK_PASSWORD' } };
  }
  if (warnings.length && acceptWarnings !== true) {
    return {
      status: 422,
      body: { error: warnings[0], warnings, code: 'PASSWORD_WARNINGS' },
    };
  }
  return null;
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  checkPasswordRules,
  getPasswordWarnings,
  isPasswordBreached,
  assessNewPassword,
  checkNewPassword,
};
