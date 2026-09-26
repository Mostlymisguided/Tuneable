/**
 * Deleted media used to keep its public slug, so artist-title URLs 404'd
 * while a live duplicate sat on slug-2, slug-3, …
 * Hand the canonical slug to the single living successor.
 */

const { escapeRegex } = require('../utils/identifierFormat');
const { buildMediaSlugBase } = require('../utils/mediaSlug');

function primaryArtistKey(media) {
  const artist = media?.artist;
  if (Array.isArray(artist) && artist.length) {
    const first = artist[0];
    const name = typeof first === 'string' ? first : first?.name;
    return String(name || '').trim().toLowerCase();
  }
  if (artist && typeof artist === 'object') {
    return String(artist.name || '').trim().toLowerCase();
  }
  if (typeof artist === 'string') return artist.trim().toLowerCase();
  return '';
}

function titleKey(media) {
  return String(media?.title || '').trim().toLowerCase();
}

function isNumberedSlugOf(candidateSlug, baseSlug) {
  if (!candidateSlug || !baseSlug) return false;
  const re = new RegExp(`^${escapeRegex(String(baseSlug).toLowerCase())}-\\d+$`, 'i');
  return re.test(String(candidateSlug));
}

function isSameRecording(a, b) {
  const title = titleKey(a);
  const artist = primaryArtistKey(a);
  if (!title || !artist) return false;
  return title === titleKey(b) && artist === primaryArtistKey(b);
}

/**
 * @returns {object|null} the single living media that should own this slug
 */
function pickSlugSuccessor(deletedMedia, candidates) {
  const base = String(deletedMedia?.slug || '').trim().toLowerCase();
  if (!base || !deletedMedia?._id) return null;

  const matches = (candidates || []).filter((candidate) => {
    if (!candidate || String(candidate._id) === String(deletedMedia._id)) return false;
    if (candidate.status === 'deleted') return false;
    const aliases = (candidate.slugAliases || []).map((slug) => String(slug).toLowerCase());
    if (aliases.includes(base)) return true;
    return isNumberedSlugOf(candidate.slug, base) && isSameRecording(deletedMedia, candidate);
  });

  if (matches.length !== 1) return null;
  return matches[0];
}

async function findSlugSuccessorCandidates(Media, deletedMedia) {
  const base = String(deletedMedia?.slug || '').trim().toLowerCase();
  if (!base) return [];
  return Media.find({
    _id: { $ne: deletedMedia._id },
    status: { $ne: 'deleted' },
    $or: [
      { slugAliases: base },
      { slug: new RegExp(`^${escapeRegex(base)}-\\d+$`, 'i') },
    ],
  }).select('_id title artist slug slugAliases status');
}

async function previewDeletedSlugHandoff(Media, deletedMedia) {
  const candidates = await findSlugSuccessorCandidates(Media, deletedMedia);
  return pickSlugSuccessor(deletedMedia, candidates);
}

/**
 * Move a deleted media's slug onto its unique living successor.
 * The previous numbered slug is kept as an alias so old links still resolve.
 * @returns {Promise<object|null>} successor, or null when there isn't exactly one
 */
async function handoffDeletedSlug(Media, deletedMedia) {
  if (!Media || !deletedMedia?.slug || deletedMedia.status !== 'deleted') return null;

  const base = String(deletedMedia.slug).trim().toLowerCase();
  const candidates = await findSlugSuccessorCandidates(Media, deletedMedia);
  const successor = pickSlugSuccessor(deletedMedia, candidates);
  if (!successor) return null;

  const previousSlug = successor.slug && String(successor.slug).toLowerCase() !== base
    ? String(successor.slug).toLowerCase()
    : null;
  const aliases = new Set((successor.slugAliases || []).map((slug) => String(slug).toLowerCase()));
  if (previousSlug) aliases.add(previousSlug);
  aliases.delete(base);

  await Media.updateOne(
    { _id: deletedMedia._id },
    { $unset: { slug: 1 }, $set: { supersededBy: successor._id } },
  );
  try {
    await Media.updateOne(
      { _id: successor._id },
      { $set: { slug: base, slugAliases: Array.from(aliases) } },
    );
  } catch (err) {
    console.error('slug handoff failed:', err.message);
    return null;
  }

  successor.slug = base;
  successor.slugAliases = Array.from(aliases);
  deletedMedia.slug = undefined;
  deletedMedia.supersededBy = successor._id;
  return successor;
}

function liveOwnsCanonicalSlug(live, deleted) {
  const base = buildMediaSlugBase(deleted);
  if (!base || !live) return false;
  const slug = String(live.slug || '').toLowerCase();
  const aliases = (live.slugAliases || []).map((item) => String(item).toLowerCase());
  if (slug === base || aliases.includes(base)) return true;
  if (isNumberedSlugOf(slug, base)) return true;
  return aliases.some((alias) => isNumberedSlugOf(alias, base));
}

async function findLiveTwin(Media, deletedMedia) {
  const title = String(deletedMedia?.title || '').trim();
  if (!title || !primaryArtistKey(deletedMedia)) return null;

  const candidates = await Media.find({
    _id: { $ne: deletedMedia._id },
    status: { $ne: 'deleted' },
    title: new RegExp(`^${escapeRegex(title)}$`, 'i'),
  }).select('_id title artist slug slugAliases status');

  const matches = candidates.filter((candidate) => (
    isSameRecording(deletedMedia, candidate) && liveOwnsCanonicalSlug(candidate, deletedMedia)
  ));
  if (matches.length !== 1) return null;
  return matches[0];
}

async function rememberSuccessor(Media, deletedMedia, successor) {
  if (!deletedMedia?._id || !successor?._id) return;
  if (String(deletedMedia.supersededBy || '') === String(successor._id)) return;
  await Media.updateOne({ _id: deletedMedia._id }, { $set: { supersededBy: successor._id } });
  deletedMedia.supersededBy = successor._id;
}

/**
 * Public tune URLs for a deleted duplicate should open the live recording.
 * UUID and ObjectId links included — admin restore/purge still address the deleted row directly.
 */
async function resolveDeletedSuccessor(Media, deletedMedia) {
  if (!Media || !deletedMedia || deletedMedia.status !== 'deleted') return null;

  if (deletedMedia.supersededBy) {
    const pointed = await Media.findById(deletedMedia.supersededBy)
      .select('_id title artist slug slugAliases status');
    if (pointed && pointed.status !== 'deleted') return pointed;
  }

  if (deletedMedia.slug) {
    const handed = await handoffDeletedSlug(Media, deletedMedia);
    if (handed) return handed;
  }

  const twin = await findLiveTwin(Media, deletedMedia);
  if (!twin) return null;
  await rememberSuccessor(Media, deletedMedia, twin);
  return twin;
}

/**
 * Drop a deleted document's slug when nothing else should inherit it,
 * so a later upload of the same recording can take the artist-title URL.
 */
async function releaseDeletedSlug(Media, deletedMedia) {
  if (!Media || !deletedMedia?._id || !deletedMedia.slug) return false;
  await Media.updateOne({ _id: deletedMedia._id }, { $unset: { slug: 1 } });
  deletedMedia.slug = undefined;
  return true;
}

module.exports = {
  primaryArtistKey,
  titleKey,
  isNumberedSlugOf,
  isSameRecording,
  pickSlugSuccessor,
  previewDeletedSlugHandoff,
  handoffDeletedSlug,
  liveOwnsCanonicalSlug,
  resolveDeletedSuccessor,
  releaseDeletedSlug,
};
