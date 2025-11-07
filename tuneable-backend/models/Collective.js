const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const collectiveSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  
  // Basic Info
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true }, // URL-friendly version
  description: { type: String, maxlength: 1000 },
  profilePicture: { type: String }, // URL to profile picture image
  coverImage: { type: String }, // URL to cover image
  
  // Type/Category
  type: {
    type: String,
    enum: ['band', 'collective', 'production_company', 'other'],
    default: 'collective'
  },
  
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
  
  // Collective Details
  foundedYear: { type: Number },
  genres: [String], // ['electronic', 'hip-hop', 'rock', etc.]
  subCollectives: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Collective' }],
  parentCollective: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective' },
  
  // Members (like Label's admins, but more flexible for creative roles)
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { 
      type: String, 
      enum: ['founder', 'member', 'admin'], 
      required: true,
      default: 'member'
    },
    instrument: { type: String }, // Optional: "guitar", "vocals", "producer", etc.
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date }, // For former members
    verified: { type: Boolean, default: false },
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
  
  // Bid-Centric Stats & Analytics (similar to Label)
  stats: {
    // Artist & Release Counts
    memberCount: { type: Number, default: 0 },
    releaseCount: { type: Number, default: 0 },
    
    // Bid Metrics (from bidMetricsSchema)
    // NOTE: All amounts stored in PENCE (integer), not pounds
    globalCollectiveAggregate: { type: Number, default: 0 }, // GlobalAggregate for collective's media (in pence)
    globalCollectiveBidAvg: { type: Number, default: 0 }, // GlobalBidAvg for collective's media (in pence)
    globalCollectiveBidTop: { type: Number, default: 0 }, // GlobalBidTop for collective's media (in pence)
    globalCollectiveBidCount: { type: Number, default: 0 }, // Count of all bids on collective's media
    
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
    partiesWithCollectiveMedia: { type: Number, default: 0 }, // Count of parties that have played collective's media
    partyCollectiveAggregate: { type: Number, default: 0 }, // Sum of party-scoped bids (bidScope: 'party') across all collective's media (in pence)
    
    // User Engagement
    uniqueBidders: { type: Number, default: 0 }, // Count of unique users who have bid on collective's media
    topBidders: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      username: String,
      totalBidAmount: Number,
      bidCount: Number
    }],
    
    // Time-based metrics
    lastBidAt: Date, // When the last bid was placed on any of collective's media
    firstBidAt: Date, // When the first bid was placed on any of collective's media
    
    // Ranking metrics (computed from bidMetricsSchema)
    globalRank: { type: Number }, // Rank among all collectives by total bid amount
    genreRank: { type: Number }, // Rank within genre by total bid amount
    percentile: { type: Number, min: 0, max: 100 } // Percentile ranking (0-100)
  },
  
  // Settings
  settings: {
    isPublic: { type: Boolean, default: true },
    allowMemberApplications: { type: Boolean, default: true },
    autoApproveMembers: { type: Boolean, default: false },
    showStats: { type: Boolean, default: true }, // Whether to show bid stats publicly
    allowDirectUploads: { type: Boolean, default: true } // Whether members can upload directly
  },
  
  isActive: { type: Boolean, default: true }
}, { 
  timestamps: true,
  toJSON: { virtuals: true }, 
  toObject: { virtuals: true } 
});

// Indexes for performance
collectiveSchema.index({ name: 1 });
collectiveSchema.index({ slug: 1 });
collectiveSchema.index({ email: 1 });
collectiveSchema.index({ type: 1 });
collectiveSchema.index({ 'stats.globalCollectiveAggregate': -1 });
collectiveSchema.index({ 'stats.globalRank': 1 });
collectiveSchema.index({ 'stats.genreRank': 1 });
collectiveSchema.index({ 'stats.lastBidAt': -1 });
collectiveSchema.index({ verificationStatus: 1 });
collectiveSchema.index({ genres: 1 });
collectiveSchema.index({ 'members.userId': 1 });

// Method to add member
collectiveSchema.methods.addMember = function(userId, role, addedBy, instrument = null) {
  // Check if user is already a member
  const existingMember = this.members.find(
    member => member.userId.toString() === userId.toString() && !member.leftAt
  );
  
  if (existingMember) {
    // Update existing member
    existingMember.role = role;
    existingMember.instrument = instrument;
    existingMember.joinedAt = new Date();
    existingMember.leftAt = null; // Rejoin
    existingMember.addedBy = addedBy;
  } else {
    // Add new member
    this.members.push({
      userId,
      role,
      instrument,
      joinedAt: new Date(),
      addedBy,
      verified: false
    });
  }
  return this.save();
};

// Method to remove member
collectiveSchema.methods.removeMember = function(userId) {
  const member = this.members.find(
    m => m.userId.toString() === userId.toString() && !m.leftAt
  );
  if (member) {
    member.leftAt = new Date();
  }
  return this.save();
};

// Method to check if user is member
collectiveSchema.methods.isMember = function(userId) {
  return this.members.some(
    member => member.userId.toString() === userId.toString() && !member.leftAt
  );
};

// Method to check if user is founder or admin
collectiveSchema.methods.isAdmin = function(userId) {
  return this.members.some(member => 
    member.userId.toString() === userId.toString() && 
    !member.leftAt &&
    (member.role === 'founder' || member.role === 'admin')
  );
};

// Method to check if user is founder
collectiveSchema.methods.isFounder = function(userId) {
  return this.members.some(member => 
    member.userId.toString() === userId.toString() && 
    !member.leftAt &&
    member.role === 'founder'
  );
};

// Method to update stats (called by bid metrics engine)
collectiveSchema.methods.updateStats = function(statsData) {
  Object.assign(this.stats, statsData);
  return this.save();
};

// Static method to find by slug
collectiveSchema.statics.findBySlug = function(slug) {
  return this.findOne({ slug, isActive: true });
};

// Static method to get top collectives by bid amount
collectiveSchema.statics.getTopByBidAmount = function(limit = 10) {
  return this.find({ isActive: true, 'stats.globalCollectiveAggregate': { $gt: 0 } })
    .sort({ 'stats.globalCollectiveAggregate': -1 })
    .limit(limit)
    .select('name slug profilePicture stats.globalCollectiveAggregate stats.memberCount stats.releaseCount type');
};

// Static method to get collectives by genre
collectiveSchema.statics.getByGenre = function(genre, limit = 20) {
  return this.find({ 
    isActive: true, 
    genres: genre,
    'stats.globalCollectiveAggregate': { $gt: 0 }
  })
  .sort({ 'stats.globalCollectiveAggregate': -1 })
  .limit(limit);
};

// Static method to get collectives by type
collectiveSchema.statics.getByType = function(type, limit = 20) {
  return this.find({ 
    isActive: true, 
    type: type,
    'stats.globalCollectiveAggregate': { $gt: 0 }
  })
  .sort({ 'stats.globalCollectiveAggregate': -1 })
  .limit(limit);
};

// Pre-save middleware to generate slug
collectiveSchema.pre('save', function(next) {
  // Generate slug if name is modified and slug is missing, or if it's a new document without a slug
  if ((this.isModified('name') || this.isNew) && !this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

module.exports = mongoose.model('Collective', collectiveSchema);

