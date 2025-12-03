const express = require('express');
const db = require('./db'); // Import the database connection module
const { initializeSocketIO } = require('./utils/socketIO'); // Import Socket.IO setup for notifications and party updates
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: envFile });

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGO_URI:', process.env.MONGO_URI);

const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');

const app = express();

const userRoutes = require('./routes/userRoutes'); // Import user routes
const partyRoutes = require('./routes/partyRoutes'); // Unified party and playlist functionality
const searchRoutes = require('./routes/searchRoutes'); // Import search routes
const mediaRoutes = require('./routes/mediaRoutes'); // Import media routes (top-tunes, etc.)
const paymentRoutes = require('./routes/paymentRoutes');
const youtubeRoutes = require('./routes/youtube');
const authRoutes = require('./routes/authRoutes'); // Import OAuth routes
const podcastRoutes = require('./routes/podcastRoutes'); // Import consolidated Podcast routes
const youtubeImportRoutes = require('./routes/youtubeImportRoutes'); // Import YouTube bulk import routes
const bidMetricsRoutes = require('./routes/bidMetricsRoutes'); // Import bid metrics routes
const instagramWebhooks = require('./routes/instagramWebhooks'); // Instagram webhooks
const creatorRoutes = require('./routes/creatorRoutes'); // Import creator application routes
const reportRoutes = require('./routes/reportRoutes'); // Report routes
const emailRoutes = require('./routes/emailRoutes'); // Email routes
const labelRoutes = require('./routes/labelRoutes'); // Import label routes
const collectiveRoutes = require('./routes/collectiveRoutes'); // Import collective routes
const notificationRoutes = require('./routes/notificationRoutes'); // Import notification routes

// Use environment variable for port or default to 8000
const PORT = process.env.PORT || 8000;

// Debug log: Server initialization
console.log('Initializing server...');

// Connect to the database
db.connectDB()
  .then(() => {
    console.log('Connected to the database successfully.');
  })
  .catch((err) => {
    console.error('Error connecting to the database:', err);
    //process.exit(1);
  });

// Allowed origins: development and production
const allowedOrigins = [
  // Local development
  'http://localhost:3000', 
  'http://localhost:5173', 
  'http://localhost:5174', 
  'http://localhost:5175', 
  'http://127.0.0.1:5173', 
  'http://127.0.0.1:5174', 
  'http://127.0.0.1:5175',
  // Production - tuneable.stream (primary)
  'https://tuneable.stream',
  'https://www.tuneable.stream',
  'http://tuneable.stream',
  // Cloudflare Pages
  'https://tuneable.pages.dev',
  // Legacy tuneable.com (deprecated - keeping for transition)
  'https://tuneable.com',
  'https://www.tuneable.com',
  'http://tuneable.com'
];

// Define CORS options
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

// Apply CORS middleware globally and handle pre-flight OPTIONS requests
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight for all routes

console.log('CORS enabled for allowed origins:', allowedOrigins);

// Middleware to parse JSON bodies (exclude webhook route which needs raw body)
// IMPORTANT: Check both req.path and req.originalUrl to catch the webhook route
app.use((req, res, next) => {
  // Skip JSON parsing for Stripe webhook (needs raw body for signature verification)
  const isWebhook = req.path === '/api/payments/webhook' || 
                    req.originalUrl === '/api/payments/webhook' ||
                    req.path === '/webhook' ||
                    req.originalUrl === '/webhook';
  
  if (isWebhook) {
    console.log('⚠️ Skipping JSON parsing for webhook route');
    return next();
  }
  express.json()(req, res, next);
});
console.log('JSON body parsing middleware added (webhook excluded).');

// Trust proxy - required for Render/Heroku (they use reverse proxies)
// This ensures req.protocol is correctly set to 'https' for secure cookies
app.set('trust proxy', 1);

