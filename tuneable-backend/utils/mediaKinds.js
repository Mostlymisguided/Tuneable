/**
 * Content-kind helpers. Media stores contentType / contentForm;
 * some older call sites used contentType / contentForm — accept both.
 */

const PODCAST_FORMS = ['podcast', 'podcastseries', 'episode', 'podcastepisode'];
const PODCAST_EPISODE_FORMS = ['podcast', 'episode', 'podcastepisode'];
const PODCAST_SERIES_FORMS = ['podcastseries'];
const WRITTEN_FORMS = ['book', 'article'];
const WRITTEN_TYPES = ['written'];

function asList(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function mediaForms(media) {
  if (!media) return [];
  return asList(media.contentForm ?? media.contentForm);
}

function mediaTypes(media) {
  if (!media) return [];
  return asList(media.contentType ?? media.contentType);
}

function isWrittenMedia(media) {
  if (!media) return false;
  if (mediaTypes(media).some((t) => WRITTEN_TYPES.includes(t))) return true;
  return mediaForms(media).some((f) => WRITTEN_FORMS.includes(f));
}

function isBookMedia(media) {
  return mediaForms(media).includes('book');
}

function isPodcastEpisode(media) {
  return mediaForms(media).some((form) => PODCAST_EPISODE_FORMS.includes(form));
}

function isPodcastSeries(media) {
  return mediaForms(media).some((form) => PODCAST_SERIES_FORMS.includes(form));
}

const BOOK_CATALOG_QUERY = {
  status: 'active',
  contentType: { $in: ['written'] },
  contentForm: { $in: ['book'] },
};

/** Forms never treated as music tracks by enrichment / coverage. */
const NON_MUSIC_FORMS = [...PODCAST_FORMS, 'series'];

/**
 * Music tracks eligible for metadata / location enrichment: not deleted,
 * contentType music (or legacy rows with no contentType) or form tune,
 * excluding podcast forms. Returns a fresh object each call.
 */
function musicMediaQuery() {
  return {
    $and: [
      { $or: [{ status: { $exists: false } }, { status: { $ne: 'deleted' } }] },
      { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
      {
        $or: [
          { contentType: 'music' },
          { contentForm: 'tune' },
          { contentType: { $exists: false } },
        ],
      },
      { contentForm: { $nin: NON_MUSIC_FORMS } },
    ],
  };
}

function isMusicMedia(media) {
  if (!media) return false;
  const forms = mediaForms(media);
  if (forms.some((f) => NON_MUSIC_FORMS.includes(f))) return false;
  const types = mediaTypes(media);
  if (types.includes('music') || forms.includes('tune')) return true;
  return types.length === 0;
}

module.exports = {
  PODCAST_FORMS,
  PODCAST_EPISODE_FORMS,
  PODCAST_SERIES_FORMS,
  WRITTEN_FORMS,
  WRITTEN_TYPES,
  asList,
  mediaForms,
  mediaTypes,
  isWrittenMedia,
  isBookMedia,
  isPodcastEpisode,
  isPodcastSeries,
  BOOK_CATALOG_QUERY,
  NON_MUSIC_FORMS,
  musicMediaQuery,
  isMusicMedia,
};
