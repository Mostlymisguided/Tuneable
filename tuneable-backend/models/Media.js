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
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    relationToNext: { 
      type: String, 
      enum: [',', '&', 'and', 'with', 'ft.', 'feat.', 'vs.', 'x', 'X', null],
      default: null 
    }, // Controls how this artist connects to the next artist in display string
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
    enum: ['tune', 'album', 'podcast', 'podcastseries', 'episode', 'podcastepisode', 'audiobook', 'interview', 
           'performance', 'mix', 'remix', 'meme', 'article', 'book', 'video'],
    required: true 
  },
  
  mediaType: { 
    type: [String], 
    enum: ['mp3', 'wav', 'flac', 'mp4', 'mov', 'avi', 'jpeg', 'png', 'gif', 
           'pdf', 'epub', 'html', 'json', 'collection'],
    required: true 
  },
  
  // Flexible metadata (conditional based on contentType)
  duration: { type: Number }, // For time-based media
  fileSize: { type: Number }, // For all media types
  
  // ROLE-SPECIFIC CREATORS (music)
  producer: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  featuring: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  songwriter: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  composer: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  mixedBy: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  masteredBy: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  // ROLE-SPECIFIC CREATORS (spoken content)
  host: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  guest: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  narrator: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  // ROLE-SPECIFIC CREATORS (video)
  director: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  cinematographer: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  editor: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  // ROLE-SPECIFIC CREATORS (written content)
  author: [{
    name: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null }, // Reference to Collective model
    verified: { type: Boolean, default: false },
    _id: false
  }],
  
  // AUTO-GENERATED: All creator names for search/discovery
  creatorNames: { type: [String], default: [] },
  
  // AI Usage Tracking (MVP)
  aiUsage: {
    used: { type: Boolean, default: false },
    disclosure: {
      type: String,
      enum: ['none', 'partial', 'full'],
      default: 'none'
    },
    tools: [{
      category: {
        type: String,
        enum: ['generation', 'enhancement', 'mixing', 'mastering', 'composition', 'lyrics', 'other']
      },
      name: { type: String }, // e.g., "ChatGPT", "Stable Diffusion", "LANDR"
      provider: { type: String }, // e.g., "OpenAI", "Stability AI", "LANDR"
      _id: false
    }]
  },
  
  // Technical metadata (music-specific)
  // mediaOwners: Array of users with ownership percentages for revenue distribution
  mediaOwners: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    percentage: { type: Number, min: 0, max: 100, required: true },
    role: { 
      type: String, 
      enum: ['creator', 'primary', 'aux', 'publisher', 'label', 'collective'],
      default: 'creator'
    },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verificationMethod: { type: String, default: null },
    verificationNotes: { type: String, default: null },
    verificationSource: { type: String, default: null },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who added this ownership claim
    addedAt: { type: Date, default: Date.now },
    lastUpdatedAt: { type: Date, default: Date.now },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
  
  // Location fields (similar to User model)
  primaryLocation: {
    city: { type: String },
    region: { type: String }, // State, province, or region
    country: { type: String },
    countryCode: { type: String }, // ISO 3166-1 alpha-2 (e.g., "US", "GB", "FR")
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    detectedFromIP: { type: Boolean, default: false } // Track if auto-detected from IP
  },
  secondaryLocation: {
    city: { type: String },
    region: { type: String },
    country: { type: String },
    countryCode: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    }
  },
  
  // Minimum bid/tip amount (media-level override, falls back to party minimumBid if not set)
  minimumBid: {
    type: Number,
    default: null,
    min: [0.01, 'Minimum bid must be at least £0.01']
  },
  
  // Release information
  album: { type: String },
  EP: { type: String },
  releaseDate: { type: Date, default: null },
  releaseYear: { type: Number, min: 1900, max: 2100, default: null }, // Year-only option when full date is unknown
  
  // Label/Publisher (hybrid subdocument)
  label: [{
    name: { type: String, required: true },
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

  // YouTube-specific metadata tracking
  youtubeMetadata: {
    originalTitle: { type: String }, // Original title from YouTube (before manual edits)
    originalThumbnail: { type: String }, // Original thumbnail URL from YouTube
    lastRefreshedAt: { type: Date }, // Last time we checked video availability
    isAvailable: { type: Boolean, default: true }, // Whether video is still available on YouTube
    availabilityCheckedAt: { type: Date }, // Last availability check timestamp
    unavailableReason: { type: String, enum: ['deleted', 'privated', 'unavailable', null], default: null } // Why video is unavailable
  },
  
  // ========================================
  // BID METRICS (managed by BidMetricsEngine)
  // ========================================
  
  // Global scope metrics (stored for performance)
  // NOTE: All amounts stored in PENCE (integer), not pounds
  globalMediaAggregate: { type: Number, default: 0 }, // GlobalMediaAggregate - Total bid value across all parties/users (in pence)
  globalMediaBidTop: { type: Number, default: 0 }, // GlobalMediaBidTop - Highest individual bid amount (in pence)
  globalMediaAggregateTop: { type: Number, default: 0 }, // GlobalMediaAggregateTop - Highest user aggregate total (in pence)
  
  // Essential user references for gamification (stored for performance)
  globalMediaBidTopUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User who made the top bid
  globalMediaAggregateTopUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User with highest aggregate
  
  // Reference to bids (for populating if needed)
  // Contains ALL bids for this media (both party and global scope)
  // To filter by scope, use Bid.find({ mediaId: X, bidScope: 'global' }) instead
  bids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  
  // DEPRECATED: globalBids array is no longer maintained
  // Use Bid.find({ mediaId: X, bidScope: 'global' }) to get global bids
  // Kept for backward compatibility but not updated
  globalBids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  
  // Note: Other metrics (averages, ranks, etc.) are computed on-demand
  // via the BidMetricsEngine using the bidMetricsSchema.js definitions
  
  // Universal metadata
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now }, // Keep for backward compatibility (maps to createdAt)
  
  // Display field for creator/artist names (parsed from artist/featuring or manually set)
  // Format: "Artist ft. Featured" or "Artist & Featured" or "Artist 1 & Artist 2 ft. Featured"
  creatorDisplay: { type: String, default: null }, // Optional display string for UI
  
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
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true }, // ObjectId of related Media item
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
  }],

  // Ownership-specific audit trail
  ownershipHistory: [{
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, default: null },
    diff: [{
      field: { type: String, required: true },
      from: { type: mongoose.Schema.Types.Mixed, default: null },
      to: { type: mongoose.Schema.Types.Mixed, default: null },
      _id: false
    }],
    _id: false
  }],

  // ========================================
  // GLOBAL VETO (affects all parties)
  // ========================================
  status: {
    type: String,
    enum: ['active', 'vetoed'],
    default: 'active',
    index: true
  },
  vetoedAt: { type: Date },
  vetoedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vetoedReason: { type: String }
}, { 
  timestamps: true // Automatically manage createdAt and updatedAt
});

