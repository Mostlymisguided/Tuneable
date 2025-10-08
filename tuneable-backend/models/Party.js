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
  musicSource: {
    type: String,
    enum: ['youtube', 'spotify', 'direct_upload'],
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
  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  attendee_uuids: [{ type: String }], // UUID references for external API usage
  bids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  
  // New unified media collection
  media: [
    {
      mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true },
      media_uuid: { type: String }, // UUID reference for external API usage
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      addedBy_uuid: { type: String },
      partyBidValue: { type: Number, default: 0 },
      partyBids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
      
      // Status and timing (universal)
      status: { 
        type: String, 
        enum: ['queued', 'playing', 'played', 'vetoed'], 
        default: 'queued' 
      },
      queuedAt: { type: Date, default: Date.now },
      playedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      vetoedAt: { type: Date, default: null },
      vetoedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      vetoedBy_uuid: { type: String }
    }
  ],
  
  // Legacy songs collection (for backward compatibility during migration)
  songs: [
    {
      // Support both songs and podcast episodes
      songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
      episodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'PodcastEpisode' },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      // UUID references for external API usage
      song_uuid: { type: String },
      episode_uuid: { type: String },
      addedBy_uuid: { type: String },
      partyBidValue: { type: Number, default: 0 }, // Party-specific total bid value
      partyBids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }], // Party-specific bids
      
      // Content type and status
      contentType: { 
        type: String, 
        enum: ['song', 'episode'], 
        required: true 
      },
      status: { 
        type: String, 
        enum: ['queued', 'playing', 'played', 'vetoed'], 
        default: 'queued' 
      },
      
      // Timing information
      queuedAt: { type: Date, default: Date.now }, // When added to queue
      playedAt: { type: Date, default: null }, // When started playing
      completedAt: { type: Date, default: null }, // When finished playing
      vetoedAt: { type: Date, default: null }, // When vetoed
      vetoedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who vetoed it
      vetoedBy_uuid: { type: String }, // UUID reference for external API usage
    },
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
    enum: ['remote', 'live'],
    default: 'remote',
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

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Automatically update `updatedAt` on save
PartySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
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

// Automatically populate `songs` and nested `bids` when querying parties
const autoPopulateSongs = function (next) {
  this.populate({
    path: 'songs',
    populate: {
      path: 'bids',
      populate: {
        path: 'userId', // Populate `userId` inside `bids`
        select: 'username avatar', // Select specific user fields
      },
    },
  });
  next();
};

PartySchema
  .pre('find', autoPopulateSongs)
  .pre('findOne', autoPopulateSongs)
  .pre('findById', autoPopulateSongs);

// Add indexes for performance
PartySchema.index({ host: 1 });
PartySchema.index({ attendees: 1 });

module.exports = mongoose.model('Party', PartySchema);
