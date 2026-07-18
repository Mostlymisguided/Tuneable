/**
 * Post-import MusicBrainz enrichment: score → auto-apply high confidence,
 * queue medium confidence for admin review.
 * Also pulls folksonomy tags, ISRC, and release year via recording lookup.
 */

const Media = require('../models/Media');
const MetadataEnrichment = require('../models/MetadataEnrichment');
const musicbrainzService = require('./musicbrainzService');
const { formatCreatorDisplay } = require('../utils/artistParser');
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
 * Enrich a scored candidate with recording lookup (tags, ISRC, year, release id).
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
      album: details.album || candidate.album,
      duration: details.duration || candidate.duration,
      releaseYear: details.releaseYear ?? candidate.releaseYear ?? null,
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
  return {
    title: candidate.title,
    artist: candidate.artist,
    album: candidate.album || null,
    duration: candidate.duration || 0,
    isrc: candidate.isrc || null,
    releaseYear: candidate.releaseYear || null,
    tags: normalizeTagList(candidate.tags || []),
    genres: normalizeTagList(candidate.genres || candidate.tags || [], MAX_GENRES),
    musicbrainzId: candidate.musicbrainzId,
    musicbrainzReleaseId: candidate.musicbrainzReleaseId || null,
    score: candidate.score,
    matchType: candidate.matchType,
    ...extras,
  };
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

  if (applyIdentity && suggestion.title && suggestion.artist) {
    media.title = suggestion.title;
    if (Array.isArray(media.artist) && media.artist.length > 0) {
      media.artist[0].name = suggestion.artist;
    } else {
      media.artist = [{ name: suggestion.artist, userId: null, verified: false }];
    }
    if (suggestion.album) media.album = suggestion.album;
  }

  if (suggestion.isrc && !media.isrc) media.isrc = normalizeIsrc(suggestion.isrc);
  if (suggestion.duration && (!media.duration || media.duration === 0)) {
    media.duration = suggestion.duration;
  }
  if (suggestion.releaseYear && !media.releaseYear) {
    media.releaseYear = suggestion.releaseYear;
  }

  ensureMap(media, 'externalIds');
  if (suggestion.musicbrainzId) {
    media.externalIds.set('musicbrainz', String(suggestion.musicbrainzId));
  }
  if (suggestion.musicbrainzReleaseId) {
    media.externalIds.set('musicbrainzRelease', String(suggestion.musicbrainzReleaseId));
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
  const hasYear = Boolean(media.releaseYear);
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
      releaseYear: media.releaseYear || null,
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

  item.suggestion = suggestionFromCandidate(detailed, {
    title: media.title,
    artist: mediaPrimaryArtistName(media),
    album: media.album || detailed.album || null,
  });
  item.confidence = 'high';
  item.candidates = [];

  const hasNewTags = (detailed.tags || []).length > 0
    && (!(media.tags || []).length
      || (detailed.tags || []).some((t) => !(media.tags || []).some((m) => tagsMatch(m, t))));
  const hasNewYear = detailed.releaseYear && !media.releaseYear;
  const hasNewIsrc = detailed.isrc && !media.isrc;

  if (!hasNewTags && !hasNewYear && !hasNewIsrc) {
    item.status = 'skipped';
    item.error = null;
    item.processedAt = new Date();
    await item.save();
    return item;
  }

  // Tags always need admin review; year/ISRC alone can auto-fill on confirmed MB links
  if (hasNewTags) {
    item.status = 'needs_review';
    item.error = null;
    item.processedAt = new Date();
    await item.save();
    return item;
  }

  await applySuggestionToMedia(media, item.suggestion, {
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
        album: track.album || null,
        duration: track.duration || 0,
        releaseYear: track.releaseYear || null,
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
        album: detailed.album || null,
        duration: detailed.duration || 0,
        releaseYear: detailed.releaseYear || null,
        isrc: detailed.isrc || null,
        tags: detailed.tags || [],
        genres: detailed.genres || [],
        score: best.score,
        matchType: best.matchType,
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
    return {
      ...item,
      importSourceUrl: resolveImportSourceUrl(media, item.importSource),
      currentTags: media?.tags || [],
      currentGenres: media?.genres || [],
      currentReleaseYear: media?.releaseYear || null,
      currentIsrc: media?.isrc || null,
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

  const suggestion = {
    title: overrides.title || item.suggestion.title,
    artist: overrides.artist || item.suggestion.artist,
    album: overrides.album ?? item.suggestion.album,
    duration: overrides.duration ?? item.suggestion.duration,
    isrc: overrides.isrc ?? item.suggestion.isrc,
    releaseYear: overrides.releaseYear ?? item.suggestion.releaseYear,
    tags: overrides.tags ?? item.suggestion.tags ?? [],
    genres: overrides.genres ?? item.suggestion.genres ?? [],
    musicbrainzId: overrides.musicbrainzId || item.suggestion.musicbrainzId,
    musicbrainzReleaseId: overrides.musicbrainzReleaseId
      || item.suggestion.musicbrainzReleaseId
      || null,
  };

  const applyIdentity = overrides.applyIdentity !== false;
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

  const plain = typeof candidate.toObject === 'function' ? candidate.toObject() : { ...candidate };
  const detailed = await enrichCandidateDetails(plain);
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
 * Enqueue MusicBrainz tag/year/ISRC backfill for music media missing tags.
 * Prefer already-linked MBIDs; also queues unmatched untagged tracks for search.
 */
async function enqueueUntaggedBackfill({
  limit = 50,
  onlyLinked = false,
  processImmediately = true,
} = {}) {
  const capped = Math.min(Math.max(limit, 1), 200);

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
      {
        $or: [
          { tags: { $exists: false } },
          { tags: { $size: 0 } },
          { tags: null },
        ],
      },
    ],
  };

  if (onlyLinked) {
    baseQuery['externalIds.musicbrainz'] = { $exists: true, $nin: [null, ''] };
  }

  const mediaList = await Media.find(baseQuery)
    .select('_id uuid externalIds tags genres releaseYear isrc title artist')
    .sort({ updatedAt: -1 })
    .limit(capped)
    .lean();

  const created = [];
  let skippedOpen = 0;

  for (const media of mediaList) {
    const open = await MetadataEnrichment.findOne({
      mediaId: media._id,
      status: { $in: ['pending', 'processing', 'needs_review'] },
    });
    if (open) {
      skippedOpen += 1;
      continue;
    }

    const hasMb = Boolean(mapToObject(media.externalIds).musicbrainz);
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
    scanned: mediaList.length,
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
  chooseCandidate,
  scoreCandidate,
  HIGH_SCORE,
  MEDIUM_SCORE,
};
