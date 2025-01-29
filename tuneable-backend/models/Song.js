const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  album: { type: String },
  genre: { type: String },
  year: { type: Number },
  duration: { type: Number }, // Duration in seconds
  coverArt: { type: String }, // URL to album cover
  bids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }], // Reference Bid model
  globalBidValue: { type: Number, default: 0 }, // Tracks total bid amount globally
  
  // Platform-specific URLs
  sources: {
    youtube: { type: String, default: null },
    spotify: { type: String, default: null },
    soundcloud: { type: String, default: null },
    appleMusic: { type: String, default: null },
    deezer: { type: String, default: null },
    tidal: { type: String, default: null },
    mp3Upload: { type: String, default: null }, // Direct upload (if applicable)
  },

  // Technical song metadata
  bpm: { type: Number, default: null }, // Beats Per Minute
  key: { type: String, default: null }, // Musical key (e.g., C#m, G Major)
  timeSignature: { type: String, default: "4/4" }, // Default to 4/4
  releaseDate: { type: Date, default: null }, // Full release date

  // Audio properties
  bitrate: { type: Number, default: null }, // kbps
  sampleRate: { type: Number, default: null }, // Hz

  // User data
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Who added the song
  uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // Who uploaded the MP3 (optional)
  
  uploadedAt: { type: Date, default: Date.now },
  popularity: { type: Number, default: 0 },
  lyrics: { type: String, default: "" },
  tags: { type: [String], default: [] }, // Keywords for filtering
});

// Indexes for performance
songSchema.index({ "sources.youtube": 1 });
songSchema.index({ "sources.spotify": 1 });
songSchema.index({ globalBidValue: -1 });
songSchema.index({ addedBy: 1 }); // If frequently filtering by user

module.exports = mongoose.models.Song || mongoose.model('Song', songSchema);
