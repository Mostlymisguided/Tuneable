/**
 * Artist Parser Utility
 * 
 * Parses artist strings containing "ft.", "feat.", "&", "and", "with" etc.
 * Extracts display strings for UI display
 */

/**
 * Parse an artist string and extract primary artists and featuring artists
 * @param {string} artistString - String like "Artist ft. Featured" or "Artist & Featured"
 * @returns {Object} { artists: [string], featuring: [string] }
 */
function parseArtistString(artistString) {
  if (!artistString || typeof artistString !== 'string') {
    return { artists: [], featuring: [] };
  }

  const trimmed = artistString.trim();
  if (!trimmed) {
    return { artists: [], featuring: [] };
  }

  // Patterns to detect featuring/collaborations
  // Order matters: more specific patterns first
  const patterns = [
    /(?:^|[\s,])ft\.\s+/i,           // "ft. " or ", ft. "
    /(?:^|[\s,])feat\.\s+/i,         // "feat. " or ", feat. "
    /(?:^|[\s,])featuring\s+/i,      // "featuring "
    /(?:^|[\s,])with\s+/i,           // "with "
    /\s+&\s+/,                       // " & "
    /\s+and\s+/i,                    // " and "
  ];

  // Find the first matching pattern
  let splitIndex = -1;
  let splitPattern = null;
  
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      splitIndex = match.index + match[0].length;
      splitPattern = pattern;
      break;
    }
  }

  if (splitIndex === -1) {
    // No collaboration pattern found, treat entire string as primary artist
    return {
      artists: [trimmed],
      featuring: []
    };
  }

  // Split the string
  const primaryPart = trimmed.substring(0, splitIndex - splitPattern.source.match(/\S+/)?.[0]?.length || 0).trim();
  const featuringPart = trimmed.substring(splitIndex).trim();

  // Handle multiple artists separated by commas in featuring part
  const featuringArtists = featuringPart
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0);

  // Handle multiple artists in primary part (separated by commas or "&" or "and")
  const primaryArtists = primaryPart
    .split(/[,&]|\s+and\s+/i)
    .map(name => name.trim())
    .filter(name => name.length > 0);

  return {
    artists: primaryArtists.length > 0 ? primaryArtists : [primaryPart],
    featuring: featuringArtists
  };
}

/**
 * Format artists and featuring arrays into a display string
 * @param {Array} artists - Array of artist subdocuments or strings
 * @param {Array} featuring - Array of featuring subdocuments or strings
 * @returns {string} Formatted display string
 */
function formatCreatorDisplay(artists = [], featuring = []) {
  // Normalize artist entries to include relation metadata
  const normalizedArtists = artists
    .map(a => {
      if (!a) return null;
      if (typeof a === 'string') {
        return { name: a, relationToNext: null };
      }
      const relation = a.relationToNext || null;
      return {
        name: a.name || '',
        relationToNext: relation
      };
    })
    .filter(a => a && a.name);

  const featNames = featuring
    .map(f => (typeof f === 'string' ? f : (f?.name || f)))
    .filter(Boolean);

  if (normalizedArtists.length === 0) {
    return null;
  }

  let display = '';

  normalizedArtists.forEach((artist, index) => {
    display += artist.name;

    const isLast = index === normalizedArtists.length - 1;
    if (!isLast) {
      const relation = artist.relationToNext || '&';
      // Ensure proper spacing around relation tokens (except commas)
      if (relation === ',') {
        display += ', ';
      } else {
        display += ` ${relation.trim()} `;
      }
    }
  });

  if (featNames.length > 0) {
    display += ` ft. ${featNames.join(', ')}`;
  }

  return display.trim();
}

/**
 * Generate creatorDisplay from existing artist/featuring arrays
 * This is useful for existing media that doesn't have creatorDisplay set
 * @param {Array} artists - Array of artist subdocuments
 * @param {Array} featuring - Array of featuring subdocuments
 * @returns {string|null} Formatted display string
 */
function generateCreatorDisplay(artists = [], featuring = []) {
  return formatCreatorDisplay(artists, featuring);
}

module.exports = {
  parseArtistString,
  formatCreatorDisplay,
  generateCreatorDisplay
};

