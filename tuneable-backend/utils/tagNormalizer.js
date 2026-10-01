/**
 * Tag normalization and fuzzy matching utilities
 *
 * Two layers:
 * - Match key: lowercase, no spaces/punctuation (never show/store this)
 * - Display/storage: Title Case, with aliases + acronym exceptions
 */

/**
 * Normalize tag for fuzzy matching
 * Handles: D&b -> dnb, hip-hop -> hiphop, etc.
 * @param {string} tag - The tag to normalize
 * @returns {string} - Normalized tag (lowercase, no special chars, no spaces)
 */
function normalizeTagForMatching(tag) {
  if (!tag || typeof tag !== 'string') return '';

  return tag
    .toLowerCase()
    .trim()
    // Remove special characters (keep alphanumeric and spaces)
    .replace(/[^\w\s]/g, '')
    // Normalize whitespace (multiple spaces/hyphens/underscores to single space)
    .replace(/[\s\-_]+/g, ' ')
    .trim()
    // Remove spaces entirely for matching (Drum And Bass -> drumandbass)
    .replace(/\s+/g, '');
}

/**
 * Tag aliases — keys must be match keys (output of normalizeTagForMatching).
 * Values are canonical display forms.
 */
const TAG_ALIASES = {
  // Drum & Bass
  dnb: 'DnB',
  drumandbass: 'DnB',
  drumbass: 'DnB',
  drumnbass: 'DnB',
  drumnbassmusic: 'DnB',
  db: 'DnB',

  // Hip Hop
  hiphop: 'Hip Hop',

  // UK Hip Hop
  ukhiphop: 'UK Hip Hop',

  // UK R&B
  ukrb: 'UK R&B',
  ukrandb: 'UK R&B',

  // UK Rap
  ukrap: 'UK Rap',

  // Electronic
  edm: 'Electronic',
  electronic: 'Electronic',

  // House
  house: 'House',
  housemusic: 'House',
  deephouse: 'Deep House',
  techhouse: 'Tech House',
  progressivehouse: 'Progressive House',
  melodichouse: 'Melodic House',
  afrohouse: 'Afro House',

  // Singer Songwriter
  singersongwriter: 'Singer Songwriter',

  // Techno
  techno: 'Techno',
  technomusic: 'Techno',
  melodictechno: 'Melodic Techno',

  // R&B
  rnb: 'R&B',
  randb: 'R&B',
  rb: 'R&B',
  rhythmandblues: 'R&B',
  rhythmblues: 'R&B',

  // Genres where "&" is part of the name (kept whole by splitCompoundTag)
  rockroll: 'Rock & Roll',
  rockandroll: 'Rock & Roll',
  rocknroll: 'Rock & Roll',
  countrywestern: 'Country & Western',
  countryandwestern: 'Country & Western',
  stagescreen: 'Stage & Screen',
  stageandscreen: 'Stage & Screen',
};

const PRIMARY_TAG_SEPARATORS = /\s*[/,;]\s*/;
const SECONDARY_TAG_SEPARATORS = /\s+[&+]\s+/;

function isAliasedTag(tag) {
  return Boolean(TAG_ALIASES[normalizeTagForMatching(tag)]);
}

/**
 * Split a compound genre string into its parts, e.g.
 * "Hip-Hop & Rap" -> ["Hip-Hop", "Rap"], "R&B/Soul" -> ["R&B", "Soul"].
 * Known aliases ("Drum & Bass", "Singer/Songwriter", "R & B") stay whole,
 * and unspaced "&" (R&B, D&B) is never a separator.
 * Returns raw parts — pass each through normalizeTagForStorage.
 * @param {string} tag
 * @returns {string[]}
 */
function splitCompoundTag(tag) {
  if (!tag || typeof tag !== 'string') return [];
  const trimmed = tag.trim();
  if (!trimmed) return [];
  if (isAliasedTag(trimmed)) return [trimmed];

  const parts = [];
  for (const piece of trimmed.split(PRIMARY_TAG_SEPARATORS)) {
    const p = piece.trim();
    if (!p) continue;
    if (isAliasedTag(p)) {
      parts.push(p);
      continue;
    }
    for (const sub of p.split(SECONDARY_TAG_SEPARATORS)) {
      const s = sub.trim();
      if (s) parts.push(s);
    }
  }
  return parts;
}

