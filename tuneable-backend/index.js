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

// Middleware to parse JSON bodies
app.use(express.json());
console.log('JSON body parsing middleware added.');

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
