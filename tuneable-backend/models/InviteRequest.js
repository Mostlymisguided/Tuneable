const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const inviteRequestSchema = new mongoose.Schema({
  uuid: { 
    type: String, 
    unique: true, 
    default: uuidv7 
  },
  email: { 
    type: String, 
    required: true,
    lowercase: true,
    trim: true
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  reason: { 
    type: String, 
    required: true 
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  inviteCode: {
    type: String,
    default: null // Set when approved
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectedReason: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster queries
inviteRequestSchema.index({ email: 1 });
inviteRequestSchema.index({ status: 1 });
inviteRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('InviteRequest', inviteRequestSchema);