/**
 * Capitalize tag for display: Title Case per word, with acronym + stylization exceptions.
 * @param {string} tag
 * @returns {string}
 */
function capitalizeTag(tag) {
  if (!tag || typeof tag !== 'string') return tag;

  const acronyms = new Set(['uk', 'dj', 'edm', 'rnb', 'dnb', 'r&b', 'd&b']);

  return tag
    .trim()
    .split(/\s+/)
    .map((word) => {
      const wordLower = word.toLowerCase();
      const isKnownAcronym = acronyms.has(wordLower);
      const isAcronymFormat = /^[A-Z]{2,4}$/.test(word);
      const hasSpecialChars = /[&/\-]/.test(word);
      const isStylized = /^[A-Z][a-z]+[A-Z]/.test(word) || /[a-z][A-Z]/.test(word);

      if (isKnownAcronym) {
        return wordLower
          .split('')
          .map((char) => (/[&/\-]/.test(char) ? char : char.toUpperCase()))
          .join('');
      }

      if (isAcronymFormat) {
        return word;
      }

      if (isStylized) {
        return word;
      }

      if (hasSpecialChars) {
        return word
          .split('')
          .map((char, i) => {
            if (/[&/\-]/.test(char)) return char;
            if (i === 0 || (i > 0 && /[&/\-]/.test(word[i - 1]))) {
              return char.toUpperCase();
            }
            return char.toLowerCase();
          })
          .join('');
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Normalize tag for storage/display.
 * Uses canonical alias when available; otherwise Title-Cases the original wording.
 * @param {string} tag
 * @returns {string}
 */
function normalizeTagForStorage(tag) {
  if (!tag || typeof tag !== 'string') return tag;

  const trimmed = tag.trim();
  if (!trimmed) return '';

  const normalized = normalizeTagForMatching(trimmed);
  const canonical = TAG_ALIASES[normalized];

  if (canonical) {
    return canonical;
  }

  // Preserve original word boundaries/spaces; Title Case for display
  return capitalizeTag(trimmed);
}

/**
 * Canonical form for matching/grouping.
 * Prefer display alias when known; otherwise the match key.
 * Do NOT use for user-facing labels — use normalizeTagForStorage.
 * @param {string} tag
 * @returns {string}
 */
function getCanonicalTag(tag) {
  const normalized = normalizeTagForMatching(tag);
  return TAG_ALIASES[normalized] || normalized;
}

/**
 * Check if two tags match (fuzzy)
 * @param {string} tag1
 * @param {string} tag2
 * @returns {boolean}
 */
function tagsMatch(tag1, tag2) {
  const norm1 = normalizeTagForMatching(tag1);
  const norm2 = normalizeTagForMatching(tag2);

  if (norm1 === norm2) return true;

  const canon1 = TAG_ALIASES[norm1] || norm1;
  const canon2 = TAG_ALIASES[norm2] || norm2;

  return normalizeTagForMatching(canon1) === normalizeTagForMatching(canon2);
}

/**
 * Find all tags that match a given tag (fuzzy)
 * @param {string} tag
 * @param {Array<string>} tagList
 * @returns {Array<string>}
 */
function findMatchingTags(tag, tagList) {
  if (!tag || !Array.isArray(tagList)) return [];
  return tagList.filter((t) => tagsMatch(tag, t));
}

/**
 * Split compound tags, normalize for storage, and de-duplicate (fuzzy).
 * @param {Array<string>} tags
 * @param {number} [limit]
 * @returns {Array<string>}
 */
function normalizeTagList(tags, limit = Infinity) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const raw of tags) {
    for (const part of splitCompoundTag(raw)) {
      const normalized = normalizeTagForStorage(part);
      if (!normalized) continue;
      if (out.some((t) => tagsMatch(t, normalized))) continue;
      out.push(normalized);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Stable match key for grouping (aliases collapse to the same key)
 * @param {string} tag
 * @returns {string}
 */
function getTagMatchKey(tag) {
  const canonical = getCanonicalTag(tag);
  return normalizeTagForMatching(canonical);
}

module.exports = {
  normalizeTagForMatching,
  normalizeTagForStorage,
  normalizeTagList,
  splitCompoundTag,
  capitalizeTag,
  getCanonicalTag,
  getTagMatchKey,
  tagsMatch,
  findMatchingTags,
  TAG_ALIASES,
};
