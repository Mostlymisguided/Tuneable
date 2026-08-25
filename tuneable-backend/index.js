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
const bookRoutes = require('./routes/bookRoutes');
const bidMetricsRoutes = require('./routes/bidMetricsRoutes'); // Import bid metrics routes
const instagramWebhooks = require('./routes/instagramWebhooks'); // Instagram webhooks
const creatorRoutes = require('./routes/creatorRoutes'); // Import creator application routes
const reportRoutes = require('./routes/reportRoutes'); // Report routes
const emailRoutes = require('./routes/emailRoutes'); // Email routes
const labelRoutes = require('./routes/labelRoutes'); // Import label routes
const gearRoutes = require('./routes/gearRoutes'); // Production gear catalog
const tagRoutes = require('./routes/tagRoutes'); // Tag profile pages
const artistRoutes = require('./routes/artistRoutes'); // Artist champions
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
    logMemory('mongo-connected');
    const { recoverPendingBidWork } = require('./services/bidBackgroundRecoveryService');
    setImmediate(() => {
      recoverPendingBidWork().catch((error) => {
        console.error('Failed to recover pending bid background work:', error);
      });
    });

    // Optional ongoing tags + location drip (ENRICHMENT_DRIP_ENABLED=true)
    try {
      const { startEnrichmentDripCron } = require('./services/enrichmentDripService');
      startEnrichmentDripCron();
    } catch (error) {
      console.error('Failed to start enrichment drip cron:', error);
    }

    try {
      const { startPromoEscrowExpiryCron } = require('./services/welcomePromoEscrowService');
      startPromoEscrowExpiryCron();
    } catch (error) {
      console.error('Failed to start promo escrow expiry cron:', error);
    }
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
  // Capacitor native shell (WebView origin)
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'ionic://localhost',
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
// Reuse one parser instance — calling express.json() per request leaks memory.
const jsonParser = express.json();
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
  return jsonParser(req, res, next);
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
  // NOTE: Share purchases always use live mode, so they will fail test verification and fall through to live
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
    // CRITICAL: Share purchases always use live mode, so STRIPE_WEBHOOK_SECRET_LIVE MUST be configured
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
      const errorMsg = `❌ Webhook signature verification failed. Test error: ${testErr.message}. Live mode not configured or STRIPE_WEBHOOK_SECRET_LIVE missing. NOTE: Share purchases require STRIPE_WEBHOOK_SECRET_LIVE to be configured.`;
      console.error(errorMsg);
      return res.status(400).send(`Webhook Error: ${testErr.message}. Live webhook secret required for share purchases.`);
    }
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`📦 Checkout session completed: Session ID ${session.id}, Metadata:`, session.metadata);
    
    if (session.metadata && session.metadata.type === 'wallet_topup') {
      try {
        const { fulfillStripeCheckoutSession } = require('./services/walletTopUpService');
        const stripe = isLiveMode ? stripeLive : stripeTest;
        const result = await fulfillStripeCheckoutSession({ stripe, session, isLiveMode });
        if (result.alreadyProcessed) {
          return res.json({ received: true, message: 'Already processed' });
        }
        if (result.skipped) {
          console.error(`⚠️ Wallet top-up webhook skipped: ${result.reason}`);
          return res.json({ received: true, message: result.reason || 'skipped' });
        }
        return res.json({ received: true });
      } catch (error) {
        console.error('❌ Error processing wallet top-up webhook:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          sessionId: session.id,
          userId: session.metadata?.userId
        });
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
  } else if (event.type === 'charge.refunded') {
    try {
      const charge = event.data.object;
      const paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
      const fullyRefunded =
        charge.refunded === true ||
        (Number(charge.amount_refunded || 0) >= Number(charge.amount || 0) &&
          Number(charge.amount || 0) > 0);

      if (!paymentIntentId || !fullyRefunded) {
        return res.json({ received: true });
      }

      const WalletTransaction = require('./models/WalletTransaction');
      const tx = await WalletTransaction.findOne({
        stripePaymentIntentId: paymentIntentId,
        type: 'topup',
        paymentMethod: 'stripe',
      });

      if (!tx) {
        return res.json({ received: true });
      }

      if (tx.status === 'completed') {
        tx.status = 'refunded';
        await tx.save();
      }

      const { unconvertPromoEscrowIfNoPaidTopUp } = require('./services/welcomePromoEscrowService');
      await unconvertPromoEscrowIfNoPaidTopUp(tx.userId);
      console.log(`⚠️ Stripe charge refunded for top-up ${tx._id}; promo escrow unconvert checked`);
    } catch (refundErr) {
      console.error('Failed to handle charge.refunded for promo escrow:', refundErr);
    }
    return res.json({ received: true });
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
app.use('/api/books', bookRoutes);
app.use('/api/bid-metrics', bidMetricsRoutes); // Bid metrics API routes
app.use('/api/claims', require('./routes/claimRoutes')); // Tune ownership claims
app.use('/api/creator', creatorRoutes); // Creator application routes
app.use('/api/reports', reportRoutes); // Report routes
app.use('/api/email', emailRoutes); // Email routes
app.use('/api/labels', labelRoutes); // Label routes
app.use('/api/gear', gearRoutes); // Production gear catalog
app.use('/api/tags', tagRoutes); // Tag profile pages
app.use('/api/artists', artistRoutes); // Artist champions
app.use('/api/collectives', collectiveRoutes); // Collective routes
app.use('/api/notifications', notificationRoutes); // Notification routes
app.use('/api/conversations', require('./routes/conversationRoutes')); // Tuneable Conversations
app.use('/api/locations', require('./routes/locationRoutes')); // Mapbox location suggest/resolve
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

function logMemory(label) {
  const mem = process.memoryUsage();
  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  console.log(`🧠 ${label}: rss=${mb(mem.rss)} heap=${mb(mem.heapUsed)}/${mb(mem.heapTotal)}`);
}

let server;

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  logMemory('uncaughtException');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down');
  logMemory('SIGTERM');
  if (server) server.close(() => process.exit(0));
  else process.exit(0);
});

// Start the server only if this file is run directly
if (require.main === module) {
  console.log(`Node.js version: ${process.version}`);
  logMemory('boot');
  server = app.listen(PORT, () => {
    console.log(`Server running on PORT ${PORT}`);
    logMemory('listen');
    
    // Set up Socket.IO server for real-time notifications and party updates
    initializeSocketIO(server);
    console.log('✅ Socket.IO server initialized (for notifications and party updates).');
  });
}

// Export app
module.exports = { app };
