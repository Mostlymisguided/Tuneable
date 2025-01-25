const mongoose = require('mongoose');

const PartySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: [3, 'Party name must be at least 3 characters long'],
    maxlength: [100, 'Party name cannot exceed 100 characters'],
  },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  partyCode: { type: String, required: true, unique: true },
  location: { type: String, default: null },
  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  bids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  songs: [
    {
      songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: true },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
  ],
  status: {
    type: String,
    enum: ['active', 'ended', 'canceled'],
    default: 'active',
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
