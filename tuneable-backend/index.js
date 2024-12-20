// Import Express and other dependencies
const express = require('express');
const connectDB = require('./db'); // Import the database connection module
require('dotenv').config(); // Load environment variables from .env file
const cors = require('cors'); // Add this if using a frontend from a different domain

const app = express();

// User and playlist routes
const userRoutes = require('./routes/userRoutes');
const playlistRoutes = require('./routes/playlistRoutes');

// Use environment variable for port or default to 3000
const PORT = process.env.PORT || 3000;

// Connect to the database
connectDB().catch((err) => {
  console.error('Error connecting to the database:', err);
  process.exit(1); // Exit the application if DB connection fails
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

// Fallback for unknown routes
app.use((req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
