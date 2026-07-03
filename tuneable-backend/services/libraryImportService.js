/**
 * User-facing library import: preview + batch tip (Spotify likes, etc.)
 */

const mongoose = require('mongoose');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const spotifyService = require('./spotifyService');
const { placeGlobalBid } = require('./globalBidService');
const { enrichMediaWithPlayability } = require('../utils/mediaPlayability');

const DEFAULT_TIP = 0.11;
const MIN_TIP = 0.01;
const MAX_BATCH = 100;

function buildExternalMediaFromTrack(track) {
  return {
    title: track.title,
    artist: track.artist,
    coverArt: track.coverArt || null,
    duration: track.duration || 0,
    category: track.category || 'Music',
    album: track.album || null,
    releaseDate: track.releaseDate || null,
    releaseYear: track.releaseYear || null,
    sources: track.sources || {},
    externalIds: track.externalIds || {},
  };
}

async function findCatalogMedia(track) {
  const spotifyId = track.externalIds?.spotify || track.id;
  const isrc = track.externalIds?.isrc;

  const or = [];
  if (spotifyId) or.push({ 'externalIds.spotify': spotifyId });
  if (isrc) or.push({ isrc });

  if (or.length > 0) {
    const byExternal = await Media.findOne({ $or: or }).lean();
    if (byExternal) return byExternal;
  }

  return Media.findOne({
    title: track.title,
    'artist.name': track.artist,
  }).lean();
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

async function previewSpotifyImport(userId, limit = 50) {
  const user = await User.findById(userId).select('spotifyAccessToken preferences balance');
  if (!user?.spotifyAccessToken) {
    const err = new Error('Spotify not connected. Please connect your Spotify account first.');
    err.status = 400;
    throw err;
  }

  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const savedTracks = await spotifyService.getSavedTracks(user.spotifyAccessToken, cappedLimit);
  const tracks = savedTracks.map(spotifyService.convertSavedTrackToTuneableFormat);

  const userBids = await Bid.find({ userId, status: 'active' }).select('mediaId amount').lean();
  const tippedMediaIds = new Set(userBids.map((b) => b.mediaId?.toString()).filter(Boolean));
  const userBidTotals = {};
  userBids.forEach((b) => {
    const id = b.mediaId?.toString();
    if (!id) return;
    userBidTotals[id] = (userBidTotals[id] || 0) + (b.amount || 0);
  });

  const defaultTip = user.preferences?.defaultTip || DEFAULT_TIP;

  const items = [];
  for (const track of tracks) {
    const catalogMedia = await findCatalogMedia(track);
    const catalogId = catalogMedia?._id?.toString();
    const inLibrary = catalogId && tippedMediaIds.has(catalogId);
    const play = mediaToPlayabilityFields(catalogMedia);

    let matchStatus = 'new';
    if (inLibrary) matchStatus = 'in_library';
    else if (catalogMedia) matchStatus = 'on_catalog';

    items.push({
      key: track.externalIds?.spotify || track.id,
      title: track.title,
      artist: track.artist,
      coverArt: track.coverArt || catalogMedia?.coverArt || null,
      duration: track.duration || catalogMedia?.duration || 0,
      album: track.album,
      matchStatus,
      mediaId: catalogId || null,
      mediaUuid: catalogMedia?.uuid || null,
      isPlayable: catalogMedia ? play.isPlayable : false,
      awaitingUpload: catalogMedia ? play.awaitingUpload : true,
      userBidTotalPence: catalogId ? (userBidTotals[catalogId] || 0) : 0,
      defaultTip,
      minTip: MIN_TIP,
      selected: matchStatus !== 'in_library',
      externalMedia: buildExternalMediaFromTrack(track),
    });
  }

  const selectable = items.filter((i) => i.matchStatus !== 'in_library');
  const estimatedTotal = selectable.reduce((sum, i) => sum + i.defaultTip, 0);

  return {
    source: 'spotify',
    items,
    summary: {
      total: items.length,
      inLibrary: items.filter((i) => i.matchStatus === 'in_library').length,
      onCatalog: items.filter((i) => i.matchStatus === 'on_catalog').length,
      newTracks: items.filter((i) => i.matchStatus === 'new').length,
      selectedCount: selectable.length,
      estimatedTotal,
      userBalance: (user.balance || 0) / 100,
      defaultTip,
    },
  };
}

async function executeSpotifyImport(userId, { items, defaultTip } = {}) {
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

  for (const item of selected) {
    const amount = Number(item.amount ?? fallbackTip);
    const label = item.title || item.key;

    try {
      if (item.mediaId && mongoose.Types.ObjectId.isValid(item.mediaId)) {
        const existingBid = await Bid.findOne({
          userId,
          mediaId: item.mediaId,
          status: 'active',
        });
        if (existingBid && item.skipIfInLibrary !== false) {
          results.skipped++;
          results.items.push({ key: item.key, title: label, status: 'skipped', reason: 'already_in_library' });
          continue;
        }
      }

      const mediaId = item.mediaId && mongoose.Types.ObjectId.isValid(item.mediaId)
        ? item.mediaId
        : 'external';

      const externalMedia = item.externalMedia || null;
      const out = await placeGlobalBid(userId, { mediaId, amount, externalMedia });

      results.tipped++;
      results.totalSpentPence += Math.round(amount * 100);
      results.updatedBalance = out.updatedBalance;
      results.items.push({
        key: item.key,
        title: label,
        status: 'tipped',
        mediaId: out.media._id.toString(),
        mediaUuid: out.media.uuid,
        amount,
        bidId: out.bid._id.toString(),
      });
    } catch (error) {
      results.failed++;
      results.items.push({
        key: item.key,
        title: label,
        status: 'failed',
        error: error.message,
      });
      if (error.status === 400 && error.message.includes('Insufficient balance')) {
        break;
      }
    }
  }

  return results;
}

module.exports = {
  previewSpotifyImport,
  executeSpotifyImport,
  MIN_TIP,
  MAX_BATCH,
};
