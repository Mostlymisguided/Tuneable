const Gear = require('../models/Gear');
const Media = require('../models/Media');
const { escapeRegex, exactNameRegex } = require('../utils/gearUtils');

const GEAR_TYPE_PATHS = {
  daw: 'productionStack.daws',
  plugin: 'productionStack.plugins',
  hardware: 'productionStack.hardware',
};

const GEAR_ID_PATHS = {
  daw: 'productionStack.daws.gearId',
  plugin: 'productionStack.plugins.gearId',
  hardware: 'productionStack.hardware.gearId',
};

/**
 * Build a MongoDB query for media that credits a piece of gear (by catalog id and/or name).
 */
const buildMediaGearQuery = (gear) => {
  const base = { contentType: { $in: ['music'] }, status: { $ne: 'vetoed' } };
  if (!gear) return base;

  const nameRegex = exactNameRegex(gear.name);
  const type = gear.type;
  const path = GEAR_TYPE_PATHS[type];
  const gearIdPath = GEAR_ID_PATHS[type];

  if (!path) return base;

  const orClauses = [{ [path]: { $elemMatch: { name: nameRegex } } }];
  if (gear._id) {
    orClauses.unshift({ [gearIdPath]: gear._id });
  }

  return { ...base, $or: orClauses };
};

/**
 * Resolve a Gear document for a stack entry; optionally create a non-catalog entry.
 */
const resolveGearEntry = async (name, type, { createIfMissing = false, manufacturer, category } = {}) => {
  if (!name?.trim() || !type) return null;

  let gear = await Gear.findByNameAndType(name, type);
  if (gear || !createIfMissing) return gear;

  const slug = await Gear.generateUniqueSlug(name, type);
  gear = new Gear({
    name: name.trim(),
    slug,
    type,
    manufacturer: manufacturer || null,
    category: category || null,
    isCatalog: false,
  });
  await gear.save();
  return gear;
};

/**
 * Attach gearId + slug to each productionStack entry when a catalog match exists.
 */
const attachGearIdsToProductionStack = async (stack, { createIfMissing = false } = {}) => {
  if (!stack) return { daws: [], plugins: [], hardware: [] };

  const enrich = async (entries, type) => {
    if (!Array.isArray(entries)) return [];
    const result = [];
    for (const entry of entries) {
      if (!entry?.name) continue;
      const gear = await resolveGearEntry(entry.name, type, {
        createIfMissing,
        manufacturer: entry.manufacturer,
        category: entry.category,
      });
      result.push({
        ...entry,
        gearId: gear?._id || entry.gearId || null,
        slug: gear?.slug || entry.slug || null,
      });
    }
    return result;
  };

  return {
    daws: await enrich(stack.daws, 'daw'),
    plugins: await enrich(stack.plugins, 'plugin'),
    hardware: await enrich(stack.hardware, 'hardware'),
  };
};

/**
 * Recompute stats for a single Gear document from Media.
 */
const refreshGearStats = async (gearId) => {
  const gear = await Gear.findById(gearId);
  if (!gear) return null;

  const query = buildMediaGearQuery(gear);
  const media = await Media.find(query)
    .select('globalMediaAggregate uploadedAt createdAt')
    .lean();

  const mediaCount = media.length;
  const globalGearAggregate = media.reduce((sum, m) => sum + (m.globalMediaAggregate || 0), 0);
  const dates = media
    .map((m) => m.uploadedAt || m.createdAt)
    .filter(Boolean)
    .map((d) => new Date(d));
  const lastMediaAt = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;

  gear.stats = { mediaCount, globalGearAggregate, lastMediaAt };
  await gear.save();
  return gear;
};

/**
 * Search gear catalog (name, slug, aliases).
 */
const searchGear = async ({ search, type, limit = 20, page = 1 }) => {
  const query = { isActive: true };
  if (type && ['daw', 'plugin', 'hardware'].includes(type)) {
    query.type = type;
  }
  if (search?.trim()) {
    const regex = new RegExp(escapeRegex(search.trim()), 'i');
    query.$or = [{ name: regex }, { slug: regex }, { aliases: regex }, { manufacturer: regex }];
  }

  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limitNum;

  const [gear, total] = await Promise.all([
    Gear.find(query)
      .sort({ 'stats.mediaCount': -1, name: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Gear.countDocuments(query),
  ]);

  return { gear, total, page: parseInt(page, 10) || 1, limit: limitNum };
};

module.exports = {
  GEAR_TYPE_PATHS,
  buildMediaGearQuery,
  resolveGearEntry,
  attachGearIdsToProductionStack,
  refreshGearStats,
  searchGear,
};
