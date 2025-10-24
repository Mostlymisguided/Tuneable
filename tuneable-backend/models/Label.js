const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const labelSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  
  // Basic Info
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true }, // URL-friendly version
  description: { type: String, maxlength: 1000 },
  logo: { type: String }, // URL to logo image
  coverImage: { type: String }, // URL to cover image
  
  // Contact & Location
  email: { type: String, required: true, unique: true },
  website: { type: String },
  location: {
    city: { type: String },
    country: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  
  // Social Media
  socialMedia: {
    instagram: String,
    facebook: String,
    soundcloud: String,
    spotify: String,
    youtube: String,
    twitter: String,
    tiktok: String
  },
  
  // Label Details
  foundedYear: { type: Number },
  genres: [String], // ['electronic', 'hip-hop', 'rock', etc.]
  subLabels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Label' }],
  parentLabel: { type: mongoose.Schema.Types.ObjectId, ref: 'Label' },
  
  // Management & Staff
  admins: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'moderator'], required: true },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Verification & Status
  verificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'rejected'],
    default: 'unverified'
  },
  verificationMethod: String, // 'email', 'manual', 'admin'
  verifiedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Bid-Centric Stats & Analytics (replacing play-centric metrics)
  stats: {
    // Artist & Release Counts
    artistCount: { type: Number, default: 0 },
    releaseCount: { type: Number, default: 0 },
    
    // Bid Metrics (from bidMetricsSchema)
    totalBidAmount: { type: Number, default: 0 }, // GlobalAggregate for label's media
    averageBidAmount: { type: Number, default: 0 }, // GlobalBidAvg for label's media
    topBidAmount: { type: Number, default: 0 }, // GlobalBidTop for label's media
    totalBidCount: { type: Number, default: 0 }, // Count of all bids on label's media
    
    // Media Performance (bid-centric)
    topPerformingMedia: [{
      mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
      title: String,
      artist: String,
      totalBidAmount: Number,
      bidCount: Number,
      averageBid: Number
    }],
    
    // Party Engagement
    partiesWithLabelMedia: { type: Number, default: 0 }, // Count of parties that have played label's media
    totalPartyBidAmount: { type: Number, default: 0 }, // Sum of bids across all parties for label's media
    
    // User Engagement
    uniqueBidders: { type: Number, default: 0 }, // Count of unique users who have bid on label's media
    topBidders: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      username: String,
      totalBidAmount: Number,
      bidCount: Number
    }],
    
    // Time-based metrics
    lastBidAt: Date, // When the last bid was placed on any of label's media
    firstBidAt: Date, // When the first bid was placed on any of label's media
    
    // Ranking metrics (computed from bidMetricsSchema)
    globalRank: { type: Number }, // Rank among all labels by total bid amount
    genreRank: { type: Number }, // Rank within genre by total bid amount
    percentile: { type: Number, min: 0, max: 100 } // Percentile ranking (0-100)
  },
  
  // Settings
  settings: {
    isPublic: { type: Boolean, default: true },
    allowArtistApplications: { type: Boolean, default: true },
    autoApproveArtists: { type: Boolean, default: false },
    showStats: { type: Boolean, default: true }, // Whether to show bid stats publicly
    allowDirectUploads: { type: Boolean, default: true } // Whether artists can upload directly
  },
  
  // Followers & Social
  followers: [{ 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    followedAt: { type: Date, default: Date.now }
  }],
  followerCount: { type: Number, default: 0 },
  
  isActive: { type: Boolean, default: true }
}, { 
  timestamps: true,
  toJSON: { virtuals: true }, 
  toObject: { virtuals: true } 
});

// Indexes for performance
labelSchema.index({ name: 1 });
labelSchema.index({ slug: 1 });
labelSchema.index({ email: 1 });
labelSchema.index({ 'stats.totalBidAmount': -1 });
labelSchema.index({ 'stats.globalRank': 1 });
labelSchema.index({ 'stats.genreRank': 1 });
labelSchema.index({ 'stats.lastBidAt': -1 });
labelSchema.index({ verificationStatus: 1 });
labelSchema.index({ genres: 1 });
labelSchema.index({ 'admins.userId': 1 });

// Follower count is already a field in the schema, no virtual needed

// Method to add admin
labelSchema.methods.addAdmin = function(userId, role, addedBy) {
  const existingAdmin = this.admins.find(admin => admin.userId.toString() === userId.toString());
  if (existingAdmin) {
    existingAdmin.role = role;
    existingAdmin.addedAt = new Date();
    existingAdmin.addedBy = addedBy;
  } else {
    this.admins.push({
      userId,
      role,
      addedAt: new Date(),
      addedBy
    });
  }
  return this.save();
};

// Method to remove admin
labelSchema.methods.removeAdmin = function(userId) {
  this.admins = this.admins.filter(admin => admin.userId.toString() !== userId.toString());
  return this.save();
};

// Method to check if user is admin
labelSchema.methods.isAdmin = function(userId) {
  return this.admins.some(admin => admin.userId.toString() === userId.toString());
};

// Method to check if user is owner
labelSchema.methods.isOwner = function(userId) {
  return this.admins.some(admin => 
    admin.userId.toString() === userId.toString() && admin.role === 'owner'
  );
};

// Method to update stats (called by bid metrics engine)
labelSchema.methods.updateStats = function(statsData) {
  Object.assign(this.stats, statsData);
  return this.save();
};

// Static method to find by slug
labelSchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, isActive: true });
};

// Static method to get top labels by bid amount
labelSchema.statics.getTopByBidAmount = function(limit = 10) {
  return this.find({ isActive: true, 'stats.totalBidAmount': { $gt: 0 } })
    .sort({ 'stats.totalBidAmount': -1 })
    .limit(limit)
    .select('name slug logo stats.totalBidAmount stats.artistCount stats.releaseCount');
};

// Static method to get labels by genre
labelSchema.statics.getByGenre = function(genre, limit = 20) {
  return this.find({ 
    isActive: true, 
    genres: genre,
    'stats.totalBidAmount': { $gt: 0 }
  })
  .sort({ 'stats.totalBidAmount': -1 })
  .limit(limit);
};

// Pre-save middleware to generate slug
labelSchema.pre('save', function(next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

module.exports = mongoose.model('Label', labelSchema);
