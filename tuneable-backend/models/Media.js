const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const mediaSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  
  // Core identification
  title: { type: String, required: true },
  
  // PRIMARY CREATORS (headline artists - array of subdocuments)
  artist: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  // Flexible classification system
  contentType: { 
    type: [String], 
    enum: ['music', 'spoken', 'video', 'image', 'written', 'interactive'],
    required: true 
  },
  
  contentForm: { 
    type: [String], 
    enum: ['tune', 'album', 'podcast', 'episode', 'audiobook', 'interview', 
           'performance', 'mix', 'remix', 'meme', 'article', 'book', 'video'],
    required: true 
  },
  
  mediaType: { 
    type: [String], 
    enum: ['mp3', 'wav', 'flac', 'mp4', 'mov', 'avi', 'jpeg', 'png', 'gif', 
           'pdf', 'epub', 'html', 'json'],
    required: true 
  },
  
  // Flexible metadata (conditional based on contentType)
  duration: { type: Number }, // For time-based media
  fileSize: { type: Number }, // For all media types
  
  // ROLE-SPECIFIC CREATORS (music)
  producer: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  featuring: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  songwriter: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  composer: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  // ROLE-SPECIFIC CREATORS (spoken content)
  host: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  guest: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  narrator: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  // ROLE-SPECIFIC CREATORS (video)
  director: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  cinematographer: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  editor: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  // ROLE-SPECIFIC CREATORS (written content)
  author: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  // AUTO-GENERATED: All creator names for search/discovery
  creatorNames: { type: [String], default: [] },
  
  // Technical metadata (music-specific)
  // mediaOwners: Array of users with ownership percentages for revenue distribution
  mediaOwners: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    percentage: { type: Number, min: 0, max: 100, required: true },
    role: { 
      type: String, 
      enum: ['primary', 'secondary', 'label', 'distributor'],
      default: 'primary'
    },
    verified: { type: Boolean, default: false },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who added this ownership claim
    addedAt: { type: Date, default: Date.now },
    _id: false
  }],
  explicit: { type: Boolean, default: false }, // Explicit content flag
  isrc: { type: String, default: null }, // International Standard Recording Code
  upc: { type: String, default: null }, // Universal Product Code
  lyrics: { type: String }, // lyrics
  transcript: { type: String }, // Podcast/video transcript
  bpm: { type: Number },
  key: { type: String },
  pitch: { type: Number, default: 440 },
  timeSignature: { type: String, default: '4/4' },
  bitrate: { type: Number },
  sampleRate: { type: Number },
  elements: { type: [String], default: [] }, // Instrument/element tags
  
  // Technical metadata (video/image-specific)
  resolution: { type: String }, // e.g., "1920x1080"
  aspectRatio: { type: String }, // e.g., "16:9"
  colorSpace: { type: String },
  
  // Technical metadata (written content-specific)
  pages: { type: Number },
  wordCount: { type: Number },
  language: { type: String, default: 'en' },
  
  // Universal fields
  coverArt: { type: String },
  description: { type: String },
  tags: { type: [String], default: [] },
  genres: { type: [String], default: [] }, // Multiple genres (was singular 'genre')
  category: { type: String, default: null }, // YouTube category name (mapped from categoryId)
  
  // Release information
  album: { type: String },
  EP: { type: String },
  releaseDate: { type: Date, default: null },
  
  // Label/Publisher (hybrid subdocument)
  label: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    labelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Label', default: null }, // Reference to Label model
    verified: { type: Boolean, default: false },
    catalogNumber: { type: String }, // Label's internal catalog number
    releaseDate: { type: Date }, // Label's release date for this media
    _id: false
  }],
  
  // Episode/Series information (for podcasts, TV shows, etc.)
  episodeNumber: { type: Number, default: null },
  seasonNumber: { type: Number, default: null },
  podcastSeries: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null }, // Reference to podcast series Media item
  
  // Platform sources (flexible map)
  sources: {
    type: Map,
    of: String,
    default: {}
  },
  
  // External platform IDs (for syncing & deduplication)
  externalIds: {
    type: Map,
    of: String,
    default: {}
  },
  
  // ========================================
  // BID METRICS (managed by BidMetricsEngine)
  // ========================================
  
  // Global scope metrics (stored for performance)
  globalMediaAggregate: { type: Number, default: 0 }, // GlobalMediaAggregate - Total bid value across all parties/users
  globalMediaBidTop: { type: Number, default: 0 }, // GlobalMediaBidTop - Highest individual bid amount
  globalMediaAggregateTop: { type: Number, default: 0 }, // GlobalMediaAggregateTop - Highest user aggregate total
  
  // Essential user references for gamification (stored for performance)
  globalMediaBidTopUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User who made the top bid
  globalMediaAggregateTopUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User with highest aggregate
  
  // Reference to bids (for populating if needed)
  bids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  
  // Reference to global bids (subset of bids array)
  globalBids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  
  // Note: Other metrics (averages, ranks, etc.) are computed on-demand
  // via the BidMetricsEngine using the bidMetricsSchema.js definitions
  
  // Universal metadata
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  addedBy_uuid: { type: String },
  uploadedAt: { type: Date, default: Date.now }, // Keep for backward compatibility (maps to createdAt)
  
  // Rights confirmation fields
  rightsCleared: { type: Boolean, default: false },
  rightsConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rightsConfirmedAt: { type: Date },
  
  playCount: { type: Number, default: 0 },
  popularity: { type: Number, default: 0 },
  
  // Relationships to other media (content graph)
  relationships: [{
    type: { 
      type: String, 
      enum: ['remix_of', 'cover_of', 'sampled_in', 'uses_sample', 'same_series', 'inspired_by', 'references', 'other'], 
      required: true 
    },
    target_uuid: { type: String, required: true }, // UUID of related Media item
    description: { type: String, default: '' }, // Optional notes
    _id: false
  }],

  // Edit history tracking for disputes and audit trail
  editHistory: [{
    editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editedAt: { type: Date, default: Date.now },
    changes: [{
      field: { type: String, required: true },
      oldValue: { type: mongoose.Schema.Types.Mixed },
      newValue: { type: mongoose.Schema.Types.Mixed }
    }],
    _id: false
  }]
}, { 
  timestamps: true // Automatically manage createdAt and updatedAt
});

