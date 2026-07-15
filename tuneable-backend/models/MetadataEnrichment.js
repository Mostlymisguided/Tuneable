const mongoose = require('mongoose');

/**
 * Post-import metadata enrichment queue (MusicBrainz cross-ref).
 * High-confidence suggestions can be auto-applied; medium confidence needs admin review.
 */
const candidateSchema = new mongoose.Schema({
  musicbrainzId: String,
  title: String,
  artist: String,
  album: { type: String, default: null },
  duration: { type: Number, default: 0 },
  releaseYear: { type: Number, default: null },
  score: { type: Number, default: 0 },
  matchType: { type: String, default: null },
}, { _id: false });

const metadataEnrichmentSchema = new mongoose.Schema({
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: true,
    index: true,
  },
  mediaUuid: { type: String, index: true },

  importSource: {
    type: String,
    enum: ['soundcloud_likes', 'spotify_likes', 'library_import', 'manual', 'other'],
    default: 'library_import',
    index: true,
  },
  importedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  status: {
    type: String,
    enum: [
      'pending',
      'processing',
      'needs_review',
      'auto_applied',
      'applied',
      'dismissed',
      'skipped',
      'failed',
    ],
    default: 'pending',
  },
  confidence: {
    type: String,
    enum: ['high', 'medium', 'low', 'none', null],
    default: null,
  },

  original: {
    title: String,
    artist: String,
    album: { type: String, default: null },
    duration: { type: Number, default: 0 },
    isrc: { type: String, default: null },
  },

  suggestion: {
    title: String,
    artist: String,
    album: { type: String, default: null },
    duration: { type: Number, default: 0 },
    isrc: { type: String, default: null },
    musicbrainzId: String,
    score: { type: Number, default: 0 },
    matchType: { type: String, default: null },
  },

  candidates: [candidateSchema],

  error: { type: String, default: null },
  adminNotes: { type: String, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
}, {
  timestamps: true,
});

metadataEnrichmentSchema.index({ status: 1, createdAt: -1 });
metadataEnrichmentSchema.index({ mediaId: 1, status: 1 });

module.exports = mongoose.model('MetadataEnrichment', metadataEnrichmentSchema);
