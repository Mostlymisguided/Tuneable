/**
 * User-facing library import: preview + batch tip (Spotify / SoundCloud likes, etc.)
 */

const mongoose = require('mongoose');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const spotifyService = require('./spotifyService');
const soundcloudService = require('./soundcloudService');
const importCrossRefService = require('./importCrossRefService');
const { placeGlobalBid } = require('./globalBidService');
const { enrichMediaWithPlayability } = require('../utils/mediaPlayability');
const {
  buildMediaIndexes,
  findFuzzyCatalogMatch,
  mediaPrimaryArtistName,
  normalizeIsrc,
} = require('../utils/mediaMatchUtils');

const DEFAULT_TIP = 1.11;
const MIN_TIP = 0.01;
const MAX_BATCH = 100;
const FUZZY_CATALOG_LIMIT = 25000;
const MATCH_CONCURRENCY = 8;

async function mapWithConcurrency(items, concurrency, mapper) {
  const list = items || [];
  const results = new Array(list.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < list.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(list[index], index);
    }
  }

  const workerCount = Math.min(Math.max(concurrency, 1), Math.max(list.length, 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function identityConfidenceSourceFrom({ matchStatus, matchType, crossRef }) {
  if (crossRef?.status === 'isrc_verified') {
    const sources = crossRef.sources || [];
    if (sources.includes('spotify') && sources.includes('musicbrainz')) {
      return 'isrc-spotify+musicbrainz';
    }
    if (sources.includes('spotify')) return 'isrc-spotify';
    if (sources.includes('musicbrainz')) return 'isrc-musicbrainz';
    return 'isrc';
  }
  if (crossRef?.status === 'spotify_catalog' || (
    crossRef?.identityConfidence === 'verified' && (crossRef.sources || []).includes('spotify')
  )) {
    return 'spotify';
  }
  if (matchStatus === 'on_catalog' || matchStatus === 'in_library') {
    return matchType === 'external-id' ? 'catalog-external-id' : 'catalog-exact';
  }
  if (matchStatus === 'possible_match') return 'catalog-fuzzy';
  return 'none';
}

function buildExternalMediaFromTrack(track, {
  identityConfidence = null,
  identityConfidenceSource = null,
} = {}) {
  const tags = Array.isArray(track.tags)
    ? track.tags.filter((t) => typeof t === 'string' && t.trim())
    : [];
  const genres = Array.isArray(track.genres)
    ? track.genres.filter((t) => typeof t === 'string' && t.trim())
    : (track.genre ? [String(track.genre).trim()].filter(Boolean) : []);

  const isrc = normalizeIsrc(track.externalIds?.isrc);

  return {
    title: track.title,
    artist: track.artist,
    coverArt: track.coverArt || null,
    duration: track.duration || 0,
    category: track.category || 'Music',
    album: track.album || null,
    releaseDate: track.releaseDate || null,
    releaseYear: track.releaseYear || null,
    releaseDatePrecision: track.releaseDatePrecision || null,
    sources: track.sources || {},
    externalIds: track.externalIds || {},
    isrc: isrc || null,
    tags,
    genres,
    identityConfidence: identityConfidence || null,
    identityConfidenceSource: identityConfidenceSource || null,
  };
}

function normalizePermalink(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    let path = u.pathname.replace(/\/+$/, '');
    return `${u.origin}${path}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * High-confidence catalog hit (IDs / ISRC / exact title+artist). Safe to auto-attach.
 */
async function findExactCatalogMedia(track) {
  const spotifyId = track.externalIds?.spotify || (track.sourceLabel === 'Spotify Likes' ? track.id : null);
  const soundcloudId = track.externalIds?.soundcloud
    || (track.sourceLabel === 'SoundCloud Likes' ? track.id : null);
  const isrc = normalizeIsrc(track.externalIds?.isrc);
  const soundcloudUrl = track.sources?.soundcloud;

  const or = [];
  if (spotifyId) or.push({ 'externalIds.spotify': String(spotifyId) });
  if (soundcloudId) or.push({ 'externalIds.soundcloud': String(soundcloudId) });
  if (isrc) or.push({ isrc });
  if (soundcloudUrl) {
    or.push({ 'sources.soundcloud': soundcloudUrl });
    const normalized = normalizePermalink(soundcloudUrl);
    if (normalized && normalized !== soundcloudUrl) {
      or.push({ 'sources.soundcloud': normalized });
    }
  }

  if (or.length > 0) {
    const byExternal = await Media.findOne({
      $or: or,
      status: { $ne: 'deleted' },
      deletedAt: null,
    }).lean();
    if (byExternal) return { media: byExternal, confidence: 'exact', matchType: 'external-id' };
  }

  if (!track.title || !track.artist) return null;

  const exact = await Media.findOne({
    title: track.title,
    'artist.name': track.artist,
    status: { $ne: 'deleted' },
    deletedAt: null,
  }).lean();

  if (exact) return { media: exact, confidence: 'exact', matchType: 'exact-title-artist' };
  return null;
}

async function loadFuzzyCatalogIndexes() {
  const mediaList = await Media.find({
    status: { $ne: 'deleted' },
    deletedAt: null,
    $or: [
      { contentType: 'music' },
      { contentType: { $in: ['music'] } },
      { contentForm: { $in: ['tune'] } },
      { contentType: { $exists: false } },
      { contentType: { $size: 0 } },
    ],
  })
    .select('title artist duration coverArt uuid externalIds isrc sources globalMediaAggregate')
    .limit(FUZZY_CATALOG_LIMIT)
    .lean();

  return buildMediaIndexes(mediaList);
}

/**
 * Attach missing SoundCloud/Spotify ids & URLs onto an existing catalog row.
 */
async function mergeExternalIdsOntoMedia(mediaId, externalMedia) {
  if (!mediaId || !externalMedia) return;
  const media = await Media.findById(mediaId);
  if (!media) return;

  let changed = false;
  const ensureMap = (field) => {
    if (!(media[field] instanceof Map)) {
      media[field] = new Map(Object.entries(media[field] || {}));
    }
  };

  if (externalMedia.externalIds && typeof externalMedia.externalIds === 'object') {
    ensureMap('externalIds');
    for (const [key, value] of Object.entries(externalMedia.externalIds)) {
      if (!value) continue;
      if (!media.externalIds.get(key)) {
        media.externalIds.set(key, String(value));
        changed = true;
      }
    }
  }

  if (externalMedia.sources && typeof externalMedia.sources === 'object') {
    ensureMap('sources');
    for (const [key, value] of Object.entries(externalMedia.sources)) {
      if (!value) continue;
      if (!media.sources.get(key)) {
        media.sources.set(key, value);
        changed = true;
      }
    }
  }

  if (externalMedia.externalIds?.isrc && !media.isrc) {
    media.isrc = normalizeIsrc(externalMedia.externalIds.isrc);
    changed = true;
  }
  if (externalMedia.isrc && !media.isrc) {
    media.isrc = normalizeIsrc(externalMedia.isrc);
    changed = true;
  }

  // Upgrade soft identity flags when a stronger signal arrives via import merge
  const rank = { unverified: 1, likely: 2, catalog: 3, verified: 4 };
  const incomingConfidence = externalMedia.identityConfidence;
  if (incomingConfidence && rank[incomingConfidence]) {
    const currentRank = rank[media.identityConfidence] || 0;
    if (rank[incomingConfidence] > currentRank) {
      media.identityConfidence = incomingConfidence;
      media.identityConfidenceSource = externalMedia.identityConfidenceSource || media.identityConfidenceSource;
      changed = true;
    }
  }

  // Seed tags/genres onto catalog rows that have none (SoundCloud genre pass-through)
  const { normalizeTagForStorage, tagsMatch } = require('../utils/tagNormalizer');
  const incomingTags = Array.isArray(externalMedia.tags) ? externalMedia.tags : [];
  const incomingGenres = Array.isArray(externalMedia.genres) ? externalMedia.genres : [];
  if (incomingTags.length > 0) {
    if (!media.tags || media.tags.length === 0) {
      media.tags = incomingTags
        .map((t) => normalizeTagForStorage(t))
        .filter(Boolean)
        .slice(0, 24);
      changed = true;
    } else {
      const merged = [...media.tags];
      let tagsChanged = false;
      for (const raw of incomingTags) {
        const normalized = normalizeTagForStorage(raw);
        if (!normalized) continue;
        if (merged.some((t) => tagsMatch(t, normalized))) continue;
        merged.push(normalized);
        tagsChanged = true;
      }
      if (tagsChanged) {
        media.tags = merged.slice(0, 24);
        changed = true;
      }
    }
  }
  if (incomingGenres.length > 0 && (!media.genres || media.genres.length === 0)) {
    media.genres = incomingGenres
      .map((t) => normalizeTagForStorage(t))
      .filter(Boolean)
      .slice(0, 12);
    changed = true;
  }

  if (changed) await media.save();
}

function mediaToPlayabilityFields(media) {
  if (!media) {
    return { isPlayable: false, awaitingUpload: true, isYouTubeOnly: false };
  }
  const sources = media.sources instanceof Map
    ? Object.fromEntries(media.sources)
    : (media.sources || {});
  return enrichMediaWithPlayability({ ...media, sources });
}

function trackKey(track, source) {
  if (source === 'soundcloud') {
    return String(track.externalIds?.soundcloud || track.id || `${track.title}-${track.artist}`);
  }
  return String(track.externalIds?.spotify || track.id || `${track.title}-${track.artist}`);
}

async function previewImportFromTracks(userId, source, tracks, user, extraSummary = {}, onProgress = null) {
  const report = typeof onProgress === 'function' ? onProgress : () => {};

  report({ stage: 'loading_bids', message: 'Loading your library…', current: 0, total: tracks.length });
  const userBids = await Bid.find({ userId, status: 'active' }).select('mediaId amount').lean();
  const tippedMediaIds = new Set(userBids.map((b) => b.mediaId?.toString()).filter(Boolean));
  const userBidTotals = {};
  userBids.forEach((b) => {
    const id = b.mediaId?.toString();
    if (!id) return;
    userBidTotals[id] = (userBidTotals[id] || 0) + (b.amount || 0);
  });

  const defaultTip = user.preferences?.defaultTip || DEFAULT_TIP;
  report({
    stage: 'loading_catalog',
    message: 'Loading Tuneable catalog…',
    current: 0,
    total: tracks.length,
  });
  const fuzzyIndexes = await loadFuzzyCatalogIndexes();

  report({
    stage: 'matching',
    message: `Matching tracks (0/${tracks.length})…`,
    current: 0,
    total: tracks.length,
  });

  let matched = 0;
  const items = await mapWithConcurrency(tracks, MATCH_CONCURRENCY, async (track) => {
    const crossRef = track.crossRef || (
      source === 'spotify' && (track.externalIds?.spotify || track.id)
        ? { status: 'spotify_catalog', identityConfidence: 'verified', sources: ['spotify'] }
        : null
    );
    const exactHit = await findExactCatalogMedia(track);
    let catalogMedia = exactHit?.media || null;
    let matchConfidence = exactHit?.confidence || null;
    let matchType = exactHit?.matchType || null;

    if (!catalogMedia) {
      const fuzzyHit = findFuzzyCatalogMatch(track, fuzzyIndexes);
      if (fuzzyHit?.media) {
        catalogMedia = fuzzyHit.media;
        matchConfidence = 'fuzzy';
        matchType = fuzzyHit.matchType;
      }
    }

    const catalogId = catalogMedia?._id?.toString();
    const inLibrary = catalogId && tippedMediaIds.has(catalogId);
    const play = mediaToPlayabilityFields(catalogMedia);

    let matchStatus = 'new';
    if (inLibrary) matchStatus = 'in_library';
    else if (catalogMedia && matchConfidence === 'exact') matchStatus = 'on_catalog';
    else if (catalogMedia && matchConfidence === 'fuzzy') matchStatus = 'possible_match';

    // Fuzzy suggestions default to accepted (user can opt out in UI)
    const useSuggestedMatch = matchStatus === 'possible_match';

    const identityConfidence = importCrossRefService.resolveIdentityConfidence({
      matchStatus,
      crossRef,
    });
    const identityConfidenceSource = identityConfidenceSourceFrom({
      matchStatus,
      matchType,
      crossRef,
    });

    matched += 1;
    if (matched === tracks.length || matched % 5 === 0) {
      report({
        stage: 'matching',
        message: `Matching tracks (${matched}/${tracks.length})…`,
        current: matched,
        total: tracks.length,
      });
    }

    return {
      key: trackKey(track, source),
      title: track.title,
      artist: track.artist,
      coverArt: track.coverArt || catalogMedia?.coverArt || null,
      duration: track.duration || catalogMedia?.duration || 0,
      album: track.album,
      matchStatus,
      matchType: matchType || null,
      identityConfidence,
      identityConfidenceSource,
      crossRefStatus: crossRef?.status || 'none',
      crossRefSources: crossRef?.sources || [],
      originalTitle: crossRef?.originalTitle || null,
      originalArtist: crossRef?.originalArtist || null,
      mediaId: catalogId || null,
      mediaUuid: catalogMedia?.uuid || null,
      suggestedTitle: catalogMedia && matchStatus === 'possible_match' ? catalogMedia.title : null,
      suggestedArtist: catalogMedia && matchStatus === 'possible_match'
        ? mediaPrimaryArtistName(catalogMedia)
        : null,
      useSuggestedMatch,
      isPlayable: catalogMedia ? play.isPlayable : false,
      awaitingUpload: catalogMedia ? play.awaitingUpload : true,
      userBidTotalPence: catalogId ? (userBidTotals[catalogId] || 0) : 0,
      defaultTip,
      minTip: MIN_TIP,
      selected: matchStatus !== 'in_library',
      externalMedia: buildExternalMediaFromTrack(track, {
        identityConfidence,
        identityConfidenceSource,
      }),
    };
  });

  const selectable = items.filter((i) => i.matchStatus !== 'in_library');
  const estimatedTotal = selectable.reduce((sum, i) => sum + i.defaultTip, 0);

  report({
    stage: 'matching',
    message: `Matched ${items.length} track${items.length === 1 ? '' : 's'}`,
    current: items.length,
    total: items.length,
  });

  return {
    source,
    items,
    summary: {
      total: items.length,
      inLibrary: items.filter((i) => i.matchStatus === 'in_library').length,
      onCatalog: items.filter((i) => i.matchStatus === 'on_catalog').length,
      possibleMatches: items.filter((i) => i.matchStatus === 'possible_match').length,
      newTracks: items.filter((i) => i.matchStatus === 'new').length,
      identityVerified: items.filter((i) => i.identityConfidence === 'verified').length,
      identityUnverified: items.filter((i) => i.identityConfidence === 'unverified').length,
      selectedCount: selectable.length,
      estimatedTotal,
      userBalance: (user.balance || 0) / 100,
      defaultTip,
      ...extraSummary,
    },
  };
}

async function previewSpotifyImport(userId, limit = 50, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const report = onProgress || (() => {});

  const user = await User.findById(userId).select('spotifyAccessToken preferences balance');
  if (!user?.spotifyAccessToken) {
    const err = new Error('Spotify not connected. Please connect your Spotify account first.');
    err.status = 400;
    throw err;
  }

  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  report({
    stage: 'fetching',
    message: `Fetching Spotify likes (up to ${cappedLimit})…`,
    current: 0,
    total: cappedLimit,
  });
  const savedTracks = await spotifyService.getSavedTracks(user.spotifyAccessToken, cappedLimit);
  const tracks = savedTracks.map(spotifyService.convertSavedTrackToTuneableFormat);
  report({
    stage: 'fetching',
    message: `Fetched ${tracks.length} Spotify like${tracks.length === 1 ? '' : 's'}`,
    current: tracks.length,
    total: tracks.length,
  });
  return previewImportFromTracks(userId, 'spotify', tracks, user, {}, onProgress);
}

async function previewSoundCloudImport(userId, limit = 50, opts = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const report = onProgress || (() => {});
  // spotify_only (default): skip MusicBrainz throttle. full: include MB. none: skip ISRC entirely.
  const crossRefMode = opts.crossRefMode || 'spotify_only';

  const user = await User.findById(userId).select(
    'soundcloudAccessToken soundcloudRefreshToken preferences balance'
  );
  if (!user?.soundcloudAccessToken && !user?.soundcloudRefreshToken) {
    const err = new Error('SoundCloud not connected. Please connect your SoundCloud account first.');
    err.status = 400;
    throw err;
  }

  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  report({
    stage: 'fetching',
    message: `Fetching SoundCloud likes (up to ${cappedLimit})…`,
    current: 0,
    total: cappedLimit,
  });
  const {
    tracks: likedTracks,
    skippedMixes,
    skippedUnplayable,
    scanned,
  } = await soundcloudService.getLikedTracks(
    userId,
    cappedLimit,
    { excludeMixes: true, excludeUnplayable: true }
  );
  const converted = likedTracks.map(soundcloudService.convertLikedTrackToTuneableFormat);
  report({
    stage: 'fetching',
    message: `Fetched ${converted.length} playable like${converted.length === 1 ? '' : 's'}`,
    current: converted.length,
    total: converted.length,
  });

  let tracks = converted;
  let crossRefStats = { verified: 0, withIsrc: 0, noIsrc: converted.length };

  if (crossRefMode !== 'none') {
    report({
      stage: 'cross_ref',
      message: 'Cross-referencing identities…',
      current: 0,
      total: converted.length,
    });
    const enriched = await importCrossRefService.enrichTracksViaIsrc(converted, {
      skipMusicBrainz: crossRefMode !== 'full',
      onProgress: (update) => report({
        stage: 'cross_ref',
        current: update.current,
        total: update.total,
        message: update.message,
      }),
    });
    tracks = enriched.tracks;
    crossRefStats = enriched.stats;
  }

  // Reload balance/preferences in case token refresh mutated user elsewhere
  const freshUser = await User.findById(userId).select('preferences balance');
  return previewImportFromTracks(userId, 'soundcloud', tracks, freshUser || user, {
    skippedMixes,
    skippedUnplayable,
    scanned,
    crossRefVerified: crossRefStats.verified,
    crossRefWithIsrc: crossRefStats.withIsrc,
    crossRefNoIsrc: crossRefStats.noIsrc,
    crossRefMode,
  }, onProgress);
}

async function executeLibraryImport(userId, { items, defaultTip, importSource = 'library_import', onProgress } = {}) {
  const report = typeof onProgress === 'function' ? onProgress : () => {};

  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('No items to import');
    err.status = 400;
    throw err;
  }

  const selected = items.filter((i) => i.selected !== false);
  if (selected.length === 0) {
    const err = new Error('No tracks selected');
    err.status = 400;
    throw err;
  }
  if (selected.length > MAX_BATCH) {
    const err = new Error(`Maximum ${MAX_BATCH} tracks per import batch`);
    err.status = 400;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const fallbackTip = defaultTip || user.preferences?.defaultTip || DEFAULT_TIP;

  let totalPence = 0;
  for (const item of selected) {
    const amount = Number(item.amount ?? fallbackTip);
    if (!Number.isFinite(amount) || amount < MIN_TIP) {
      const err = new Error(`Invalid tip amount for "${item.title || item.key}"`);
      err.status = 400;
      throw err;
    }
    totalPence += Math.round(amount * 100);
  }

  if (user.balance < totalPence) {
    const err = new Error('Insufficient balance for this import');
    err.status = 400;
    err.details = {
      required: totalPence / 100,
      available: user.balance / 100,
    };
    throw err;
  }

  const results = {
    tipped: 0,
    skipped: 0,
    failed: 0,
    totalSpentPence: 0,
    items: [],
    updatedBalance: user.balance,
  };

  // Rows often look distinct (different Spotify/SC ids) but collapse onto one Media
  // inside placeGlobalBid via ISRC / externalIds / title+artist.
  const tippedMediaIds = new Set();
  const skipIfInLibrary = (item) => item.skipIfInLibrary !== false;
  const total = selected.length;

  report({
    stage: 'tipping',
    message: `Importing track 0 of ${total}…`,
    current: 0,
    total,
    partial: { tipped: 0, skipped: 0, failed: 0, totalSpentPence: 0 },
  });

  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const amount = Number(item.amount ?? fallbackTip);
    const label = item.title || item.key;

    try {
      if (item.mediaId && mongoose.Types.ObjectId.isValid(item.mediaId)) {
        const mediaIdStr = String(item.mediaId);
        if (skipIfInLibrary(item) && tippedMediaIds.has(mediaIdStr)) {
          results.skipped++;
          results.items.push({
            key: item.key,
            title: label,
            status: 'skipped',
            reason: 'already_tipped_in_batch',
            mediaId: mediaIdStr,
          });
          report({
            stage: 'tipping',
            message: `Importing track ${index + 1} of ${total}…`,
            current: index + 1,
            total,
            partial: {
              tipped: results.tipped,
              skipped: results.skipped,
              failed: results.failed,
              totalSpentPence: results.totalSpentPence,
            },
          });
          continue;
        }

        const existingBid = await Bid.findOne({
          userId,
          mediaId: item.mediaId,
          status: 'active',
        });
        if (existingBid && skipIfInLibrary(item)) {
          tippedMediaIds.add(mediaIdStr);
          results.skipped++;
          results.items.push({ key: item.key, title: label, status: 'skipped', reason: 'already_in_library' });
          report({
            stage: 'tipping',
            message: `Importing track ${index + 1} of ${total}…`,
            current: index + 1,
            total,
            partial: {
              tipped: results.tipped,
              skipped: results.skipped,
              failed: results.failed,
              totalSpentPence: results.totalSpentPence,
            },
          });
          continue;
        }
      }

      const rejectedFuzzy = item.matchStatus === 'possible_match' && item.useSuggestedMatch === false;
      const mediaId = !rejectedFuzzy
        && item.mediaId
        && mongoose.Types.ObjectId.isValid(item.mediaId)
        ? item.mediaId
        : 'external';

      let externalMedia = item.externalMedia || null;
      if (externalMedia && rejectedFuzzy) {
        // Creating as new — drop catalog "likely" unless ISRC already verified it
        const stillVerified = externalMedia.identityConfidence === 'verified'
          || item.crossRefStatus === 'isrc_verified';
        externalMedia = {
          ...externalMedia,
          identityConfidence: stillVerified ? 'verified' : 'unverified',
          identityConfidenceSource: stillVerified
            ? (externalMedia.identityConfidenceSource || 'isrc')
            : 'none',
        };
      }

      if (mediaId !== 'external' && externalMedia) {
        await mergeExternalIdsOntoMedia(mediaId, externalMedia);
      }

      const out = await placeGlobalBid(userId, {
        mediaId,
        amount,
        externalMedia,
        skipIfAlreadyTipped: skipIfInLibrary(item),
      });

      const resolvedMediaId = out.media?._id?.toString();

      if (out.skipped) {
        if (resolvedMediaId) {
          tippedMediaIds.add(resolvedMediaId);
          if (externalMedia) {
            await mergeExternalIdsOntoMedia(resolvedMediaId, externalMedia);
          }
        }
        results.skipped++;
        results.items.push({
          key: item.key,
          title: label,
          status: 'skipped',
          reason: out.reason || 'already_in_library',
          mediaId: resolvedMediaId || null,
        });
      } else {
        if (resolvedMediaId) tippedMediaIds.add(resolvedMediaId);
        results.tipped++;
        results.totalSpentPence += Math.round(amount * 100);
        results.updatedBalance = out.updatedBalance;
        results.items.push({
          key: item.key,
          title: label,
          status: 'tipped',
          mediaId: resolvedMediaId,
          mediaUuid: out.media.uuid,
          amount,
          bidId: out.bid._id.toString(),
        });
      }
    } catch (error) {
      results.failed++;
      results.items.push({
        key: item.key,
        title: label,
        status: 'failed',
        error: error.message,
      });
      if (error.status === 400 && error.message.includes('Insufficient balance')) {
        report({
          stage: 'tipping',
          message: `Stopped early — insufficient balance (${index + 1}/${total})`,
          current: index + 1,
          total,
          partial: {
            tipped: results.tipped,
            skipped: results.skipped,
            failed: results.failed,
            totalSpentPence: results.totalSpentPence,
          },
        });
        break;
      }
    }

    report({
      stage: 'tipping',
      message: `Importing track ${index + 1} of ${total}…`,
      current: index + 1,
      total,
      partial: {
        tipped: results.tipped,
        skipped: results.skipped,
        failed: results.failed,
        totalSpentPence: results.totalSpentPence,
      },
    });
  }

  // Queue MusicBrainz enrichment for tipped tracks (non-blocking)
  try {
    report({
      stage: 'enriching',
      message: 'Queueing metadata enrichment…',
      current: total,
      total,
      partial: {
        tipped: results.tipped,
        skipped: results.skipped,
        failed: results.failed,
        totalSpentPence: results.totalSpentPence,
      },
    });
    const metadataEnrichmentService = require('./metadataEnrichmentService');
    await metadataEnrichmentService.enqueueAfterLibraryImport(results.items, {
      importSource,
      importedBy: userId,
    });
  } catch (enrichErr) {
    console.error('library import enrichment enqueue failed:', enrichErr.message);
  }

  return results;
}

async function executeSpotifyImport(userId, opts) {
  return executeLibraryImport(userId, { ...opts, importSource: 'spotify_likes' });
}

async function executeSoundCloudImport(userId, opts) {
  return executeLibraryImport(userId, { ...opts, importSource: 'soundcloud_likes' });
}

module.exports = {
  previewSpotifyImport,
  previewSoundCloudImport,
  executeSpotifyImport,
  executeSoundCloudImport,
  executeLibraryImport,
  MIN_TIP,
  MAX_BATCH,
};
