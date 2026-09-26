/**
 * Strict public-identifier classifiers.
 * mongoose.Types.ObjectId.isValid is too loose (12-char strings, integers, etc.).
 * Usernames are 3–20 chars; ObjectIds are 24 hex; UUIDs are 36 with hyphens —
 * so these never collide with usernames. Media slugs are generated to avoid
 * UUID / ObjectId shapes.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

function isUuidString(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

function isMongoObjectIdString(value) {
  return typeof value === 'string' && OBJECT_ID_RE.test(value.trim());
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeIdentifier(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

module.exports = {
  isUuidString,
  isMongoObjectIdString,
  escapeRegex,
  normalizeIdentifier,
};
