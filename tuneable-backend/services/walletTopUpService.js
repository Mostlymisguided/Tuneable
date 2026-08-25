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

async function findExistingStripeTopUp(stripeSessionId) {
  if (!stripeSessionId) return null;
  return WalletTransaction.findOne({
    stripeSessionId,
    type: 'topup',
    status: { $in: ['completed', 'refunded'] },
  });
}

function paymentIntentIdFromSession(session) {
  if (!session) return null;
  if (typeof session.payment_intent === 'string') return session.payment_intent;
  return session.payment_intent?.id || null;
}

/**
 * Exact net amount Tuneable received (balance_transaction.net). No estimates.
 */
async function resolveStripeCheckoutNetAmount(stripe, session) {
  const paymentIntentId = paymentIntentIdFromSession(session);
  if (!paymentIntentId) {
    throw new Error(
      `Missing payment_intent in checkout session ${session.id}. Cannot determine exact net amount received.`
    );
  }

  let paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['charges.data.balance_transaction'],
  });

  console.log(`🔍 PaymentIntent retrieved: ${paymentIntentId}, Status: ${paymentIntent.status}`);

  if (paymentIntent.status !== 'succeeded') {
    throw new Error(
      `PaymentIntent ${paymentIntentId} status is ${paymentIntent.status}, not succeeded. Cannot process.`
    );
  }

  let charge = null;
  const maxRetries = 5;
  let retryCount = 0;

  while (!charge && retryCount < maxRetries) {
    if (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0) {
      charge = paymentIntent.charges.data[0];
      break;
    }

    if (retryCount < maxRetries - 1) {
      const waitTime = Math.min(1000 * Math.pow(2, retryCount), 2000);
      console.log(
        `⏳ PaymentIntent has no charges yet (attempt ${retryCount + 1}/${maxRetries}), waiting ${waitTime}ms before retry...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['charges.data.balance_transaction'],
      });
    }
    retryCount++;
  }

  if (!charge) {
    console.log(`⚠️ No charge in expanded PaymentIntent, trying to list charges directly...`);
    const chargesList = await stripe.charges.list({
      payment_intent: paymentIntentId,
      limit: 1,
      expand: ['data.balance_transaction'],
    });
    if (chargesList.data && chargesList.data.length > 0) {
      charge = chargesList.data[0];
      console.log(`✅ Found charge via list: ${charge.id}`);
    } else {
      throw new Error(
        `PaymentIntent ${paymentIntentId} has no charges after ${maxRetries} retries and direct listing. Payment may not be fully processed. Cannot determine exact net amount.`
      );
    }
  }

  if (!charge.balance_transaction) {
    throw new Error(`Charge ${charge.id} has no balance_transaction. Cannot determine exact net amount.`);
  }

  let balanceTransaction = null;
  let amountReceivedPence;
  if (typeof charge.balance_transaction === 'object' && charge.balance_transaction.net) {
    balanceTransaction = charge.balance_transaction;
    amountReceivedPence = balanceTransaction.net;
    console.log(
      `✅ Using balance_transaction.net (expanded): £${(amountReceivedPence / 100).toFixed(2)} (exact net amount after fees)`
    );
  } else if (typeof charge.balance_transaction === 'string') {
    balanceTransaction = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
    amountReceivedPence = balanceTransaction.net;
    console.log(
      `✅ Using balance_transaction.net (retrieved): £${(amountReceivedPence / 100).toFixed(2)} (exact net amount after fees)`
    );
  } else {
    throw new Error(`Charge ${charge.id} has invalid balance_transaction format. Cannot determine exact net amount.`);
  }

  if (balanceTransaction) {
    console.log(`💰 Stripe Balance Transaction Breakdown:`);
    console.log(`   Gross amount: £${(balanceTransaction.amount / 100).toFixed(2)}`);
    console.log(`   Stripe fees: £${(balanceTransaction.fee / 100).toFixed(2)}`);
    console.log(`   Net amount (what Tuneable receives): £${(balanceTransaction.net / 100).toFixed(2)}`);
  }

  if (!amountReceivedPence || amountReceivedPence <= 0) {
    throw new Error(`Invalid net amount received: ${amountReceivedPence}. Cannot proceed with transaction.`);
  }

  const amountRequestedPence =
    session.amount_total ||
    Math.round(parseFloat(session.metadata?.totalCharge || session.metadata?.amount) * 100);
  const stripeFeesPence = amountRequestedPence - amountReceivedPence;
  const walletCreditAmountPence = Math.round(parseFloat(session.metadata?.amount) * 100);

  console.log(`💰 Amount breakdown:`);
  console.log(`   User wanted to add: £${(walletCreditAmountPence / 100).toFixed(2)}`);
  console.log(`   User paid (gross): £${(amountRequestedPence / 100).toFixed(2)}`);
  console.log(`   Tuneable received (net): £${(amountReceivedPence / 100).toFixed(2)}`);
  console.log(`   Stripe fees: £${(stripeFeesPence / 100).toFixed(2)}`);

  return {
    paymentIntentId,
    amountReceivedPence,
    amountRequestedPence,
    stripeFeesPence,
    walletCreditAmountPence,
    currency: session.currency || 'gbp',
  };
}

async function creditStripeTopUp({
  user,
  creditPence,
  stripeSessionId,
  stripePaymentIntentId,
  isLiveMode,
  amounts,
  customerEmail,
  customerDetails,
}) {
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
      throw new Error(`User not found after balance update: ${user.uuid}`);
    }

    const amountReceivedPounds = creditPence / 100;
    const stripeFeesPounds = (amounts.stripeFeesPence || 0) / 100;

    const [walletTx] = await WalletTransaction.create(
      [
        {
          userId: updatedUser._id,
          user_uuid: updatedUser.uuid,
          amount: creditPence,
          type: 'topup',
          status: 'completed',
          paymentMethod: 'stripe',
          stripeSessionId,
          stripePaymentIntentId,
          balanceBefore,
          balanceAfter: updatedUser.balance,
          description: `Wallet top-up via Stripe (net: £${amountReceivedPounds.toFixed(2)})`,
          username: updatedUser.username,
          metadata: {
            currency: amounts.currency || 'gbp',
            customerEmail,
            customerDetails,
            amountRequested: amounts.amountRequestedPence,
            amountReceived: amounts.amountReceivedPence,
            stripeFees: amounts.stripeFeesPence,
            stripeFeesPounds: stripeFeesPounds.toFixed(2),
            isLiveMode: !!isLiveMode,
          },
        },
      ],
      { session: dbSession }
    );

    const TuneableLedger = require('../models/TuneableLedger');
    const globalAggregatePre = await TuneableLedger.aggregate([
      { $match: { transactionType: { $in: ['TIP', 'TOP_UP'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).session(dbSession);

    const globalAggregateValue = globalAggregatePre.length > 0 ? globalAggregatePre[0].total : 0;

    const ledgerEntry = new TuneableLedger({
      userId: updatedUser._id,
      mediaId: null,
      partyId: null,
      bidId: null,
      user_uuid: updatedUser.uuid,
      media_uuid: null,
      transactionType: 'TOP_UP',
      amount: creditPence,
      userBalancePre: balanceBefore,
      userBalancePost: balanceBefore + creditPence,
      userAggregatePre,
      userAggregatePost: userAggregatePre,
      mediaAggregatePre: 0,
      mediaAggregatePost: 0,
      globalAggregatePre: globalAggregateValue,
      globalAggregatePost: globalAggregateValue,
      referenceTransactionId: walletTx._id,
      referenceTransactionType: 'WalletTransaction',
      username: updatedUser.username,
      mediaTitle: null,
      partyName: null,
      description: `Top-up of £${amountReceivedPounds.toFixed(2)}`,
      metadata: {
        stripeSessionId,
        stripePaymentIntentId,
        currency: amounts.currency || 'gbp',
        customerEmail,
        customerDetails,
        amountRequested: amounts.amountRequestedPence,
        amountReceived: amounts.amountReceivedPence,
        stripeFees: amounts.stripeFeesPence,
        isLiveMode: !!isLiveMode,
        walletTransactionCreated: true,
      },
    });

    await ledgerEntry.save({ session: dbSession });
    await dbSession.commitTransaction();

    console.log(
      `✅ Stripe top-up committed: User ${updatedUser.uuid} requested £${(
        (amounts.amountRequestedPence || creditPence) / 100
      ).toFixed(2)}, credited £${amountReceivedPounds.toFixed(2)}, new balance: £${(
        updatedUser.balance / 100
      ).toFixed(2)}`
    );

    try {
      const verificationService = require('./transactionVerificationService');
      await verificationService.storeVerificationHash(walletTx, 'WalletTransaction');
      await verificationService.storeVerificationHash(ledgerEntry, 'TuneableLedger');
    } catch (verifyError) {
      console.error('Failed to store verification hash (non-critical):', verifyError);
    }

    try {
      await sendPaymentNotification(updatedUser, amountReceivedPounds);
    } catch (emailError) {
      console.error('Failed to send payment notification email (non-critical):', emailError);
    }

    try {
      const { afterPaidTopUp } = require('./welcomePromoEscrowService');
      await afterPaidTopUp(updatedUser._id, walletTx);
    } catch (promoErr) {
      console.error('Failed to convert promo escrow after Stripe top-up:', promoErr);
    }

    return {
      alreadyProcessed: false,
      balance: updatedUser.balance,
      transaction: walletTx,
    };
  } catch (err) {
    try {
      await dbSession.abortTransaction();
    } catch (_) {
      // already committed / aborted
    }
    throw err;
  } finally {
    dbSession.endSession();
  }
}

/**
 * Credit a paid Stripe Checkout session. Idempotent on stripeSessionId.
 * Used by the webhook and by the client confirm endpoint.
 */
async function fulfillStripeCheckoutSession({ stripe, session, isLiveMode }) {
  if (!session?.id) throw new Error('Checkout session is required');
  if (!stripe) throw new Error('Stripe client is required');

  const userId = session.metadata?.userId;
  if (!userId) {
    console.error('❌ Wallet top-up: userId missing from session metadata');
    return { skipped: true, reason: 'missing_userId', alreadyProcessed: false, balance: 0 };
  }

  const existing = await findExistingStripeTopUp(session.id);
  if (existing) {
    console.log(`⚠️ Duplicate Stripe top-up skipped: Session ${session.id} already processed (${existing._id})`);
    try {
      const { afterPaidTopUp } = require('./welcomePromoEscrowService');
      await afterPaidTopUp(existing.userId, existing);
    } catch (promoErr) {
      console.error('Failed to convert promo escrow on duplicate Stripe top-up:', promoErr);
    }
    const user = await User.findById(existing.userId);
    return {
      alreadyProcessed: true,
      skipped: false,
      balance: user?.balance || 0,
      transaction: existing,
    };
  }

  const amounts = await resolveStripeCheckoutNetAmount(stripe, session);
  const user = await User.findOne({ uuid: userId });
  if (!user) {
    console.error(`User not found for wallet top-up: ${userId}`);
    return { skipped: true, reason: 'user_not_found', alreadyProcessed: false, balance: 0 };
  }

  try {
    return await creditStripeTopUp({
      user,
      creditPence: amounts.amountReceivedPence,
      stripeSessionId: session.id,
      stripePaymentIntentId: amounts.paymentIntentId,
      isLiveMode,
      amounts,
      customerEmail: session.customer_email,
      customerDetails: session.customer_details,
    });
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || '').includes('duplicate'))) {
      const raced = await findExistingStripeTopUp(session.id);
      if (raced) {
        const u = await User.findById(raced.userId);
        return {
          alreadyProcessed: true,
          skipped: false,
          balance: u?.balance || 0,
          transaction: raced,
        };
      }
    }
    throw err;
  }
}

module.exports = {
  creditIapTopUp,
  fulfillStripeCheckoutSession,
};
