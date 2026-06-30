/**
 * Media playability helpers for the YouTube → pledge → upload transition.
 *
 * Playable music requires an uploaded file (sources.upload) and cleared rights.
 * Podcast/spoken content may use other direct audio source keys.
 */

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
  const forms = media?.contentForm;
  if (!forms) return false;
  const list = Array.isArray(forms) ? forms : [forms];
  return list.some((f) => ['podcastepisode', 'podcast', 'episode', 'audiobook'].includes(f));
}

function hasDirectAudioSource(sources) {
  return !!(
    sources.upload ||
    sources.audio_direct ||
    sources.audio ||
    sources.enclosure
  );
}

function isYouTubeOnly(media) {
  const sources = normalizeSources(media?.sources);
  return !!sources.youtube && !sources.upload;
}

function isMediaPlayable(media) {
  if (!media) return false;

  const sources = normalizeSources(media.sources);

  if (isPodcastLike(media)) {
    return hasDirectAudioSource(sources);
  }

  return !!(sources.upload && (media.rightsCleared ?? true));
}

function getSupportMode(media) {
  if (isMediaPlayable(media)) return 'tip';
  if (isYouTubeOnly(media)) return 'pledge';
  return 'pledge';
}

function enrichMediaWithPlayability(media) {
  const playable = isMediaPlayable(media);
  return {
    isPlayable: playable,
    supportMode: getSupportMode(media),
    isYouTubeOnly: isYouTubeOnly(media),
    awaitingUpload: !playable && !isPodcastLike(media),
  };
}

module.exports = {
  normalizeSources,
  isPodcastLike,
  hasDirectAudioSource,
  isYouTubeOnly,
  isMediaPlayable,
  getSupportMode,
  enrichMediaWithPlayability,
};
