const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');

const listeningHistorySchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', required: true, index: true },
  sessionId: { type: String, required: true },
  sourceType: {
    type: String,
    enum: ['user_queue', 'library', 'party', 'search', 'profile', 'direct', 'unknown'],
    default: 'unknown',
  },
  mediaTitle: { type: String, default: '' },
  mediaArtist: { type: String, default: '' },
  mediaCoverArt: { type: String, default: '' },
  mediaDuration: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  lastPlayedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  lastPositionSeconds: { type: Number, default: 0 },
  listenDurationSeconds: { type: Number, default: 0 },
  completionPercent: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['in_progress', 'partial', 'completed'],
    default: 'in_progress',
    index: true,
  },
}, {
  timestamps: true,
});

listeningHistorySchema.index({ userId: 1, lastPlayedAt: -1 });
listeningHistorySchema.index({ userId: 1, sessionId: 1 }, { unique: true });
listeningHistorySchema.index({ userId: 1, mediaId: 1, lastPlayedAt: -1 });

module.exports = mongoose.models.ListeningHistory || mongoose.model('ListeningHistory', listeningHistorySchema);
