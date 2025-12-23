/**
 * Tag normalization and fuzzy matching utilities
 * Handles variations like: D&b -> Dnb, hip-hop -> hiphop, etc.
 * This matches the backend logic in tuneable-backend/utils/tagNormalizer.js
 */

/**
 * Normalize tag for fuzzy matching
 * Handles: D&b -> dnb, hip-hop -> hiphop, etc.
 * @param tag - The tag to normalize
 * @returns Normalized tag (lowercase, no special chars, no spaces)
 */
function normalizeTagForMatching(tag: string): string {
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
 * The value after the colon is the canonical tag
 */
const TAG_ALIASES: Record<string, string> = {
  // Drum & Bass variations
  'dnb': 'DnB',
  'd&b': 'DnB',
  'drumandbass': 'DnB',
  'drumbass': 'DnB',
  'drum n bass': 'DnB',
  'drum and bass': 'DnB',
  'drumnbass': 'DnB',
  'drumand bass': 'DnB',
  'db': 'DnB', // Normalized form of D&b (after removing &)
  
  // Hip Hop variations
  'hiphop': 'hip hop',
  'hip-hop': 'hip hop',
  'hip hop': 'hip hop',
  
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
 * @param tag - The tag to get canonical form for
 * @returns Canonical tag form
 */
export function getCanonicalTag(tag: string): string {
  const normalized = normalizeTagForMatching(tag);
  return TAG_ALIASES[normalized] || normalized;
}

/**
 * Check if two tags match (fuzzy)
 * @param tag1 - First tag
 * @param tag2 - Second tag
 * @returns True if tags match canonically
 */
export function tagsMatch(tag1: string, tag2: string): boolean {
  return getCanonicalTag(tag1) === getCanonicalTag(tag2);
}

/**
 * Find all tags that match a given tag (fuzzy)
 * @param tag - The tag to find matches for
 * @param tagList - List of tags to search
 * @returns Array of matching tags
 */
export function findMatchingTags(tag: string, tagList: string[]): string[] {
  if (!tag || !Array.isArray(tagList)) return [];
  
  const canonicalTag = getCanonicalTag(tag);
  return tagList.filter(t => getCanonicalTag(t) === canonicalTag);
}

/**
 * Normalize tag for matching (exported for direct use if needed)
 */
export { normalizeTagForMatching };

