const mongoose = require('mongoose');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const Party = require('../models/Party');
const Comment = require('../models/Comment');
const ArtistEscrowAllocation = require('../models/ArtistEscrowAllocation');
const tuneableLedgerService = require('./tuneableLedgerService');
const notificationService = require('./notificationService');
const bidMetricsEngine = require('./bidMetricsEngine');

async function resolveMediaByIdentifier(mediaId) {
  if (!mediaId) return null;
  if (mongoose.isValidObjectId(mediaId)) {
    return Media.findById(mediaId);
  }
  if (typeof mediaId === 'string' && mediaId.includes('-')) {
    return Media.findOne({ uuid: mediaId });
  }
  return null;
}

async function reverseEscrowForBid(bid, refundAmount) {
  try {
    const escrowAllocation = await ArtistEscrowAllocation.findOne({ bidId: bid._id });

    if (escrowAllocation) {
      if (!escrowAllocation.claimed) {
        await escrowAllocation.deleteOne();
        return;
      }
      if (escrowAllocation.claimed && escrowAllocation.artistUserId) {
        const artistUser = await User.findById(escrowAllocation.artistUserId);
        if (artistUser && artistUser.artistEscrowBalance > 0) {
          const userShare = escrowAllocation.allocatedAmount;
          if (artistUser.artistEscrowBalance >= userShare) {
            artistUser.artistEscrowBalance -= userShare;
            artistUser.totalEscrowEarned = Math.max(0, (artistUser.totalEscrowEarned || 0) - userShare);
            await artistUser.save();
          }
        }
      }
      return;
    }

    const mediaWithOwners = await Media.findById(bid.mediaId).select('mediaOwners');
    if (!mediaWithOwners?.mediaOwners?.length) return;

    const userShare = Math.round(refundAmount * 0.70);
    for (const owner of mediaWithOwners.mediaOwners) {
      if (!owner.userId) continue;
      const artistUser = await User.findById(owner.userId);
      if (!artistUser || artistUser.artistEscrowBalance <= 0) continue;
      const ownerShare = Math.round(userShare * (owner.percentage / 100));
      if (artistUser.artistEscrowBalance >= ownerShare) {
        artistUser.artistEscrowBalance -= ownerShare;
        artistUser.totalEscrowEarned = Math.max(0, (artistUser.totalEscrowEarned || 0) - ownerShare);
        await artistUser.save();
      }
    }
  } catch (error) {
    console.error(`Error reversing escrow for bid ${bid._id}:`, error);
  }
}

async function refundActiveBidsForMedia(media, actorId, reason) {
  const mediaObjectId = media._id;
  const bidsToRefund = await Bid.find({
    mediaId: mediaObjectId,
    status: 'active',
  }).populate('userId', 'balance uuid username');

  const refundsByUser = new Map();

  for (const bid of bidsToRefund) {
    if (!bid.userId?._id) {
      await Bid.findByIdAndUpdate(bid._id, {
        status: 'refunded',
        refundedAt: new Date(),
        refundedBy: actorId,
        refundReason: reason || 'Media deleted',
      });
      continue;
    }

    const userId = bid.userId._id.toString();
    if (!refundsByUser.has(userId)) {
      refundsByUser.set(userId, { user: bid.userId, totalAmount: 0, bidIds: [] });
    }
    const refund = refundsByUser.get(userId);
    refund.totalAmount += bid.amount;
    refund.bidIds.push(bid._id);
  }

  for (const [userId, refund] of refundsByUser) {
    const user = await User.findById(userId);
    if (!user) continue;

    const userBalancePre = user.balance || 0;
    const mediaAggregatePre = media.globalMediaAggregate || 0;
    const userBidsPre = await Bid.find({ userId, status: 'active' }).lean();
    const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);

    let runningUserBalance = userBalancePre;
    let runningUserAggregate = userAggregatePre;
    let runningMediaAggregate = mediaAggregatePre;

    for (const bidId of refund.bidIds) {
      const bid = await Bid.findById(bidId);
      if (!bid) continue;

      try {
        await tuneableLedgerService.createRefundEntry({
          userId: user._id,
          mediaId: media._id,
          partyId: bid.partyId || null,
          bidId: bid._id,
          amount: bid.amount,
          userBalancePre: runningUserBalance,
          userAggregatePre: runningUserAggregate,
          mediaAggregatePre: runningMediaAggregate,
          referenceTransactionId: null,
          metadata: {
            reason: reason || 'Media deleted by owner',
            deletedBy: actorId?.toString(),
          },
        });
      } catch (ledgerError) {
        console.error(`Failed to create ledger entry for refund bid ${bidId}:`, ledgerError);
      }

      runningUserBalance += bid.amount;
      runningUserAggregate = Math.max(0, runningUserAggregate - bid.amount);
      runningMediaAggregate = Math.max(0, runningMediaAggregate - bid.amount);

      bid.status = 'refunded';
      bid.refundedAt = new Date();
      bid.refundedBy = actorId;
      bid.refundReason = reason || 'Media deleted by owner';
      await bid.save();

      await reverseEscrowForBid(bid, bid.amount);

      try {
        await bidMetricsEngine.updateMetricsForBidChange({
          _id: bid._id,
          userId: bid.userId,
          mediaId: bid.mediaId,
          partyId: bid.partyId,
          amount: bid.amount,
        }, 'delete');
      } catch (metricsError) {
        console.error('Error updating metrics after media delete refund:', metricsError);
      }
    }

    const { restoreWelcomeCredit, sumWelcomeCreditAppliedForBids } = require('../utils/welcomeCreditHelper');
    const welcomeRestore = await sumWelcomeCreditAppliedForBids(refund.bidIds);
    restoreWelcomeCredit(user, welcomeRestore);
    user.balance = (user.balance || 0) + refund.totalAmount;
    await user.save();
  }

  return { bidsToRefund, refundsByUser };
}

