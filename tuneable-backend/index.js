/* const express = require('express');
require('dotenv').config(); // Load environment variables
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.send('Hello, Tuneable!');
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  const userRoutes = require('./routes/userRoutes'); // Import user routes
  const partyRoutes = require('./routes/partyRoutes');
  const searchRoutes = require('./routes/search');
  const songRoutes = require('./routes/songRoutes');
  
  // Debug log before adding routes
  console.log('Adding routes...');
  
  app.use('/api/users', userRoutes);
  app.use('/api/parties', partyRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/songs', songRoutes);
  
  console.log('Routes added successfully.');

  const db = {
    connectDB: () => {
      console.log('Mock database connection successful.');
      return Promise.resolve();
    },
  };
  
  // Call the mocked function
  db.connectDB().catch((err) => {
    console.error('Error connecting to the database:', err);
  });
  
  
});
*/
const express = require('express');
const db = require('./db'); // Import the database connection module
const { setWebSocketServer, broadcast } = require('./utils/broadcast'); // Import WebSocket setup and broadcast
require('dotenv').config(); // Load environment variables from .env file
const cors = require('cors');

const app = express();

const userRoutes = require('./routes/userRoutes'); // Import user routes
const partyRoutes = require('./routes/partyRoutes'); // Unified party and playlist functionality
const searchRoutes = require('./routes/search'); // Import search routes
const songRoutes = require('./routes/songRoutes'); // Import song routes

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

// Explicit CORS configuration
app.use(cors({
  origin: 'http://localhost:3000', // Allow only frontend requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
  credentials: true, // Allow credentials if needed
}));
console.log('CORS enabled for http://localhost:3000');

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
app.use('/api/parties', songRoutes); // Mount song-specific routes
console.log('API routes registered.');

// Fallback for unknown routes
app.use((req, res, next) => {
  console.error(`404 Error: Route not found - ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found' });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server only if this file is run directly
let server;
if (require.main === module) {
  console.log(`Node.js version: ${process.version}`);
  server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Initialize WebSocket Server
  setWebSocketServer(server);
  console.log('WebSocket server initialized.');
}

// Export app and broadcast function from utils
module.exports = { app, broadcast };