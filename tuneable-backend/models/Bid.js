const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const bidSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
    
    // ========================================
    // REFERENCES (ObjectIds)
    // ========================================
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    partyId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Party', 
        required: true 
    },
    // Unified Media reference
    mediaId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Media', 
        required: true 
    },
    
    // ========================================
    // UUID REFERENCES (for external API)
    // ========================================
    user_uuid: { type: String },
    party_uuid: { type: String },
    media_uuid: { type: String },
    
    // ========================================
    // DENORMALIZED DISPLAY FIELDS (Phase 1)
    // For debugging, analytics, and fast queries without populating
    // ========================================
    username: { type: String, required: true }, // User who placed bid
    partyName: { type: String, required: true }, // Party name at time of bid
    mediaTitle: { type: String, required: true }, // Song/media title
    mediaArtist: { type: String }, // Artist name(s)
    mediaCoverArt: { type: String }, // Thumbnail URL
    
    // ========================================
    // PARTY CONTEXT (Phase 1)
    // ========================================
    partyType: { 
        type: String, 
        enum: ['remote', 'live'],
        required: true
    }, // Type of party when bid was placed
    
    // ========================================
    // BID CONTEXT (Phase 1 & 2)
    // ========================================
    isInitialBid: { 
        type: Boolean, 
        default: false 
    }, // True if this bid added the song to party (vs boosting existing)
    queuePosition: { type: Number }, // Song position in queue when bid placed (1-indexed)
    queueSize: { type: Number }, // Total songs in queue at bid time
    
    // ========================================
    // MEDIA DETAILS (Phase 2)
    // ========================================
    mediaContentType: { type: [String] }, // ['music'], ['spoken'], etc.
    mediaContentForm: { type: [String] }, // ['song'], ['podcast'], etc.
    mediaDuration: { type: Number }, // Duration in seconds
    
    // ========================================
    // PLATFORM TRACKING (Phase 2)
    // ========================================
    platform: { 
        type: String, 
        enum: ['web', 'mobile', 'tablet', 'desktop', 'unknown'],
        default: 'unknown'
    }, // Platform where bid was placed
    
    // ========================================
    // PERFORMANCE OPTIMIZATION (Phase 1)
    // Auto-computed from createdAt for fast analytics
    // ========================================
    dayOfWeek: { 
        type: Number, 
        min: 0, 
        max: 6 
    }, // 0=Sunday, 1=Monday, ..., 6=Saturday
    hourOfDay: { 
        type: Number, 
        min: 0, 
        max: 23 
    }, // 0-23 hour of day when bid placed
    
    // ========================================
    // CORE BID DATA
    // ========================================
    amount: { 
        type: Number, 
        required: true, 
        min: [0, 'Bid amount cannot be negative'] 
    },
    status: {
        type: String,
        enum: ['requested', 'active', 'played', 'vetoed', 'refunded'],
        default: 'active'
    },
    
    // ========================================
    // DYNAMIC METRICS (computed via BidMetricsEngine)
    // ========================================
    // Note: Aggregate values are now computed dynamically using the
    // BidMetricsEngine rather than stored as static fields.
    // This allows for flexible metric computation based on the
    // bid metrics schema defined in utils/bidMetricsSchema.js
}, {
    timestamps: true
});

// ========================================
// VALIDATION HOOKS
// ========================================

// Validation to ensure mediaId is provided
bidSchema.pre('validate', function(next) {
    if (!this.mediaId) {
        return next(new Error('mediaId is required. All bids must reference a Media item.'));
    }
    next();
});

// Auto-populate dayOfWeek and hourOfDay from createdAt
bidSchema.pre('save', function(next) {
    if (this.isNew) {
        const date = this.createdAt || new Date();
        this.dayOfWeek = date.getDay(); // 0-6 (Sunday=0)
        this.hourOfDay = date.getHours(); // 0-23
    }
    next();
});

// Update metrics after bid is saved
bidSchema.post('save', async function(doc) {
    try {
        const bidMetricsEngine = require('../services/bidMetricsEngine');
        await bidMetricsEngine.updateMetricsForBidChange({
            _id: doc._id,
            userId: doc.userId,
            mediaId: doc.mediaId,
            partyId: doc.partyId,
            amount: doc.amount
        }, 'create');
    } catch (error) {
        console.error('Error updating metrics after bid save:', error);
    }
});

// Update metrics after bid is removed
bidSchema.post('remove', async function(doc) {
    try {
        const bidMetricsEngine = require('../services/bidMetricsEngine');
        await bidMetricsEngine.updateMetricsForBidChange({
            _id: doc._id,
            userId: doc.userId,
            mediaId: doc.mediaId,
            partyId: doc.partyId,
            amount: doc.amount
        }, 'delete');
    } catch (error) {
        console.error('Error updating metrics after bid removal:', error);
    }
});

// ========================================
// INDEXES
// ========================================

// Core reference indexes
bidSchema.index({ userId: 1 });
bidSchema.index({ partyId: 1 });
bidSchema.index({ mediaId: 1 }); // Primary media reference

// Denormalized field indexes for fast searching/filtering
bidSchema.index({ username: 1 });
bidSchema.index({ partyName: 1 });
bidSchema.index({ mediaTitle: 1 });
bidSchema.index({ mediaArtist: 1 });

// Context & analytics indexes
bidSchema.index({ partyType: 1 });
bidSchema.index({ isInitialBid: 1 });
bidSchema.index({ platform: 1 });

// Time-based analytics indexes (super fast queries)
bidSchema.index({ dayOfWeek: 1 });
bidSchema.index({ hourOfDay: 1 });
bidSchema.index({ dayOfWeek: 1, hourOfDay: 1 }); // Compound for "Tuesday at 8pm" queries

// Status and amount indexes
bidSchema.index({ status: 1 });
bidSchema.index({ amount: -1 }); // For "top bids" queries

// Compound indexes for common query patterns
bidSchema.index({ partyId: 1, status: 1 }); // Party bids by status
bidSchema.index({ userId: 1, createdAt: -1 }); // User's recent bids
bidSchema.index({ mediaId: 1, createdAt: -1 }); // Media's recent bids
bidSchema.index({ partyId: 1, createdAt: -1 }); // Party's recent bids


// ========================================
// NOTES ON USAGE
// ========================================

// Populate references for convenience
// NOTE: Disabled auto-populate to prevent issues with Media model population
// Use explicit .populate() calls in routes instead when needed
// 
// DENORMALIZED FIELDS:
// The username, partyName, mediaTitle, etc. are stored at time of bid creation
// This means you can query bids WITHOUT populating references for:
// - Displaying bid lists
// - Analytics queries
// - Debugging in database
// 
// ANALYTICS EXAMPLES:
// - Top bidders by username: Bid.aggregate([{ $group: { _id: "$username", total: { $sum: "$amount" } } }])
// - Bids by hour: Bid.find({ hourOfDay: 20 }) // All bids placed at 8pm
// - Peak days: Bid.find({ dayOfWeek: 5 }) // All Friday bids
// - Platform revenue: Bid.aggregate([{ $group: { _id: "$platform", total: { $sum: "$amount" } } }])

module.exports = mongoose.model('Bid', bidSchema);
