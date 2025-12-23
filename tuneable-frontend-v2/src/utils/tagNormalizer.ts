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
 * @param tag - The tag to get canonical form for
 * @returns Canonical tag form
 */
export function getCanonicalTag(tag: string): string {
  const normalized = normalizeTagForMatching(tag);
  return TAG_ALIASES[normalized] || normalized;
}

/**
 * Check if two tags match (fuzzy)
 * Compares normalized versions (no spaces) for matching, but uses canonical forms
 * @param tag1 - First tag
 * @param tag2 - Second tag
 * @returns True if tags match canonically
 */
export function tagsMatch(tag1: string, tag2: string): boolean {
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
 * @param tag - The tag to find matches for
 * @param tagList - List of tags to search
 * @returns Array of matching tags
 */
export function findMatchingTags(tag: string, tagList: string[]): string[] {
  if (!tag || !Array.isArray(tagList)) return [];
  
  return tagList.filter(t => tagsMatch(tag, t));
}

/**
 * Normalize tag for storage/display
 * Matches backend logic: uses canonical forms when available, otherwise capitalizes preserving spaces
 * @param tag - The tag to normalize for storage
 * @returns Normalized tag in display format
 */
export function normalizeTagForStorage(tag: string): string {
  if (!tag || typeof tag !== 'string') return tag;
  
  // Normalize the tag for matching (removes spaces, special chars)
  const normalized = normalizeTagForMatching(tag);
  
  // Check if this normalized form is in our aliases
  const canonical = TAG_ALIASES[normalized];
  
  // If it's in aliases, use the canonical form (already in display format with spaces)
  // This handles tags like "Hip Hop", "Deep House", "R&B", "DnB", "Singer Songwriter"
  if (canonical && /^[A-Z]/.test(canonical)) {
    return canonical;
  }
  
  // If not in aliases, preserve the original tag's structure (spaces)
  // but capitalize it properly (e.g., "Indie Folk" -> "Indie Folk", not "Indiefolk")
  // This handles tags like "Indie Folk", "Ballroom Folk" that aren't in aliases
  return capitalizeTag(tag);
}

/**
 * Capitalize tag preserving acronyms and stylized capitalization
 * Matches backend logic from tagPartyService.js
 * @param tag - The tag to capitalize
 * @returns Capitalized tag
 */
function capitalizeTag(tag: string): string {
  if (!tag || typeof tag !== 'string') return tag;
  
  // Common acronyms that should be preserved as uppercase
  const acronyms = new Set(['uk', 'dj', 'edm', 'rnb', 'dnb', 'r&b', 'd&b']);
  
  return tag
    .trim()
    .split(/\s+/)
    .map(word => {
      const wordLower = word.toLowerCase();
      // Check if it's a known acronym (including special char variants)
      const isKnownAcronym = acronyms.has(wordLower);
      // Check if it's already in acronym format (all caps, 2-4 letters)
      const isAcronymFormat = /^[A-Z]{2,4}$/.test(word);
      // Check if it has special chars (might be an acronym like R&B, D&B)
      const hasSpecialChars = /[&\/\-]/.test(word);
      // Check if it's stylistically capitalized (camelCase, mixed case like WantTheGanja)
      const isStylized = /^[A-Z][a-z]+[A-Z]/.test(word) || /[a-z][A-Z]/.test(word);
      
      if (isKnownAcronym) {
        // Known acronym: make uppercase (handles both "uk" -> "UK" and "r&b" -> "R&B")
        return wordLower.split('').map((char, i) => {
          if (/[&\/\-]/.test(char)) return char; // Preserve special chars
          return char.toUpperCase();
        }).join('');
      }
      
      if (isAcronymFormat) {
        // Already in acronym format, preserve it
        return word;
      }
      
      if (isStylized) {
        // Stylistically capitalized (camelCase, mixed case), preserve as-is
        return word;
      }
      
      if (hasSpecialChars) {
        // Has special chars but not a known acronym - capitalize properly
        // e.g., "r&b" -> "R&B", "d&b" -> "D&B"
        return word.split('').map((char, i) => {
          if (/[&\/\-]/.test(char)) return char; // Preserve special chars
          if (i === 0 || (i > 0 && /[&\/\-]/.test(word[i-1]))) {
            return char.toUpperCase(); // Capitalize first char and chars after special chars
          }
          return char.toLowerCase();
        }).join('');
      }
      
      // Regular word: capitalize first letter, lowercase rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Normalize tag for matching (exported for direct use if needed)
 */
export { normalizeTagForMatching };

