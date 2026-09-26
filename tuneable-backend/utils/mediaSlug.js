/**
 * Human-readable URL slugs for Media (tunes, podcasts, books).
 * IDs stay on uuid/_id; slugs are a public routing layer.
 */

const { slugifySegment, artistDisplayName } = require('./readableUploadKey');
const { isUuidString, isMongoObjectIdString } = require('./identifierFormat');

const MAX_SLUG_LENGTH = 80;

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

module.exports = {
  MAX_SLUG_LENGTH,
  firstCreatorName,
  buildMediaSlugBase,
};
