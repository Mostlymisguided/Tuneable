const mongoose = require('mongoose');
const Media = require('../models/Media');
const {
  parseLibraryXmlContent,
  lookupTrackInLibrary,
} = require('../utils/libraryXml');
const { buildMediaIndexes, findCatalogMatch } = require('../scripts/lib/catalogMatch');
const { isAdmin, canEditMedia } = require('../utils/permissionHelpers');

function getExternalId(media, key) {
  if (!media?.externalIds) return null;
  if (typeof media.externalIds.get === 'function') {
    return media.externalIds.get(key) || null;
  }
  return media.externalIds[key] || null;
}

/** Treat null/undefined/0 as missing — many imports store 0 as a placeholder. */
function isMissingBpm(bpm) {
  return bpm == null || bpm === 0;
}

/** Treat null/undefined/blank as missing — many imports store "" as a placeholder. */
function isMissingKey(key) {
  return key == null || String(key).trim() === '';
}

function buildScopeQuery(userId, scope) {
  // Include placeholder values (bpm: 0, key: "") that older imports used for "unknown"
  const missingMeta = {
    $or: [
      { bpm: { $exists: false } },
      { bpm: null },
      { bpm: 0 },
      { key: { $exists: false } },
      { key: null },
      { key: '' },
    ],
  };

  if (scope === 'all') {
    return {
      contentForm: { $in: ['tune'] },
      ...missingMeta,
    };
  }

  const uid = new mongoose.Types.ObjectId(userId);
  return {
    contentForm: { $in: ['tune'] },
    $and: [
      missingMeta,
      {
        $or: [
          { addedBy: uid },
          { importedBy: uid },
          { 'mediaOwners.userId': uid },
        ],
      },
    ],
  };
}

function buildXmlCatalogIndexes(tracks) {
  const pseudoMediaList = tracks.map((track) => ({
    title: track.title || track.name || '',
    artist: [{ name: track.artist || '' }],
    __track: track,
  }));
  return buildMediaIndexes(pseudoMediaList);
}

function findXmlTrackByCatalogMatch(guess, indexes) {
  const result = findCatalogMatch(guess, indexes);
  if (!result?.media?.__track) return null;
  return {
    track: result.media.__track,
    matchType: result.matchType,
  };
}

function buildXmlTrackIndexes(tracks) {
  const byRekordboxId = new Map();
  for (const track of tracks) {
    if (track.trackId) {
      byRekordboxId.set(String(track.trackId), track);
    }
  }
  return {
    tracks,
    byRekordboxId,
    catalogIndexes: buildXmlCatalogIndexes(tracks),
  };
}

function matchMediaToXmlTrack(media, xmlIndexes) {
  const rekordboxId = getExternalId(media, 'rekordbox');
  if (rekordboxId && xmlIndexes.byRekordboxId.has(String(rekordboxId))) {
    return {
      track: xmlIndexes.byRekordboxId.get(String(rekordboxId)),
      matchType: 'rekordbox-id',
    };
  }

  const artistName = media.artist?.[0]?.name || '';
  const titleArtistMatch = findXmlTrackByCatalogMatch(
    { title: media.title, artist: artistName },
    xmlIndexes.catalogIndexes,
  );
  if (titleArtistMatch) return titleArtistMatch;

  const libraryMatch = lookupTrackInLibrary(xmlIndexes.tracks, {
    title: media.title,
    artist: artistName,
  });
  if (libraryMatch) {
    return { track: libraryMatch, matchType: libraryMatch.matchType || 'library-lookup' };
  }

  return null;
}

function buildEnrichmentPatch(media, track) {
  const patch = {};
  if (isMissingBpm(media.bpm) && track.bpm != null && track.bpm !== 0) {
    patch.bpm = track.bpm;
  }
  if (isMissingKey(media.key) && track.key && String(track.key).trim()) {
    patch.key = String(track.key).trim();
  }
  return patch;
}

