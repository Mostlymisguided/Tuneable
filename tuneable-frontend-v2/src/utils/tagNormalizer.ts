/**
 * Tag normalization and fuzzy matching utilities
 * Mirrors tuneable-backend/utils/tagNormalizer.js
 *
 * Two layers:
 * - Match key: lowercase, no spaces/punctuation (never show/store this)
 * - Display/storage: Title Case, with aliases + acronym exceptions
 */

function normalizeTagForMatching(tag: string): string {
  if (!tag || typeof tag !== 'string') return '';

  return tag
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/[\s\-_]+/g, ' ')
    .trim()
    .replace(/\s+/g, '');
}

/**
 * Keys must be match keys (output of normalizeTagForMatching).
 * Values are canonical display forms.
 */
const TAG_ALIASES: Record<string, string> = {
  dnb: 'DnB',
  drumandbass: 'DnB',
  drumbass: 'DnB',
  drumnbass: 'DnB',
  drumnbassmusic: 'DnB',
  db: 'DnB',

  hiphop: 'Hip Hop',

  ukhiphop: 'UK Hip Hop',

  ukrb: 'UK R&B',
  ukrandb: 'UK R&B',

  ukrap: 'UK Rap',

  edm: 'Electronic',
  electronic: 'Electronic',

  house: 'House',
  housemusic: 'House',
  deephouse: 'Deep House',
  techhouse: 'Tech House',
  progressivehouse: 'Progressive House',
  melodichouse: 'Melodic House',
  afrohouse: 'Afro House',

  singersongwriter: 'Singer Songwriter',

  techno: 'Techno',
  technomusic: 'Techno',
  melodictechno: 'Melodic Techno',

  rnb: 'R&B',
  randb: 'R&B',
  rb: 'R&B',
};

/**
 * Title Case per word, with acronym + stylization exceptions.
 */
export function capitalizeTag(tag: string): string {
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
 */
export function normalizeTagForStorage(tag: string): string {
  if (!tag || typeof tag !== 'string') return tag;

  const trimmed = tag.trim();
  if (!trimmed) return '';

  const normalized = normalizeTagForMatching(trimmed);
  const canonical = TAG_ALIASES[normalized];

  if (canonical) {
    return canonical;
  }

  return capitalizeTag(trimmed);
}

/**
 * Canonical form for matching/grouping.
 * Do NOT use for user-facing labels — use normalizeTagForStorage.
 */
export function getCanonicalTag(tag: string): string {
  const normalized = normalizeTagForMatching(tag);
  return TAG_ALIASES[normalized] || normalized;
}

/** Stable match key for grouping (aliases collapse to the same key) */
export function getTagMatchKey(tag: string): string {
  return normalizeTagForMatching(getCanonicalTag(tag));
}

export function tagsMatch(tag1: string, tag2: string): boolean {
  const norm1 = normalizeTagForMatching(tag1);
  const norm2 = normalizeTagForMatching(tag2);

  if (norm1 === norm2) return true;

  const canon1 = TAG_ALIASES[norm1] || norm1;
  const canon2 = TAG_ALIASES[norm2] || norm2;

  return normalizeTagForMatching(canon1) === normalizeTagForMatching(canon2);
}

export function findMatchingTags(tag: string, tagList: string[]): string[] {
  if (!tag || !Array.isArray(tagList)) return [];
  return tagList.filter((t) => tagsMatch(tag, t));
}

export function generateTagSlug(tag: string): string {
  if (!tag || typeof tag !== 'string') return '';

  return tag
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Profile path for a tag string, e.g. "Hip Hop" → "/tag/hip-hop" */
export function getTagProfilePath(tag: string): string {
  const slug = generateTagSlug(normalizeTagForStorage(tag) || tag);
  return slug ? `/tag/${encodeURIComponent(slug)}` : '/tag';
}

export { normalizeTagForMatching, TAG_ALIASES };
