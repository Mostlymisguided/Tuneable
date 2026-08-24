/**
 * Content-kind helpers. Media stores contentType / contentForm;
 * some older call sites used contentType / contentForm — accept both.
 */

const PODCAST_FORMS = ['podcast', 'podcastseries', 'episode', 'podcastepisode'];
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

const BOOK_CATALOG_QUERY = {
  status: 'active',
  contentType: { $in: ['written'] },
  contentForm: { $in: ['book'] },
};

module.exports = {
  PODCAST_FORMS,
  WRITTEN_FORMS,
  WRITTEN_TYPES,
  asList,
  mediaForms,
  mediaTypes,
  isWrittenMedia,
  isBookMedia,
  BOOK_CATALOG_QUERY,
};
