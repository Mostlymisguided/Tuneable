const mongoose = require('mongoose');

const songSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    artist: { type: String },
    platform: {
      type: String,
      enum: ['youtube', 'spotify', 'soundcloud', 'deezer', 'applemusic', 'tidal', 'amazonmusic'],
      required: true,
      set: (value) => value.toLowerCase(), // Normalize input to lowercase
    },
    url: { type: String, required: true },
    bids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }], // Reference Bid model
    globalBidValue: { type: Number, default: 0 }, // Tracks total bid amount globally
  },
  {
    timestamps: true, // Automatically add `createdAt` and `updatedAt`
  }
);

// Indexes for performance
songSchema.index({ platform: 1 });
songSchema.index({ globalBidValue: -1 });

module.exports = mongoose.models.Song || mongoose.model('Song', songSchema);
