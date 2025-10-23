const mongoose = require('mongoose');

const podcastEpisodeSchema = new mongoose.Schema({
  // Basic episode information
  title: { type: String, required: true },
  description: { type: String, default: '' },
  summary: { type: String, default: '' },
  
  // Podcast information
  podcastTitle: { type: String, required: true },
  podcastId: { type: String, required: true }, // External podcast ID
  podcastImage: { type: String, default: null },
  podcastAuthor: { type: String, default: '' },
  podcastCategory: { type: String, default: '' },
  
  // Episode details
  episodeNumber: { type: Number, default: null },
  seasonNumber: { type: Number, default: null },
  duration: { type: Number, required: true }, // Duration in seconds
  explicit: { type: Boolean, default: false },
  
  // Audio sources
  audioUrl: { type: String, required: false },
  audioType: { type: String, default: 'audio/mpeg' }, // MIME type
  audioSize: { type: Number, default: null }, // File size in bytes
  
  // Publication info
  publishedAt: { type: Date, required: true },
  guid: { type: String, required: true, unique: true }, // RSS GUID
  
  // RSS/API source
  rssUrl: { type: String, required: true },
  source: { 
    type: String, 
    enum: ['rss', 'spotify', 'apple', 'google', 'manual'],
    default: 'rss' 
  },
  
  // Tuneable-specific fields
  globalBidValue: { type: Number, default: 0 },
  bids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  
  // Metadata
  tags: [{ type: String }],
  language: { type: String, default: 'en' },
  
  // Platform-specific IDs
  spotifyId: { type: String, default: null },
  appleId: { type: String, default: null },
  googleId: { type: String, default: null },
  taddyUuid: { type: String, default: null }, // Taddy episode UUID
  podcastSeriesUuid: { type: String, default: null }, // Taddy podcast series UUID
  
  // Analytics
  playCount: { type: Number, default: 0 },
  popularity: { type: Number, default: 0 },
  
  // User who added this episode
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Timestamps
  uploadedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Indexes for performance
podcastEpisodeSchema.index({ title: 'text', description: 'text', summary: 'text' });
podcastEpisodeSchema.index({ podcastTitle: 'text' });
podcastEpisodeSchema.index({ publishedAt: -1 });
podcastEpisodeSchema.index({ globalBidValue: -1 });
podcastEpisodeSchema.index({ playCount: -1 });
podcastEpisodeSchema.index({ popularity: -1 });
podcastEpisodeSchema.index({ podcastId: 1 });
podcastEpisodeSchema.index({ addedBy: 1 });

// Virtual for formatted duration
podcastEpisodeSchema.virtual('formattedDuration').get(function() {
  const hours = Math.floor(this.duration / 3600);
  const minutes = Math.floor((this.duration % 3600) / 60);
  const seconds = this.duration % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for episode number display
podcastEpisodeSchema.virtual('episodeDisplay').get(function() {
  if (this.seasonNumber && this.episodeNumber) {
    return `S${this.seasonNumber}E${this.episodeNumber}`;
  } else if (this.episodeNumber) {
    return `Episode ${this.episodeNumber}`;
  }
  return '';
});

// Method to increment play count
podcastEpisodeSchema.methods.incrementPlayCount = function() {
  this.playCount += 1;
  return this.save();
};

// Method to update popularity score
podcastEpisodeSchema.methods.updatePopularity = function() {
  // Simple popularity calculation based on bids and plays
  this.popularity = (this.globalBidValue * 0.7) + (this.playCount * 0.3);
  return this.save();
};

// Static method to find episodes by podcast
podcastEpisodeSchema.statics.findByPodcast = function(podcastId) {
  return this.find({ podcastId }).sort({ publishedAt: -1 });
};

// Static method to find trending episodes
podcastEpisodeSchema.statics.findTrending = function(limit = 50) {
  return this.find()
    .sort({ popularity: -1, publishedAt: -1 })
    .limit(limit);
};

// Static method to find episodes by category
podcastEpisodeSchema.statics.findByCategory = function(category) {
  return this.find({ podcastCategory: new RegExp(category, 'i') })
    .sort({ publishedAt: -1 });
};

// Static method to search episodes
podcastEpisodeSchema.statics.search = function(query, limit = 20) {
  return this.find(
    { $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  )
  .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
  .limit(limit);
};

module.exports = mongoose.model('PodcastEpisode', podcastEpisodeSchema);
