const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

/**
 * Tuneable Conversations — crowdfunded conversations between people and/or podcasts.
 * Pledges are held on the conversation until cancelled (refund) or completed (creator escrow).
 */

const participantSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['person', 'podcast'],
    default: 'person',
  },
  role: {
    type: String,
    enum: ['participant', 'moderator', 'host'],
    default: 'participant',
  },
  // Linked Tuneable user (optional — external guests can be name-only)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  user_uuid: { type: String },
  // Podcast series media (when kind === 'podcast')
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
  media_uuid: { type: String },
  displayName: { type: String, required: true, maxlength: 120 },
  profilePic: { type: String },
  response: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
  },
  respondedAt: { type: Date },
}, { _id: true });

const pledgeSchema = new mongoose.Schema({
  uuid: { type: String, default: uuidv7 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  user_uuid: { type: String },
  username: { type: String },
  amount: { type: Number, required: true, min: 1 }, // pence
  // Portion of amount funded by welcome credit (pence). Restored on pledge refund.
  welcomeCreditAppliedPence: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['active', 'refunded', 'released'],
    default: 'active',
  },
  message: { type: String, maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
  refundedAt: { type: Date },
}, { _id: true });

const topicSuggestionSchema = new mongoose.Schema({
  text: { type: String, required: true, maxlength: 200 },
  suggestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  suggestedByUsername: { type: String },
  voteCount: { type: Number, default: 0 },
  voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const conversationSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },

  title: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 140,
  },
  description: {
    type: String,
    maxlength: 2000,
  },
  // Primary topic (optional — also collect suggestions)
  topic: {
    type: String,
    maxlength: 200,
  },

  proposedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  proposedBy_uuid: { type: String },
  proposedByUsername: { type: String },

  participants: {
    type: [participantSchema],
    validate: {
      validator(v) {
        return Array.isArray(v) && v.length >= 2;
      },
      message: 'A conversation needs at least 2 participants',
    },
  },

  topicSuggestions: [topicSuggestionSchema],
  pledges: [pledgeSchema],

  // Funding goal in PENCE
  goalAmount: {
    type: Number,
    required: true,
    min: [100, 'Goal must be at least £1.00'],
  },
  // Sum of active pledges in PENCE
  totalPledged: {
    type: Number,
    default: 0,
  },
  minimumPledge: {
    type: Number,
    default: 1, // £0.01 in pence
    min: 1,
  },

  status: {
    type: String,
    enum: ['open', 'funded', 'scheduled', 'completed', 'cancelled'],
    default: 'open',
  },

  // When true, all linked users must accept before open→funded (goal still required)
  requireAcceptance: {
    type: Boolean,
    default: true,
  },

  privacy: {
    type: String,
    enum: ['public', 'private'],
    default: 'public',
  },

  scheduledAt: { type: Date },
  livestreamUrl: { type: String, maxlength: 500 },
  recordingUrl: { type: String, maxlength: 500 },
  // Optional link to resulting Media episode after completion
  resultingMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },

  fundedAt: { type: Date },
  completedAt: { type: Date },
  cancelledAt: { type: Date },
  cancelReason: { type: String, maxlength: 500 },
}, { timestamps: true });

conversationSchema.index({ status: 1, createdAt: -1 });
conversationSchema.index({ proposedBy: 1, createdAt: -1 });
conversationSchema.index({ 'participants.userId': 1 });
conversationSchema.index({ 'pledges.userId': 1 });
conversationSchema.index({ totalPledged: -1 });

conversationSchema.methods.recalculateTotalPledged = function recalculateTotalPledged() {
  this.totalPledged = (this.pledges || [])
    .filter((p) => p.status === 'active')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  return this.totalPledged;
};

conversationSchema.methods.linkedParticipants = function linkedParticipants() {
  return (this.participants || []).filter((p) => p.userId);
};

conversationSchema.methods.allLinkedAccepted = function allLinkedAccepted() {
  const linked = this.linkedParticipants();
  if (linked.length === 0) return true;
  return linked.every((p) => p.response === 'accepted');
};

conversationSchema.methods.isGoalMet = function isGoalMet() {
  return this.totalPledged >= this.goalAmount;
};

conversationSchema.methods.canBecomeFunded = function canBecomeFunded() {
  if (this.status !== 'open') return false;
  if (!this.isGoalMet()) return false;
  if (this.requireAcceptance && !this.allLinkedAccepted()) return false;
  return true;
};

module.exports = mongoose.model('Conversation', conversationSchema);