async function removeMediaFromQueues(mediaObjectId) {
  await User.updateMany(
    { 'playbackQueue.mediaId': mediaObjectId },
    { $pull: { playbackQueue: { mediaId: mediaObjectId } } },
  );

  await Party.updateMany(
    { 'media.mediaId': mediaObjectId },
    {
      $set: {
        'media.$.status': 'vetoed',
        'media.$.vetoedAt': new Date(),
      },
    },
  );
}

async function softDeleteMedia(media, actor, reason = null) {
  if (!media) throw new Error('Media not found');
  if (media.status === 'deleted') throw new Error('Media is already deleted');
  if (media.status === 'vetoed') throw new Error('Media is vetoed and cannot be deleted');

  const actorId = actor._id || actor.id;
  const { bidsToRefund, refundsByUser } = await refundActiveBidsForMedia(
    media,
    actorId,
    reason || 'Media deleted by owner',
  );

  media.status = 'deleted';
  media.deletedAt = new Date();
  media.deletedBy = actorId;
  media.deletedReason = reason || null;
  media.globalMediaAggregate = 0;
  await media.save();

  await removeMediaFromQueues(media._id);

  await Comment.updateMany(
    { mediaId: media._id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
  );

  for (const [userId, refund] of refundsByUser) {
    notificationService.notifyMediaDeleted(
      userId,
      media._id,
      media.title,
      refund.totalAmount,
      reason,
    ).catch((err) => console.error(`Error sending delete notification to user ${userId}:`, err));
  }

  const totalRefunded = Array.from(refundsByUser.values()).reduce((sum, r) => sum + r.totalAmount, 0);

  return {
    media,
    refundedBidsCount: bidsToRefund.length,
    refundedUsersCount: refundsByUser.size,
    refundedAmount: totalRefunded,
  };
}

async function restoreMedia(media) {
  if (!media) throw new Error('Media not found');
  if (media.status !== 'deleted') throw new Error('Media is not deleted');

  media.status = 'active';
  media.deletedAt = null;
  media.deletedBy = null;
  media.deletedReason = null;
  await media.save();

  return media;
}

async function purgeMedia(media) {
  if (!media) throw new Error('Media not found');
  if (media.status !== 'deleted') throw new Error('Media must be soft-deleted before purge');

  await Media.findByIdAndDelete(media._id);
  return { purgedId: media._id, title: media.title };
}

module.exports = {
  resolveMediaByIdentifier,
  softDeleteMedia,
  restoreMedia,
  purgeMedia,
};
