const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/User'); // Import user model
require('dotenv').config();

// Test mode Stripe (for wallet top-ups - can be overridden by AdminSettings)
const stripeTest = new Stripe(process.env.STRIPE_SECRET_KEY_TEST || '');

// Live mode Stripe (for share purchases/funding and wallet top-ups when enabled)
const stripeLive = process.env.STRIPE_SECRET_KEY_LIVE ? new Stripe(process.env.STRIPE_SECRET_KEY_LIVE || '') : null;

// Helper function to get the appropriate Stripe instance for wallet top-ups
const getWalletTopUpStripe = async () => {
  try {
    const AdminSettings = require('../models/AdminSettings');
    const settings = await AdminSettings.getSettings();
    const mode = settings.stripe?.walletTopUpMode || 'live';
    
    if (mode === 'live' && stripeLive) {
      return stripeLive;
    }
    if (mode === 'live' && !stripeLive) {
      console.warn('⚠️ Stripe: Admin mode is "live" but STRIPE_SECRET_KEY_LIVE is not set. Wallet top-ups will use TEST keys until you set STRIPE_SECRET_KEY_LIVE in .env.');
    }
    // Default to test mode if live not configured or mode is 'test'
    return stripeTest;
  } catch (error) {
    console.error('Error getting Stripe instance for wallet top-up:', error);
    // Fallback to test mode on error
    return stripeTest;
  }
};