// Session configuration for OAuth
// For OAuth redirects that cross domains (app → Google → app), we need SameSite: 'none' with Secure: true
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-key',
  resave: false,
  saveUninitialized: true, // Changed to true to ensure session is created for OAuth state
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Must be true for SameSite: 'none'
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' required for cross-site OAuth redirects
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'tuneable.sid' // Custom session name
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
console.log('Passport OAuth middleware initialized.');

// Basic route
app.get('/', (req, res) => {
  console.log('GET /');
  res.send('Hello, Tuneable!');
});

// Health check route
app.get('/health', (req, res) => {
  console.log('GET /health');
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Test route
app.get('/api/test', (req, res) => {
  console.log('GET /api/test');
  res.json({ message: 'API is working!' });
});

// Test webhook route accessibility
app.get('/api/payments/webhook/test', (req, res) => {
  console.log('✅ Webhook test endpoint hit:', req.path);
  res.json({ 
    status: 'ok', 
    message: 'Webhook endpoint is accessible',
    timestamp: new Date().toISOString(),
    url: '/api/payments/webhook',
    methods: ['POST'],
    environment: process.env.NODE_ENV || 'development',
    backendUrl: process.env.BACKEND_URL || 'not set'
  });
});

// Handle OPTIONS for webhook (CORS preflight)
app.options('/api/payments/webhook', (req, res) => {
  console.log('OPTIONS request for webhook endpoint');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');
  res.status(200).end();
});

// Register webhook route DIRECTLY on app BEFORE mounting paymentRoutes router
// This ensures it's registered with raw body parsing and avoids route conflicts
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('🔔 Stripe webhook received (direct route) - checking signature...');
  console.log('Webhook request details:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    headers: {
      'content-type': req.headers['content-type'],
      'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing'
    }
  });
  
  // Import Stripe instances
  const Stripe = require('stripe');
  const stripeTest = new Stripe(process.env.STRIPE_SECRET_KEY_TEST || '');
  const stripeLive = process.env.STRIPE_SECRET_KEY_LIVE ? new Stripe(process.env.STRIPE_SECRET_KEY_LIVE) : null;
  
  const sig = req.headers['stripe-signature'];
  let event;
  let isLiveMode = false;

  if (!sig) {
    console.error('❌ Webhook request missing stripe-signature header');
    return res.status(400).send('Missing stripe-signature header');
  }

  // Try test mode webhook first
  try {
    const testSecret = process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET;
    if (!testSecret) {
      console.warn('⚠️ STRIPE_WEBHOOK_SECRET_TEST not configured, skipping test mode verification');
      throw new Error('Test webhook secret not configured');
    }
    event = stripeTest.webhooks.constructEvent(req.body, sig, testSecret);
    isLiveMode = false;
    console.log(`✅ Webhook signature verified (TEST mode): Event type: ${event.type}`);
  } catch (testErr) {
    console.log(`⚠️ Test mode webhook verification failed: ${testErr.message}`);
    // If test webhook fails, try live webhook
    if (stripeLive && process.env.STRIPE_WEBHOOK_SECRET_LIVE) {
      try {
        event = stripeLive.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET_LIVE);
        isLiveMode = true;
        console.log(`✅ Webhook signature verified (LIVE mode): Event type: ${event.type}`);
      } catch (liveErr) {
        console.error(`❌ Webhook signature verification failed for both test and live modes. Test error: ${testErr.message}, Live error: ${liveErr.message}`);
        return res.status(400).send(`Webhook Error: ${liveErr.message}`);
      }
    } else {
      console.error(`❌ Webhook signature verification failed. Test error: ${testErr.message}, Live mode not configured or secret missing`);
      return res.status(400).send(`Webhook Error: ${testErr.message}`);
    }
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`📦 Checkout session completed: Session ID ${session.id}, Metadata:`, session.metadata);
    
    if (session.metadata && session.metadata.type === 'wallet_topup') {
      // Call the wallet top-up handler - we'll import the handler logic
      try {
        // Import required modules
        const User = require('./models/User');
        const WalletTransaction = require('./models/WalletTransaction');
        const { sendPaymentNotification } = require('./utils/emailService');
        
        const userId = session.metadata.userId;
        
        if (!userId) {
          console.error('❌ Wallet top-up webhook: userId missing from session metadata');
          return res.json({ received: true }); // Still acknowledge to Stripe
        }
        
        // IDEMPOTENCY CHECK: Check if this webhook has already been processed
        // This prevents duplicate balance credits if Stripe retries the webhook
        console.log(`🔍 Checking for existing transaction with session ID: ${session.id}`);
        const existingTransaction = await WalletTransaction.findOne({
          stripeSessionId: session.id,
          type: 'topup',
          status: 'completed'
        });
        
        if (existingTransaction) {
          console.log(`⚠️ DUPLICATE WEBHOOK DETECTED: Session ${session.id} already processed`);
          console.log(`   Existing transaction ID: ${existingTransaction._id}`);
          console.log(`   User was already credited: £${(existingTransaction.amount / 100).toFixed(2)}`);
          console.log(`   Transaction created at: ${existingTransaction.createdAt}`);
          console.log(`   User ID: ${existingTransaction.userId}`);
          // Still acknowledge to Stripe to prevent retries
          return res.json({ received: true, message: 'Already processed' });
        }
        console.log(`✅ No existing transaction found - proceeding with webhook processing`);
        
        // Get the actual Stripe instance (test or live)
        const stripe = isLiveMode ? stripeLive : stripeTest;
        
        // Retrieve PaymentIntent to get actual amount received (net after fees)
        // CRITICAL: We MUST have the exact net amount for audit integrity - NO ESTIMATES
        let paymentIntent;
        let amountReceivedPence;
        
        if (!session.payment_intent) {
          throw new Error(`Missing payment_intent in checkout session ${session.id}. Cannot determine exact net amount received.`);
        }
        
        paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent, {
          expand: ['charges.data.balance_transaction']
        });
        
        // Verify payment was successful
        if (paymentIntent.status !== 'succeeded') {
          throw new Error(`PaymentIntent ${session.payment_intent} status is ${paymentIntent.status}, not succeeded. Cannot process.`);
        }
        
        // Get the exact net amount after fees - try multiple sources for accuracy
        if (paymentIntent.amount_received && paymentIntent.amount_received > 0) {
          // amount_received is the net amount after fees (most accurate, preferred)
          amountReceivedPence = paymentIntent.amount_received;
          console.log(`✅ Using amount_received: £${(amountReceivedPence/100).toFixed(2)} (exact net amount)`);
        } else if (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0) {
          // Fallback: get net from balance transaction (also exact)
          const charge = paymentIntent.charges.data[0];
          if (charge.balance_transaction) {
            // If balance_transaction is expanded, use it directly
            if (charge.balance_transaction.net) {
              amountReceivedPence = charge.balance_transaction.net;
              console.log(`✅ Using balance_transaction.net: £${(amountReceivedPence/100).toFixed(2)} (exact net amount)`);
            } else {
              // If not expanded, retrieve it
              const balanceTransaction = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
              amountReceivedPence = balanceTransaction.net;
              console.log(`✅ Using balance_transaction.net (retrieved): £${(amountReceivedPence/100).toFixed(2)} (exact net amount)`);
            }
          } else {
            throw new Error(`PaymentIntent ${session.payment_intent} has charge but no balance_transaction. Cannot determine exact net amount.`);
          }
        } else {
          throw new Error(`PaymentIntent ${session.payment_intent} has no charges. Payment may not be fully processed. Cannot determine exact net amount.`);
        }
        
        // Final validation: ensure we have a valid amount
        if (!amountReceivedPence || amountReceivedPence <= 0) {
          throw new Error(`Invalid net amount received: ${amountReceivedPence}. Cannot proceed with transaction.`);
        }
        
        // Calculate fees for transparency
        // amountRequested is what user paid (gross, from session.amount_total or metadata.totalCharge)
        // session.amount_total is the gross amount charged to the user
        const amountRequestedPence = session.amount_total || Math.round(parseFloat(session.metadata.totalCharge || session.metadata.amount) * 100);
        const stripeFeesPence = amountRequestedPence - amountReceivedPence;
        
        // Wallet credit amount (what user wanted to add, from metadata)
        const walletCreditAmountPence = Math.round(parseFloat(session.metadata.amount) * 100);
        
        // Log the amounts for debugging
        console.log(`💰 Amount breakdown:`);
        console.log(`   User wanted to add: £${(walletCreditAmountPence/100).toFixed(2)}`);
        console.log(`   User paid (gross): £${(amountRequestedPence/100).toFixed(2)}`);
        console.log(`   Tuneable received (net): £${(amountReceivedPence/100).toFixed(2)}`);
        console.log(`   Stripe fees: £${(stripeFeesPence/100).toFixed(2)}`);
        console.log(`   Ledger will record: £${(amountReceivedPence/100).toFixed(2)} (net amount)`);
        
        // Convert to pounds for display
        const amountReceivedPounds = amountReceivedPence / 100;
        const stripeFeesPounds = stripeFeesPence / 100;
        
        // Find user first to get current balance
        const user = await User.findOne({ uuid: userId });
        
        if (!user) {
          console.error(`User not found for wallet top-up: ${userId}`);
          return res.json({ received: true }); // Still acknowledge to Stripe
        }
        
        const balanceBefore = user.balance || 0;
        
        // Calculate user aggregate PRE (total tips placed)
        const Bid = require('./models/Bid');
        const userBidsPre = await Bid.find({
          userId: user._id,
          status: 'active'
        }).lean();
        const userAggregatePre = userBidsPre.reduce((sum, bid) => sum + (bid.amount || 0), 0);
        
        // Use MongoDB transaction to ensure atomicity
        // If ledger creation fails, balance update will be rolled back
        const mongoose = require('mongoose');
        const dbSession = await mongoose.startSession();
        dbSession.startTransaction();
        
        try {
          console.log(`🔄 Starting transaction for wallet top-up: User ${userId}, Amount: £${amountReceivedPounds.toFixed(2)}`);
          
          // Update user balance with ACTUAL amount received (net after fees)
          const updatedUser = await User.findOneAndUpdate(
            { uuid: userId },
            { $inc: { balance: amountReceivedPence } },
            { new: true, session: dbSession }
          );
          
          if (!updatedUser) {
            throw new Error(`User not found after balance update: ${userId}`);
          }
          
          console.log(`✅ Balance updated in transaction: User ${userId}, new balance: £${(updatedUser.balance / 100).toFixed(2)}`);
          
          // Create wallet transaction record
          const walletTransaction = await WalletTransaction.create([{
            userId: updatedUser._id,
            user_uuid: updatedUser.uuid,
            amount: amountReceivedPence,
            type: 'topup',
            status: 'completed',
            paymentMethod: 'stripe',
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent,
            balanceBefore: balanceBefore,
            balanceAfter: updatedUser.balance,
            description: `Wallet top-up via Stripe (net: £${amountReceivedPounds.toFixed(2)})`,
            username: updatedUser.username,
            metadata: {
              currency: session.currency || 'gbp',
              customerEmail: session.customer_email,
              customerDetails: session.customer_details,
              amountRequested: amountRequestedPence,
              amountReceived: amountReceivedPence,
              stripeFees: stripeFeesPence,
              stripeFeesPounds: stripeFeesPounds.toFixed(2),
              isLiveMode: isLiveMode
            }
          }], { session: dbSession });
          
          const walletTx = walletTransaction[0];
          console.log(`✅ Wallet transaction created in transaction: ${walletTx._id} for user ${userId}`);
          
          // Store verification hash (non-critical, don't fail transaction if this fails)
          try {
            const verificationService = require('./services/transactionVerificationService');
            await verificationService.storeVerificationHash(walletTx, 'WalletTransaction');
          } catch (verifyError) {
            console.error('Failed to store verification hash (non-critical):', verifyError);
          }
          
          // Create ledger entry - THIS IS CRITICAL, transaction will fail if this fails
          console.log(`📝 Creating ledger entry in transaction: User ${userId}, Amount: £${amountReceivedPounds.toFixed(2)}`);
          
          if (!updatedUser._id) {
            throw new Error('updatedUser._id is missing');
          }
          if (typeof amountReceivedPence !== 'number' || isNaN(amountReceivedPence)) {
            throw new Error(`Invalid amountReceivedPence: ${amountReceivedPence}`);
          }
          if (typeof balanceBefore !== 'number' || isNaN(balanceBefore)) {
            throw new Error(`Invalid balanceBefore: ${balanceBefore}`);
          }
          if (typeof userAggregatePre !== 'number' || isNaN(userAggregatePre)) {
            throw new Error(`Invalid userAggregatePre: ${userAggregatePre}`);
          }
          
          // Create ledger entry directly with session support
          const TuneableLedger = require('./models/TuneableLedger');
          const globalAggregatePre = await TuneableLedger.aggregate([
            { $match: { transactionType: { $in: ['TIP', 'TOP_UP'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
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
            amount: amountReceivedPence,
            userBalancePre: balanceBefore,
            userBalancePost: balanceBefore + amountReceivedPence,
            userAggregatePre: userAggregatePre,
            userAggregatePost: userAggregatePre, // Top-up doesn't change aggregate
            mediaAggregatePre: 0,
            mediaAggregatePost: 0,
            globalAggregatePre: globalAggregateValue,
            globalAggregatePost: globalAggregateValue, // Top-up doesn't change global aggregate
            referenceTransactionId: walletTx._id,
            referenceTransactionType: 'WalletTransaction',
            username: updatedUser.username,
            mediaTitle: null,
            partyName: null,
            description: `Top-up of £${amountReceivedPounds.toFixed(2)}`,
            metadata: {
              stripeSessionId: session.id,
              stripePaymentIntentId: session.payment_intent,
              currency: session.currency || 'gbp',
              customerEmail: session.customer_email,
              customerDetails: session.customer_details,
              amountRequested: amountRequestedPence,
              amountReceived: amountReceivedPence,
              stripeFees: stripeFeesPence,
              isLiveMode: isLiveMode,
              walletTransactionCreated: true
            }
          });
          
          await ledgerEntry.save({ session: dbSession });
          console.log(`✅ Ledger entry created in transaction: Entry ID ${ledgerEntry._id}, User ${userId}`);
          
          // Store verification hash for ledger (non-critical)
          try {
            const verificationService = require('./services/transactionVerificationService');
            await verificationService.storeVerificationHash(ledgerEntry, 'TuneableLedger');
          } catch (verifyError) {
            console.error('Failed to store verification hash for ledger (non-critical):', verifyError);
          }
          
          // Commit the transaction - all operations succeed or all fail
          await dbSession.commitTransaction();
          console.log(`✅ Transaction committed successfully: User ${userId} requested £${(amountRequestedPence / 100).toFixed(2)}, received £${amountReceivedPounds.toFixed(2)} (fees: £${stripeFeesPounds.toFixed(2)}), new balance: £${(updatedUser.balance / 100).toFixed(2)}`);
          
          // Send email notification (non-critical, don't fail if this fails)
          try {
            await sendPaymentNotification(updatedUser, amountReceivedPounds);
          } catch (emailError) {
            console.error('Failed to send payment notification email (non-critical):', emailError);
          }
          
          // Only respond to Stripe after successful transaction
          // This ensures we don't acknowledge if anything failed
          return res.json({ received: true });
          
        } catch (transactionError) {
          // Rollback the transaction - balance update will be undone
          await dbSession.abortTransaction();
          console.error('❌ Transaction failed, rolling back:', transactionError);
          console.error('Transaction error details:', {
            message: transactionError.message,
            stack: transactionError.stack,
            stripeSessionId: session.id,
            userId: userId
          });
          
          // Re-throw to trigger error response to Stripe (so it retries)
          throw transactionError;
        } finally {
          // Always end the session
          await dbSession.endSession();
        }
      } catch (error) {
        console.error('❌ Error processing wallet top-up webhook:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          sessionId: session.id,
          userId: session.metadata?.userId
        });
        
        // If transaction failed, respond with 500 so Stripe retries
        // This ensures we get another chance to process the payment
        return res.status(500).json({ 
          error: 'Failed to process webhook',
          message: error.message 
        });
      }
    } else if (session.metadata && session.metadata.type === 'share_purchase') {
      console.log(`✅ Share purchase successful: User ${session.metadata.userId}`);
    } else {
      console.log(`⚠️ Unhandled checkout session type: ${session.metadata?.type || 'no metadata'}`);
    }
  } else {
    console.log(`⚠️ Unhandled webhook event type: ${event.type}`);
    // For unhandled events, still acknowledge to Stripe
    return res.json({ received: true });
  }

  // If we get here and haven't responded yet, acknowledge receipt
  // (This should only happen for non-wallet-topup events that don't return early)
  if (!res.headersSent) {
    res.json({ received: true });
  }
});
console.log('Webhook route registered directly on app (raw body preserved).');

