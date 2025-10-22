const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const commentSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  content: { type: String, required: true, maxlength: 1000 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Media reference
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true },
  
  // Optional: Reply functionality
  parentCommentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  replies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
  
  // Engagement metrics
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount: { type: Number, default: 0 },
  
  // Moderation
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
}, {
  timestamps: true
});

// Validation: mediaId is required
commentSchema.pre('validate', function(next) {
  if (!this.mediaId) {
    return next(new Error('mediaId is required'));
  }
  next();
});

// Auto-update like count
commentSchema.pre('save', function (next) {
  this.likeCount = this.likes.length;
  next();
});

// Indexes for performance
commentSchema.index({ mediaId: 1, createdAt: -1 }); // For fetching comments by media
commentSchema.index({ userId: 1 }); // For user's comment history
commentSchema.index({ parentCommentId: 1 }); // For reply threads
commentSchema.index({ isDeleted: 1 }); // For filtering deleted comments

module.exports = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
