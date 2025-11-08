const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportType: {
    type: String,
    enum: ['media', 'user', 'label', 'collective'],
    required: true,
    index: true
  },
  
  // Media being reported (for media reports)
  mediaId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Media',
    index: true
  },
  mediaUuid: { 
    type: String
  },
  
  // User being reported (for user reports)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  userUuid: {
    type: String
  },
  
  // Label being reported (for label reports)
  labelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Label',
    index: true
  },
  labelUuid: {
    type: String
  },
  // Collective being reported (for collective reports)
  collectiveId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collective',
    index: true
  },
  collectiveUuid: {
    type: String
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
    // Media categories: copyright, incorrect_info, inappropriate, duplicate, other
    // User categories: harassment, spam, impersonation, inappropriate, copyright, other
    // Label categories: copyright, label_impersonation, unauthorized_claim, label_incorrect_info, scam_fraud, inappropriate, other
    enum: [
      // Media categories
      'copyright', 'incorrect_info', 'incorrect_tags', 'inappropriate', 'duplicate', 'other',
      // Note: 'incorrect_tags' kept in enum for backward compatibility but removed from frontend/validation
      // User categories
      'harassment', 'spam', 'impersonation',
      // Label categories (reuse some, add new ones)
      'label_impersonation', 'label_incorrect_info', 'label_spam', 'unauthorized_claim', 'scam_fraud',
      // Collective categories
      'collective_impersonation', 'collective_incorrect_info', 'collective_spam'
      // Note: 'copyright' and 'inappropriate' are reused from media/user categories, 'label_spam' kept for backward compatibility
    ],
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
reportSchema.index({ reportType: 1, status: 1 });
reportSchema.index({ mediaId: 1, reportedBy: 1 });
reportSchema.index({ userId: 1, reportedBy: 1 });
reportSchema.index({ labelId: 1, reportedBy: 1 });
reportSchema.index({ collectiveId: 1, reportedBy: 1 });

// Prevent duplicate reports from same user for same target
// Compound indexes for uniqueness based on report type
reportSchema.index({ reportType: 1, mediaId: 1, reportedBy: 1 }, { 
  unique: true, 
  sparse: true,
  partialFilterExpression: { reportType: 'media' }
});
reportSchema.index({ reportType: 1, userId: 1, reportedBy: 1 }, { 
  unique: true, 
  sparse: true,
  partialFilterExpression: { reportType: 'user' }
});
reportSchema.index({ reportType: 1, labelId: 1, reportedBy: 1 }, { 
  unique: true, 
  sparse: true,
  partialFilterExpression: { reportType: 'label' }
});
reportSchema.index({ reportType: 1, collectiveId: 1, reportedBy: 1 }, {
  unique: true,
  sparse: true,
  partialFilterExpression: { reportType: 'collective' }
});

module.exports = mongoose.model('Report', reportSchema);

