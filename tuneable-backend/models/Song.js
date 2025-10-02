const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  producer: { type: String },
  featuring: { type: [String], default: [] }, // Supports multiple featured artists
  rightsHolder: { type: String }, // Covers record labels, imprints, and publishing entities
  rightsHolderEmail: { type: String },
  album: { type: String },
  genre: { type: String },
  releaseDate: { type: Date, default: null }, // Full release date
  duration: { type: Number }, // Duration in seconds
  coverArt: { type: String }, // URL to album cover
  explicit: { type: Boolean, default: false }, // Explicit lyrics flag
  isrc: { type: String, default: null }, // International Standard Recording Code
  upc: { type: String, default: null }, // Universal Product Code

  // Global bidding system (for analytics across all parties)
  globalBids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  globalBidValue: { type: Number, default: 0 }, // Tracks total bid amount across all parties (for analytics)
  
  // Legacy field for backward compatibility (deprecated)
  bids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],

  // Platform-specific URLs (Flexible Map)
  sources: {
    type: Map,
    of: String,
    default: {}
  },

  // Technical song metadata
  bpm: { type: Number, default: null },
  pitch: { type: Number, default: null },
  key: { type: String, default: null },
  elements: { type: [String], default: [] }, // Instrument/element tags
  tags: { type: [String], default: [] }, // YouTube tags from snippet.tags
  category: { type: String, default: null }, // YouTube category name (mapped from categoryId)
  timeSignature: { type: String, default: null }, // Default to 4/4
  bitrate: { type: Number, default: null }, // kbps
  sampleRate: { type: Number, default: null }, // Hz

  // User data
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  playCount: { type: Number, default: 0 }, // Tracks number of plays in parties

  popularity: { type: Number, default: 0 },
  lyrics: { type: String, default: "" },
});

// Auto-update `updatedAt`
songSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for performance
songSchema.index({ "sources.youtube": 1 });
songSchema.index({ "sources.spotify": 1 });
songSchema.index({ globalBidValue: -1 });
songSchema.index({ addedBy: 1 });

module.exports = mongoose.models.Song || mongoose.model('Song', songSchema);
