/**
 * Welcome / beta credit helper.
 *
 * Credit is claimed by the user (not auto-granted on signup) so they can
 * accept promotional terms first. Grant is atomic to prevent double-claim.
 */

const notificationService = require('../services/notificationService');
const WalletTransaction = require('../models/WalletTransaction');
const { WELCOME_CREDIT_PENCE } = require('./welcomeCreditHelper');
const {
  computeWelcomeExpiryDate,
  WELCOME_CREDIT_EXPIRY_MONTHS,
} = require('./welcomeCreditPolicy');

const WELCOME_CREDIT_TERMS_VERSION = 'welcome-credit-v1';

const OFFER_STATUS = {
  ELIGIBLE: 'eligible',
  NEEDS_VERIFICATION: 'needs_verification',
  CLAIMED: 'claimed',
  UNAVAILABLE: 'unavailable',
};

function isBetaModeEnabled(env = process.env) {
  const raw = env.VITE_BETA_MODE;
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'on' ||
    normalized === true
  );
}

function hasVerifiedIdentity(user) {
  if (!user) return false;
  if (user.emailVerified) return true;
  const oauth = user.oauthVerified || {};
  return Object.values(oauth).some(Boolean);
}

function hasReceivedWelcomeCredit(user) {
  if (!user) return false;
  return Boolean(user.welcomeCreditGrantedAt) || (user.welcomeCreditRemainingPence || 0) > 0;
}

function getWelcomeCreditOffer(user) {
  const amountPence = WELCOME_CREDIT_PENCE;
  const remainingPence = Math.max(0, user?.welcomeCreditRemainingPence || 0);
  const expiresAt = user?.welcomeCreditExpiresAt || null;

  if (hasReceivedWelcomeCredit(user)) {
    return {
      status: OFFER_STATUS.CLAIMED,
      amountPence,
      remainingPence,
      expiresAt,
    };
  }

  if (!isBetaModeEnabled()) {
    return {
      status: OFFER_STATUS.UNAVAILABLE,
      amountPence,
      remainingPence: 0,
      expiresAt: null,
    };
  }

  if (!hasVerifiedIdentity(user)) {
    return {
      status: OFFER_STATUS.NEEDS_VERIFICATION,
      amountPence,
      remainingPence: 0,
      expiresAt: null,
    };
  }

  return {
    status: OFFER_STATUS.ELIGIBLE,
    amountPence,
    remainingPence: 0,
    expiresAt: null,
  };
}

function withWelcomeCreditOffer(user) {
  if (!user) return user;
  const obj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  obj.welcomeCreditOffer = getWelcomeCreditOffer(user);
  return obj;
}

async function hasCompletedWelcomeGrant(userId) {
  const existing = await WalletTransaction.findOne({
    userId,
    type: 'beta_credit',
    status: 'completed',
  }).select('_id');
  return Boolean(existing);
}

async function recordWelcomeGrantSideEffects(user, amountPence, balanceBefore) {
  try {
    await WalletTransaction.create({
      userId: user._id,
      user_uuid: user.uuid,
      amount: amountPence,
      type: 'beta_credit',
      status: 'completed',
      paymentMethod: 'beta',
      balanceBefore,
      balanceAfter: user.balance,
      description: 'Welcome credit (£11.11)',
      username: user.username,
    });
  } catch (txError) {
    console.error('❌ Failed to create wallet transaction record for welcome credit:', txError);
  }

  try {
    await notificationService.createNotification({
      userId: user._id,
      type: 'admin_announcement',
      title: 'Welcome Credit Claimed',
      message:
        `You've claimed £11.11 promotional credit. Welcome tips are capped ` +
        `(max £1.11 per tip, £3.33 / 3 songs per artist). Unused credit expires after ` +
        `${WELCOME_CREDIT_EXPIRY_MONTHS} months and may be revoked at Tuneable's discretion.`,
      link: '/wallet',
      linkText: 'View Wallet',
      groupKey: `beta_signup_credit_${user._id}`,
    });
  } catch (notificationError) {
    console.error('Failed to create welcome credit notification:', notificationError);
  }
}

