/**
 * Media playability helpers for the metadata/import → upload transition.
 *
 * Playable music requires an uploaded file (sources.upload) AND cleared rights.
 * Pending library-import audio stays hosted for a later claim, but is not
 * streamed and direct audio URLs are stripped from public API responses.
 * Podcast/spoken content may use other direct audio source keys.
 */

const { isWrittenMedia } = require('./mediaKinds');

const DIRECT_AUDIO_SOURCE_KEYS = ['upload', 'audio_direct', 'audio', 'enclosure'];

function normalizeSources(sources) {
  if (!sources) return {};

  if (sources instanceof Map) {
    const obj = {};
    sources.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  if (Array.isArray(sources)) {
    const obj = {};
    for (const source of sources) {
      if (!source) continue;
      if (source.platform && source.url) {
        obj[source.platform] = source.url;
      } else if (typeof source === 'object') {
        Object.assign(obj, source);
      }
    }
    return obj;
  }

  if (typeof sources === 'object') {
    return { ...sources };
  }

  return {};
}

function isPodcastLike(media) {
  const forms = media?.contentForm ?? media?.contentForm;
  if (!forms) return false;
  const list = Array.isArray(forms) ? forms : [forms];
  return list.some((f) => ['podcastepisode', 'podcast', 'episode', 'audiobook'].includes(f));
}

function hasDirectAudioSource(sources) {
  const normalized = sources && typeof sources === 'object' && !Array.isArray(sources)
    ? sources
    : normalizeSources(sources);
  return DIRECT_AUDIO_SOURCE_KEYS.some((key) => !!normalized[key]);
}

function stripDirectAudioSources(sources) {
  const normalized = normalizeSources(sources);
  const stripped = { ...normalized };
  for (const key of DIRECT_AUDIO_SOURCE_KEYS) {
    delete stripped[key];
  }
  return stripped;
}

function isYouTubeOnly(media) {
  const sources = normalizeSources(media?.sources);
  return !!sources.youtube && !sources.upload;
}

function isMediaPlayable(media) {
  if (!media) return false;
  if (isWrittenMedia(media)) return false;

  const sources = normalizeSources(media.sources);

  if (isPodcastLike(media)) {
    return hasDirectAudioSource(sources);
  }

  if (media.rightsStatus === 'disputed' || media.rightsStatus === 'pending') {
    return false;
  }

  return !!(sources.upload && media.rightsCleared === true);
}

function getSupportMode(media) {
  return 'tip';
}

/**
 * Classify why a track cannot play. Prefer rights over missing audio when both apply.
 * @returns {'rights'|'audio'|'disputed'|null}
 */
function getPlayabilityBlockReason(media) {
  if (!media || isMediaPlayable(media) || isPodcastLike(media)) return null;
  if (isWrittenMedia(media)) return 'audio';

  if (media.rightsStatus === 'disputed') return 'disputed';
  if (media.rightsStatus === 'pending') return 'rights';

  const sources = normalizeSources(media.sources);
  if (!hasDirectAudioSource(sources)) return 'audio';
  if (media.rightsCleared === false) return 'rights';

  return 'audio';
}

function isRightsPendingClaimable(media) {
  if (!media) return false;
  return media.rightsStatus === 'pending' && !media.rightsCleared;
}

/**
 * Playability fields plus public-safe sources.
 * Direct audio URLs are omitted unless the track is actually playable
 * (or options.exposeDirectAudio is set for trusted admin responses).
 */
function enrichMediaWithPlayability(media, options = {}) {
  const originalSources = normalizeSources(media?.sources);
  const playable = isMediaPlayable({ ...media, sources: originalSources });
  const podcast = isPodcastLike(media);
  const written = isWrittenMedia(media);
  const hasHostedAudio = typeof media?.hasHostedAudio === 'boolean'
    ? media.hasHostedAudio
    : (!podcast && !written && hasDirectAudioSource(originalSources));
  const exposeDirectAudio = options.exposeDirectAudio === true || playable || podcast;
  const clientSources = exposeDirectAudio
    ? originalSources
    : stripDirectAudioSources(originalSources);

  return {
    isPlayable: playable,
    supportMode: getSupportMode(media),
    isYouTubeOnly: isYouTubeOnly({ ...media, sources: originalSources }),
    awaitingUpload: !playable && !podcast && !written && !hasHostedAudio,
    playabilityBlockReason: getPlayabilityBlockReason({ ...media, sources: originalSources }),
    hasHostedAudio,
    sources: clientSources,
  };
}

function availablePlatformsFromSources(sources) {
  return Object.entries(sources || {})
    .filter(([, url]) => !!url)
    .map(([platform, url]) => ({ platform, url }));
}

/**
 * Spread onto a media payload so callers cannot forget to sanitize sources.
 */
function toClientMedia(media, extra = {}, options = {}) {
  if (!media) return media;
  const playability = enrichMediaWithPlayability(media, options);
  return { ...media, ...playability, ...extra };
}

module.exports = {
  DIRECT_AUDIO_SOURCE_KEYS,
  normalizeSources,
  isPodcastLike,
  isWrittenMedia,
  hasDirectAudioSource,
  stripDirectAudioSources,
  isYouTubeOnly,
  isMediaPlayable,
  getSupportMode,
  getPlayabilityBlockReason,
  isRightsPendingClaimable,
  enrichMediaWithPlayability,
  availablePlatformsFromSources,
  toClientMedia,
};
