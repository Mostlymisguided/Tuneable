/**
 * Parse and apply catalog release dates with explicit precision.
 * Spotify/MusicBrainz may return YYYY, YYYY-MM, or YYYY-MM-DD.
 */

const PRECISION_RANK = { year: 1, month: 2, day: 3 };

/**
 * @param {string|Date|null|undefined} raw
 * @param {'day'|'month'|'year'|null|undefined} hintedPrecision
 * @returns {{ releaseDate: Date|null, releaseYear: number|null, precision: 'day'|'month'|'year'|null }}
 */
function parseReleaseDate(raw, hintedPrecision = null) {
  if (raw == null || raw === '') {
    return { releaseDate: null, releaseYear: null, precision: null };
  }

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      return { releaseDate: null, releaseYear: null, precision: null };
    }
    const year = raw.getUTCFullYear();
    if (year < 1900 || year > 2100) {
      return { releaseDate: null, releaseYear: null, precision: null };
    }
    const precision = hintedPrecision && PRECISION_RANK[hintedPrecision]
      ? hintedPrecision
      : 'day';
    return {
      releaseDate: precision === 'year' ? null : raw,
      releaseYear: year,
      precision,
    };
  }

  const str = String(raw).trim();
  if (!str) {
    return { releaseDate: null, releaseYear: null, precision: null };
  }

  // YYYY
  if (/^\d{4}$/.test(str)) {
    const year = Number.parseInt(str, 10);
    if (year < 1900 || year > 2100) {
      return { releaseDate: null, releaseYear: null, precision: null };
    }
    return { releaseDate: null, releaseYear: year, precision: 'year' };
  }

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(str)) {
    const [y, m] = str.split('-').map((n) => Number.parseInt(n, 10));
    if (y < 1900 || y > 2100 || m < 1 || m > 12) {
      return { releaseDate: null, releaseYear: null, precision: null };
    }
    const releaseDate = new Date(Date.UTC(y, m - 1, 1));
    return { releaseDate, releaseYear: y, precision: 'month' };
  }

  // YYYY-MM-DD (or ISO datetime)
  const dayMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dayMatch) {
    const year = Number.parseInt(dayMatch[1], 10);
    const month = Number.parseInt(dayMatch[2], 10);
    const day = Number.parseInt(dayMatch[3], 10);
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
      return { releaseDate: null, releaseYear: null, precision: null };
    }
    const releaseDate = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(releaseDate.getTime())) {
      return { releaseDate: null, releaseYear: null, precision: null };
    }
    const precision = hintedPrecision === 'month' || hintedPrecision === 'year'
      ? hintedPrecision
      : 'day';
    if (precision === 'year') {
      return { releaseDate: null, releaseYear: year, precision: 'year' };
    }
    if (precision === 'month') {
      return {
        releaseDate: new Date(Date.UTC(year, month - 1, 1)),
        releaseYear: year,
        precision: 'month',
      };
    }
    return { releaseDate, releaseYear: year, precision: 'day' };
  }

  const fallback = new Date(str);
  if (Number.isNaN(fallback.getTime())) {
    return { releaseDate: null, releaseYear: null, precision: null };
  }
  const year = fallback.getUTCFullYear();
  if (year < 1900 || year > 2100) {
    return { releaseDate: null, releaseYear: null, precision: null };
  }
  return {
    releaseDate: fallback,
    releaseYear: year,
    precision: hintedPrecision && PRECISION_RANK[hintedPrecision] ? hintedPrecision : 'day',
  };
}

function precisionRank(precision) {
  return PRECISION_RANK[precision] || 0;
}

/**
 * Jan 1 dates often come from year-only ID3/Rekordbox imports.
 * Only treat as fuzzy when precision is missing or year.
 */
function looksLikeYearOnlyJan1(releaseDate, releaseYear, precision = null) {
  if (precision === 'day' || precision === 'month') return false;
  if (!releaseDate) return false;
  const d = releaseDate instanceof Date ? releaseDate : new Date(releaseDate);
  if (Number.isNaN(d.getTime())) return false;
  const year = releaseYear || d.getUTCFullYear();
  return d.getUTCMonth() === 0 && d.getUTCDate() === 1 && year >= 1900 && year <= 2100;
}

