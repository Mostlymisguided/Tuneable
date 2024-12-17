// Import Express and other dependencies
const express = require('express');
const connectDB = require('./db'); // Import the database connection module
require('dotenv').config(); // Load environment variables from .env file

const app = express();
// user and playlist routes
const userRoutes = require('./routes/userRoutes');
const playlistRoutes = require('./routes/playlistRoutes');

// Use environment variable for port or default to 3000
const PORT = process.env.PORT || 3000;

// Connect to the database
connectDB().catch((err) => {
  console.error('Error connecting to the database:', err);
  process.exit(1); // Exit the application if DB connection fails
});

// Middleware to parse JSON bodies
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.send('Hello, Tuneable!');
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

app.use('/api/users', userRoutes);
app.use('/api/playlists', playlistRoutes);


// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});