// Auto-populate `creatorNames` and auto-verify creators
mediaSchema.pre('save', function (next) {
  // Auto-populate creatorNames from all role fields
  const names = new Set();
  
  const roleFields = [
    'artist', 'producer', 'featuring', 'songwriter', 'composer',
    'host', 'guest', 'narrator',
    'director', 'cinematographer', 'editor',
    'author', 'label'
  ];
  
  roleFields.forEach(field => {
    if (this[field] && Array.isArray(this[field])) {
      this[field].forEach(creator => {
        if (creator && creator.name) {
          names.add(creator.name);
          
          // Auto-verify: if creator's userId matches addedBy, set verified to true
          if (creator.userId && this.addedBy && creator.userId.toString() === this.addedBy.toString()) {
            creator.verified = true;
          }
        }
      });
    }
  });
  
  this.creatorNames = Array.from(names);
  next();
});

// Indexes for performance
mediaSchema.index({ globalMediaAggregate: -1 });
mediaSchema.index({ globalMediaBidTop: -1 });
mediaSchema.index({ globalMediaAggregateTop: -1 });
mediaSchema.index({ addedBy: 1 });
mediaSchema.index({ "sources.youtube": 1 });
mediaSchema.index({ contentType: 1 });
mediaSchema.index({ contentForm: 1 });
mediaSchema.index({ creatorNames: 1 }); // Index for searching by creator name
mediaSchema.index({ "artist.name": 1 }); // Index for artist name searches
mediaSchema.index({ "artist.userId": 1 }); // Index for verified artists
mediaSchema.index({ "artist.verified": 1 }); // Index for verified artist queries
mediaSchema.index({ "producer.name": 1 });
mediaSchema.index({ "producer.userId": 1 });
mediaSchema.index({ "producer.verified": 1 }); // Index for verified producer queries
mediaSchema.index({ "author.verified": 1 }); // Index for verified author queries
mediaSchema.index({ "label.name": 1 }); // Index for label searches
mediaSchema.index({ "label.userId": 1 }); // Index for verified labels
mediaSchema.index({ "label.labelId": 1 }); // Index for Label model references
mediaSchema.index({ album: 1 }); // Index for album searches
mediaSchema.index({ genres: 1 }); // Multi-key index for genres (each genre indexed separately)
mediaSchema.index({ tags: 1, globalMediaAggregate: -1 }); // Compound index for tag rankings
mediaSchema.index({ releaseDate: -1 }); // Index for release date sorting
mediaSchema.index({ episodeNumber: 1, seasonNumber: 1 }); // Index for episode/season queries
mediaSchema.index({ podcastSeries: 1 }); // Index for podcast series lookups
mediaSchema.index({ "externalIds.podcastIndex": 1 }); // Index for Podcast Index lookups
mediaSchema.index({ "externalIds.taddy": 1 }); // Index for Taddy UUID lookups
mediaSchema.index({ "externalIds.iTunes": 1 }); // Index for iTunes lookups
mediaSchema.index({ "externalIds.rssGuid": 1 }); // Index for RSS GUID lookups
mediaSchema.index({ "relationships.type": 1 }); // Index for relationship type queries
mediaSchema.index({ "relationships.target_uuid": 1 }); // Index for finding relationships to specific media
mediaSchema.index({ "mediaOwners.userId": 1 }); // Index for finding media by owner
mediaSchema.index({ "mediaOwners.verified": 1 }); // Index for verified owners
mediaSchema.index({ "editHistory.editedBy": 1 }); // Index for finding edits by user
mediaSchema.index({ "editHistory.editedAt": -1 }); // Index for recent edits
mediaSchema.index({ title: 'text', description: 'text' });