// Auto-populate `creatorNames` and auto-verify creators
mediaSchema.pre('save', function (next) {
  // Auto-populate creatorNames from all role fields
  const names = new Set();
  
  const roleFields = [
    'artist', 'producer', 'featuring', 'songwriter', 'composer', 'mixedBy', 'masteredBy',
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
  
  // Auto-populate releaseYear from releaseDate if not set
  if (!this.releaseYear && this.releaseDate) {
    const date = this.releaseDate instanceof Date ? this.releaseDate : new Date(this.releaseDate);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      if (year >= 1900 && year <= 2100) {
        this.releaseYear = year;
      }
    }
  }
  
  // Auto-generate creatorDisplay if not set and we have artist/featuring data
  if (!this.creatorDisplay && (this.artist || this.featuring)) {
    const { formatCreatorDisplay } = require('../utils/artistParser');
    this.creatorDisplay = formatCreatorDisplay(this.artist || [], this.featuring || []);
  }
  
  next();
});

// Post-save hook: Check and create tag parties when media is saved
// Note: This hook is intentionally NOT async to avoid blocking the save operation
mediaSchema.post('save', function(doc) {
  try {
    // Only process if media has tags
    if (!doc || !doc.tags || !Array.isArray(doc.tags) || doc.tags.length === 0) {
      return;
    }
    
    // Store tags in a variable to avoid closure issues
    const mediaTags = doc.tags;
    
    // Run tag party creation asynchronously (don't block the save operation)
    // Use setImmediate to ensure it runs after the save is complete and response is sent
    setImmediate(() => {
      // Wrap in promise to handle async operations
      Promise.resolve().then(async () => {
        try {
          const tagPartyService = require('../services/tagPartyService');
          await tagPartyService.checkAndCreateTagParties(mediaTags);
        } catch (error) {
          console.error('❌ Error in post-save tag party creation:', error);
          // Don't throw - this is a background operation
        }
      }).catch(err => {
        console.error('❌ Unhandled error in tag party creation promise:', err);
      });
    });
  } catch (error) {
    // Catch any synchronous errors in the hook itself
    console.error('❌ Error in post-save hook setup:', error);
    // Don't throw - allow the save to complete
  }
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
mediaSchema.index({ "label.labelId": 1 }); // Index for Label model references
mediaSchema.index({ "artist.collectiveId": 1 }); // Index for Collective references in artist
mediaSchema.index({ "aiUsage.used": 1 }); // Index for AI usage filtering
mediaSchema.index({ "aiUsage.disclosure": 1 }); // Index for disclosure level filtering
mediaSchema.index({ "producer.collectiveId": 1 }); // Index for Collective references in producer
mediaSchema.index({ "featuring.collectiveId": 1 }); // Index for Collective references in featuring
// Note: Other creator roles (songwriter, composer, host, guest, etc.) also support collectiveId but indexes are optional for now
mediaSchema.index({ album: 1 }); // Index for album searches
mediaSchema.index({ genres: 1 }); // Multi-key index for genres (each genre indexed separately)
mediaSchema.index({ tags: 1, globalMediaAggregate: -1 }); // Compound index for tag rankings
mediaSchema.index({ releaseDate: -1 }); // Index for release date sorting
mediaSchema.index({ releaseYear: -1 }); // Index for release year sorting/filtering
mediaSchema.index({ episodeNumber: 1, seasonNumber: 1 }); // Index for episode/season queries
mediaSchema.index({ podcastSeries: 1 }); // Index for podcast series lookups
mediaSchema.index({ "externalIds.podcastIndex": 1 }); // Index for Podcast Index lookups
mediaSchema.index({ "externalIds.taddy": 1 }); // Index for Taddy UUID lookups
mediaSchema.index({ "externalIds.iTunes": 1 }); // Index for iTunes lookups
mediaSchema.index({ "externalIds.rssGuid": 1 }); // Index for RSS GUID lookups
mediaSchema.index({ "relationships.type": 1 }); // Index for relationship type queries
mediaSchema.index({ "relationships.targetId": 1 }); // Index for finding relationships to specific media
mediaSchema.index({ "mediaOwners.userId": 1 }); // Index for finding media by owner
mediaSchema.index({ "mediaOwners.verified": 1 }); // Index for verified owners
mediaSchema.index({ "editHistory.editedBy": 1 }); // Index for finding edits by user
mediaSchema.index({ "editHistory.editedAt": -1 }); // Index for recent edits
mediaSchema.index({ status: 1 }); // Index for global veto status
mediaSchema.index(
  { title: 'text', description: 'text' },
  { default_language: 'english', language_override: 'none' }
);

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

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId || value instanceof mongoose.mongo.ObjectId) {
    return value;
  }
  if (typeof value === 'string') {
    return new mongoose.Types.ObjectId(value);
  }
  if (typeof value === 'object' && value._id) {
    return toObjectId(value._id);
  }
  return new mongoose.Types.ObjectId(String(value));
};

