const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const commentSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  content: { type: String, required: true, maxlength: 1000 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Support both legacy Song and new Media references
  songId: { type: mongoose.Schema.Types.ObjectId, ref: 'Song', required: false }, // DEPRECATED - for legacy comments
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: false }, // NEW - preferred
  
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

// Validation: at least one content reference required
commentSchema.pre('validate', function(next) {
  if (!this.songId && !this.mediaId) {
    return next(new Error('Either songId or mediaId must be provided'));
  }
  next();
});

// Auto-update like count
commentSchema.pre('save', function (next) {
  this.likeCount = this.likes.length;
  next();
});

// Indexes for performance
commentSchema.index({ songId: 1, createdAt: -1 }); // DEPRECATED - For legacy song comments
commentSchema.index({ mediaId: 1, createdAt: -1 }); // NEW - For fetching comments by media
commentSchema.index({ userId: 1 }); // For user's comment history
commentSchema.index({ parentCommentId: 1 }); // For reply threads
commentSchema.index({ isDeleted: 1 }); // For filtering deleted comments

module.exports = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
