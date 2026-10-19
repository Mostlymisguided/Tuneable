/**
 * Human-readable URL slugs for Media (tunes, podcasts, books).
 * IDs stay on uuid/_id; slugs are a public routing layer.
 */

const { slugifySegment, artistDisplayName } = require('./readableUploadKey');
const { isUuidString, isMongoObjectIdString, escapeRegex } = require('./identifierFormat');

const MAX_SLUG_LENGTH = 80;
const MAX_SLUG_ALIASES = 20;
const SLUG_SOURCE_FIELDS = ['title', 'artist', 'author', 'host', 'contentForm'];

function firstCreatorName(creators) {
  if (!creators) return '';
  if (typeof creators === 'string') return creators;
  if (!Array.isArray(creators) || creators.length === 0) return '';
  const first = creators[0];
  if (typeof first === 'string') return first;
  return first?.name || '';
}

function formsOf(media) {
  const raw = media?.contentForm;
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw ? [raw] : [];
}

/**
 * artist-title (or author-title / show-title) base slug, ASCII, lowercase.
 */
function buildMediaSlugBase(media) {
  if (!media) return 'untitled';
  const forms = formsOf(media);
  const titleSlug = slugifySegment(media.title || '');

  let left = '';
  if (forms.includes('book') || forms.includes('article')) {
    left = slugifySegment(firstCreatorName(media.author) || artistDisplayName(media.author));
  } else if (forms.includes('podcastseries')) {
    left = '';
  } else if (forms.includes('podcastepisode') || forms.includes('episode') || forms.includes('podcast')) {
    const seriesTitle =
      (media.podcastSeries && typeof media.podcastSeries === 'object' && media.podcastSeries.title)
      || media.podcastTitle
      || '';
    left = slugifySegment(
      seriesTitle
      || firstCreatorName(media.host)
      || artistDisplayName(media.artist)
      || firstCreatorName(media.artist)
    );
  } else {
    left = slugifySegment(
      firstCreatorName(media.artist)
      || artistDisplayName(media.artist)
      || media.creatorDisplay
    );
  }

  let base = [left, titleSlug].filter(Boolean).join('-') || 'untitled';
  if (base.length > MAX_SLUG_LENGTH) {
    base = base.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  }
  if (isUuidString(base) || isMongoObjectIdString(base)) {
    base = `${base.slice(0, MAX_SLUG_LENGTH - 6)}-media`.replace(/-+$/g, '');
  }
  return base || 'untitled';
}

/** Current slug is the canonical base, or a collision suffix of that base (`-2`, `-3`). */
function slugMatchesBase(currentSlug, base) {
  if (!currentSlug || !base) return false;
  const current = String(currentSlug).toLowerCase();
  const root = String(base).toLowerCase();
  if (current === root) return true;
  return new RegExp(`^${escapeRegex(root)}-\\d+$`).test(current);
}

function normalizeAliasList(slugAliases, forbidden) {
  const skip = new Set((forbidden || []).filter(Boolean).map((slug) => String(slug).toLowerCase()));
  const aliases = [];
  const seen = new Set();
  for (const alias of slugAliases || []) {
    const value = String(alias || '').toLowerCase().trim();
    if (!value || skip.has(value) || seen.has(value)) continue;
    seen.add(value);
    aliases.push(value);
  }
  return aliases;
}

/**
 * Decide the stored slug after a title/artist change.
 * `availableSlug` is the unique slug the caller already reserved (base, or base-N).
 * The previous slug is kept as an alias so existing links still open the tune.
 */
function planSlugUpdate({ currentSlug, slugAliases, availableSlug, base }) {
  const current = currentSlug ? String(currentSlug).toLowerCase() : '';
  const next = availableSlug ? String(availableSlug).toLowerCase() : '';
  const aliases = normalizeAliasList(slugAliases, [next]);

  if (!next) {
    return { slug: current || null, slugAliases: aliases, changed: false };
  }
  if (!current) {
    return { slug: next, slugAliases: aliases, changed: true };
  }
  if (current === next) {
    const original = normalizeAliasList(slugAliases, []);
    const changed = original.length !== aliases.length || original.some((alias, i) => alias !== aliases[i]);
    return { slug: current, slugAliases: aliases, changed };
  }
  // Numbered collision slug, and the bare artist-title URL is still taken.
  if (slugMatchesBase(current, base) && next !== base && slugMatchesBase(next, base)) {
    return { slug: current, slugAliases: aliases, changed: false };
  }

  if (!aliases.includes(current)) aliases.push(current);
  return {
    slug: next,
    slugAliases: aliases.slice(-MAX_SLUG_ALIASES),
    changed: true,
  };
}

module.exports = {
  MAX_SLUG_LENGTH,
  MAX_SLUG_ALIASES,
  SLUG_SOURCE_FIELDS,
  firstCreatorName,
  buildMediaSlugBase,
  slugMatchesBase,
  planSlugUpdate,
};
