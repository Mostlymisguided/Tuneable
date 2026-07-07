/**
 * Shared helpers for the Gear catalog (slugify, name matching).
 */

const slugifyGearName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive exact name match regex */
const exactNameRegex = (name) => new RegExp(`^${escapeRegex(name.trim())}$`, 'i');

module.exports = {
  slugifyGearName,
  escapeRegex,
  exactNameRegex,
};