async function previewLibraryXmlEnrichment(xmlContent, { user, scope = 'mine', limit = 500 } = {}) {
  if (!user) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  if (scope === 'all' && !isAdmin(user)) {
    const err = new Error('Only admins can enrich the full catalog');
    err.status = 403;
    throw err;
  }

  if (scope !== 'all' && scope !== 'mine') {
    const err = new Error('Invalid scope — use "mine" or "all"');
    err.status = 400;
    throw err;
  }

  const parsed = await parseLibraryXmlContent(xmlContent);
  const xmlIndexes = buildXmlTrackIndexes(parsed.tracks);

  const query = buildScopeQuery(user._id, scope);
  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 5000);

  const mediaList = await Media.find(query)
    .select('title artist bpm key uuid _id externalIds addedBy importedBy mediaOwners')
    .limit(cappedLimit)
    .lean();

  const items = [];
  const unmatched = [];

  for (const media of mediaList) {
    const needsBpm = isMissingBpm(media.bpm);
    const needsKey = isMissingKey(media.key);
    if (!needsBpm && !needsKey) continue;

    const matched = matchMediaToXmlTrack(media, xmlIndexes);
    if (!matched?.track) {
      unmatched.push({
        mediaId: media._id.toString(),
        uuid: media.uuid,
        title: media.title,
        artist: media.artist?.[0]?.name || '',
        missing: { bpm: needsBpm, key: needsKey },
      });
      continue;
    }

    const patch = buildEnrichmentPatch(media, matched.track);
    if (!Object.keys(patch).length) {
      // Matched XML track but nothing useful to fill (e.g. iTunes with no BPM set)
      unmatched.push({
        mediaId: media._id.toString(),
        uuid: media.uuid,
        title: media.title,
        artist: media.artist?.[0]?.name || '',
        missing: { bpm: needsBpm, key: needsKey },
        reason: 'matched_but_no_xml_values',
      });
      continue;
    }

    items.push({
      mediaId: media._id.toString(),
      uuid: media.uuid,
      title: media.title,
      artist: media.artist?.[0]?.name || '',
      currentBpm: isMissingBpm(media.bpm) ? null : media.bpm,
      currentKey: isMissingKey(media.key) ? null : media.key,
      newBpm: patch.bpm ?? null,
      newKey: patch.key ?? null,
      matchType: matched.matchType,
      rekordboxTrackId: matched.track.trackId || null,
      selected: true,
    });
  }

  const totalEligibleMedia = await Media.countDocuments(query);

  return {
    source: parsed.source,
    scope,
    trackCount: parsed.trackCount,
    scannedMedia: mediaList.length,
    totalEligibleMedia,
    matchedCount: items.length,
    unmatchedCount: unmatched.length,
    items,
    unmatched: unmatched.slice(0, 100),
    hasKeyData: parsed.tracks.some((track) => !!track.key),
    message: parsed.source === 'itunes'
      ? 'iTunes Library.xml can fill BPM only — no musical key field exists in iTunes exports.'
      : 'Rekordbox XML can fill both BPM and key where analyzed.',
  };
}

async function executeLibraryXmlEnrichment(updates, { user } = {}) {
  if (!user) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    const err = new Error('No updates to apply');
    err.status = 400;
    throw err;
  }

  if (updates.length > 1000) {
    const err = new Error('Maximum 1000 updates per batch');
    err.status = 400;
    throw err;
  }

  const results = {
    updated: 0,
    skipped: 0,
    failed: 0,
    items: [],
  };

  for (const item of updates) {
    const mediaId = item.mediaId;
    const label = item.title || mediaId;

    try {
      if (!mongoose.Types.ObjectId.isValid(mediaId)) {
        throw new Error('Invalid media ID');
      }

      const media = await Media.findById(mediaId);
      if (!media) {
        throw new Error('Media not found');
      }

      if (!isAdmin(user) && !canEditMedia(user, media)) {
        const addedBy = media.addedBy?.toString();
        const importedBy = media.importedBy?.toString();
        const userId = user._id.toString();
        const isUploader = addedBy === userId || importedBy === userId;
        if (!isUploader) {
          throw new Error('Not authorized to update this media');
        }
      }

      let changed = false;
      if (item.bpm != null && item.bpm !== 0 && isMissingBpm(media.bpm)) {
        media.bpm = Number(item.bpm);
        changed = true;
      }
      if (item.key && String(item.key).trim() && isMissingKey(media.key)) {
        media.key = String(item.key).trim();
        changed = true;
      }
      if (item.rekordboxTrackId && !getExternalId(media, 'rekordbox')) {
        if (!media.externalIds || typeof media.externalIds.set !== 'function') {
          media.externalIds = new Map(Object.entries(media.externalIds || {}));
        }
        media.externalIds.set('rekordbox', String(item.rekordboxTrackId));
        changed = true;
      }

      if (!changed) {
        results.skipped++;
        results.items.push({ mediaId, title: label, status: 'skipped', reason: 'already_has_values' });
        continue;
      }

      await media.save();
      results.updated++;
      results.items.push({
        mediaId,
        uuid: media.uuid,
        title: media.title,
        status: 'updated',
        bpm: media.bpm ?? null,
        key: media.key ?? null,
      });
    } catch (error) {
      results.failed++;
      results.items.push({
        mediaId,
        title: label,
        status: 'failed',
        error: error.message,
      });
    }
  }

  return results;
}

module.exports = {
  previewLibraryXmlEnrichment,
  executeLibraryXmlEnrichment,
};