/**
 * Idempotent claim. Requires acceptedPromoTerms.
 * @returns {Promise<{
 *   ok: boolean,
 *   alreadyClaimed?: boolean,
 *   user?: object,
 *   amountPence?: number,
 *   status?: number,
 *   code?: string,
 *   message?: string,
 * }>}
 */
async function claimWelcomeCredit(user, { acceptedPromoTerms } = {}) {
  if (!user) {
    return { ok: false, status: 404, code: 'USER_NOT_FOUND', message: 'User not found' };
  }

  if (!acceptedPromoTerms) {
    return {
      ok: false,
      status: 400,
      code: 'TERMS_REQUIRED',
      message: 'You must accept the promotional credit terms to claim welcome credit.',
    };
  }

  if (!isBetaModeEnabled()) {
    return {
      ok: false,
      status: 403,
      code: 'UNAVAILABLE',
      message: 'Welcome credit is not available right now.',
    };
  }

  if (!hasVerifiedIdentity(user)) {
    return {
      ok: false,
      status: 403,
      code: 'NEEDS_VERIFICATION',
      message: 'Verify your email to claim welcome credit.',
    };
  }

  if (hasReceivedWelcomeCredit(user) || (await hasCompletedWelcomeGrant(user._id))) {
    if (!user.welcomeCreditGrantedAt) {
      user.welcomeCreditGrantedAt = user.createdAt || new Date();
      try {
        await user.save();
      } catch (saveErr) {
        console.error('Failed to stamp welcomeCreditGrantedAt for existing grant:', saveErr);
      }
    }
    return { ok: true, alreadyClaimed: true, user, amountPence: 0 };
  }

  const User = require('../models/User');
  const now = new Date();
  const expiresAt = computeWelcomeExpiryDate(now);
  const amountPence = WELCOME_CREDIT_PENCE;
  const balanceBefore = user.balance || 0;

  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      welcomeCreditGrantedAt: null,
      $or: [
        { welcomeCreditRemainingPence: { $exists: false } },
        { welcomeCreditRemainingPence: null },
        { welcomeCreditRemainingPence: 0 },
      ],
    },
    {
      $inc: {
        balance: amountPence,
        welcomeCreditRemainingPence: amountPence,
      },
      $set: {
        welcomeCreditGrantedAt: now,
        welcomeCreditExpiresAt: expiresAt,
        welcomeCreditTermsAcceptedAt: now,
        welcomeCreditTermsVersion: WELCOME_CREDIT_TERMS_VERSION,
      },
    },
    { new: true }
  );

  if (!updated) {
    const fresh = await User.findById(user._id);
    if (fresh && (hasReceivedWelcomeCredit(fresh) || (await hasCompletedWelcomeGrant(user._id)))) {
      return { ok: true, alreadyClaimed: true, user: fresh, amountPence: 0 };
    }
    return {
      ok: false,
      status: 409,
      code: 'CLAIM_FAILED',
      message: 'Unable to claim welcome credit. Please try again.',
    };
  }

  await recordWelcomeGrantSideEffects(updated, amountPence, balanceBefore);
  console.log(
    `✅ Claimed £11.11 welcome credit for ${updated.username}. New balance: £${(updated.balance / 100).toFixed(2)}`
  );

  return { ok: true, alreadyClaimed: false, user: updated, amountPence };
}

module.exports = {
  WELCOME_CREDIT_TERMS_VERSION,
  OFFER_STATUS,
  isBetaModeEnabled,
  hasVerifiedIdentity,
  hasReceivedWelcomeCredit,
  getWelcomeCreditOffer,
  withWelcomeCreditOffer,
  claimWelcomeCredit,
};
