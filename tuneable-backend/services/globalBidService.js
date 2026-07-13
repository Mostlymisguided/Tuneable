/**
 * Shared global bid placement logic (used by media routes and batch import).
 */

const Media = require('../models/Media');
const User = require('../models/User');
const Bid = require('../models/Bid');
const Party = require('../models/Party');
const { isValidObjectId } = require('../utils/validators');
const { DEFAULT_COVER_ART } = require('../utils/coverArtUtils');
const { getBidLocationSnapshot, getUserBidLocation } = require('../utils/locationUtils');

const capitalizeTag = (tag) => {
  if (!tag || typeof tag !== 'string') return tag;
  return tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1).toLowerCase();
};

/**
 * @param {string} userId
 * @param {{ mediaId?: string, amount: number, externalMedia?: object }} options amount in pounds
 */
async function placeGlobalBid(userId, { mediaId = 'external', amount, externalMedia } = {}) {
  if (!amount || amount < 0.01) {
    const err = new Error('Minimum bid is £0.01');
    err.status = 400;
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const bidAmountPence = Math.round(amount * 100);

  if (user.balance < bidAmountPence) {
    const err = new Error('Insufficient balance');
    err.status = 400;
    err.details = { required: amount, available: user.balance / 100 };
    throw err;
  }

  let media;
  const isObjectId = isValidObjectId(mediaId);
  const isUuid = !isObjectId && mediaId && mediaId.includes('-');
  const isExternalRequest = !isObjectId && !isUuid;

  if (isObjectId) {
    media = await Media.findById(mediaId);
  } else if (isUuid) {
    media = await Media.findOne({ uuid: mediaId });
  } else {
    media = null;
  }

  if (!media && isExternalRequest) {
    if (!externalMedia) {
      const err = new Error('External media metadata is required to create a new track.');
      err.status = 400;
      throw err;
    }

    const {
      title, artist, sources, coverArt, duration, tags, category,
      externalIds, album, releaseDate, releaseYear,
    } = externalMedia;

    if (!title || !artist) {
      const err = new Error('Title and artist are required for new media.');
      err.status = 400;
      throw err;
    }

    const externalIdEntries = externalIds && typeof externalIds === 'object'
      ? Object.entries(externalIds).filter(([, value]) => !!value)
      : [];

    const sourceEntries = sources && typeof sources === 'object'
      ? Object.entries(sources).filter(([, url]) => !!url)
      : [];

    if (externalIdEntries.length > 0) {
      const externalLookup = externalIdEntries.map(([key, value]) => ({ [`externalIds.${key}`]: value }));
      media = await Media.findOne({ $or: externalLookup });
    }

    if (!media) {
      media = await Media.findOne({ title, 'artist.name': artist });
    }

    if (!media && sourceEntries.length === 0 && externalIdEntries.length === 0) {
      const err = new Error('A music source or catalog identifier is required for new media.');
      err.status = 400;
      throw err;
    }

    if (!media) {
      media = new Media({
        title,
        artist: [{ name: artist, userId: null, verified: false }],
        coverArt: coverArt || DEFAULT_COVER_ART,
        duration: duration || 0,
        sources: new Map(sourceEntries),
        externalIds: new Map(externalIdEntries),
        tags: Array.isArray(tags) ? tags.map((tag) => capitalizeTag(tag)) : [],
        category: category || 'Music',
        album: album || null,
        releaseDate: releaseDate || null,
        releaseYear: releaseYear || null,
        addedBy: userId,
        globalMediaAggregate: 0,
        contentType: ['music'],
        contentForm: ['tune'],
        mediaType: ['mp3'],
      });
      await media.save();
    }
  }

  if (!media) {
    const err = new Error('Media not found');
    err.status = 404;
    throw err;
  }

  const globalParty = await Party.getGlobalParty();
  if (!globalParty) {
    const err = new Error('Global Party not found. Please contact support.');
    err.status = 500;
    throw err;
  }

  let partyMediaEntry = globalParty.media.find(
    (m) => m.mediaId && m.mediaId.toString() === media._id.toString()
  );
  const isInitialPartyEntry = !partyMediaEntry;

  const bid = new Bid({
    userId,
    partyId: globalParty._id,
    mediaId: media._id,
    amount: bidAmountPence,
    welcomeCreditAppliedPence: require('../utils/welcomeCreditHelper').peekWelcomeCreditApplied(user, bidAmountPence),
    status: 'active',
    bidScope: 'global',
    username: user.username,
    partyName: globalParty.name,
    partyType: globalParty.type,
    mediaTitle: media.title,
    mediaArtist: media.artist?.[0]?.name || 'Unknown',
    mediaCoverArt: media.coverArt,
    isInitialBid: isInitialPartyEntry,
    mediaContentType: media.contentType,
    mediaContentForm: media.contentForm,
    mediaDuration: media.duration,
    ...getBidLocationSnapshot(getUserBidLocation(user)),
  });

  await bid.save();

  try {
    const artistEscrowService = require('./artistEscrowService');
    artistEscrowService.allocateEscrowForBid(bid._id, media._id, bidAmountPence).catch((error) => {
      console.error('Failed to allocate escrow for bid:', bid._id, error);
    });
  } catch (error) {
    console.error('Error setting up escrow allocation:', error);
  }

  try {
    const tagRankingsService = require('./tagRankingsService');
    tagRankingsService.invalidateUserTagRankings(userId).catch(console.error);
    tagRankingsService.calculateAndUpdateUserTagRankings(userId, 10).catch(console.error);
  } catch (error) {
    console.error('Error setting up tag rankings:', error);
  }

  if (!partyMediaEntry) {
    partyMediaEntry = {
      mediaId: media._id,
      media_uuid: media.uuid,
      addedBy: userId,
      partyMediaAggregate: bidAmountPence,
      partyBids: [bid._id],
      status: 'active',
      queuedAt: new Date(),
      partyMediaBidTop: bidAmountPence,
      partyMediaBidTopUser: userId,
      partyMediaAggregateTop: bidAmountPence,
      partyMediaAggregateTopUser: userId,
    };
    globalParty.media.push(partyMediaEntry);
  } else {
    partyMediaEntry.partyMediaAggregate = (partyMediaEntry.partyMediaAggregate || 0) + bidAmountPence;
    partyMediaEntry.partyBids = partyMediaEntry.partyBids || [];
    partyMediaEntry.partyBids.push(bid._id);
    if (partyMediaEntry.status !== 'active' && partyMediaEntry.status !== 'vetoed') {
      partyMediaEntry.status = 'active';
    }
  }

  globalParty.media.forEach((entry) => {
    if (entry.status && entry.status !== 'active' && entry.status !== 'vetoed') {
      entry.status = 'active';
    }
  });

  await globalParty.save();

  const previousTopBidAmount = media.globalMediaBidTop || 0;
  const previousTopBidderId = media.globalMediaBidTopUser;
  const wasNewTopBid = bidAmountPence > previousTopBidAmount;

  const userBalancePre = user.balance;
  const mediaAggregatePre = media.globalMediaAggregate || 0;
  const userBidsPre = await Bid.find({ userId, status: 'active' }).lean();
  const userAggregatePre = userBidsPre.reduce((sum, b) => sum + (b.amount || 0), 0);

  media.bids = media.bids || [];
  media.bids.push(bid._id);
  if (wasNewTopBid) {
    media.globalMediaBidTop = bidAmountPence;
    media.globalMediaBidTopUser = userId;
  }
  await media.save();

  try {
    const tuneableLedgerService = require('./tuneableLedgerService');
    await tuneableLedgerService.createTipEntry({
      userId,
      mediaId: media._id,
      partyId: globalParty._id,
      bidId: bid._id,
      amount: bidAmountPence,
      userBalancePre,
      userAggregatePre,
      mediaAggregatePre,
      userTuneBytesPre: null,
      userTuneBytesPost: null,
      referenceTransactionId: bid._id,
      metadata: {
        bidScope: 'global',
        isNewMedia: isInitialPartyEntry,
        platform: 'global-bid',
        tunebytesCalculatedAsync: true,
      },
    });
  } catch (error) {
    console.error('Failed to create ledger entry for global bid:', bid._id, error);
  }

  const { applyWalletSpend } = require('../utils/welcomeCreditHelper');
  applyWalletSpend(user, bidAmountPence);
  await user.save();

  return {
    bid,
    media,
    updatedBalance: user.balance,
    globalPartyId: globalParty._id,
  };
}

module.exports = { placeGlobalBid };