// Virtual for formatted duration
mediaSchema.virtual('formattedDuration').get(function() {
  if (!this.duration) return null;
  
  const hours = Math.floor(this.duration / 3600);
  const minutes = Math.floor((this.duration % 3600) / 60);
  const seconds = this.duration % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for formatted artists (primary creators)
mediaSchema.virtual('formattedArtists').get(function() {
  if (!this.artist || this.artist.length === 0) return 'Unknown Artist';
  if (this.artist.length === 1) return this.artist[0].name;
  if (this.artist.length === 2) return `${this.artist[0].name} & ${this.artist[1].name}`;
  return `${this.artist[0].name} feat. ${this.artist.slice(1).map(a => a.name).join(', ')}`;
});

// Virtual for primary artist name (for backward compatibility)
mediaSchema.virtual('primaryArtist').get(function() {
  return this.artist && this.artist.length > 0 ? this.artist[0].name : 'Unknown Artist';
});

// Virtual for media summary (compact representation)
mediaSchema.virtual('summary').get(function() {
  // Get top 10 bids sorted by amount
  let topBids = [];
  if (this.bids && this.bids.length > 0) {
    // Sort bids by amount (descending) and take top 10
    topBids = [...this.bids]
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, 10)
      .map(bid => ({
        amount: bid.amount,
        user: bid.userId?.username || bid.userId
      }));
  }
  
  return {
    uuid: this.uuid,
    title: this.title,
    artist: this.formattedArtists,
    coverArt: this.coverArt,
    contentType: this.contentType,
    contentForm: this.contentForm,
    globalMediaAggregate: this.globalMediaAggregate || 0,
    topBids
  };
});

// Virtual for mediaOwners with populated usernames
mediaSchema.virtual('mediaOwnersWithUsernames').get(function() {
  if (!this.mediaOwners || this.mediaOwners.length === 0) return [];
  
  return this.mediaOwners.map(owner => ({
    ...owner.toObject(),
    username: owner.userId?.username || 'Unknown User',
    addedByUsername: owner.addedBy?.username || 'Unknown User'
  }));
});

// Virtual for editHistory with populated usernames
mediaSchema.virtual('editHistoryWithUsernames').get(function() {
  if (!this.editHistory || this.editHistory.length === 0) return [];
  
  return this.editHistory.map(edit => ({
    ...edit.toObject(),
    editedByUsername: edit.editedBy?.username || 'Unknown User'
  }));
});

// Schema method: Get all verified creators across all roles
mediaSchema.methods.getVerifiedCreators = function() {
  const verifiedCreators = [];
  const roleFields = [
    'artist', 'producer', 'featuring', 'songwriter', 'composer',
    'host', 'guest', 'narrator',
    'director', 'cinematographer', 'editor',
    'author', 'label'
  ];
  
  roleFields.forEach(role => {
    if (this[role] && Array.isArray(this[role])) {
      this[role].forEach(creator => {
        if (creator && creator.verified === true) {
          verifiedCreators.push({
            role,
            name: creator.name,
            userId: creator.userId
          });
        }
      });
    }
  });
  
  return verifiedCreators;
};

// Schema method: Get verified creators with ownership information
mediaSchema.methods.getVerifiedCreatorsWithOwnership = function() {
  const verifiedCreators = this.getVerifiedCreators();
  
  return verifiedCreators.map(creator => {
    const owner = this.mediaOwners.find(o => 
      o.userId.toString() === creator.userId.toString()
    );
    
    return {
      ...creator,
      ownershipPercentage: owner ? owner.percentage : 0,
      ownershipRole: owner ? owner.role : null,
      isMediaOwner: !!owner
    };
  });
};

// Schema method: Get all pending (unverified) creators across all roles
mediaSchema.methods.getPendingCreators = function() {
  const pendingCreators = [];
  const roleFields = [
    'artist', 'producer', 'featuring', 'songwriter', 'composer',
    'host', 'guest', 'narrator',
    'director', 'cinematographer', 'editor',
    'author', 'label'
  ];
  
  roleFields.forEach(role => {
    if (this[role] && Array.isArray(this[role])) {
      this[role].forEach(creator => {
        if (creator && creator.verified === false) {
          pendingCreators.push({
            role,
            name: creator.name,
            userId: creator.userId
          });
        }
      });
    }
  });
  
  return pendingCreators;
};

// Schema method: Add a media owner
mediaSchema.methods.addMediaOwner = function(userId, percentage, role = 'primary', addedBy) {
  // Check if user is already an owner
  const existingOwner = this.mediaOwners.find(owner => 
    owner.userId.toString() === userId.toString()
  );
  
  if (existingOwner) {
    throw new Error('User is already a media owner');
  }
  
  // Validate percentage doesn't exceed 100% total
  const currentTotal = this.mediaOwners.reduce((sum, owner) => sum + owner.percentage, 0);
  if (currentTotal + percentage > 100) {
    throw new Error('Total ownership percentage cannot exceed 100%');
  }
  
  this.mediaOwners.push({
    userId,
    percentage,
    role,
    verified: false,
    addedBy: addedBy || userId,
    addedAt: new Date()
  });
  
  return this;
};

// Schema method: Remove a media owner
mediaSchema.methods.removeMediaOwner = function(userId) {
  const ownerIndex = this.mediaOwners.findIndex(owner => 
    owner.userId.toString() === userId.toString()
  );
  
  if (ownerIndex === -1) {
    throw new Error('User is not a media owner');
  }
  
  this.mediaOwners.splice(ownerIndex, 1);
  return this;
};

// Schema method: Update media owner percentage
mediaSchema.methods.updateOwnerPercentage = function(userId, newPercentage) {
  const owner = this.mediaOwners.find(owner => 
    owner.userId.toString() === userId.toString()
  );
  
  if (!owner) {
    throw new Error('User is not a media owner');
  }
  
  // Validate new total doesn't exceed 100%
  const currentTotal = this.mediaOwners.reduce((sum, o) => sum + o.percentage, 0);
  const newTotal = currentTotal - owner.percentage + newPercentage;
  
  if (newTotal > 100) {
    throw new Error('Total ownership percentage cannot exceed 100%');
  }
  
  owner.percentage = newPercentage;
  return this;
};

// Schema method: Get total ownership percentage
mediaSchema.methods.getTotalOwnershipPercentage = function() {
  return this.mediaOwners.reduce((sum, owner) => sum + owner.percentage, 0);
};

module.exports = mongoose.models.Media || mongoose.model('Media', mediaSchema);
