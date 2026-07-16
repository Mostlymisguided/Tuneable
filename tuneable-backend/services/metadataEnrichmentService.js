/**
 * Post-import MusicBrainz enrichment: score → auto-apply high confidence,
 * queue medium confidence for admin review.
 */

const Media = require('../models/Media');
const MetadataEnrichment = require('../models/MetadataEnrichment');
const musicbrainzService = require('./musicbrainzService');
const { formatCreatorDisplay } = require('../utils/artistParser');
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
} = require('../utils/mediaMatchUtils');

const MB_GAP_MS = 1100;
const HIGH_SCORE = 0.82;
const MEDIUM_SCORE = 0.55;

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
  };
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
 * Enqueue enrichment for a tipped/imported media item (idempotent for open statuses).
 */
async function enqueueEnrichment(mediaId, {
  importSource = 'library_import',
  importedBy = null,
  force = false,
} = {}) {
  const media = await Media.findById(mediaId);
  if (!media) return null;
  if (media.status === 'deleted' || media.deletedAt) return null;

  const externalIds = mapToObject(media.externalIds);
  if (!force && externalIds.musicbrainz) {
    return null; // already linked
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
    original: snapshotMedia(media),
  });

  return item;
}

async function applySuggestionToMedia(media, suggestion, { preserveOriginal = true } = {}) {
  if (!media || !suggestion?.title || !suggestion?.artist) return media;

  if (preserveOriginal && !media.youtubeMetadata?.originalTitle) {
    // Reuse youtubeMetadata.originalTitle as a generic "first known title" when empty,
    // otherwise store only on the enrichment record (preferred).
  }

  media.title = suggestion.title;
  if (Array.isArray(media.artist) && media.artist.length > 0) {
    media.artist[0].name = suggestion.artist;
  } else {
    media.artist = [{ name: suggestion.artist, userId: null, verified: false }];
  }

  if (suggestion.album) media.album = suggestion.album;
  if (suggestion.isrc && !media.isrc) media.isrc = suggestion.isrc;
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

  media.creatorDisplay = formatCreatorDisplay(media.artist || [], media.featuring || []);
  await media.save();
  return media;
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

    item.original = original;

    const alreadyMb = mapToObject(media.externalIds).musicbrainz;
    if (alreadyMb) {
      item.status = 'skipped';
      item.confidence = 'high';
      item.error = null;
      item.suggestion = {
        title: media.title,
        artist: mediaPrimaryArtistName(media),
        album: media.album || null,
        duration: media.duration || 0,
        isrc: media.isrc || null,
        musicbrainzId: alreadyMb,
        score: 1,
        matchType: 'already-linked',
      };
      item.processedAt = new Date();
      await item.save();
      return item;
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
        score,
        matchType,
      };
    }).sort((a, b) => b.score - a.score);

    item.candidates = scored.slice(0, 5);
    const best = scored[0] || null;
    const confidence = best ? confidenceFromScore(best.score) : 'none';
    item.confidence = confidence;

    if (!best || confidence === 'none' || confidence === 'low') {
      item.status = confidence === 'low' ? 'needs_review' : 'skipped';
      if (best && confidence === 'low') {
        item.suggestion = {
          title: best.title,
          artist: best.artist,
          album: best.album,
          duration: best.duration,
          isrc: null,
          musicbrainzId: best.musicbrainzId,
          score: best.score,
          matchType: best.matchType,
        };
        item.status = 'needs_review';
      }
      item.processedAt = new Date();
      await item.save();
      return item;
    }

    item.suggestion = {
      title: best.title,
      artist: best.artist,
      album: best.album,
      duration: best.duration,
      isrc: null,
      musicbrainzId: best.musicbrainzId,
      score: best.score,
      matchType: best.matchType,
    };

    if (confidence === 'high') {
      await applySuggestionToMedia(media, {
        ...item.suggestion,
        releaseYear: best.releaseYear,
      });
      item.status = 'auto_applied';
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
    ? await Media.find({ _id: { $in: mediaIds } }).select('sources externalIds').lean()
    : [];
  const mediaById = new Map(mediaDocs.map((doc) => [String(doc._id), doc]));

  const enrichedItems = items.map((item) => ({
    ...item,
    importSourceUrl: resolveImportSourceUrl(
      mediaById.get(String(item.mediaId)),
      item.importSource
    ),
  }));

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
  if (!['needs_review', 'skipped', 'auto_applied', 'failed'].includes(item.status)
    && item.status !== 'pending') {
    // allow re-apply from needs_review primarily
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
    musicbrainzId: overrides.musicbrainzId || item.suggestion.musicbrainzId,
  };

  await applySuggestionToMedia(media, suggestion);
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
  item.suggestion = {
    title: candidate.title,
    artist: candidate.artist,
    album: candidate.album,
    duration: candidate.duration,
    isrc: null,
    musicbrainzId: candidate.musicbrainzId,
    score: candidate.score,
    matchType: candidate.matchType,
  };
  item.confidence = confidenceFromScore(candidate.score);
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

module.exports = {
  enqueueEnrichment,
  enqueueAfterLibraryImport,
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