// Add routes
console.log('Registering API routes...');
app.use('/api/search', searchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/parties', partyRoutes); // Unified party and playlist functionality
app.use('/api/media', mediaRoutes); // Media routes (top-tunes, etc.)
app.use('/api/songs', mediaRoutes); // Backward compatibility - routes to same Media handlers
app.use('/api/payments', paymentRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/auth', authRoutes); // OAuth routes
app.use('/api/podcasts', podcastRoutes); // Consolidated Podcast routes
app.use('/api/youtube-import', youtubeImportRoutes); // YouTube bulk import routes
app.use('/api/bid-metrics', bidMetricsRoutes); // Bid metrics API routes
app.use('/api/claims', require('./routes/claimRoutes')); // Tune ownership claims
app.use('/api/creator', creatorRoutes); // Creator application routes
app.use('/api/reports', reportRoutes); // Report routes
app.use('/api/email', emailRoutes); // Email routes
app.use('/api/labels', labelRoutes); // Label routes
app.use('/api/collectives', collectiveRoutes); // Collective routes
app.use('/api/notifications', notificationRoutes); // Notification routes
app.use('/api/artist-escrow', require('./routes/artistEscrowRoutes')); // Artist escrow routes
app.use('/api/verification', require('./routes/verificationRoutes')); // Transaction verification routes
app.use('/api/ledger', require('./routes/ledgerRoutes')); // Ledger management routes
app.use('/api/webhooks/instagram', instagramWebhooks); // Instagram webhooks
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
console.log('API routes registered.');

// API route handler - return 404 for non-API routes
app.get('*', (req, res) => {
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  // For non-API routes, redirect to frontend or return a simple message
  res.status(404).json({ 
    error: 'Route not found', 
    message: 'This is the backend API. Please use the frontend application.',
    frontend_url: process.env.FRONTEND_URL || 'http://localhost:5173'
  });
});

// Centralized error handling middleware (with CORS headers on error responses)
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  // Ensure CORS headers are set even in error responses
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server only if this file is run directly
let server;
if (require.main === module) {
  console.log(`Node.js version: ${process.version}`);
  server = app.listen(PORT, () => {
    console.log(`Server running on PORT ${PORT}`);
    
    // Set up Socket.IO server for real-time notifications and party updates
    initializeSocketIO(server);
    console.log('✅ Socket.IO server initialized (for notifications and party updates).');
  });
}

// Export app
module.exports = { app };
