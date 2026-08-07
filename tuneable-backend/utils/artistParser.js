/**
 * Artist Parser Utility
 *
 * Parses artist strings containing "ft.", "feat.", "&", "and", "with" etc.
 * Also maps MusicBrainz artist-credit arrays into Tuneable artist/featuring shapes.
 */

/** Media.artist.relationToNext enum values */
const RELATION_ENUM = new Set([',', '&', 'and', 'with', 'ft.', 'feat.', 'vs.', 'x', 'X']);

function isFeaturingJoinphrase(joinphrase) {
  const t = String(joinphrase || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return false;
  return /^(feat\.?|ft\.?|featuring|with)\b/.test(t);
}

/**
 * Map an MB joinphrase onto Media.artist.relationToNext (or null).
 * Featuring-style phrases return null — those credits move to `featuring[]`.
 */
function normalizeRelationToNext(joinphrase) {
  if (joinphrase == null) return null;
  const raw = String(joinphrase).trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  if (isFeaturingJoinphrase(raw)) return null;

  const lower = raw.toLowerCase();
  if (lower === '&' || lower === '+') return '&';
  if (lower === 'and' || lower === 'y' || lower === 'et') return 'and';
  if (lower === ',' || lower === ', and' || lower === '/') return ',';
  if (lower === 'x') return 'x';
  if (lower === 'X') return 'X';
  if (lower === 'vs' || lower === 'vs.' || lower === 'versus') return 'vs.';
  if (lower === 'with') return 'with';
  if (RELATION_ENUM.has(raw)) return raw;
  if (RELATION_ENUM.has(lower)) return lower;

  // Unknown short connector → co-headline default
  if (raw.length <= 10) return '&';
  return '&';
}

/**
 * Parse MusicBrainz `artist-credit` into Tuneable artist + featuring arrays.
 * Preserves MB joinphrases via relationToNext / featuring split.
 *
 * @param {Array|null|undefined} artistCredit
 * @returns {{ artists: Array<{name: string, relationToNext: string|null, musicbrainzId: string|null}>, featuring: Array<{name: string, musicbrainzId: string|null}>, display: string }}
 */
function parseMusicBrainzArtistCredit(artistCredit) {
  const credits = Array.isArray(artistCredit) ? artistCredit : [];
  const artists = [];
  const featuring = [];

  if (credits.length === 0) {
    return { artists: [], featuring: [], display: 'Unknown Artist' };
  }

  // Display string: MB-faithful name + joinphrase concatenation
  const display = credits
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      const name = entry?.name || entry?.artist?.name || '';
      const join = entry?.joinphrase || '';
      return `${name}${join}`;
    })
    .join('')
    .trim() || 'Unknown Artist';

  let mode = 'primary'; // primary | featuring
  for (let i = 0; i < credits.length; i += 1) {
    const entry = credits[i];
    if (typeof entry === 'string') {
      const name = entry.trim();
      if (!name) continue;
      if (mode === 'featuring') {
        featuring.push({ name, musicbrainzId: null });
      } else {
        artists.push({ name, relationToNext: null, musicbrainzId: null });
      }
      continue;
    }

    const name = String(entry?.name || entry?.artist?.name || '').trim();
    const mbid = entry?.artist?.id ? String(entry.artist.id) : null;
    const joinphrase = entry?.joinphrase || '';
    if (!name) continue;

    if (mode === 'featuring') {
      featuring.push({ name, musicbrainzId: mbid });
      continue;
    }

    artists.push({ name, relationToNext: null, musicbrainzId: mbid });

    if (isFeaturingJoinphrase(joinphrase)) {
      mode = 'featuring';
      // Last primary has no relationToNext — featuring is rendered via featuring[]
    } else if (i < credits.length - 1) {
      artists[artists.length - 1].relationToNext = normalizeRelationToNext(joinphrase) || '&';
    }
  }

  // Clear relation on final primary artist
  if (artists.length > 0) {
    const lastPrimaryIdx = artists.length - 1;
    // relationToNext only meaningful between primaries; if we switched to featuring,
    // the last primary's relation should already be null.
    if (mode === 'featuring') {
      artists[lastPrimaryIdx].relationToNext = null;
    }
  }

  return {
    artists: artists.length > 0 ? artists : [{ name: display, relationToNext: null, musicbrainzId: null }],
    featuring,
    display,
  };
}

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
  parseMusicBrainzArtistCredit,
  normalizeRelationToNext,
  isFeaturingJoinphrase,
  formatCreatorDisplay,
  generateCreatorDisplay,
};

