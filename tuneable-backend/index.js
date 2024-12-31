// Import Express and other dependencies
const express = require('express');
const db = require('./db'); // Import the database connection module
const { setWebSocketServer, broadcast } = require('./utils/broadcast'); // Import WebSocket setup and broadcast
require('dotenv').config(); // Load environment variables from .env file
const cors = require('cors'); // Add this if using a frontend from a different domain

const app = express();

// User, playlist, and party routes
const userRoutes = require('./routes/userRoutes');
const playlistRoutes = require('./routes/playlistRoutes');
const partyRoutes = require('./routes/partyRoutes');
const youtubeRoutes = require('./routes/youtube'); // Import the YouTube API routes

// Use environment variable for port or default to 8000
const PORT = process.env.PORT || 8000;

// Connect to the database
db.connectDB().catch((err) => {
  console.error('Error connecting to the database:', err);
  process.exit(1);
});

// Middleware to parse JSON bodies and handle CORS
app.use(express.json());
app.use(cors());

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
app.use('/api/users', userRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/parties', partyRoutes);
app.use('/api/youtube', youtubeRoutes); // Add the YouTube routes here

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
