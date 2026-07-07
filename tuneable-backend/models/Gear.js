const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');
const { slugifyGearName } = require('../utils/gearUtils');

const gearSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },

  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['daw', 'plugin', 'hardware'],
    required: true,
  },
  manufacturer: { type: String, default: null },
  category: { type: String, default: null }, // plugin/hardware category enum string
  aliases: { type: [String], default: [] },
  imageUrl: { type: String, default: null },
  description: { type: String, maxlength: 1000, default: null },

  // true when seeded from the curated catalog; false for user-suggested entries
  isCatalog: { type: Boolean, default: false },

  stats: {
    mediaCount: { type: Number, default: 0 },
    globalGearAggregate: { type: Number, default: 0 }, // pence
    lastMediaAt: { type: Date, default: null },
  },

  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

gearSchema.index({ name: 1, type: 1 });
gearSchema.index({ type: 1, 'stats.mediaCount': -1 });
gearSchema.index({ type: 1, 'stats.globalGearAggregate': -1 });
gearSchema.index({ aliases: 1 });
gearSchema.index({ isCatalog: 1 });

gearSchema.statics.findBySlug = function (slug) {
  return this.findOne({ slug, isActive: true });
};

gearSchema.statics.findByNameAndType = function (name, type) {
  if (!name || !type) return null;
  const trimmed = name.trim();
  const regex = new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  return this.findOne({
    type,
    isActive: true,
    $or: [
      { name: regex },
      { aliases: regex },
    ],
  });
};

gearSchema.statics.generateUniqueSlug = async function (name, type, excludeId = null) {
  let base = slugifyGearName(name);
  if (!base) base = 'gear';
  let slug = base;
  let counter = 2;

  while (true) {
    const query = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await this.findOne(query).select('_id');
    if (!existing) return slug;
    slug = `${base}-${type}`;
    if (counter > 2) slug = `${base}-${counter}`;
    counter += 1;
    if (counter > 50) {
      slug = `${base}-${Date.now()}`;
      break;
    }
  }
  return slug;
};

module.exports = mongoose.model('Gear', gearSchema);
