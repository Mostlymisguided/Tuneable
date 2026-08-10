/**
 * Post-import MusicBrainz enrichment: score → auto-apply high confidence,
 * queue medium confidence for admin review.
 * Also pulls folksonomy tags, ISRC, and release date/year via recording lookup.
 */

const Media = require('../models/Media');
const MetadataEnrichment = require('../models/MetadataEnrichment');
const musicbrainzService = require('./musicbrainzService');
const {
  formatCreatorDisplay,
  parseArtistString,
} = require('../utils/artistParser');
const {
  normalizeTagForStorage,
  tagsMatch,
} = require('../utils/tagNormalizer');
const {
  normalize,
  primaryArtist,
  parseTitleArtistFromString,
  artistsCompatible,
  coreTitle,
  fuzzyTitleMatch,
  durationWithinTolerance,
  mediaPrimaryArtistName,
  levenshtein,
  normalizeIsrc,
} = require('../utils/mediaMatchUtils');
const {
  parseReleaseDate,
  applyReleaseToMedia,
} = require('../utils/releaseDateUtils');

const MB_GAP_MS = 1100;
const HIGH_SCORE = 0.82;
const MEDIUM_SCORE = 0.55;
const MAX_TAGS = 24;
const MAX_GENRES = 12;

let queueBusy = false;
let lastMbCallAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleMusicBrainz() {
  const wait = Math.max(0, MB_GAP_MS - (Date.now() - lastMbCallAt));
  if (wait > 0) await sleep(wait);
  lastMbCallAt = Date.now();
}

function mapToObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return { ...value };
}

function ensureMap(doc, field) {
  if (!(doc[field] instanceof Map)) {
    doc[field] = new Map(Object.entries(doc[field] || {}));
  }
}

function buildSearchQuery(title, artist) {
  const parsed = parseTitleArtistFromString(title);
  const resolvedArtist = (parsed?.artist || artist || '').trim();
  const resolvedTitle = (parsed?.title || title || '').trim();
  return [resolvedArtist, resolvedTitle].filter(Boolean).join(' ').slice(0, 200);
}

function scoreCandidate(original, candidate) {
  const origParsed = parseTitleArtistFromString(original.title);
  const origTitle = origParsed?.title || original.title;
  const origArtist = origParsed?.artist || original.artist;

  const wantTitle = coreTitle(origTitle) || normalize(origTitle);
  const haveTitle = coreTitle(candidate.title) || normalize(candidate.title);
  const wantArtist = normalize(primaryArtist(origArtist));
  const haveArtist = normalize(primaryArtist(candidate.artist));

  let score = 0;
  let matchType = 'weak';

  if (!wantTitle || !haveTitle) {
    return { score: 0, matchType: 'no-title' };
  }

  if (wantTitle === haveTitle) {
    score += 0.45;
    matchType = 'exact-title';
  } else if (fuzzyTitleMatch(wantTitle, haveTitle, 2)) {
    score += 0.35;
    matchType = 'fuzzy-title';
  } else if (wantTitle.includes(haveTitle) || haveTitle.includes(wantTitle)) {
    score += 0.25;
    matchType = 'partial-title';
  } else {
    const dist = levenshtein(wantTitle, haveTitle);
    const maxLen = Math.max(wantTitle.length, haveTitle.length) || 1;
    const sim = 1 - dist / maxLen;
    if (sim >= 0.75) {
      score += 0.2 * sim;
      matchType = 'similar-title';
    } else {
      return { score: 0.05, matchType: 'title-mismatch' };
    }
  }

  if (wantArtist && haveArtist) {
    if (wantArtist === haveArtist) {
      score += 0.4;
      matchType = `${matchType}+exact-artist`;
    } else if (artistsCompatible(origArtist, candidate.artist)) {
      score += 0.28;
      matchType = `${matchType}+compat-artist`;
    } else if (wantArtist.includes(haveArtist) || haveArtist.includes(wantArtist)) {
      score += 0.15;
      matchType = `${matchType}+partial-artist`;
    } else {
      score -= 0.15;
      matchType = `${matchType}+artist-mismatch`;
    }
  }

  if (durationWithinTolerance(original.duration || 0, candidate.duration || 0, {
    minCatalogDuration: 20,
    minDeltaSec: 5,
    pct: 0.06,
  })) {
    score += 0.12;
  } else if (original.duration && candidate.duration) {
    score -= 0.2;
    matchType = `${matchType}+duration-mismatch`;
  }

  return { score: Math.max(0, Math.min(1, score)), matchType };
}

function confidenceFromScore(score) {
  if (score >= HIGH_SCORE) return 'high';
  if (score >= MEDIUM_SCORE) return 'medium';
  if (score > 0.2) return 'low';
  return 'none';
}

function snapshotMedia(media) {
  return {
    title: media.title,
    artist: mediaPrimaryArtistName(media),
    album: media.album || null,
    duration: media.duration || 0,
    isrc: media.isrc || null,
    releaseDate: media.releaseDate || null,
    releaseYear: media.releaseYear || null,
    tags: Array.isArray(media.tags) ? [...media.tags] : [],
    genres: Array.isArray(media.genres) ? [...media.genres] : [],
  };
}