/**
 * Whether existing media release data should be upgraded by a candidate.
 * Manual source is never overwritten unless forceManual is true.
 */
function shouldUpgradeRelease(media, candidate, { forceManual = false } = {}) {
  if (!candidate || (!candidate.releaseDate && !candidate.releaseYear)) {
    return false;
  }

  const source = media.releaseDateSource || null;
  if (source === 'manual' && !forceManual) {
    return false;
  }

  const existingPrecision = media.releaseDatePrecision
    || (media.releaseDate
      ? (looksLikeYearOnlyJan1(media.releaseDate, media.releaseYear, media.releaseDatePrecision) ? 'year' : 'day')
      : (media.releaseYear ? 'year' : null));

  const candidatePrecision = candidate.precision
    || (candidate.releaseDate ? 'day' : (candidate.releaseYear ? 'year' : null));

  if (!existingPrecision) return true;

  // Upgrade fuzzy Jan-1 year placeholders even when stored as a Date
  if (
    looksLikeYearOnlyJan1(media.releaseDate, media.releaseYear, media.releaseDatePrecision)
    && precisionRank(candidatePrecision) >= PRECISION_RANK.month
  ) {
    return true;
  }

  return precisionRank(candidatePrecision) > precisionRank(existingPrecision);
}

/**
 * Apply parsed release fields onto a Media document (mutates, does not save).
 * @returns {boolean} whether anything changed
 */
function applyReleaseToMedia(media, parsed, source = null, { forceManual = false } = {}) {
  if (!parsed || (!parsed.releaseDate && !parsed.releaseYear)) return false;
  if (!shouldUpgradeRelease(media, parsed, { forceManual })) return false;

  let changed = false;

  if (parsed.precision === 'year' || !parsed.releaseDate) {
    if (media.releaseDate) {
      media.releaseDate = null;
      changed = true;
    }
    if (parsed.releaseYear && media.releaseYear !== parsed.releaseYear) {
      media.releaseYear = parsed.releaseYear;
      changed = true;
    }
  } else if (parsed.releaseDate) {
    const nextMs = parsed.releaseDate.getTime();
    const prevMs = media.releaseDate ? new Date(media.releaseDate).getTime() : null;
    if (prevMs !== nextMs) {
      media.releaseDate = parsed.releaseDate;
      changed = true;
    }
    if (parsed.releaseYear && media.releaseYear !== parsed.releaseYear) {
      media.releaseYear = parsed.releaseYear;
      changed = true;
    }
  }

  if (parsed.precision && media.releaseDatePrecision !== parsed.precision) {
    media.releaseDatePrecision = parsed.precision;
    changed = true;
  }
  if (source && media.releaseDateSource !== source) {
    media.releaseDateSource = source;
    changed = true;
  }

  return changed;
}

/**
 * Extract Spotify track id from externalIds map/object or sources URL.
 */
function extractSpotifyTrackId(media) {
  const externalIds = media?.externalIds instanceof Map
    ? Object.fromEntries(media.externalIds)
    : (media?.externalIds || {});
  if (externalIds.spotify) {
    const id = String(externalIds.spotify).trim();
    if (/^[a-zA-Z0-9]{22}$/.test(id)) return id;
    const fromEmbedded = id.match(/track[/:]([a-zA-Z0-9]{22})/);
    if (fromEmbedded) return fromEmbedded[1];
  }

  const sources = media?.sources instanceof Map
    ? Object.fromEntries(media.sources)
    : (media?.sources || {});
  const spotifyUrl = sources.spotify;
  if (typeof spotifyUrl === 'string') {
    const match = spotifyUrl.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extract MusicBrainz recording MBID.
 */
function extractMusicBrainzId(media) {
  const externalIds = media?.externalIds instanceof Map
    ? Object.fromEntries(media.externalIds)
    : (media?.externalIds || {});
  const id = externalIds.musicbrainz;
  return id ? String(id).trim() : null;
}

module.exports = {
  parseReleaseDate,
  precisionRank,
  looksLikeYearOnlyJan1,
  shouldUpgradeRelease,
  applyReleaseToMedia,
  extractSpotifyTrackId,
  extractMusicBrainzId,
  PRECISION_RANK,
};
