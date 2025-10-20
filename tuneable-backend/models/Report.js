const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  // Media being reported
  mediaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Media', 
    required: true,
    index: true
  },
  mediaUuid: { 
    type: String, 
    required: true 
  },
  
  // Reporter information
  reportedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  
  // Report details
  category: {
    type: String,
    enum: ['copyright', 'incorrect_info', 'incorrect_tags', 'inappropriate', 'duplicate', 'other'],
    required: true
  },
  description: { 
    type: String, 
    required: true,
    maxlength: 2000
  },
  contactEmail: { 
    type: String,
    trim: true
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'in_review', 'resolved', 'dismissed'],
    default: 'pending',
    index: true
  },
  
  // Admin actions
  adminNotes: String,
  resolvedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  resolvedAt: Date
}, {
  timestamps: true
});

// Index for efficient queries
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ mediaId: 1, reportedBy: 1 });

// Prevent duplicate reports from same user for same media
reportSchema.index({ mediaId: 1, reportedBy: 1 }, { unique: true });

module.exports = mongoose.model('Report', reportSchema);

