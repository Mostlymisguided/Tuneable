const Bid = require('../models/Bid');

const RECOVERY_BATCH_SIZE = 100;

/**
 * Resume derived work that was durably marked pending on the Bid document.
 * This is run after database connection so a restart cannot silently drop
 * metrics or TuneBytes work scheduled outside the request path.
 */
async function recoverPendingBidWork({ afterId = null } = {}) {
  const query = {
    $or: [
      { metricsUpdateStatus: 'pending' },
      { tuneBytesAwardStatus: 'pending' }
    ]
  };
  if (afterId) {
    query._id = { $gt: afterId };
  }

  const pendingBids = await Bid.find(query)
    .select('_id userId mediaId partyId amount metricsUpdateStatus tuneBytesAwardStatus')
    .sort({ _id: 1 })
    .limit(RECOVERY_BATCH_SIZE)
    .lean();

  if (pendingBids.length === 0) {
    return { processed: 0 };
  }

  const bidMetricsEngine = require('./bidMetricsEngine');
  const tuneBytesService = require('./tuneBytesService');

  for (const bid of pendingBids) {
    if (bid.metricsUpdateStatus === 'pending') {
      try {
        await bidMetricsEngine.updateMetricsForBidChange({
          _id: bid._id,
          userId: bid.userId,
          mediaId: bid.mediaId,
          partyId: bid.partyId,
          amount: bid.amount
        }, 'create');
        await Bid.updateOne(
          { _id: bid._id },
          { $set: { metricsUpdateStatus: 'completed' } }
        );
      } catch (error) {
        console.error('Failed to recover bid metrics:', bid._id, error);
      }
    }

    if (bid.tuneBytesAwardStatus === 'pending') {
      try {
        await tuneBytesService.awardTuneBytesForBid(bid._id);
      } catch (error) {
        console.error('Failed to recover TuneBytes award:', bid._id, error);
      }
    }
  }

  if (pendingBids.length === RECOVERY_BATCH_SIZE) {
    const nextAfterId = pendingBids[pendingBids.length - 1]._id;
    setImmediate(() => {
      recoverPendingBidWork({ afterId: nextAfterId }).catch((error) => {
        console.error('Failed to continue pending bid recovery:', error);
      });
    });
  }

  return { processed: pendingBids.length };
}

module.exports = { recoverPendingBidWork };
