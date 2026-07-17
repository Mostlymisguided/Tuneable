const User = require('../models/User');

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Strip diacritics/spaces/non-alphanumeric characters, then clamp to max length.
 * e.g. "José García" → "JoseGarcia"
 */
function sanitizeUsernameCandidate(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, MAX_USERNAME_LENGTH);
}

/**
 * Build a unique OAuth username that matches profile update rules (3–20 alphanumeric).
 * Prefers given+family name, then displayName, email local-part, then provider+id.
 * Collision resolution uses ascending numerals (Name2, Name3, …) with case-insensitive checks.
 */
async function generateUniqueOAuthUsername({ profile, email, provider }) {
  const givenName = profile?.name?.givenName;
  const familyName = profile?.name?.familyName;
  const displayName = profile?.displayName;
  const providerKey = String(provider || 'user').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'user';
  const profileId = String(profile?.id || '');

  const rawCandidates = [];
  if (givenName && familyName) {
    rawCandidates.push(`${givenName}${familyName}`);
  }
  if (givenName) rawCandidates.push(givenName);
  if (familyName) rawCandidates.push(familyName);
  if (displayName) rawCandidates.push(displayName);
  if (email) rawCandidates.push(String(email).split('@')[0]);
  rawCandidates.push(`${providerKey}${profileId.substring(0, 10)}`);
  rawCandidates.push(`${providerKey}user`);

  let baseUsername = '';
  for (const raw of rawCandidates) {
    const cleaned = sanitizeUsernameCandidate(raw);
    if (cleaned.length >= MIN_USERNAME_LENGTH) {
      baseUsername = cleaned;
      break;
    }
  }

  if (!baseUsername) {
    baseUsername = sanitizeUsernameCandidate(`${providerKey}user`) || 'user';
    if (baseUsername.length < MIN_USERNAME_LENGTH) {
      baseUsername = 'user';
    }
  }

  let username = baseUsername;
  let counter = 2; // First duplicate becomes Name2, not Name1
  // eslint-disable-next-line no-await-in-loop
  while (await User.findOne({
    username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') },
  })) {
    const suffix = String(counter);
    const maxBaseLen = MAX_USERNAME_LENGTH - suffix.length;
    username = `${baseUsername.substring(0, Math.max(1, maxBaseLen))}${suffix}`;
    counter += 1;
    if (counter > 10000) {
      username = sanitizeUsernameCandidate(`${providerKey}${Date.now()}`) || `user${Date.now()}`;
      break;
    }
  }

  return username;
}

module.exports = {
  generateUniqueOAuthUsername,
  sanitizeUsernameCandidate,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
};
