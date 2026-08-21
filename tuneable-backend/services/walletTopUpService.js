const mongoose = require('mongoose');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const Bid = require('../models/Bid');
const { sendPaymentNotification } = require('../utils/emailService');

/**
 * Credit wallet after a verified store purchase (Apple / Google).
 * Idempotent on storeTransactionId.
 *
 * @returns {{ balance, transaction, alreadyProcessed }}
 */
async function creditIapTopUp({
  userId,
  creditPence,
  paymentMethod,
  storeTransactionId,
  storeProductId,
  platform,
  metadata = {},
  description,
}) {
  if (!userId) throw new Error('userId is required');
  if (!creditPence || creditPence <= 0) throw new Error('Invalid creditPence');
  if (!storeTransactionId) throw new Error('storeTransactionId is required');
  if (!['apple_iap', 'google_play'].includes(paymentMethod)) {
    throw new Error(`Invalid IAP paymentMethod: ${paymentMethod}`);
  }

  const existing = await WalletTransaction.findOne({
    storeTransactionId,
    type: 'topup',
    status: 'completed',
  });

  if (existing) {
    const user = await User.findById(existing.userId);
    try {
      const { afterPaidTopUp } = require('./welcomePromoEscrowService');
      await afterPaidTopUp(existing.userId, existing);
    } catch (promoErr) {
      console.error('Failed to convert promo escrow on duplicate IAP top-up:', promoErr);
    }
    return {
      balance: user?.balance || 0,
      transaction: existing,
      alreadyProcessed: true,
    };
  }

  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const balanceBefore = user.balance || 0;

  const userBidsPre = await Bid.find({
    userId: user._id,
    status: 'active',
  }).lean();
  const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);

  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { balance: creditPence } },
      { new: true, session: dbSession }
    );

    if (!updatedUser) {
      throw new Error('User not found after balance update');
    }

    const [walletTx] = await WalletTransaction.create(
      [
        {
          userId: updatedUser._id,
          user_uuid: updatedUser.uuid,
          amount: creditPence,
          type: 'topup',
          status: 'completed',
          paymentMethod,
          storeTransactionId,
          storeProductId,
          platform,
          balanceBefore,
          balanceAfter: updatedUser.balance,
          description:
            description ||
            `Wallet top-up via ${paymentMethod === 'apple_iap' ? 'Apple' : 'Google Play'} (£${(creditPence / 100).toFixed(2)})`,
          username: updatedUser.username,
          metadata: {
            ...metadata,
            storeProductId,
            platform,
          },
        },
      ],
      { session: dbSession }
    );

    await dbSession.commitTransaction();

    try {
      const verificationService = require('./transactionVerificationService');
      await verificationService.storeVerificationHash(walletTx, 'WalletTransaction');
    } catch (verifyError) {
      console.error('Failed to store verification hash (non-critical):', verifyError);
    }

    try {
      const tuneableLedgerService = require('./tuneableLedgerService');
      await tuneableLedgerService.createTopUpEntry({
        userId: updatedUser._id,
        amount: creditPence,
        userBalancePre: balanceBefore,
        userAggregatePre,
        referenceTransactionId: walletTx._id,
        metadata: {
          paymentMethod,
          storeTransactionId,
          storeProductId,
          platform,
          ...metadata,
        },
      });
    } catch (ledgerError) {
      console.error('❌ Failed to create ledger entry for IAP top-up:', ledgerError);
    }

    try {
      await sendPaymentNotification(updatedUser, creditPence / 100);
    } catch (emailError) {
      console.error('Failed to send payment notification email (non-critical):', emailError);
    }

    try {
      const { afterPaidTopUp } = require('./welcomePromoEscrowService');
      await afterPaidTopUp(updatedUser._id, walletTx);
    } catch (promoErr) {
      console.error('Failed to convert promo escrow after IAP top-up:', promoErr);
    }

    return {
      balance: updatedUser.balance,
      transaction: walletTx,
      alreadyProcessed: false,
    };
  } catch (err) {
    try {
      await dbSession.abortTransaction();
    } catch (_) {
      // already committed / aborted
    }

    // Race: another request may have inserted the same storeTransactionId
    if (err && (err.code === 11000 || String(err.message || '').includes('duplicate'))) {
      const raced = await WalletTransaction.findOne({
        storeTransactionId,
        type: 'topup',
        status: 'completed',
      });
      if (raced) {
        const u = await User.findById(raced.userId);
        return {
          balance: u?.balance || 0,
          transaction: raced,
          alreadyProcessed: true,
        };
      }
    }
    throw err;
  } finally {
    dbSession.endSession();
  }
}

module.exports = {
  creditIapTopUp,
};
