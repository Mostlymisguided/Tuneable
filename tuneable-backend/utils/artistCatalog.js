/**
 * Pure helpers for unclaimed artist catalog pages.
 * A catalog groups credited media under one public slug. It is not a User.
 */

const { isPlaceholderCreatorLabel } = require('./creatorHelpers');

const CREDIT_FIELDS = [
  'artist',
  'producer',
  'featuring',
  'songwriter',
  'composer',
  'mixedBy',
  'masteredBy',
  'host',
  'guest',
  'narrator',
  'director',
  'cinematographer',
  'editor',
  'author',
];

const PRIMARY_ROLES = new Set(['artist', 'host', 'author']);
const APPEARS_ROLES = new Set(['featuring', 'guest']);

const RESERVED_SLUGS = new Set(['index', 'admin', 'claims', 'new']);

const MAX_ALIASES = 12;
const MAX_MEDIA = 500;

function normalizeArtistCatalogName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function slugifyArtistCatalogName(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'artist';
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive exact credit match. Spaces inside the name may vary. */
function exactNameRegex(name) {
  const parts = normalizeArtistCatalogName(name).split(' ').filter(Boolean).map(escapeRegex);
  if (!parts.length) return null;
  return new RegExp(`^\\s*${parts.join('\\s+')}\\s*$`, 'i');
}

/**
 * Canonical name plus aliases, deduped by normalized key.
 * Placeholder labels such as "Unknown Artist" are dropped.
 */
function collectCatalogNames(name, aliases = []) {
  const incoming = [name, ...(Array.isArray(aliases) ? aliases : [])];
  const keys = [];
  const aliasLabels = [];
  const seen = new Set();
  let displayName = '';

  incoming.forEach((raw) => {
    const label = String(raw || '').trim().replace(/\s+/g, ' ');
    const key = normalizeArtistCatalogName(label);
    if (!key || isPlaceholderCreatorLabel(label) || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
    if (!displayName) {
      displayName = label;
      return;
    }
    aliasLabels.push(label);
  });

  return { name: displayName, aliases: aliasLabels.slice(0, MAX_ALIASES), nameKeys: keys };
}

function matchedRoles(media, nameKeys) {
  const keys = nameKeys instanceof Set ? nameKeys : new Set(nameKeys || []);
  const roles = [];
  CREDIT_FIELDS.forEach((field) => {
    const people = media?.[field];
    if (!Array.isArray(people)) return;
    const hit = people.some((person) => keys.has(normalizeArtistCatalogName(person?.name)));
    if (hit) roles.push(field);
  });
  return roles;
}

function sectionForRoles(roles) {
  const list = Array.isArray(roles) ? roles : [];
  if (list.some((role) => PRIMARY_ROLES.has(role))) return 'artist';
  if (list.some((role) => APPEARS_ROLES.has(role))) return 'appears';
  return 'credits';
}

/**
 * Point matching credits at a user. Never replaces a credit already linked
 * to someone else. Returns counts; caller saves the document.
 */
function linkCredits(media, nameKeys, userId, { verify = false } = {}) {
  const keys = nameKeys instanceof Set ? nameKeys : new Set(nameKeys || []);
  const user = userId == null ? '' : String(userId._id || userId);
  const result = { linked: 0, already: 0, heldByOther: 0 };
  if (!user || !keys.size) return result;

  CREDIT_FIELDS.forEach((field) => {
    if (!Array.isArray(media?.[field])) return;
    let touched = false;
    media[field].forEach((person) => {
      if (!person || !keys.has(normalizeArtistCatalogName(person.name))) return;
      const existing = person.userId ? String(person.userId._id || person.userId) : '';
      if (!existing) {
        person.userId = userId;
        if (verify) person.verified = true;
        result.linked += 1;
        touched = true;
        return;
      }
      if (existing === user) {
        result.already += 1;
        if (verify && person.verified !== true) {
          person.verified = true;
          touched = true;
        }
        return;
      }
      result.heldByOther += 1;
    });
    if (touched && typeof media.markModified === 'function') {
      media.markModified(field);
    }
  });

  return result;
}

function remainingOwnershipPercentage(media) {
  const total = (media?.mediaOwners || []).reduce(
    (sum, owner) => sum + (Number(owner?.percentage) || 0),
    0
  );
  return Math.round((100 - total) * 100) / 100;
}

function ownerUserId(owner) {
  if (!owner?.userId) return '';
  return String(owner.userId._id || owner.userId);
}

module.exports = {
  CREDIT_FIELDS,
  RESERVED_SLUGS,
  MAX_ALIASES,
  MAX_MEDIA,
  normalizeArtistCatalogName,
  slugifyArtistCatalogName,
  exactNameRegex,
  collectCatalogNames,
  matchedRoles,
  sectionForRoles,
  linkCredits,
  remainingOwnershipPercentage,
  ownerUserId,
};
