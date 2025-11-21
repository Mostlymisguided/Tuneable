const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const notificationSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true // For fast queries
  },
  type: {
    type: String,
    enum: [
      'admin_announcement',      // Admin sends to all users
      'bid_received',            // Someone tipped on your media
      'bid_outbid',              // You were outtipped on media
      'comment_reply',           // Reply to your comment
      'creator_approved',        // Creator application approved
      'creator_rejected',        // Creator application rejected
      'claim_approved',          // Tune claim approved
      'claim_rejected',          // Tune claim rejected
      'party_invite',            // Invited to party
      'tune_bytes_earned',       // Earned TuneBytes
      'party_media_played',      // Your media played in party
      'media_claimed',           // Your uploaded media was claimed
      'label_invite',            // Invited to label
      'collective_invite',       // Invited to collective
      'warning',                 // Admin warning issued to user
      'media_vetoed',            // Media you tipped on was vetoed
      'media_unvetoed',          // Media you tipped on was unvetoed
      'user_kicked',             // User was kicked from a party
      'escrow_allocated',        // Escrow allocated for your media
      'escrow_matched',          // Unknown artist allocations matched to your account
      'payout_requested',        // Payout request submitted (admin notification)
      'payout_processed',        // Payout request processed
      'payout_rejected',         // Payout request rejected
    ],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String }, // URL to related page (e.g., /tune/123)
  linkText: { type: String }, // e.g., "View Media"
  
  // For admin announcements
  isGlobal: { type: Boolean, default: false }, // If true, sent to all users
  
  // Related entities for context
  relatedMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
  relatedPartyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party' },
  relatedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  relatedBidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid' },
  relatedCommentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
  relatedLabelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Label' },
  relatedCollectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective' },
  
  // Invitation metadata
  inviteType: { type: String, enum: ['admin', 'artist', 'member'] }, // For label/collective invites
  inviteRole: { type: String }, // Specific role for artist/member invites
  
  // Metadata
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  
  // For aggregating similar notifications
  groupKey: { type: String }, // e.g., "tip_outtipped_media_123"
}, { timestamps: true });

// Indexes for efficient queries
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ isGlobal: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

// Virtual for formatted date
notificationSchema.virtual('formattedDate').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
});

module.exports = mongoose.model('Notification', notificationSchema);

