const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema({
  // Media being claimed
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true
  },
  
  // User submitting the claim
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Proof of ownership
  proofText: {
    type: String,
    required: true,
    maxlength: 2000
  },
  
  // Supporting files (URLs to uploaded proof files)
  proofFiles: [{
    filename: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Claim status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // Admin review notes
  reviewNotes: String,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  
  // Metadata
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
claimSchema.index({ mediaId: 1, userId: 1 });
claimSchema.index({ status: 1 });
claimSchema.index({ userId: 1 });

module.exports = mongoose.model('Claim', claimSchema);

