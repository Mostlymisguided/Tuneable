const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const PartySchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  name: {
    type: String,
    required: true,
    minlength: [3, 'Party name must be at least 3 characters long'],
    maxlength: [100, 'Party name cannot exceed 100 characters'],
  },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  host_uuid: { type: String }, // UUID reference for external API usage
  
  partyCode: { type: String, required: true, unique: true },
  location: {type: String, required: true},
  mediaSource: {
    type: String,
    enum: ['youtube', 'direct_upload', 'mixed'],
    default: 'youtube',
    required: true
  },
  minimumBid: {
    type: Number,
    default: 0.33,
    min: [0.01, 'Minimum bid must be at least £0.01']
  },
  /*{
    type: {
      type: String,
      enum: ["Point"],
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: {
      type: String, // Formatted Google Maps address
      required: true
    }
  },  */
  partiers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Kicked users - users who have been removed and cannot rejoin
  kickedUsers: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kickedAt: { type: Date, default: Date.now },
    kickedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Host or admin who kicked
    reason: { type: String }, // Optional reason for kick
    _id: false
  }],
  
  // ========================================
  // PARTY-LEVEL BID METRICS (managed by BidMetricsEngine)
  // ========================================
  
  // Party scope metrics (stored for performance)
  // NOTE: All monetary amounts stored in PENCE (integer), not pounds
  partyBidTop: { type: Number, default: 0 }, // PartyBidTop - highest bid across all media in party (in pence)
  partyBidTopUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User who made highest bid
  partyUserAggregateTop: { type: Number, default: 0 }, // PartyUserAggregateTop - highest user aggregate in party (in pence)
  partyUserAggregateTopUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User with highest aggregate
  partyUserBidTop: { type: Number, default: 0 }, // PartyUserBidTop - highest user bid in party (in pence)
  partyUserBidTopUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User who made highest bid
  
  // Bids are stored in Party.media[].partyBids[] - organized by media for efficient queue rendering
  // Individual bid documents exist in the Bid collection as the source of truth
  
  // New unified media collection
  media: [
    {
      mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true },
      media_uuid: { type: String }, // UUID reference for external API usage
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      addedBy_uuid: { type: String },
      partyBids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
      
      // ========================================
      // PARTY-SPECIFIC BID METRICS (managed by BidMetricsEngine)
      // ========================================
      // NOTE: All monetary amounts stored in PENCE (integer), not pounds
      
      // Party-media scope metrics (stored for performance)
      partyMediaAggregate: { type: Number, default: 0 }, // PartyMediaAggregate - total bid value for this media in party (in pence)
      partyMediaBidTop: { type: Number, default: 0 }, // PartyMediaBidTop - highest individual bid for this media in party (in pence)
      partyMediaBidTopUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User who made highest bid
      
      partyMediaAggregateTop: { type: Number, default: 0 }, // PartyMediaAggregateTop - highest user aggregate for this media in party (in pence)
      partyMediaAggregateTopUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User with highest aggregate
      
      // Note: Other party metrics are computed on-demand via BidMetricsEngine
      
      // Status and timing (universal)
      status: { 
        type: String, 
        enum: ['active', 'vetoed'], 
        default: 'active' 
      },
      queuedAt: { type: Date, default: Date.now },
      playedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      vetoedAt: { type: Date, default: null },
      vetoedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  ],
  
  startTime:{ type: Date, default: Date.now },
  endTime: { type: Date, default: null},
  privacy: {
    type: String,
    enum: ['public', 'private'],
    default: 'public',
  },
  type: {
    type: String,
    enum: ['remote', 'live', 'global', 'tag', 'location'],
    default: 'remote',
  },
  locationFilter: {
    city: { type: String },
    region: { type: String }, // State, province, or region
    country: { type: String },
    countryCode: { type: String }, // ISO 3166-1 alpha-2 (e.g., "US", "GB", "FR")
  },
  slug: {
    type: String,
    unique: true,
    sparse: true, // Allow null/undefined for non-tag parties
    trim: true,
    lowercase: true,
    maxlength: [100, 'Slug cannot exceed 100 characters']
  },
  canonicalTag: {
    type: String,
    index: true, // Index for fast fuzzy matching lookups
    sparse: true, // Only for tag parties
    trim: true,
    lowercase: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'active', 'ended'],
    default: 'scheduled',
  },
  watershed: {
    type: Boolean,
    default: true,
  },
  tags: [{
    type: String,
    trim: true,
    // Title case (first letter of each word capitalized) - handled by application logic
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters'],
    trim: true
  },
}, {
  timestamps: true
});

// Method to calculate party status based on current time
PartySchema.methods.calculateStatus = function() {
  const now = new Date();
  
  // If party has ended
  if (this.endTime && now >= this.endTime) {
    return 'ended';
  }
  
  // If party has started
  if (now >= this.startTime) {
    return 'active';
  }
  
  // Party is still scheduled
  return 'scheduled';
};

// Static method to update all party statuses
PartySchema.statics.updateAllStatuses = async function() {
  const parties = await this.find({});
  const updates = [];
  
  for (const party of parties) {
    const newStatus = party.calculateStatus();
    if (party.status !== newStatus) {
      updates.push({
        updateOne: {
          filter: { _id: party._id },
          update: { status: newStatus }
        }
      });
    }
  }
  
  if (updates.length > 0) {
    await this.bulkWrite(updates);
    console.log(`Updated ${updates.length} party statuses`);
  }
  
  return updates.length;
};

// Static method to get Global Party
PartySchema.statics.getGlobalParty = async function() {
  return await this.findOne({ type: 'global' });
};

// Add indexes for performance
PartySchema.index({ host: 1 });
PartySchema.index({ partiers: 1 });
PartySchema.index({ partyBidTop: -1 });
PartySchema.index({ partyUserAggregateTop: -1 });
PartySchema.index({ partyUserBidTop: -1 });
PartySchema.index({ 'media.partyMediaAggregate': -1 });
PartySchema.index({ 'media.partyMediaBidTop': -1 });
PartySchema.index({ 'media.partyMediaAggregateTop': -1 });
PartySchema.index({ type: 1 }); // Index for Global Party lookup
PartySchema.index({ tags: 1 }); // Index for tag-based filtering
PartySchema.index({ slug: 1 }); // Index for slug-based lookup
PartySchema.index({ 'locationFilter.countryCode': 1, 'locationFilter.city': 1 }); // Index for location-based filtering

module.exports = mongoose.model('Party', PartySchema);
