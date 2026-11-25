/**
 * Artist catalog pages: admin-published credit groups that a real user can claim.
 * Publishing does not grant ownership, clear rights, or pay out escrow.
 */

const mongoose = require('mongoose');
const Media = require('../models/Media');
const User = require('../models/User');
const Claim = require('../models/Claim');
const ArtistCatalog = require('../models/ArtistCatalog');
const ArtistCatalogClaim = require('../models/ArtistCatalogClaim');
const RightsCase = require('../models/RightsCase');
const { isPlaceholderCreatorLabel } = require('../utils/creatorHelpers');
const { applyResolvedLocation } = require('../utils/locationUtils');
const { isRightsPendingClaimable } = require('../utils/mediaPlayability');
const { TERMINAL_STATUSES } = require('../utils/rightsCaseHelpers');
const {
  RESERVED_SLUGS,
  MAX_MEDIA,
  normalizeArtistCatalogName,
  slugifyArtistCatalogName,
  exactNameRegex,
  collectCatalogNames,
  matchedRoles,
  sectionForRoles,
  linkCredits,
  remainingOwnershipPercentage,
  ownerUserId,
} = require('../utils/artistCatalog');

const CHART_MEDIA_SELECT = [
  '_id', 'uuid', 'slug', 'title', 'coverArt', 'creatorDisplay',
  'artist', 'featuring', 'contentForm', 'contentType',
  'duration', 'bpm', 'releaseDate', 'releaseYear', 'primaryLocation',
  'tags', 'sources', 'globalMediaAggregate',
  'rightsStatus', 'rightsCleared', 'status',
].join(' ');

const MEDIA_CARD_SELECT = [
  '_id', 'uuid', 'slug', 'title', 'coverArt', 'creatorDisplay',
  'artist', 'featuring', 'producer', 'songwriter', 'composer',
  'mixedBy', 'masteredBy', 'host', 'guest', 'narrator',
  'director', 'cinematographer', 'editor', 'author',
  'contentForm', 'contentType', 'globalMediaAggregate', 'rightsStatus',
  'rightsCleared', 'status', 'mediaOwners',
].join(' ');

class ArtistCatalogError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function cleanText(value, max) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return max ? text.slice(0, max) : text;
}

function cleanUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

function applySocial(existing, input) {
  const current = { ...(existing?.toObject?.() || existing || {}) };
  const source = input && typeof input === 'object' ? input : {};
  ['instagram', 'spotify', 'youtube', 'soundcloud', 'twitter'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      current[key] = cleanText(source[key], 200);
    }
  });
  return current;
}

function cleanGenres(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || '').split(',');
  const seen = new Set();
  const genres = [];
  list.forEach((raw) => {
    const genre = cleanText(raw, 40);
    const key = genre.toLowerCase();
    if (!genre || seen.has(key)) return;
    seen.add(key);
    genres.push(genre);
  });
  return genres.slice(0, 12);
}

