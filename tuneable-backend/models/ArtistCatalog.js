const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');
const { mapboxLocationFields } = require('./mapboxLocationFields');

/**
 * Public catalog page for a credited artist who may not have a Tuneable account.
 * Claiming the page attaches it to a real User. This document is never a login.
 */
const artistCatalogSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 80,
  },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  aliases: [{ type: String, trim: true, maxlength: 120 }],
  // Normalized canonical name and aliases. Unique across catalogs.
  nameKeys: [{ type: String, required: true }],
  bio: { type: String, maxlength: 500, default: '' },
  genres: [{ type: String, trim: true, maxlength: 40 }],
  profilePic: { type: String, default: '' },
  website: { type: String, default: '' },
  location: mapboxLocationFields(),
  socialMedia: {
    instagram: { type: String, default: '' },
    spotify: { type: String, default: '' },
    youtube: { type: String, default: '' },
    soundcloud: { type: String, default: '' },
    twitter: { type: String, default: '' },
  },
  mediaIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Media' }],
  status: {
    type: String,
    enum: ['unclaimed', 'claimed'],
    default: 'unclaimed',
    index: true,
  },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  claimedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

artistCatalogSchema.index({ nameKeys: 1 }, { unique: true });

module.exports = mongoose.model('ArtistCatalog', artistCatalogSchema);
