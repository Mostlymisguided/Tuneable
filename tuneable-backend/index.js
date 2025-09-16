const express = require('express');
const db = require('./db'); // Import the database connection module
const { setWebSocketServer, broadcast } = require('./utils/broadcast'); // Import WebSocket setup and broadcast
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: envFile });

console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGO_URI:', process.env.MONGO_URI);

const cors = require('cors');
const path = require('path');

const app = express();

const userRoutes = require('./routes/userRoutes'); // Import user routes
const partyRoutes = require('./routes/partyRoutes'); // Unified party and playlist functionality
const searchRoutes = require('./routes/searchRoutes'); // Import search routes
const songRoutes = require('./routes/songRoutes'); // Import song routes
const paymentRoutes = require('./routes/paymentRoutes');
const youtubeRoutes = require('./routes/youtube');

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
const allowedOrigins = ['http://localhost:3000', 'http://tuneable.com', 'https://tuneable.com'];

// Define CORS options (temporary: allow all origins for MVP + Base44 integration)
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
app.use('/api/songs', songRoutes); // Tunefeed route
app.use('/api/payments', paymentRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
console.log('API routes registered.');

// Serve static files from the React web directory
app.use(express.static(path.join(__dirname, 'web')));

// Catch-all route for non-API requests to serve React's index.html
app.get('*', (req, res) => {
  if (req.url.startsWith('/api')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
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
    
    // Set up WebSocket server after the HTTP server is ready
    setWebSocketServer(server);
    console.log('✅ WebSocket server initialized.');
  });
}

// Export app and broadcast function from utils
module.exports = { app, broadcast };
