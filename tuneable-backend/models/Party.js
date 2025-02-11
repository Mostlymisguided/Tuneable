const mongoose = require('mongoose');

const PartySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: [3, 'Party name must be at least 3 characters long'],
    maxlength: [100, 'Party name cannot exceed 100 characters'],
  },
  venue: {
    type: String,
    //required: true,
    minlength: [3, 'Venue must be at least 3 characters long'],
    maxlength: [100, 'Venue cannot exceed 100 characters'],
  },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  partyCode: { type: String, required: true, unique: true },
  location: {
    type: String,
    required: true,
    minlength: [3, 'Party location must be at least 3 characters long'],
    maxlength: [100, 'Party location cannot exceed 100 characters'],
  },
  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  bids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  songs: [
    {
      songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
  ],
  startTime:{ type: Date, default: Date.now },
  endTime: { type: Date, default: null},
  type: {
    type: String,
    enum: ['public', 'private', 'geocoded'],
    default: 'public',
  },
  status: {
    type: String,
    enum: ['scheduled', 'active', 'ended', 'canceled'],
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