// Create Payment Intent
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const userId = req.user.uuid;  // Use UUID instead of _id for Stripe metadata

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const stripe = await getWalletTopUpStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: currency || 'gbp',
      automatic_payment_methods: { enabled: true },
    });

    res.json({ clientSecret: paymentIntent.client_secret, userId });
  } catch (error) {
    console.error('Stripe Payment Intent Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create Stripe Checkout Session for Wallet Top-up (uses AdminSettings to determine test/live mode)
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { amount, totalCharge, currency = 'gbp', successUrl, cancelUrl } = req.body;
    const userId = req.user.uuid;  // Use UUID string instead of _id ObjectId

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Use totalCharge if provided (includes fees), otherwise use amount (backward compatibility)
    const chargeAmount = totalCharge && totalCharge > amount ? totalCharge : amount;

    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';
    const defaultSuccess = `${frontendBase}/wallet?success=true&amount=${amount}`;
    const defaultCancel = `${frontendBase}/wallet?canceled=true`;

    const isAllowedRedirect = (url) => {
      if (!url || typeof url !== 'string') return false;
      try {
        const parsed = new URL(url);
        // Mobile deep link (Expo / Capacitor)
        if (parsed.protocol === 'stream.tuneable.app:') return true;
        // Web app
        if (url.startsWith(frontendBase)) return true;
        return false;
      } catch {
        return false;
      }
    };

    const appendCheckoutSessionId = (url) => {
      if (!url || typeof url !== 'string') return url;
      if (url.includes('{CHECKOUT_SESSION_ID}')) return url;
      const hashIndex = url.indexOf('#');
      const withoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
      const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
      const separator = withoutHash.includes('?') ? '&' : '?';
      return `${withoutHash}${separator}session_id={CHECKOUT_SESSION_ID}${hash}`;
    };

    const resolvedSuccess = appendCheckoutSessionId(
      isAllowedRedirect(successUrl) ? successUrl : defaultSuccess
    );
    const resolvedCancel = isAllowedRedirect(cancelUrl) ? cancelUrl : defaultCancel;
    
    // amount is the wallet credit amount, chargeAmount is what Stripe will charge
    const stripe = await getWalletTopUpStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: 'Tuneable Wallet Top-up',
              description: `Add £${amount} to your Tuneable wallet`,
            },
            unit_amount: Math.round(chargeAmount * 100), // Convert to pence - use totalCharge if provided
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: resolvedSuccess,
      cancel_url: resolvedCancel,
      metadata: {
        userId: userId,  // Now a UUID string, not ObjectId
        amount: amount.toString(), // Wallet credit amount (what user wants to add)
        totalCharge: chargeAmount.toString(), // Total Stripe charge (including fees)
        type: 'wallet_topup'
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Session Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Create Stripe Checkout Session for Share Purchase (LIVE MODE)
router.post('/create-share-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { amount, currency = 'gbp', packageId, shares } = req.body;
    const userId = req.user.uuid;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!stripeLive) {
      return res.status(500).json({ error: 'Live Stripe key not configured. Share purchases require live mode.' });
    }

    const session = await stripeLive.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: 'Tuneable Share Purchase',
              description: shares 
                ? `Purchase ${shares} share${shares > 1 ? 's' : ''} in Tuneable`
                : `Purchase shares in Tuneable`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join-us?success=true&amount=${amount}&packageId=${packageId || 'custom'}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/join-us?canceled=true`,
      metadata: {
        userId: userId,
        amount: amount.toString(),
        type: 'share_purchase',
        packageId: packageId || 'custom',
        shares: shares ? shares.toString() : ''
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe Share Purchase Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

async function retrieveCheckoutSessionForConfirm(sessionId) {
  const primary = await getWalletTopUpStripe();
  try {
    const session = await primary.checkout.sessions.retrieve(sessionId);
    return { stripe: primary, session };
  } catch (primaryErr) {
    const secondary = primary === stripeLive ? stripeTest : stripeLive;
    if (!secondary) throw primaryErr;
    const session = await secondary.checkout.sessions.retrieve(sessionId);
    return { stripe: secondary, session };
  }
}

async function confirmPaidCheckoutSession(req, res, sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'stripeSessionId is required' });
  }

  const { stripe, session } = await retrieveCheckoutSessionForConfirm(sessionId);

  if (session.metadata?.type && session.metadata.type !== 'wallet_topup') {
    return res.status(400).json({ error: 'Checkout session is not a wallet top-up' });
  }

  if (session.metadata?.userId && session.metadata.userId !== req.user.uuid) {
    return res.status(403).json({ error: 'Checkout session does not belong to this user' });
  }

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    return res.status(400).json({
      error: 'Checkout session is not paid',
      paymentStatus: session.payment_status,
      status: session.status,
    });
  }

  const { fulfillStripeCheckoutSession } = require('../services/walletTopUpService');
  const result = await fulfillStripeCheckoutSession({
    stripe,
    session,
    isLiveMode: !!session.livemode,
  });

  if (result.skipped) {
    return res.status(400).json({
      error: 'Could not credit wallet for this session',
      reason: result.reason,
      balance: result.balance || 0,
    });
  }

  return res.json({
    message: result.alreadyProcessed
      ? 'Payment already processed'
      : 'Balance updated successfully',
    balance: result.balance,
    alreadyProcessed: !!result.alreadyProcessed,
    transaction: result.transaction,
  });
}

// NOTE: Webhook route is defined directly in index.js at /api/payments/webhook
// This ensures raw body parsing works correctly for Stripe signature verification.
// The webhook handler is NOT in this router to avoid conflicts with Express middleware ordering.

// Confirm a paid Stripe Checkout session and credit the wallet (idempotent).
router.post('/confirm-checkout-session', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.body.stripeSessionId || req.body.sessionId;
    return await confirmPaidCheckoutSession(req, res, sessionId);
  } catch (error) {
    console.error('Error confirming checkout session:', error.message);
    const status = error.statusCode || error.status || 500;
    res.status(status).json({ error: error.message });
  }
});

// Legacy success-page endpoint. Amount-only calls must NEVER credit the wallet —
// that raced with the Stripe webhook and double-topped users.
router.post('/update-balance', authMiddleware, async (req, res) => {
  try {
    const stripeSessionId = req.body.stripeSessionId || req.body.sessionId;
    if (stripeSessionId) {
      return await confirmPaidCheckoutSession(req, res, stripeSessionId);
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(
      `⚠️ /update-balance called without stripeSessionId for user ${user.uuid}; returning current balance without crediting`
    );
    return res.json({
      message: 'Balance not changed; top-ups are credited by Stripe webhook or confirm-checkout-session',
      balance: user.balance || 0,
    });
  } catch (error) {
    console.error('Error updating balance:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// List wallet IAP products (fixed packs for App Store / Play Billing)
router.get('/iap/products', authMiddleware, async (_req, res) => {
  try {
    const { getWalletIapProducts } = require('../services/iapProducts');
    res.json({ products: getWalletIapProducts() });
  } catch (error) {
    console.error('Error listing IAP products:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Verify Apple / Google purchase and credit wallet.
 * Body: {
 *   platform: 'ios' | 'android',
 *   productId: string,
 *   transactionId?: string,   // Apple
 *   purchaseToken?: string,   // Apple JWS or Google purchase token
 *   receiptData?: string,     // Apple legacy base64 receipt (optional)
 *   packageName?: string      // Android override
 * }
 */
router.post('/iap/verify', authMiddleware, async (req, res) => {
  try {
    const {
      platform,
      productId,
      transactionId,
      purchaseToken,
      receiptData,
      packageName,
    } = req.body || {};

    if (!platform || !['ios', 'android'].includes(platform)) {
      return res.status(400).json({ error: 'platform must be ios or android' });
    }
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const {
      verifyApplePurchase,
      verifyGooglePurchase,
    } = require('../services/iapVerificationService');
    const { creditIapTopUp } = require('../services/walletTopUpService');

    let verified;
    if (platform === 'ios') {
      verified = await verifyApplePurchase({
        productId,
        transactionId,
        purchaseToken,
        receiptData,
      });
    } else {
      verified = await verifyGooglePurchase({
        productId,
        purchaseToken,
        packageName,
      });
    }

    const paymentMethod = platform === 'ios' ? 'apple_iap' : 'google_play';
    const result = await creditIapTopUp({
      userId: req.user._id,
      creditPence: verified.product.creditPence,
      paymentMethod,
      storeTransactionId: verified.storeTransactionId,
      storeProductId: productId,
      platform,
      metadata: {
        environment: verified.environment,
      },
    });

    res.json({
      message: result.alreadyProcessed
        ? 'Purchase already credited'
        : 'Purchase verified and wallet credited',
      balance: result.balance,
      creditPence: verified.product.creditPence,
      creditPounds: verified.product.creditPounds,
      alreadyProcessed: result.alreadyProcessed,
      transactionId: result.transaction?._id,
      storeTransactionId: verified.storeTransactionId,
    });
  } catch (error) {
    const status = error.status || 500;
    console.error('IAP verify error:', error.message);
    res.status(status).json({ error: error.message || 'IAP verification failed' });
  }
});

// Confirm Payment — amount-only crediting is disabled (it double-topped wallets).
router.post('/confirm-payment', authMiddleware, async (req, res) => {
  try {
    const sessionId = req.body.stripeSessionId || req.body.sessionId;
    if (sessionId) {
      return await confirmPaidCheckoutSession(req, res, sessionId);
    }
    return res.status(400).json({
      error: 'stripeSessionId is required; amount-only confirm is disabled to prevent double top-ups',
    });
  } catch (error) {
    console.error('Error confirming payment:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
