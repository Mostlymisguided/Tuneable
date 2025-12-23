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
  'dnb': 'DnB',
  'd&b': 'DnB',
  'drumandbass': 'DnB',
  'drumbass': 'DnB',
  'drum n bass': 'DnB',
  'drum and bass': 'DnB',
  'drumnbass': 'DnB',
  'drum n bass music': 'DnB',
  'db': 'DnB', // Normalized form of D&b (after removing &)
  
  // Hip Hop variations
  'hiphop': 'Hip Hop',
  'hip-hop': 'Hip Hop',
  'hip hop': 'Hip Hop',
  
  // UK Hip Hop variations (preserve UK as acronym)
  'ukhiphop': 'UK Hip Hop',
  'uk hip hop': 'UK Hip Hop',
  'uk hip-hop': 'UK Hip Hop',
  
  // UK R&B variations
  'ukrb': 'UK R&B',
  'uk r&b': 'UK R&B',
  'uk r and b': 'UK R&B',
  
  // UK Rap variations
  'ukrap': 'UK Rap',
  'uk rap': 'UK Rap',
  'Uk rap': 'UK Rap',
  
  // Electronic variations
  'edm': 'Electronic',
  'electronic': 'Electronic',
  
  // House variations
  'house': 'House',
  'house music': 'House',
  'deephouse': 'Deep House', // Normalized form (no space)
  'deep house': 'Deep House',
  'techhouse': 'Tech House', // Normalized form (no space)
  'tech house': 'Tech House',
  'progressivehouse': 'Progressive House', // Normalized form (no space)
  'progressive house': 'Progressive House',
  'melodichouse': 'Melodic House', // Normalized form (no space)
  'melodic house': 'Melodic House',
  'afrohouse': 'Afro House', // Normalized form (no space)
  'afro house': 'Afro House',
  
  // Singer Songwriter variations
  'singersongwriter': 'Singer Songwriter', // Normalized form (no space)
  'singer songwriter': 'Singer Songwriter',
  'singer-songwriter': 'Singer Songwriter',
  
  // Techno variations
  'techno': 'Techno',
  'techno music': 'Techno',
  'melodictechno': 'Melodic Techno', // Normalized form (no space)
  'melodic techno': 'Melodic Techno',
  
  // R&B variations
  'r&b': 'R&B',
  'rnb': 'R&B',
  'randb': 'R&B',
  'r and b': 'R&B',
  'rb': 'R&B', // Normalized form of R&B (after removing &)
  
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
 * Compares normalized versions (no spaces) for matching, but uses canonical forms
 * @param {string} tag1 - First tag
 * @param {string} tag2 - Second tag
 * @returns {boolean} - True if tags match canonically
 */
function tagsMatch(tag1, tag2) {
  // Normalize both tags (remove spaces, lowercase)
  const norm1 = normalizeTagForMatching(tag1);
  const norm2 = normalizeTagForMatching(tag2);
  
  // If normalized versions match exactly, they're the same
  if (norm1 === norm2) return true;
  
  // Get canonical forms for both
  const canon1 = TAG_ALIASES[norm1] || norm1;
  const canon2 = TAG_ALIASES[norm2] || norm2;
  
  // Normalize canonical forms for comparison (to handle space differences)
  const canonNorm1 = normalizeTagForMatching(canon1);
  const canonNorm2 = normalizeTagForMatching(canon2);
  
  // Match if canonical normalized forms are the same
  return canonNorm1 === canonNorm2;
}

/**
 * Find all tags that match a given tag (fuzzy)
 * Uses tagsMatch() to compare normalized versions
 * @param {string} tag - The tag to find matches for
 * @param {Array<string>} tagList - List of tags to search
 * @returns {Array<string>} - Array of matching tags
 */
function findMatchingTags(tag, tagList) {
  if (!tag || !Array.isArray(tagList)) return [];
  
  return tagList.filter(t => tagsMatch(tag, t));
}

module.exports = {
  normalizeTagForMatching,
  getCanonicalTag,
  tagsMatch,
  findMatchingTags,
  TAG_ALIASES
};









