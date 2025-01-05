const express = require('express');
const db = require('./db'); // Import the database connection module
const { setWebSocketServer, broadcast } = require('./utils/broadcast'); // Import WebSocket setup and broadcast
require('dotenv').config(); // Load environment variables from .env file
const cors = require('cors');

const app = express();

const searchRoutes = require('./routes/search'); // Import search routes
const userRoutes = require('./routes/userRoutes'); // Import user routes
const partyRoutes = require('./routes/partyRoutes'); // Updated to only include unified partyRoutes

// Use environment variable for port or default to 8000
const PORT = process.env.PORT || 8000;

// Connect to the database
db.connectDB().catch((err) => {
  console.error('Error connecting to the database:', err);
  process.exit(1);
});

// Explicit CORS configuration
app.use(cors({
  origin: 'http://localhost:3000', // Allow only frontend requests
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
  credentials: true, // Allow credentials if needed
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.send('Hello, Tuneable!');
});

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Add routes
app.use('/api/search', searchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/parties', partyRoutes); // Unified party and playlist functionality

// Fallback for unknown routes
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server only if this file is run directly
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Initialize WebSocket Server
  setWebSocketServer(server);
}

// Export app and broadcast function from utils
module.exports = { app, broadcast };