function parseAliases(input) {
  if (Array.isArray(input)) return input;
  return String(input || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function mediaIdList(input) {
  const raw = Array.isArray(input) ? input : [];
  const ids = [];
  const seen = new Set();
  raw.forEach((value) => {
    const id = String(value?._id || value || '').trim();
    if (!mongoose.Types.ObjectId.isValid(id) || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function presentMedia(media, roles) {
  const artist = Array.isArray(media.artist)
    ? media.artist.map((person) => ({ name: person?.name || '' })).filter((person) => person.name)
    : [];
  return {
    _id: media._id,
    uuid: media.uuid,
    slug: media.slug || null,
    title: media.title,
    coverArt: media.coverArt || null,
    creatorDisplay: media.creatorDisplay || null,
    artist,
    contentForm: media.contentForm,
    contentType: media.contentType,
    globalMediaAggregate: media.globalMediaAggregate || 0,
    rightsStatus: media.rightsStatus || 'pending',
    status: media.status || 'active',
    roles,
    section: sectionForRoles(roles),
  };
}

const PUBLIC_LOCATION_FIELDS = [
  'city', 'region', 'country', 'countryCode', 'coordinates',
  'placeId', 'featureType', 'ancestorIds', 'ancestors',
  'label', 'namePreferred', 'display', 'placeFormatted', 'fullAddress', 'postcode',
];

function presentLocation(location) {
  if (!location) return null;
  const source = location.toObject?.() || location;
  if (!source.placeId && !source.city && !source.country && !source.display && !source.region) return null;
  const out = {};
  PUBLIC_LOCATION_FIELDS.forEach((key) => {
    if (source[key] != null && source[key] !== '') out[key] = source[key];
  });
  return Object.keys(out).length ? out : null;
}

function assignCatalogLocation(catalog, input) {
  if (!input) {
    catalog.set('location', undefined);
    return;
  }
  catalog.set('location', applyResolvedLocation(input, catalog.location || null) || undefined);
}

const BADGE_LIMIT = 3;

function mediaForSingleTag(item, tag) {
  return {
    _id: item._id,
    tags: [tag],
    genres: [],
    category: null,
    podcastSeries: null,
    contentForm: item.contentForm,
    contentType: item.contentType,
    globalMediaAggregate: item.globalMediaAggregate || 0,
  };
}

async function bestTagBadges(media) {
  const { getMediaTagRankings, collectRankingTags } = require('./mediaTagRankingsService');
  const bestByTag = new Map();
  for (const item of media) {
    const aggregate = item.globalMediaAggregate || 0;
    for (const tag of collectRankingTags(item)) {
      const key = String(tag).trim().toLowerCase();
      const current = bestByTag.get(key);
      if (!current || aggregate > current.aggregate) {
        bestByTag.set(key, { tag, item, aggregate });
      }
    }
  }
  const jobs = [...bestByTag.values()]
    .sort((a, b) => b.aggregate - a.aggregate)
    .slice(0, 8);
  const rows = await Promise.all(jobs.map(async ({ tag, item }) => {
    const rankings = await getMediaTagRankings(mediaForSingleTag(item, tag), { limit: 1 });
    return rankings[0] || null;
  }));
  return rows
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || b.aggregate - a.aggregate)
    .slice(0, BADGE_LIMIT)
    .map((row) => ({ tag: row.tag, rank: row.rank }));
}

async function bestLocationBadges(media) {
  const { getMediaLocationRankings } = require('./locationProfileService');
  const located = media
    .filter((item) => item.primaryLocation?.placeId)
    .sort((a, b) => (b.globalMediaAggregate || 0) - (a.globalMediaAggregate || 0))
    .slice(0, 8);
  const batches = await Promise.all(located.map((item) => getMediaLocationRankings(item, {
    limit: 3,
    minTotal: 2,
  })));
  const best = new Map();
  batches.flat().forEach((row) => {
    const current = best.get(row.placeId);
    if (!current || row.rank < current.rank) best.set(row.placeId, row);
  });
  return [...best.values()]
    .sort((a, b) => a.rank - b.rank || (b.aggregate || 0) - (a.aggregate || 0))
    .slice(0, BADGE_LIMIT)
    .map((row) => ({
      placeId: row.placeId,
      name: row.name,
      rank: row.rank,
    }));
}

async function catalogChartBadges(media) {
  try {
    const [tagRankings, locationRankings] = await Promise.all([
      bestTagBadges(media),
      bestLocationBadges(media),
    ]);
    return { tagRankings, locationRankings };
  } catch (error) {
    console.error('Artist catalog rankings failed:', error);
    return { tagRankings: [], locationRankings: [] };
  }
}

function presentCatalog(catalog, extras = {}) {
  return {
    _id: catalog._id,
    uuid: catalog.uuid,
    slug: catalog.slug,
    name: catalog.name,
    aliases: catalog.aliases || [],
    bio: catalog.bio || '',
    genres: catalog.genres || [],
    profilePic: catalog.profilePic || '',
    website: catalog.website || '',
    location: presentLocation(catalog.location),
    socialMedia: catalog.socialMedia || {},
    status: catalog.status,
    mediaCount: Array.isArray(catalog.mediaIds) ? catalog.mediaIds.length : 0,
    claimedAt: catalog.claimedAt || null,
    claimedBy: extras.claimedBy || null,
    createdAt: catalog.createdAt,
    updatedAt: catalog.updatedAt,
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    _id: user._id,
    username: user.username,
    uuid: user.uuid,
    profilePic: user.profilePic || null,
    artistName: user.creatorProfile?.artistName || null,
  };
}

async function uniqueSlug(name) {
  const base = slugifyArtistCatalogName(name);
  let slug = RESERVED_SLUGS.has(base) ? `${base}-artist` : base;
  let n = 2;
  while (await ArtistCatalog.exists({ slug })) {
    const suffix = `-${n}`;
    slug = `${base.slice(0, 80 - suffix.length)}${suffix}`;
    n += 1;
    if (n > 50) {
      throw new ArtistCatalogError('Could not reserve a public address for this artist', 409);
    }
  }
  return slug;
}

async function assertNameKeysFree(nameKeys, excludeId) {
  const query = { nameKeys: { $in: nameKeys } };
  if (excludeId) query._id = { $ne: excludeId };
  const clash = await ArtistCatalog.findOne(query).select('name slug nameKeys').lean();
  if (!clash) return;
  const overlap = (clash.nameKeys || []).find((key) => nameKeys.includes(key));
  throw new ArtistCatalogError(
    `"${overlap || clash.name}" is already on the ${clash.name} page (/artist/${clash.slug})`,
    409
  );
}

async function loadAttachedMedia(mediaIds) {
  const ids = mediaIdList(mediaIds);
  if (!ids.length) {
    throw new ArtistCatalogError('Choose at least one tune for this page');
  }
  if (ids.length > MAX_MEDIA) {
    throw new ArtistCatalogError(`A page can list at most ${MAX_MEDIA} tunes`);
  }
  const found = await Media.find({
    _id: { $in: ids },
    status: { $ne: 'deleted' },
  }).select('_id');
  const foundIds = new Set(found.map((media) => String(media._id)));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length) {
    throw new ArtistCatalogError('Some selected tunes are missing or deleted');
  }
  return ids;
}

async function suggestNames(query) {
  const q = normalizeArtistCatalogName(query);
  if (q.length < 2) return [];

  const prefix = new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const media = await Media.find({
    status: { $ne: 'deleted' },
    creatorNames: prefix,
  }).select('creatorNames').limit(400).lean();

  const counts = new Map();
  media.forEach((item) => {
    (item.creatorNames || []).forEach((raw) => {
      const label = String(raw || '').trim().replace(/\s+/g, ' ');
      if (!label || isPlaceholderCreatorLabel(label)) return;
      if (!prefix.test(label)) return;
      const key = normalizeArtistCatalogName(label);
      const existing = counts.get(key) || { name: label, count: 0 };
      existing.count += 1;
      if (/[A-Z]/.test(label) && !/[A-Z]/.test(existing.name)) existing.name = label;
      counts.set(key, existing);
    });
  });

  const keys = [...counts.keys()];
  const existing = keys.length
    ? await ArtistCatalog.find({ nameKeys: { $in: keys } }).select('nameKeys slug name').lean()
    : [];
  const catalogByKey = new Map();
  existing.forEach((catalog) => {
    (catalog.nameKeys || []).forEach((key) => {
      catalogByKey.set(key, { slug: catalog.slug, name: catalog.name });
    });
  });

  return [...counts.entries()]
    .map(([key, row]) => ({
      name: row.name,
      count: row.count,
      catalog: catalogByKey.get(key) || null,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 20);
}

async function previewNames(names) {
  const collected = collectCatalogNames(names?.[0], names?.slice(1));
  const labels = [collected.name, ...collected.aliases].filter(Boolean);
  if (!labels.length) {
    throw new ArtistCatalogError('Enter an artist name to find their tunes');
  }

  const clauses = labels
    .map((label) => exactNameRegex(label))
    .filter(Boolean)
    .map((regex) => ({ creatorNames: regex }));

  const media = await Media.find({
    status: { $ne: 'deleted' },
    $or: clauses,
  })
    .select(MEDIA_CARD_SELECT)
    .sort({ globalMediaAggregate: -1, title: 1 })
    .limit(MAX_MEDIA)
    .lean();

  const keys = new Set(collected.nameKeys);
  const rows = media
    .map((item) => {
      const roles = matchedRoles(item, keys);
      return roles.length ? presentMedia(item, roles) : null;
    })
    .filter(Boolean);

  const ids = rows.map((row) => row._id);
  const catalogs = ids.length
    ? await ArtistCatalog.find({ mediaIds: { $in: ids } }).select('slug name mediaIds').lean()
    : [];
  const catalogsByMedia = new Map();
  catalogs.forEach((catalog) => {
    (catalog.mediaIds || []).forEach((id) => {
      const key = String(id);
      const list = catalogsByMedia.get(key) || [];
      list.push({ slug: catalog.slug, name: catalog.name });
      catalogsByMedia.set(key, list);
    });
  });

  return {
    name: collected.name,
    aliases: collected.aliases,
    media: rows.map((row) => ({
      ...row,
      onCatalogs: catalogsByMedia.get(String(row._id)) || [],
      defaultSelected: row.roles.includes('artist') || row.roles.includes('host') || row.roles.includes('author'),
    })),
    truncated: media.length >= MAX_MEDIA,
  };
}

async function createCatalog(input, actorId) {
  const names = collectCatalogNames(input.name, parseAliases(input.aliases));
  if (!names.name || !names.nameKeys.length) {
    throw new ArtistCatalogError('Artist name is required');
  }
  const mediaIds = await loadAttachedMedia(input.mediaIds);
  await assertNameKeysFree(names.nameKeys);

  const slug = await uniqueSlug(names.name);
  try {
    const catalog = await ArtistCatalog.create({
      slug,
      name: names.name,
      aliases: names.aliases,
      nameKeys: names.nameKeys,
      bio: cleanText(input.bio, 500),
      genres: cleanGenres(input.genres),
      profilePic: input.profilePic ? cleanUrl(input.profilePic) : '',
      website: input.website ? cleanUrl(input.website) : '',
      location: input.location ? (applyResolvedLocation(input.location, null) || undefined) : undefined,
      socialMedia: applySocial({}, input.socialMedia),
      mediaIds,
      status: 'unclaimed',
      createdBy: actorId,
      updatedBy: actorId,
    });
    return catalog;
  } catch (error) {
    if (error?.code === 11000) {
      throw new ArtistCatalogError('That artist name or page address is already in use', 409);
    }
    throw error;
  }
}

async function updateCatalog(catalogId, input, actorId) {
  const catalog = await ArtistCatalog.findById(catalogId);
  if (!catalog) throw new ArtistCatalogError('Artist page not found', 404);

  if (input.name != null || input.aliases != null) {
    const names = collectCatalogNames(
      input.name != null ? input.name : catalog.name,
      input.aliases != null ? parseAliases(input.aliases) : catalog.aliases
    );
    if (!names.name) throw new ArtistCatalogError('Artist name is required');
    await assertNameKeysFree(names.nameKeys, catalog._id);
    catalog.name = names.name;
    catalog.aliases = names.aliases;
    catalog.nameKeys = names.nameKeys;
  }
  if (input.bio != null) catalog.bio = cleanText(input.bio, 500);
  if (input.genres != null) catalog.genres = cleanGenres(input.genres);
  if (input.profilePic != null) catalog.profilePic = input.profilePic ? cleanUrl(input.profilePic) : '';
  if (input.website != null) catalog.website = input.website ? cleanUrl(input.website) : '';
  if (input.location !== undefined) assignCatalogLocation(catalog, input.location);
  if (input.socialMedia != null) catalog.socialMedia = applySocial(catalog.socialMedia, input.socialMedia);
  if (input.mediaIds != null) catalog.mediaIds = await loadAttachedMedia(input.mediaIds);

  catalog.updatedBy = actorId;
  try {
    await catalog.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw new ArtistCatalogError('That artist name is already in use', 409);
    }
    throw error;
  }

  if (catalog.status === 'claimed' && catalog.claimedBy) {
    await linkCatalogCredits(catalog, catalog.claimedBy, { verify: false });
  }
  return catalog;
}

async function listCatalogs() {
  const catalogs = await ArtistCatalog.find({})
    .sort({ updatedAt: -1 })
    .limit(100)
    .populate('claimedBy', 'username uuid profilePic creatorProfile.artistName')
    .lean();

  const pending = await ArtistCatalogClaim.aggregate([
    { $match: { status: 'pending' } },
    { $group: { _id: '$catalogId', count: { $sum: 1 } } },
  ]);
  const pendingByCatalog = new Map(pending.map((row) => [String(row._id), row.count]));

  return catalogs.map((catalog) => ({
    ...presentCatalog(catalog, { claimedBy: publicUser(catalog.claimedBy) }),
    mediaIds: (catalog.mediaIds || []).map((id) => String(id)),
    pendingClaims: pendingByCatalog.get(String(catalog._id)) || 0,
  }));
}

async function getPublicCatalog(slug, viewerId) {
  const catalog = await ArtistCatalog.findOne({ slug: String(slug || '').trim().toLowerCase() })
    .populate('claimedBy', 'username uuid profilePic creatorProfile.artistName')
    .lean();
  if (!catalog) throw new ArtistCatalogError('Artist page not found', 404);

  const media = await Media.find({
    _id: { $in: catalog.mediaIds || [] },
    status: 'active',
  }).select(CHART_MEDIA_SELECT).lean();

  const keys = new Set(catalog.nameKeys || []);
  const ranked = media
    .map((item) => ({ item, roles: matchedRoles(item, keys) }))
    .sort((a, b) => (
      (b.item.globalMediaAggregate || 0) - (a.item.globalMediaAggregate || 0)
      || String(a.item.title || '').localeCompare(String(b.item.title || ''))
    ));

  const { toClientMedia } = require('../utils/mediaPlayability');
  const { loadBidsByMediaId } = require('./relatedMediaService');
  const bidsByMediaId = await loadBidsByMediaId(ranked.map((row) => row.item._id));
  const playability = { authenticated: Boolean(viewerId) };

  const queue = ranked.map(({ item, roles }) => {
    const client = toClientMedia(item, {}, playability);
    return {
      _id: client._id,
      uuid: client.uuid,
      slug: client.slug || null,
      title: client.title,
      coverArt: client.coverArt || null,
      creatorDisplay: client.creatorDisplay || null,
      artist: client.artist || [],
      featuring: client.featuring || [],
      contentForm: client.contentForm,
      contentType: client.contentType,
      duration: client.duration || 0,
      bpm: client.bpm ?? null,
      releaseDate: client.releaseDate ?? null,
      releaseYear: client.releaseYear ?? null,
      primaryLocation: client.primaryLocation ?? null,
      tags: client.tags || [],
      globalMediaAggregate: client.globalMediaAggregate || 0,
      rightsStatus: client.rightsStatus || 'pending',
      rightsCleared: client.rightsCleared === true,
      sources: client.sources || {},
      isPlayable: client.isPlayable,
      hasHostedAudio: client.hasHostedAudio,
      bids: bidsByMediaId.get(String(item._id)) || [],
      roles,
      section: sectionForRoles(roles),
    };
  });

  const sections = { artist: [], appears: [], credits: [] };
  queue.forEach((item) => {
    sections[item.section].push(item);
  });

  let viewerClaim = null;
  if (viewerId) {
    viewerClaim = await ArtistCatalogClaim.findOne({ catalogId: catalog._id, userId: viewerId })
      .sort({ createdAt: -1 })
      .select('status reviewNotes createdAt')
      .lean();
  }

  const rankings = await catalogChartBadges(media);

  return {
    catalog: presentCatalog(catalog, { claimedBy: publicUser(catalog.claimedBy) }),
    queue,
    sections,
    tagRankings: rankings.tagRankings,
    locationRankings: rankings.locationRankings,
    viewerClaim: viewerClaim
      ? {
        status: viewerClaim.status,
        reviewNotes: viewerClaim.status === 'rejected' ? (viewerClaim.reviewNotes || '') : '',
        submittedAt: viewerClaim.createdAt,
      }
      : null,
  };
}

async function listPublicIndex() {
  const catalogs = await ArtistCatalog.find({})
    .select('slug name aliases nameKeys')
    .lean();
  return catalogs.map((catalog) => ({
    slug: catalog.slug,
    name: catalog.name,
    aliases: catalog.aliases || [],
  }));
}

async function submitClaim(slug, userId, { proofText, proofFiles }) {
  const text = String(proofText || '').trim();
  if (text.length < 10) {
    throw new ArtistCatalogError('Describe how you can show this catalog is yours');
  }
  const catalog = await ArtistCatalog.findOne({ slug: String(slug || '').trim().toLowerCase() });
  if (!catalog) throw new ArtistCatalogError('Artist page not found', 404);
  if (catalog.status === 'claimed') {
    throw new ArtistCatalogError('This artist page has already been claimed', 409);
  }

  const existing = await ArtistCatalogClaim.findOne({
    catalogId: catalog._id,
    userId,
    status: 'pending',
  });
  if (existing) {
    throw new ArtistCatalogError('You already have a claim waiting for review');
  }

  const claim = await ArtistCatalogClaim.create({
    catalogId: catalog._id,
    userId,
    proofText: text.slice(0, 2000),
    proofFiles: proofFiles || [],
    status: 'pending',
  });
  return claim;
}

async function listClaims(status = 'pending') {
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  const claims = await ArtistCatalogClaim.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('userId', 'username email uuid profilePic')
    .populate('catalogId', 'name slug status')
    .lean();

  return claims.map((claim) => ({
    _id: claim._id,
    status: claim.status,
    proofText: claim.proofText,
    proofFiles: claim.proofFiles || [],
    reviewNotes: claim.reviewNotes || '',
    clearRights: claim.clearRights === true,
    submittedAt: claim.createdAt,
    reviewedAt: claim.reviewedAt,
    claimant: claim.userId
      ? {
        _id: claim.userId._id,
        username: claim.userId.username,
        email: claim.userId.email,
        uuid: claim.userId.uuid,
        profilePic: claim.userId.profilePic,
      }
      : null,
    catalog: claim.catalogId
      ? {
        _id: claim.catalogId._id,
        name: claim.catalogId.name,
        slug: claim.catalogId.slug,
        status: claim.catalogId.status,
      }
      : null,
  }));
}

async function linkCatalogCredits(catalog, userId, { verify }) {
  const media = await Media.find({
    _id: { $in: catalog.mediaIds || [] },
    status: { $ne: 'deleted' },
  });
  const keys = new Set(catalog.nameKeys || []);
  const summary = { linked: 0, already: 0, heldByOther: 0, media: media.length };
  for (const item of media) {
    const result = linkCredits(item, keys, userId, { verify });
    summary.linked += result.linked;
    summary.already += result.already;
    summary.heldByOther += result.heldByOther;
    if (result.linked || (verify && result.already)) {
      await item.save();
    }
  }
  return summary;
}

async function applyCreatorProfile(user, catalog, adminId) {
  const roles = Array.isArray(user.role) ? [...user.role] : [];
  if (!roles.includes('creator')) roles.push('creator');
  user.role = roles;

  const existing = typeof user.creatorProfile?.toObject === 'function'
    ? user.creatorProfile.toObject()
    : { ...(user.creatorProfile || {}) };
  const alreadyVerified = existing.verificationStatus === 'verified' && existing.artistName;
  if (!alreadyVerified) {
    user.creatorProfile = {
      ...existing,
      artistName: catalog.name,
      bio: catalog.bio || existing.bio || '',
      genres: (catalog.genres && catalog.genres.length) ? catalog.genres : (existing.genres || []),
      roles: (existing.roles && existing.roles.length) ? existing.roles : ['artist'],
      website: catalog.website || existing.website || '',
      verificationStatus: 'verified',
      verificationMethod: 'catalog_claim',
      verifiedAt: new Date(),
      verifiedBy: adminId,
    };
  }

  const social = { ...(user.socialMedia?.toObject?.() || user.socialMedia || {}) };
  ['instagram', 'spotify', 'youtube', 'soundcloud', 'twitter'].forEach((key) => {
    if (!social[key] && catalog.socialMedia?.[key]) social[key] = catalog.socialMedia[key];
  });
  user.socialMedia = social;
  user.markModified('role');
  user.markModified('creatorProfile');
  user.markModified('socialMedia');
  await user.save();
  return { profileUpdated: !alreadyVerified };
}

async function clearRightsOnMedia(media, userId, adminId, nameKeys) {
  const title = media.title || 'Tune';
  if (media.rightsStatus === 'disputed') {
    return { cleared: false, escrowPence: 0, warning: `${title}: disputed, left unchanged` };
  }

  const artistEscrowService = require('../services/artistEscrowService');
  const alreadyOwner = (media.mediaOwners || []).some((owner) => ownerUserId(owner) === String(userId));
  const alreadyCleared = media.rightsStatus === 'cleared' && media.rightsCleared === true;

  if (!alreadyCleared) {
    if (!isRightsPendingClaimable(media)) {
      return { cleared: false, escrowPence: 0, warning: `${title}: not awaiting clearance` };
    }
    if (!alreadyOwner) {
      const percentage = remainingOwnershipPercentage(media);
      if (percentage <= 0) {
        return {
          cleared: false,
          escrowPence: 0,
          warning: `${title}: ownership already totals 100%, rights left pending`,
        };
      }
      media.addMediaOwner(userId, percentage, 'primary', adminId, {
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: adminId,
        verificationMethod: 'Catalog claim',
        verificationNotes: 'Approved artist catalog claim',
        verificationSource: 'catalog_claim',
        note: 'Approved artist catalog claim',
      });
    }
    linkCredits(media, nameKeys, userId, { verify: true });
    media.rightsCleared = true;
    media.rightsStatus = 'cleared';
    media.rightsConfirmedBy = userId;
    media.rightsConfirmedAt = new Date();
    media.editHistory.push({
      editedBy: adminId,
      editedAt: new Date(),
      changes: [{
        field: 'rightsStatus',
        oldValue: 'Pending rights',
        newValue: 'Cleared via approved artist catalog claim',
      }],
    });
    await media.save();

    await Claim.updateMany(
      { mediaId: media._id, status: 'pending' },
      {
        status: 'rejected',
        reviewNotes: 'Artist catalog claim was approved for this tune',
        reviewedBy: adminId,
        reviewedAt: new Date(),
      }
    );
    await RightsCase.updateMany(
      { mediaId: media._id, status: { $nin: TERMINAL_STATUSES } },
      { $set: { status: 'cleared' } }
    );
  } else {
    linkCredits(media, nameKeys, userId, { verify: true });
    await media.save();
  }

  let escrowPence = 0;
  try {
    const escrow = await artistEscrowService.claimAllocationsForMedia(media._id, userId);
    escrowPence = escrow?.totalAmount || 0;
  } catch (error) {
    return {
      cleared: !alreadyCleared,
      escrowPence: 0,
      warning: `${title}: rights updated, escrow transfer failed`,
    };
  }
  return { cleared: !alreadyCleared, escrowPence, warning: null };
}

async function reviewClaim(claimId, { status, reviewNotes, clearRights }, adminId) {
  if (!['approved', 'rejected'].includes(status)) {
    throw new ArtistCatalogError('Status must be approved or rejected');
  }
  const claim = await ArtistCatalogClaim.findById(claimId);
  if (!claim) throw new ArtistCatalogError('Claim not found', 404);
  if (claim.status !== 'pending') {
    throw new ArtistCatalogError('Claim has already been reviewed');
  }

  const catalog = await ArtistCatalog.findById(claim.catalogId);
  if (!catalog) throw new ArtistCatalogError('Artist page not found', 404);

  const notes = cleanText(reviewNotes, 1000);
  if (status === 'rejected') {
    claim.status = 'rejected';
    claim.reviewNotes = notes;
    claim.reviewedBy = adminId;
    claim.reviewedAt = new Date();
    await claim.save();
    await notifyClaimant(claim.userId, catalog, 'rejected', notes);
    return { claim, warnings: [] };
  }

  if (catalog.status === 'claimed') {
    throw new ArtistCatalogError('This artist page has already been claimed', 409);
  }

  const user = await User.findById(claim.userId);
  if (!user) throw new ArtistCatalogError('Claimant account not found', 404);

  const profile = await applyCreatorProfile(user, catalog, adminId);
  const credits = await linkCatalogCredits(catalog, user._id, { verify: false });

  const warnings = [];
  if (credits.heldByOther) {
    warnings.push(`${credits.heldByOther} credit${credits.heldByOther === 1 ? '' : 's'} already linked to another account were left unchanged`);
  }

  let escrowPence = 0;
  let clearedCount = 0;
  if (clearRights === true) {
    const media = await Media.find({
      _id: { $in: catalog.mediaIds || [] },
      status: { $ne: 'deleted' },
    });
    for (const item of media) {
      try {
        const result = await clearRightsOnMedia(item, user._id, adminId, catalog.nameKeys || []);
        if (result.cleared) clearedCount += 1;
        escrowPence += result.escrowPence || 0;
        if (result.warning) warnings.push(result.warning);
      } catch (error) {
        warnings.push(`${item.title || 'Tune'}: ${error.message || 'could not clear rights'}`);
      }
    }
  }

  catalog.status = 'claimed';
  catalog.claimedBy = user._id;
  catalog.claimedAt = new Date();
  catalog.updatedBy = adminId;
  await catalog.save();

  await ArtistCatalogClaim.updateMany(
    { catalogId: catalog._id, _id: { $ne: claim._id }, status: 'pending' },
    {
      status: 'rejected',
      reviewNotes: 'Another claim for this artist page was approved',
      reviewedBy: adminId,
      reviewedAt: new Date(),
    }
  );

  claim.status = 'approved';
  claim.clearRights = clearRights === true;
  claim.reviewNotes = notes;
  claim.reviewedBy = adminId;
  claim.reviewedAt = new Date();
  await claim.save();

  const escrowNote = escrowPence > 0
    ? ` £${(escrowPence / 100).toFixed(2)} in tip escrow is now on your balance.`
    : '';
  await notifyClaimant(user._id, catalog, 'approved', escrowNote);

  return {
    claim,
    warnings,
    credits,
    clearedCount,
    escrowPence,
    profileUpdated: profile.profileUpdated,
  };
}

async function notifyClaimant(userId, catalog, status, extra) {
  try {
    const { createNotification } = require('../services/notificationService');
    const approved = status === 'approved';
    await createNotification({
      userId,
      type: approved ? 'creator_approved' : 'creator_rejected',
      title: approved ? 'Artist page claimed' : 'Artist page claim declined',
      message: approved
        ? `Your claim for ${catalog.name} was approved. The page now belongs to your account.${extra || ''}`
        : `Your claim for ${catalog.name} was declined.${extra ? ` ${extra}` : ''}`,
      link: `/artist/${catalog.slug}`,
      linkText: 'View artist page',
      groupKey: `artist_catalog_${status}_${catalog._id}_${userId}`,
    });
  } catch (error) {
    console.error('Failed to notify artist catalog claimant:', error);
  }
}

module.exports = {
  ArtistCatalogError,
  suggestNames,
  previewNames,
  createCatalog,
  updateCatalog,
  listCatalogs,
  getPublicCatalog,
  listPublicIndex,
  submitClaim,
  listClaims,
  reviewClaim,
};