function normalizeTagList(tags, limit = MAX_TAGS) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    const normalized = normalizeTagForStorage(raw);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function mergeTagLists(existing, incoming, limit = MAX_TAGS) {
  const merged = Array.isArray(existing) ? [...existing] : [];
  for (const raw of incoming || []) {
    const normalized = normalizeTagForStorage(raw);
    if (!normalized) continue;
    if (merged.some((t) => tagsMatch(t, normalized))) continue;
    merged.push(normalized);
    if (merged.length >= limit) break;
  }
  return merged;
}

/** Tags from `incoming` that are not already present on `existing` (fuzzy match). */
function filterNewTags(existing, incoming, limit = MAX_TAGS) {
  const have = Array.isArray(existing) ? existing : [];
  const out = [];
  for (const raw of incoming || []) {
    const normalized = normalizeTagForStorage(raw);
    if (!normalized) continue;
    if (have.some((t) => tagsMatch(t, normalized))) continue;
    if (out.some((t) => tagsMatch(t, normalized))) continue;
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function resolveImportSourceUrl(media, importSource) {
  if (!media) return null;
  const sources = mapToObject(media.sources);
  const externalIds = mapToObject(media.externalIds);

  if (importSource === 'soundcloud_likes' || sources.soundcloud) {
    return sources.soundcloud || null;
  }
  if (importSource === 'spotify_likes' || sources.spotify) {
    return sources.spotify
      || (externalIds.spotify ? `https://open.spotify.com/track/${externalIds.spotify}` : null);
  }
  if (sources.soundcloud) return sources.soundcloud;
  if (sources.spotify) {
    return sources.spotify
      || (externalIds.spotify ? `https://open.spotify.com/track/${externalIds.spotify}` : null);
  }
  return null;
}

/**
 * Enrich a scored candidate with recording lookup (tags, ISRC, release date, release id).
 */
async function enrichCandidateDetails(candidate) {
  if (!candidate?.musicbrainzId) return candidate;
  try {
    await throttleMusicBrainz();
    const details = await musicbrainzService.getRecording(candidate.musicbrainzId);
    if (!details) return candidate;
    return {
      ...candidate,
      title: details.title || candidate.title,
      artist: details.artist || candidate.artist,
      artists: details.artists || candidate.artists || [],
      featuring: details.featuring || candidate.featuring || [],
      album: details.album || candidate.album,
      duration: details.duration || candidate.duration,
      releaseDate: details.releaseDate ?? candidate.releaseDate ?? null,
      releaseYear: details.releaseYear ?? candidate.releaseYear ?? null,
      releaseDatePrecision: details.releaseDatePrecision ?? candidate.releaseDatePrecision ?? null,
      isrc: details.isrc || candidate.isrc || null,
      tags: normalizeTagList(details.tags || []),
      genres: normalizeTagList(details.genres || details.tags || [], MAX_GENRES),
      musicbrainzReleaseId: details.externalIds?.musicbrainzRelease || null,
    };
  } catch (err) {
    console.warn('MB recording lookup failed:', candidate.musicbrainzId, err.message);
    return candidate;
  }
}

function suggestionFromCandidate(candidate, extras = {}) {
  const artists = Array.isArray(candidate.artists) ? candidate.artists : [];
  const featuring = Array.isArray(candidate.featuring) ? candidate.featuring : [];
  const displayArtist = artists.length > 0
    ? (formatCreatorDisplay(artists, featuring) || candidate.artist)
    : candidate.artist;

  return {
    title: candidate.title,
    artist: displayArtist,
    artists,
    featuring,
    album: candidate.album || null,
    duration: candidate.duration || 0,
    isrc: candidate.isrc || null,
    releaseDate: candidate.releaseDate || null,
    releaseYear: candidate.releaseYear || null,
    releaseDatePrecision: candidate.releaseDatePrecision || null,
    tags: normalizeTagList(candidate.tags || []),
    genres: normalizeTagList(candidate.genres || candidate.tags || [], MAX_GENRES),
    musicbrainzId: candidate.musicbrainzId,
    musicbrainzReleaseId: candidate.musicbrainzReleaseId || null,
    score: candidate.score,
    matchType: candidate.matchType,
    ...extras,
  };
}

function suggestionHasStructuredArtists(suggestion) {
  return Array.isArray(suggestion?.artists)
    && suggestion.artists.length > 0
    && suggestion.artists.every((entry) => String(entry?.name || '').trim());
}

/**
 * Legacy enrichment rows stored MB names joined with '' (e.g. "LogicAlessia CaraKhalid")
 * and empty artists[]. Re-fetch credits so apply/list never write that blob again.
 */
async function hydrateSuggestionArtists(suggestion) {
  if (!suggestion) return suggestion;

  if (suggestionHasStructuredArtists(suggestion)) {
    const featuring = Array.isArray(suggestion.featuring) ? suggestion.featuring : [];
    const display = formatCreatorDisplay(suggestion.artists, featuring);
    if (display && display !== suggestion.artist) {
      return { ...suggestion, artist: display };
    }
    return suggestion;
  }

  const mbid = suggestion.musicbrainzId;
  if (!mbid) return suggestion;

  try {
    await throttleMusicBrainz();
    const details = await musicbrainzService.getRecording(mbid);
    if (!details?.artists?.length) return suggestion;
    return {
      ...suggestion,
      artist: details.artist || suggestion.artist,
      artists: details.artists,
      featuring: details.featuring || [],
    };
  } catch (err) {
    console.warn('hydrateSuggestionArtists failed:', mbid, err.message);
    return suggestion;
  }
}

function findExistingCreatorByName(existing, name) {
  const want = normalize(name);
  if (!want || !Array.isArray(existing)) return null;
  return existing.find((entry) => normalize(entry?.name) === want) || null;
}

/**
 * Resolve suggestion → Media.artist[] / featuring[] arrays.
 * Prefers structured MB credits; falls back to parseArtistString on display string.
 * Preserves existing userId / collectiveId / verified by name match.
 */
function resolveArtistArraysFromSuggestion(suggestion, media) {
  let artistsIn = Array.isArray(suggestion.artists) ? suggestion.artists : [];
  let featuringIn = Array.isArray(suggestion.featuring) ? suggestion.featuring : [];

  if (artistsIn.length === 0 && suggestion.artist) {
    const parsed = parseArtistString(suggestion.artist);
    artistsIn = (parsed.artists || []).map((name) => ({ name, relationToNext: null }));
    featuringIn = (parsed.featuring || []).map((name) => ({ name }));
    // Co-headliners from string parse: default & between primaries
    artistsIn = artistsIn.map((entry, index, arr) => ({
      ...entry,
      relationToNext: index < arr.length - 1 ? (entry.relationToNext || '&') : null,
    }));
  }

  if (artistsIn.length === 0) {
    return null;
  }

  const existingArtists = Array.isArray(media.artist) ? media.artist : [];
  const existingFeaturing = Array.isArray(media.featuring) ? media.featuring : [];

  const artists = artistsIn.map((entry, index, arr) => {
    const name = String(entry.name || '').trim();
    const prev = findExistingCreatorByName(existingArtists, name)
      || findExistingCreatorByName(existingFeaturing, name);
    const isLast = index === arr.length - 1;
    return {
      name,
      userId: prev?.userId || null,
      collectiveId: prev?.collectiveId || null,
      verified: Boolean(prev?.verified),
      relationToNext: isLast ? null : (entry.relationToNext || '&'),
    };
  }).filter((a) => a.name);

  const featuring = featuringIn.map((entry) => {
    const name = String(entry?.name || entry || '').trim();
    const prev = findExistingCreatorByName(existingFeaturing, name)
      || findExistingCreatorByName(existingArtists, name);
    return {
      name,
      userId: prev?.userId || null,
      collectiveId: prev?.collectiveId || null,
      verified: Boolean(prev?.verified),
    };
  }).filter((f) => f.name);

  return { artists, featuring };
}

/**
 * Enqueue enrichment for a tipped/imported media item (idempotent for open statuses).
 */
async function enqueueEnrichment(mediaId, {
  importSource = 'library_import',
  importedBy = null,
  force = false,
  enrichTagsOnly = false,
} = {}) {
  const media = await Media.findById(mediaId);
  if (!media) return null;
  if (media.status === 'deleted' || media.deletedAt) return null;

  const externalIds = mapToObject(media.externalIds);
  if (!force && !enrichTagsOnly && externalIds.musicbrainz) {
    return null; // already linked — use backfill / enrichTagsOnly for tag pass
  }

  const open = await MetadataEnrichment.findOne({
    mediaId: media._id,
    status: { $in: ['pending', 'processing', 'needs_review'] },
  });
  if (open && !force) return open;

  const item = await MetadataEnrichment.create({
    mediaId: media._id,
    mediaUuid: media.uuid,
    importSource,
    importedBy: importedBy || media.importedBy || media.addedBy || null,
    status: 'pending',
    enrichTagsOnly: Boolean(enrichTagsOnly || (externalIds.musicbrainz && force)),
    original: snapshotMedia(media),
  });

  return item;
}

async function applySuggestionToMedia(media, suggestion, {
  preserveOriginal = true,
  applyIdentity = true,
  applyTags = true,
} = {}) {
  if (!media || !suggestion) return media;

  if (preserveOriginal && !media.youtubeMetadata?.originalTitle) {
    // Original snapshot lives on the enrichment record.
  }

  if (applyIdentity && suggestion.title && (suggestion.artist || suggestion.artists?.length)) {
    media.title = suggestion.title;
    const resolved = resolveArtistArraysFromSuggestion(suggestion, media);
    if (resolved?.artists?.length) {
      media.artist = resolved.artists;
      media.featuring = resolved.featuring || [];
    } else if (suggestion.artist) {
      // Last-resort single blob (should be rare after parse)
      if (Array.isArray(media.artist) && media.artist.length > 0) {
        media.artist[0].name = suggestion.artist;
        media.artist = [media.artist[0]];
      } else {
        media.artist = [{ name: suggestion.artist, userId: null, verified: false }];
      }
    }
    if (suggestion.album) media.album = suggestion.album;
  }

  if (suggestion.isrc && !media.isrc) media.isrc = normalizeIsrc(suggestion.isrc);
  if (suggestion.duration && (!media.duration || media.duration === 0)) {
    media.duration = suggestion.duration;
  }
  const parsedRelease = parseReleaseDate(
    suggestion.releaseDate || (suggestion.releaseYear ? String(suggestion.releaseYear) : null),
    suggestion.releaseDatePrecision || null
  );
  applyReleaseToMedia(media, parsedRelease, 'musicbrainz');

  ensureMap(media, 'externalIds');
  if (suggestion.musicbrainzId) {
    media.externalIds.set('musicbrainz', String(suggestion.musicbrainzId));
  }
  if (suggestion.musicbrainzReleaseId) {
    media.externalIds.set('musicbrainzRelease', String(suggestion.musicbrainzReleaseId));
  }

  // Soft identity upgrade when MusicBrainz confirms the recording
  if (applyIdentity && suggestion.musicbrainzId) {
    const rank = { unverified: 1, likely: 2, catalog: 3, verified: 4 };
    const currentRank = rank[media.identityConfidence] || 0;
    if (rank.verified > currentRank) {
      media.identityConfidence = 'verified';
      media.identityConfidenceSource = 'musicbrainz';
    }
  }

  if (applyTags) {
    const incomingTags = normalizeTagList(suggestion.tags || []);
    const incomingGenres = normalizeTagList(suggestion.genres || incomingTags, MAX_GENRES);
    if (incomingTags.length > 0) {
      media.tags = mergeTagLists(media.tags, incomingTags);
    }
    if (incomingGenres.length > 0) {
      media.genres = mergeTagLists(media.genres, incomingGenres, MAX_GENRES);
    }
  }

  media.creatorDisplay = formatCreatorDisplay(media.artist || [], media.featuring || []);
  await media.save();
  return media;
}

function mediaNeedsTagEnrichment(media) {
  const hasTags = Array.isArray(media.tags) && media.tags.length > 0;
  const hasGenres = Array.isArray(media.genres) && media.genres.length > 0;
  const hasYear = Boolean(media.releaseYear || media.releaseDate);
  const hasIsrc = Boolean(media.isrc);
  return !hasTags || !hasGenres || !hasYear || !hasIsrc;
}

async function processAlreadyLinked(item, media, alreadyMb) {
  const needsMeta = mediaNeedsTagEnrichment(media);
  if (!needsMeta && !item.enrichTagsOnly) {
    item.status = 'skipped';
    item.confidence = 'high';
    item.error = null;
    item.suggestion = {
      title: media.title,
      artist: mediaPrimaryArtistName(media),
      album: media.album || null,
      duration: media.duration || 0,
      isrc: media.isrc || null,
      releaseDate: media.releaseDate || null,
      releaseYear: media.releaseYear || null,
      releaseDatePrecision: media.releaseDatePrecision || null,
      tags: media.tags || [],
      genres: media.genres || [],
      musicbrainzId: alreadyMb,
      score: 1,
      matchType: 'already-linked',
    };
    item.processedAt = new Date();
    await item.save();
    return item;
  }

  const detailed = await enrichCandidateDetails({
    musicbrainzId: alreadyMb,
    title: media.title,
    artist: mediaPrimaryArtistName(media),
    album: media.album || null,
    duration: media.duration || 0,
    score: 1,
    matchType: 'already-linked',
  });

  const newTags = filterNewTags(media.tags, detailed.tags || []);
  const newGenres = filterNewTags(media.genres, detailed.genres || detailed.tags || [], MAX_GENRES);

  item.suggestion = suggestionFromCandidate({
    ...detailed,
    // For tag-only review, suggest only tags not already on the media
    tags: item.enrichTagsOnly ? newTags : (detailed.tags || []),
    genres: item.enrichTagsOnly ? newGenres : (detailed.genres || []),
  }, {
    title: media.title,
    artist: mediaPrimaryArtistName(media),
    album: media.album || detailed.album || null,
  });
  item.confidence = 'high';
  item.candidates = [];

  const hasNewTags = newTags.length > 0;
  const hasNewYear = detailed.releaseYear && !media.releaseYear && !media.releaseDate;
  const hasNewReleaseDate = Boolean(
    detailed.releaseDate
    && (
      !media.releaseDate
      || (media.releaseDatePrecision === 'year')
      || (!media.releaseDatePrecision && media.releaseYear && !media.releaseDate)
    )
  );
  const hasNewIsrc = detailed.isrc && !media.isrc;

  if (!hasNewTags && !hasNewYear && !hasNewReleaseDate && !hasNewIsrc) {
    item.status = 'skipped';
    item.error = null;
    item.processedAt = new Date();
    await item.save();
    return item;
  }

  // Tags always need admin review; year/date/ISRC alone can auto-fill on confirmed MB links
  if (hasNewTags) {
    item.status = 'needs_review';
    item.error = null;
    item.processedAt = new Date();
    await item.save();
    return item;
  }

  await applySuggestionToMedia(media, {
    ...item.suggestion,
    releaseDate: detailed.releaseDate,
    releaseYear: detailed.releaseYear,
    releaseDatePrecision: detailed.releaseDatePrecision,
    isrc: detailed.isrc,
  }, {
    applyIdentity: false,
    applyTags: false,
  });
  item.status = 'auto_applied';
  item.error = null;
  item.processedAt = new Date();
  await item.save();
  return item;
}

async function processEnrichmentItem(itemOrId) {
  const item = typeof itemOrId === 'object' && itemOrId?._id
    ? itemOrId
    : await MetadataEnrichment.findById(itemOrId);

  if (!item) return null;
  if (!['pending', 'failed'].includes(item.status)) return item;

  item.status = 'processing';
  await item.save();

  try {
    const media = await Media.findById(item.mediaId);
    if (!media || media.status === 'deleted' || media.deletedAt) {
      item.status = 'skipped';
      item.confidence = 'none';
      item.error = 'Media missing or deleted';
      item.processedAt = new Date();
      await item.save();
      return item;
    }

    const original = item.original?.title
      ? item.original
      : snapshotMedia(media);

    item.original = {
      ...snapshotMedia(media),
      ...original,
      tags: original.tags || media.tags || [],
      genres: original.genres || media.genres || [],
      releaseYear: original.releaseYear ?? media.releaseYear ?? null,
    };

    const alreadyMb = mapToObject(media.externalIds).musicbrainz;
    if (alreadyMb) {
      return processAlreadyLinked(item, media, alreadyMb);
    }

    const query = buildSearchQuery(original.title, original.artist);
    await throttleMusicBrainz();
    const { tracks } = await musicbrainzService.searchRecordings(query, 0, 8);

    const scored = (tracks || []).map((track) => {
      const { score, matchType } = scoreCandidate(original, track);
      return {
        musicbrainzId: track.id || track.externalIds?.musicbrainz,
        title: track.title,
        artist: track.artist,
        artists: track.artists || [],
        featuring: track.featuring || [],
        album: track.album || null,
        duration: track.duration || 0,
        releaseDate: track.releaseDate || null,
        releaseYear: track.releaseYear || null,
        releaseDatePrecision: track.releaseDatePrecision || null,
        isrc: null,
        tags: [],
        genres: [],
        score,
        matchType,
      };
    }).sort((a, b) => b.score - a.score);

    item.candidates = scored.slice(0, 5);
    const best = scored[0] || null;
    const confidence = best ? confidenceFromScore(best.score) : 'none';
    item.confidence = confidence;

    if (!best || confidence === 'none') {
      item.status = 'skipped';
      item.processedAt = new Date();
      await item.save();
      return item;
    }

    // Lookup tags/ISRC/year for the best candidate (and for reviewable low/medium)
    const detailed = await enrichCandidateDetails(best);
    item.candidates = [
      {
        musicbrainzId: detailed.musicbrainzId,
        musicbrainzReleaseId: detailed.musicbrainzReleaseId || null,
        title: detailed.title,
        artist: detailed.artist,
        artists: detailed.artists || [],
        featuring: detailed.featuring || [],
        album: detailed.album || null,
        duration: detailed.duration || 0,
        releaseDate: detailed.releaseDate || null,
        releaseYear: detailed.releaseYear || null,
        releaseDatePrecision: detailed.releaseDatePrecision || null,
        isrc: detailed.isrc || null,
        tags: detailed.tags || [],
        genres: detailed.genres || [],
        score: best.score,
        matchType: best.matchType,
        detailsFetched: true,
      },
      ...scored.slice(1, 5),
    ];

    item.suggestion = suggestionFromCandidate(detailed);

    if (confidence === 'low') {
      item.status = 'needs_review';
      item.processedAt = new Date();
      await item.save();
      return item;
    }

    if (confidence === 'high') {
      const suggestedTags = item.suggestion.tags || [];
      await applySuggestionToMedia(media, item.suggestion, {
        applyTags: false,
      });
      // Hold folksonomy tags for admin review; identity/year/ISRC already applied
      if (suggestedTags.length > 0) {
        item.status = 'needs_review';
      } else {
        item.status = 'auto_applied';
      }
    } else {
      item.status = 'needs_review';
    }

    item.processedAt = new Date();
    item.error = null;
    await item.save();
    return item;
  } catch (error) {
    console.error('metadataEnrichment process error:', error.message);
    item.status = 'failed';
    item.error = error.message || 'Enrichment failed';
    item.processedAt = new Date();
    await item.save();
    return item;
  }
}

/**
 * Process pending queue items (rate-limited). Safe to call after imports.
 */
async function processQueue({ limit = 20 } = {}) {
  if (queueBusy) return { skipped: true, reason: 'busy' };
  queueBusy = true;
  try {
    const pending = await MetadataEnrichment.find({ status: { $in: ['pending', 'failed'] } })
      .sort({ createdAt: 1 })
      .limit(Math.min(Math.max(limit, 1), 50));

    const results = { processed: 0, autoApplied: 0, needsReview: 0, skipped: 0, failed: 0 };
    for (const item of pending) {
      const out = await processEnrichmentItem(item);
      results.processed += 1;
      if (out?.status === 'auto_applied') results.autoApplied += 1;
      else if (out?.status === 'needs_review') results.needsReview += 1;
      else if (out?.status === 'skipped') results.skipped += 1;
      else if (out?.status === 'failed') results.failed += 1;
    }
    return results;
  } finally {
    queueBusy = false;
  }
}

function kickProcessQueue(limit = 15) {
  setImmediate(() => {
    processQueue({ limit }).catch((err) => {
      console.error('metadataEnrichment background queue error:', err);
    });
  });
}

async function listEnrichments({
  status = 'needs_review',
  page = 1,
  limit = 30,
  importSource,
} = {}) {
  const query = {};
  if (status && status !== 'all') query.status = status;
  if (importSource) query.importSource = importSource;

  const skip = (Math.max(1, page) - 1) * limit;
  const capped = Math.min(Math.max(limit, 1), 100);

  const [items, total, counts] = await Promise.all([
    MetadataEnrichment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(capped)
      .populate('importedBy', 'username uuid')
      .populate('reviewedBy', 'username uuid')
      .lean(),
    MetadataEnrichment.countDocuments(query),
    MetadataEnrichment.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts = counts.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  const mediaIds = items.map((item) => item.mediaId).filter(Boolean);
  const mediaDocs = mediaIds.length > 0
    ? await Media.find({ _id: { $in: mediaIds } })
      .select('sources externalIds tags genres releaseYear isrc')
      .lean()
    : [];
  const mediaById = new Map(mediaDocs.map((doc) => [String(doc._id), doc]));

  const enrichedItems = items.map((item) => {
    const media = mediaById.get(String(item.mediaId));
    const currentTags = media?.tags || [];
    const suggestedTags = item.suggestion?.tags || [];
    return {
      ...item,
      importSourceUrl: resolveImportSourceUrl(media, item.importSource),
      currentTags,
      currentGenres: media?.genres || [],
      currentReleaseYear: media?.releaseYear || null,
      currentIsrc: media?.isrc || null,
      newTags: filterNewTags(currentTags, suggestedTags),
    };
  });

  return {
    items: enrichedItems,
    pagination: {
      page: Math.max(1, page),
      limit: capped,
      total,
      pages: Math.ceil(total / capped) || 1,
    },
    statusCounts,
  };
}

async function applyEnrichment(itemId, actorId, overrides = {}) {
  const item = await MetadataEnrichment.findById(itemId);
  if (!item) {
    const err = new Error('Enrichment item not found');
    err.status = 404;
    throw err;
  }
  if (!item.suggestion?.title && !overrides.title) {
    const err = new Error('No suggestion to apply');
    err.status = 400;
    throw err;
  }

  const media = await Media.findById(item.mediaId);
  if (!media) {
    const err = new Error('Media not found');
    err.status = 404;
    throw err;
  }

  let suggestion = {
    title: overrides.title || item.suggestion.title,
    artist: overrides.artist || item.suggestion.artist,
    artists: overrides.artists ?? item.suggestion.artists ?? [],
    featuring: overrides.featuring ?? item.suggestion.featuring ?? [],
    album: overrides.album ?? item.suggestion.album,
    duration: overrides.duration ?? item.suggestion.duration,
    isrc: overrides.isrc ?? item.suggestion.isrc,
    releaseDate: overrides.releaseDate ?? item.suggestion.releaseDate,
    releaseYear: overrides.releaseYear ?? item.suggestion.releaseYear,
    releaseDatePrecision: overrides.releaseDatePrecision ?? item.suggestion.releaseDatePrecision,
    tags: overrides.tags ?? item.suggestion.tags ?? [],
    genres: overrides.genres ?? item.suggestion.genres ?? [],
    musicbrainzId: overrides.musicbrainzId || item.suggestion.musicbrainzId,
    musicbrainzReleaseId: overrides.musicbrainzReleaseId
      || item.suggestion.musicbrainzReleaseId
      || null,
  };

  // If admin overrides the display artist string without structured arrays, clear arrays
  // so resolveArtistArraysFromSuggestion re-parses from the string.
  const adminArtistOverride = Boolean(overrides.artist && overrides.artists == null);
  if (adminArtistOverride) {
    suggestion.artists = [];
    suggestion.featuring = overrides.featuring ?? [];
  } else {
    // Legacy rows: smashed artist string + empty artists[] — pull credits from MB first
    suggestion = await hydrateSuggestionArtists(suggestion);
  }

  // Tag-only / backfill rows should not rewrite title/artist unless asked
  const applyIdentity = overrides.applyIdentity != null
    ? Boolean(overrides.applyIdentity)
    : !item.enrichTagsOnly;
  const applyTags = overrides.applyTags !== false;

  await applySuggestionToMedia(media, suggestion, { applyIdentity, applyTags });
  const prevSuggestion = item.suggestion && typeof item.suggestion.toObject === 'function'
    ? item.suggestion.toObject()
    : (item.suggestion || {});
  item.suggestion = { ...prevSuggestion, ...suggestion };
  item.status = 'applied';
  item.reviewedBy = actorId;
  item.reviewedAt = new Date();
  if (overrides.adminNotes) item.adminNotes = overrides.adminNotes;
  await item.save();

  return { item, media };
}

async function dismissEnrichment(itemId, actorId, adminNotes) {
  const item = await MetadataEnrichment.findById(itemId);
  if (!item) {
    const err = new Error('Enrichment item not found');
    err.status = 404;
    throw err;
  }
  item.status = 'dismissed';
  item.reviewedBy = actorId;
  item.reviewedAt = new Date();
  if (adminNotes) item.adminNotes = adminNotes;
  await item.save();
  return item;
}

async function batchApplyEnrichments(ids, actorId, overrides = {}) {
  const list = Array.isArray(ids) ? ids.slice(0, 100) : [];
  const results = { applied: 0, failed: 0, errors: [] };
  for (const id of list) {
    try {
      await applyEnrichment(id, actorId, overrides);
      results.applied += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push({ id, error: err.message || 'Apply failed' });
    }
  }
  return results;
}

async function batchDismissEnrichments(ids, actorId, adminNotes) {
  const list = Array.isArray(ids) ? ids.slice(0, 100) : [];
  const results = { dismissed: 0, failed: 0, errors: [] };
  for (const id of list) {
    try {
      await dismissEnrichment(id, actorId, adminNotes);
      results.dismissed += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push({ id, error: err.message || 'Dismiss failed' });
    }
  }
  return results;
}

function candidateToPlain(candidate) {
  if (!candidate) return null;
  return typeof candidate.toObject === 'function' ? candidate.toObject() : { ...candidate };
}

function persistCandidateDetails(item, candidateIndex, detailed) {
  const next = {
    musicbrainzId: detailed.musicbrainzId,
    musicbrainzReleaseId: detailed.musicbrainzReleaseId || null,
    title: detailed.title,
    artist: detailed.artist,
    artists: detailed.artists || [],
    featuring: detailed.featuring || [],
    album: detailed.album || null,
    duration: detailed.duration || 0,
    releaseDate: detailed.releaseDate || null,
    releaseYear: detailed.releaseYear || null,
    releaseDatePrecision: detailed.releaseDatePrecision || null,
    isrc: detailed.isrc || null,
    tags: detailed.tags || [],
    genres: detailed.genres || [],
    score: detailed.score ?? item.candidates[candidateIndex]?.score ?? 0,
    matchType: detailed.matchType ?? item.candidates[candidateIndex]?.matchType ?? null,
    detailsFetched: true,
  };
  item.candidates[candidateIndex] = next;
  item.markModified('candidates');
  return next;
}

/**
 * Lazy-load MusicBrainz recording details for a review candidate (tags, ISRC, album, etc.).
 * Persists onto the candidate so reopening the queue does not re-hit MB.
 */
async function previewCandidate(itemId, candidateIndex) {
  const item = await MetadataEnrichment.findById(itemId);
  if (!item) {
    const err = new Error('Enrichment item not found');
    err.status = 404;
    throw err;
  }
  const candidate = item.candidates?.[candidateIndex];
  if (!candidate) {
    const err = new Error('Invalid candidate index');
    err.status = 400;
    throw err;
  }

  const plain = candidateToPlain(candidate);
  if (plain.detailsFetched) {
    return { candidate: plain, item };
  }

  const detailed = await enrichCandidateDetails(plain);
  const saved = persistCandidateDetails(item, candidateIndex, detailed);
  await item.save();
  return { candidate: saved, item };
}

async function chooseCandidate(itemId, candidateIndex, actorId) {
  const item = await MetadataEnrichment.findById(itemId);
  if (!item) {
    const err = new Error('Enrichment item not found');
    err.status = 404;
    throw err;
  }
  const candidate = item.candidates?.[candidateIndex];
  if (!candidate) {
    const err = new Error('Invalid candidate index');
    err.status = 400;
    throw err;
  }

  const plain = candidateToPlain(candidate);
  const detailed = await enrichCandidateDetails(plain);
  persistCandidateDetails(item, candidateIndex, detailed);
  item.suggestion = suggestionFromCandidate(detailed);
  item.confidence = confidenceFromScore(detailed.score ?? candidate.score);
  await item.save();
  return applyEnrichment(itemId, actorId);
}

/**
 * After library import tips — enqueue + kick background MB processing.
 */
async function enqueueAfterLibraryImport(tippedItems, {
  importSource = 'library_import',
  importedBy = null,
} = {}) {
  const created = [];
  for (const tip of tippedItems || []) {
    if (!tip?.mediaId || tip.status !== 'tipped') continue;
    try {
      const item = await enqueueEnrichment(tip.mediaId, { importSource, importedBy });
      if (item) created.push(item);
    } catch (err) {
      console.error('enqueueAfterLibraryImport error:', err.message);
    }
  }
  if (created.length > 0) {
    kickProcessQueue(Math.min(created.length, 25));
  }
  return created;
}

/**
 * Enqueue MusicBrainz tag/year/ISRC backfill for music media.
 *
 * @param {object} opts
 * @param {'supplement'|'untagged'} [opts.mode='supplement']
 *   - supplement: whole library (incl. already tagged); new MB tags → needs_review
 *   - untagged: only media with empty tags
 * @param {'linked'|'unlinked'|'any'} [opts.linkage='linked']
 *   - linked: only tracks with externalIds.musicbrainz (fast lookup)
 *   - unlinked: only tracks without an MBID (search by title+artist)
 *   - any: both
 * @param {boolean} [opts.onlyLinked] Deprecated — prefer linkage
 * @param {number} [opts.limit=50]
 * @param {boolean} [opts.processImmediately=true]
 */
async function enqueueUntaggedBackfill({
  limit = 50,
  onlyLinked,
  linkage,
  processImmediately = true,
  mode = 'supplement',
} = {}) {
  const capped = Math.min(Math.max(limit, 1), 200);
  const supplement = mode !== 'untagged';

  let resolvedLinkage = linkage;
  if (!resolvedLinkage) {
    if (onlyLinked === false) resolvedLinkage = 'any';
    else if (onlyLinked === true) resolvedLinkage = 'linked';
    else resolvedLinkage = 'linked';
  }

  const baseQuery = {
    status: { $ne: 'deleted' },
    deletedAt: null,
    $and: [
      {
        $or: [
          { contentType: 'music' },
          { contentType: { $in: ['music'] } },
          { contentForm: { $in: ['tune'] } },
          { contentType: { $exists: false } },
        ],
      },
    ],
  };

  if (!supplement) {
    baseQuery.$and.push({
      $or: [
        { tags: { $exists: false } },
        { tags: { $size: 0 } },
        { tags: null },
      ],
    });
  }

  if (resolvedLinkage === 'linked') {
    baseQuery['externalIds.musicbrainz'] = { $exists: true, $nin: [null, ''] };
  } else if (resolvedLinkage === 'unlinked') {
    baseQuery.$and.push({
      $or: [
        { 'externalIds.musicbrainz': { $exists: false } },
        { 'externalIds.musicbrainz': null },
        { 'externalIds.musicbrainz': '' },
      ],
    });
  }

  // Avoid re-queueing media that already finished a tag backfill (applied / skipped).
  // Dismissed items can be re-queued later if desired.
  const doneIds = await MetadataEnrichment.distinct('mediaId', {
    importSource: 'backfill',
    status: { $in: ['applied', 'auto_applied', 'skipped'] },
  });
  if (doneIds.length > 0) {
    baseQuery._id = { $nin: doneIds };
  }

  // Pull a wider candidate set, then skip open queue rows
  const mediaList = await Media.find(baseQuery)
    .select('_id uuid externalIds tags genres releaseYear isrc title artist')
    .sort({ updatedAt: -1 })
    .limit(capped * 3)
    .lean();

  const created = [];
  let skippedOpen = 0;
  let skippedDone = 0;

  for (const media of mediaList) {
    if (created.length >= capped) break;

    const open = await MetadataEnrichment.findOne({
      mediaId: media._id,
      status: { $in: ['pending', 'processing', 'needs_review'] },
    });
    if (open) {
      skippedOpen += 1;
      continue;
    }

    const hasMb = Boolean(mapToObject(media.externalIds).musicbrainz);
    // Linked → tag-only review. Unlinked → full search/match so apply can store MBID.
    const item = await enqueueEnrichment(media._id, {
      importSource: 'backfill',
      force: true,
      enrichTagsOnly: hasMb,
    });
    if (item) created.push(item);
  }

  if (processImmediately && created.length > 0) {
    kickProcessQueue(Math.min(created.length, 25));
  }

  return {
    enqueued: created.length,
    skippedOpen,
    skippedDone,
    scanned: mediaList.length,
    mode: supplement ? 'supplement' : 'untagged',
    linkage: resolvedLinkage,
    onlyLinked: resolvedLinkage === 'linked',
  };
}

module.exports = {
  enqueueEnrichment,
  enqueueAfterLibraryImport,
  enqueueUntaggedBackfill,
  processEnrichmentItem,
  processQueue,
  kickProcessQueue,
  listEnrichments,
  applyEnrichment,
  dismissEnrichment,
  batchApplyEnrichments,
  batchDismissEnrichments,
  chooseCandidate,
  previewCandidate,
  scoreCandidate,
  filterNewTags,
  hydrateSuggestionArtists,
  suggestionHasStructuredArtists,
  resolveArtistArraysFromSuggestion,
  applySuggestionToMedia,
  HIGH_SCORE,
  MEDIUM_SCORE,
};
