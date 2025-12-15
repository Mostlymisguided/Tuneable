/**
 * Tag normalization and fuzzy matching utilities
 * Handles variations like: D&b -> Dnb, hip-hop -> hiphop, etc.
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
    // Remove spaces entirely for matching (Drum And Bass -> drumbass)
    .replace(/\s+/g, '');
}

/**
 * Tag aliases mapping - maps variations to canonical forms
 * This handles complex cases that normalization can't catch
 */
const TAG_ALIASES = {
  // Drum & Bass variations
  'dnb': 'drumandbass',
  'd&b': 'drumandbass',
  'drumandbass': 'drumandbass',
  'drumbass': 'drumandbass',
  'drum n bass': 'drumandbass',
  'drumandbass': 'drumandbass',
  
  // Hip Hop variations
  'hiphop': 'hiphop',
  'hip-hop': 'hiphop',
  'hip hop': 'hiphop',
  
  // Electronic variations
  'edm': 'electronic',
  'electronic': 'electronic',
  'electronica': 'electronic',
  
  // House variations
  'house': 'house',
  'house music': 'house',
  
  // Techno variations
  'techno': 'techno',
  'tech': 'techno', // Common abbreviation
  
  // R&B variations
  'r&b': 'rnb',
  'rnb': 'rnb',
  'randb': 'rnb',
  'r and b': 'rnb',
  
  // Add more as patterns are discovered...
};

/**
 * Get canonical tag form for matching
 * Returns the normalized + aliased version
 * @param {string} tag - The tag to get canonical form for
 * @returns {string} - Canonical tag form
 */
function getCanonicalTag(tag) {
  const normalized = normalizeTagForMatching(tag);
  return TAG_ALIASES[normalized] || normalized;
}

/**
 * Check if two tags match (fuzzy)
 * @param {string} tag1 - First tag
 * @param {string} tag2 - Second tag
 * @returns {boolean} - True if tags match canonically
 */
function tagsMatch(tag1, tag2) {
  return getCanonicalTag(tag1) === getCanonicalTag(tag2);
}

/**
 * Find all tags that match a given tag (fuzzy)
 * @param {string} tag - The tag to find matches for
 * @param {Array<string>} tagList - List of tags to search
 * @returns {Array<string>} - Array of matching tags
 */
function findMatchingTags(tag, tagList) {
  if (!tag || !Array.isArray(tagList)) return [];
  
  const canonicalTag = getCanonicalTag(tag);
  return tagList.filter(t => getCanonicalTag(t) === canonicalTag);
}

module.exports = {
  normalizeTagForMatching,
  getCanonicalTag,
  tagsMatch,
  findMatchingTags,
  TAG_ALIASES
};




