const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const spotifyImportRequestSchema = new mongoose.Schema({
  uuid: {
    type: String,
    unique: true,
    default: uuidv7,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  spotifyAccount: {
    type: String,
    required: true,
    trim: true,
  },
  note: {
    type: String,
    default: null,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'allowlisted', 'rejected'],
    default: 'pending',
    index: true,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  rejectedReason: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

spotifyImportRequestSchema.index({ userId: 1, createdAt: -1 });
spotifyImportRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SpotifyImportRequest', spotifyImportRequestSchema);
