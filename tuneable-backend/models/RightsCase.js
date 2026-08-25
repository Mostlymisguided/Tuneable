const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');
const {
  CASE_STATUSES,
  PARTY_ROLES,
  CASE_SOURCES,
  OUTREACH_TEMPLATES,
  OPEN_STATUSES,
  normalizePartyKey,
} = require('../utils/rightsCaseHelpers');

const contactSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['email', 'instagram', 'soundcloud', 'website', 'other'],
    default: 'email',
  },
  value: { type: String, required: true, trim: true },
  notes: { type: String, trim: true },
}, { _id: false });

const partySchema = new mongoose.Schema({
  displayName: { type: String, required: true, trim: true },
  role: { type: String, enum: PARTY_ROLES, default: 'artist' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  labelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Label', default: null },
  collectiveId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collective', default: null },
  contacts: { type: [contactSchema], default: [] },
}, { _id: false });

const outreachEventSchema = new mongoose.Schema({
  channel: {
    type: String,
    enum: ['email', 'in_app', 'manual', 'note'],
    required: true,
  },
  direction: {
    type: String,
    enum: ['outbound', 'inbound', 'note'],
    default: 'outbound',
  },
  template: {
    type: String,
    enum: [...OUTREACH_TEMPLATES, 'none'],
    default: 'none',
  },
  to: { type: String, trim: true },
  subject: { type: String, trim: true },
  body: { type: String, default: '' },
  resendId: { type: String, default: null },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sentAt: { type: Date, default: Date.now },
}, { _id: true });

const rightsCaseSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true,
    index: true,
  },
  party: { type: partySchema, required: true },
  partyKey: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: CASE_STATUSES,
    default: 'identified',
    index: true,
  },
  source: {
    type: String,
    enum: CASE_SOURCES,
    default: 'manual',
    index: true,
  },
  linkedClaimId: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim', default: null },
  linkedReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  nextFollowUpAt: { type: Date, default: null, index: true },
  notes: { type: String, default: '' },
  outreach: { type: [outreachEventSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

rightsCaseSchema.index({ mediaId: 1, partyKey: 1, status: 1 });
rightsCaseSchema.index({ status: 1, nextFollowUpAt: 1 });
rightsCaseSchema.index({ linkedClaimId: 1 });
rightsCaseSchema.index({ linkedReportId: 1 });

rightsCaseSchema.pre('validate', function syncPartyKey(next) {
  if (this.party?.displayName) {
    this.partyKey = normalizePartyKey(this.party.displayName);
  }
  next();
});

rightsCaseSchema.statics.openStatuses = OPEN_STATUSES;

module.exports = mongoose.model('RightsCase', rightsCaseSchema);
