const mongoose = require('mongoose');

// Define the track schema
const trackSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String },
  platform: {
    type: String,
    enum: ['YouTube', 'Spotify', 'SoundCloud', 'Deezer', 'Apple Music'],
    required: true,
  },
  url: { type: String, required: true },
  bid: { type: Number, default: 0 }, // Track highest bid
  bidders: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to user
      amount: { type: Number, required: true }, // Bid amount
    },
  ],
});

// Define the playlist schema
const playlistSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, minlength: 3, maxlength: 100 },
    description: { type: String },
    tracks: [trackSchema], // Embed the track schema
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false, // User is optional for now
      index: true, // Index for faster user-specific queries
    },
  },
  { timestamps: true }
);

// Add a compound index to optimize queries involving tracks and bids
playlistSchema.index({ 'tracks.bid': -1 });

// Export the model
module.exports = mongoose.model('Playlist', playlistSchema);