// Schema method: Add a media owner
mediaSchema.methods.addMediaOwner = function(userId, percentage, role = 'creator', addedBy, options = {}) {
  const normalizedUserId = toObjectId(userId);
  if (!normalizedUserId) {
    throw new Error('Invalid userId');
  }

  const normalizePercentage = (value) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric) || numeric < 0) {
      return 0;
    }
    return Math.round(numeric * 100) / 100;
  };

  // Check if user is already an owner
  const existingOwner = this.mediaOwners.find(owner => 
    owner.userId.toString() === normalizedUserId.toString()
  );
  
  if (existingOwner) {
    throw new Error('User is already a media owner');
  }
  
  // Validate percentage doesn't exceed 100% total
  const currentTotal = this.mediaOwners.reduce((sum, owner) => sum + owner.percentage, 0);
  if (currentTotal + percentage > 100) {
    throw new Error('Total ownership percentage cannot exceed 100%');
  }
  
  const now = new Date();
  const normalizedPercentage = normalizePercentage(percentage);
  const verifiedAt = options.verifiedAt ? new Date(options.verifiedAt) : null;
  const verifiedBy = toObjectId(options.verifiedBy);
  const actorId = toObjectId(options.addedBy) || toObjectId(addedBy) || normalizedUserId;

  this.mediaOwners.push({
    userId: normalizedUserId,
    percentage: normalizedPercentage,
    role,
    verified: options.verified === true || !!verifiedAt || !!verifiedBy,
    verifiedAt,
    verifiedBy,
    verificationMethod: options.verificationMethod || null,
    verificationNotes: options.verificationNotes || null,
    verificationSource: options.verificationSource || null,
    addedBy: actorId,
    addedAt: options.addedAt ? new Date(options.addedAt) : now,
    lastUpdatedAt: now,
    lastUpdatedBy: actorId
  });

  if (!Array.isArray(this.ownershipHistory)) {
    this.ownershipHistory = [];
  }

  this.ownershipHistory.push({
    action: 'Added media owner',
    timestamp: now,
    actor: actorId,
    note: options.note || null,
    diff: [{
      field: `owner:${normalizedUserId.toString()}`,
      from: null,
      to: {
        userId: normalizedUserId.toString(),
        percentage: normalizedPercentage,
        verified: options.verified === true || !!verifiedAt || !!verifiedBy,
        verifiedAt,
        verifiedBy: verifiedBy ? verifiedBy.toString() : null,
        verificationMethod: options.verificationMethod || null,
        verificationNotes: options.verificationNotes || null,
        verificationSource: options.verificationSource || null
      }
    }]
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
  owner.lastUpdatedAt = new Date();
  return this;
};

mediaSchema.methods.replaceMediaOwners = function(owners, actorId, note) {
  if (!Array.isArray(owners)) {
    throw new Error('Owners must be an array');
  }

  const normalizePercentage = (value) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric) || numeric < 0) {
      return 0;
    }
    return Math.round(numeric * 100) / 100;
  };

  const now = new Date();
  const actorObjectId = toObjectId(actorId);

  const oldOwnersSnapshot = (this.mediaOwners || []).map(owner => ({
    userId: owner.userId?.toString(),
    percentage: owner.percentage,
    verified: owner.verified,
    verifiedAt: owner.verifiedAt,
    verifiedBy: owner.verifiedBy ? owner.verifiedBy.toString() : null,
    verificationMethod: owner.verificationMethod || null,
    verificationNotes: owner.verificationNotes || null,
    verificationSource: owner.verificationSource || null
  }));

  const seen = new Set();
  let totalBasisPoints = 0;

  const formattedOwners = owners.map(rawOwner => {
    const userId = rawOwner.userId || rawOwner.owner?._id || rawOwner.owner?.id || rawOwner.owner?.uuid;
    if (!userId) {
      throw new Error('Each owner entry must include a userId');
    }

    const normalizedUserId = toObjectId(userId);
    if (!normalizedUserId) {
      throw new Error('Invalid userId');
    }

    const userIdStr = normalizedUserId.toString();
    if (seen.has(userIdStr)) {
      throw new Error('Duplicate owner entries are not permitted');
    }
    seen.add(userIdStr);

    const normalizedPercentage = normalizePercentage(
      rawOwner.ownershipPercentage ?? rawOwner.percentage ?? 0
    );

    if (normalizedPercentage > 100) {
      throw new Error('Ownership percentage must be between 0 and 100');
    }

    totalBasisPoints += Math.round(normalizedPercentage * 100);

    const verifiedAt = rawOwner.verifiedAt ? new Date(rawOwner.verifiedAt) : null;
    const verifiedBy = toObjectId(rawOwner.verifiedBy);

    const derivedAddedBy = toObjectId(rawOwner.addedBy) || actorObjectId || normalizedUserId;
    const lastUpdatedBy = actorObjectId || derivedAddedBy;

    return {
      userId: normalizedUserId,
      percentage: normalizedPercentage,
      role: rawOwner.role || 'creator',
      verified: rawOwner.verified === true || !!verifiedAt || !!verifiedBy,
      verifiedAt,
      verifiedBy,
      verificationMethod: rawOwner.verificationMethod || null,
      verificationNotes: rawOwner.verificationNotes || null,
      verificationSource: rawOwner.verificationSource || null,
      addedBy: derivedAddedBy,
      addedAt: rawOwner.addedAt ? new Date(rawOwner.addedAt) : now,
      lastUpdatedAt: now,
      lastUpdatedBy
    };
  });

  if (totalBasisPoints > 10000) {
    throw new Error('Total ownership percentage cannot exceed 100%');
  }

  const oldOwnersMap = new Map();
  oldOwnersSnapshot.forEach(owner => {
    if (owner.userId) {
      oldOwnersMap.set(owner.userId, owner);
    }
  });

  const diff = [];

  formattedOwners.forEach(owner => {
    const userIdStr = owner.userId.toString();
    const previous = oldOwnersMap.get(userIdStr);

    const newRecord = {
      userId: userIdStr,
      percentage: owner.percentage,
      verified: owner.verified,
      verifiedAt: owner.verifiedAt,
      verifiedBy: owner.verifiedBy ? owner.verifiedBy.toString() : null,
      verificationMethod: owner.verificationMethod,
      verificationNotes: owner.verificationNotes,
      verificationSource: owner.verificationSource
    };

    if (!previous) {
      diff.push({
        field: `owner:${userIdStr}`,
        from: null,
        to: newRecord
      });
    } else {
      const hasChanged = JSON.stringify(previous) !== JSON.stringify(newRecord);
      if (hasChanged) {
        diff.push({
          field: `owner:${userIdStr}`,
          from: previous,
          to: newRecord
        });
      }
      oldOwnersMap.delete(userIdStr);
    }
  });

  // Remaining owners in map were removed
  oldOwnersMap.forEach((previous, userIdStr) => {
    diff.push({
      field: `owner:${userIdStr}`,
      from: previous,
      to: null
    });
  });

  this.mediaOwners = formattedOwners;
  this.markModified('mediaOwners');

  if (!Array.isArray(this.editHistory)) {
    this.editHistory = [];
  }

  this.editHistory.push({
    editedBy: actorObjectId,
    editedAt: now,
    changes: [{
      field: 'mediaOwners',
      oldValue: oldOwnersSnapshot,
      newValue: formattedOwners.map(owner => ({
        userId: owner.userId.toString(),
        percentage: owner.percentage,
        verified: owner.verified,
        verifiedAt: owner.verifiedAt,
        verifiedBy: owner.verifiedBy ? owner.verifiedBy.toString() : null,
        verificationMethod: owner.verificationMethod,
        verificationNotes: owner.verificationNotes,
        verificationSource: owner.verificationSource
      }))
    }]
  });

  if (!Array.isArray(this.ownershipHistory)) {
    this.ownershipHistory = [];
  }

  this.ownershipHistory.push({
    action: 'Updated ownership allocation',
    timestamp: now,
    actor: actorObjectId,
    note: note || null,
    diff
  });

  return this;
};

// Schema method: Get total ownership percentage
mediaSchema.methods.getTotalOwnershipPercentage = function() {
  return this.mediaOwners.reduce((sum, owner) => sum + owner.percentage, 0);
};

module.exports = mongoose.models.Media || mongoose.model('Media', mediaSchema);
