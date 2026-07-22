const mongoose = require('mongoose');

/**
 * Post-import metadata enrichment queue (MusicBrainz cross-ref).
 * High-confidence suggestions can be auto-applied; medium confidence needs admin review.
 * Suggestions may include tags/genres/ISRC/releaseDate/releaseYear from MB recording lookup.
 */
const candidateSchema = new mongoose.Schema({
  musicbrainzId: String,
  musicbrainzReleaseId: { type: String, default: null },
  title: String,
  artist: String,
  album: { type: String, default: null },
  duration: { type: Number, default: 0 },
  releaseDate: { type: String, default: null },
  releaseYear: { type: Number, default: null },
  releaseDatePrecision: {
    type: String,
    enum: ['day', 'month', 'year', null],
    default: null,
  },
  isrc: { type: String, default: null },
  tags: { type: [String], default: [] },
  genres: { type: [String], default: [] },
  score: { type: Number, default: 0 },
  matchType: { type: String, default: null },
}, { _id: false });

const suggestionSchema = new mongoose.Schema({
  title: String,
  artist: String,
  album: { type: String, default: null },
  duration: { type: Number, default: 0 },
  isrc: { type: String, default: null },
  releaseDate: { type: String, default: null },
  releaseYear: { type: Number, default: null },
  releaseDatePrecision: {
    type: String,
    enum: ['day', 'month', 'year', null],
    default: null,
  },
  tags: { type: [String], default: [] },
  genres: { type: [String], default: [] },
  musicbrainzId: String,
  musicbrainzReleaseId: { type: String, default: null },
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
    enum: ['soundcloud_likes', 'spotify_likes', 'library_import', 'manual', 'other', 'backfill'],
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

  /** When true, enrichment may proceed even if media already has an MBID (tag backfill). */
  enrichTagsOnly: { type: Boolean, default: false },

  original: {
    title: String,
    artist: String,
    album: { type: String, default: null },
    duration: { type: Number, default: 0 },
    isrc: { type: String, default: null },
    releaseDate: { type: Date, default: null },
    releaseYear: { type: Number, default: null },
    tags: { type: [String], default: [] },
    genres: { type: [String], default: [] },
  },

  suggestion: suggestionSchema,

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
