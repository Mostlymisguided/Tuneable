/**
 * Client-side playability checks (mirrors tuneable-backend/utils/mediaPlayability.js).
 *
 * Pending-rights uploads are not playable. Direct audio URLs should already be
 * stripped by the API; the client still refuses to play pending/disputed tracks.
 */

export type SupportMode = 'tip';

/** Why a non-podcast track is not playable (null when playable). */
export type PlayabilityBlockReason = 'rights' | 'audio' | 'disputed' | null;

export interface PlayabilityFields {
  isPlayable?: boolean;
  supportMode?: SupportMode;
  isYouTubeOnly?: boolean;
  awaitingUpload?: boolean;
  playabilityBlockReason?: PlayabilityBlockReason;
  hasHostedAudio?: boolean;
}

const DIRECT_AUDIO_SOURCE_KEYS = ['upload', 'audio_direct', 'audio', 'enclosure'] as const;

type MediaLike = PlayabilityFields & {
  sources?: Record<string, string> | Array<{ platform?: string; url?: string; youtube?: string }> | null;
  rightsCleared?: boolean;
  rightsStatus?: 'cleared' | 'pending' | 'disputed';
  contentForm?: string | string[];
  contentType?: string | string[];
};

export function normalizeSources(
  sources: MediaLike['sources']
): Record<string, string> {
  if (!sources) return {};

  if (Array.isArray(sources)) {
    const obj: Record<string, string> = {};
    for (const source of sources) {
      if (!source) continue;
      if (source.platform && source.url) {
        obj[source.platform] = source.url;
      } else if (typeof source === 'object') {
        if (source.youtube) obj.youtube = source.youtube;
        if ((source as Record<string, string>).upload) {
          obj.upload = (source as Record<string, string>).upload;
        }
      }
    }
    return obj;
  }

  if (typeof sources === 'object') {
    return { ...sources };
  }

  return {};
}

export function isWrittenMedia(media: MediaLike | null | undefined): boolean {
  const types = media?.contentType;
  const typeList = Array.isArray(types) ? types : types ? [types] : [];
  if (typeList.includes('written')) return true;
  const forms = media?.contentForm;
  if (!forms) return false;
  const list = Array.isArray(forms) ? forms : [forms];
  return list.some((f) => ['book', 'article'].includes(f));
}

export function isPodcastLike(media: MediaLike | null | undefined): boolean {
  const forms = media?.contentForm;
  if (!forms) return false;
  const list = Array.isArray(forms) ? forms : [forms];
  return list.some((f) =>
    ['podcastepisode', 'podcast', 'episode', 'audiobook'].includes(f)
  );
}

function hasDirectAudioSource(sources: Record<string, string>): boolean {
  return DIRECT_AUDIO_SOURCE_KEYS.some((key) => !!sources[key]);
}

function stripDirectAudioSources(sources: Record<string, string>): Record<string, string> {
  const stripped = { ...sources };
  for (const key of DIRECT_AUDIO_SOURCE_KEYS) {
    delete stripped[key];
  }
  return stripped;
}

export function isYouTubeOnly(media: MediaLike | null | undefined): boolean {
  const sources = normalizeSources(media?.sources);
  return !!sources.youtube && !sources.upload;
}

export function isMediaPlayable(media: MediaLike | null | undefined): boolean {
  if (!media) return false;
  if (isWrittenMedia(media)) return false;

  const sources = normalizeSources(media.sources);

  if (isPodcastLike(media)) {
    return hasDirectAudioSource(sources);
  }

  if (media.rightsStatus === 'disputed' || media.rightsStatus === 'pending') {
    return false;
  }

  if (media.isPlayable === false) return false;

  return !!(sources.upload && media.rightsCleared === true);
}

export function getSupportMode(media: MediaLike | null | undefined): SupportMode {
  if (media?.supportMode === 'tip') return 'tip';
  return 'tip';
}

/**
 * Classify why a non-podcast track is not playable. Prefer rights over missing audio when both apply.
 */
export function getPlayabilityBlockReason(
  media: MediaLike | null | undefined
): PlayabilityBlockReason {
  if (!media || isMediaPlayable(media) || isPodcastLike(media)) return null;
  if (isWrittenMedia(media)) return 'audio';

  if (media.rightsStatus === 'disputed') return 'disputed';
  if (media.rightsStatus === 'pending') return 'rights';

  const sources = normalizeSources(media.sources);
  if (!hasDirectAudioSource(sources)) return 'audio';
  if (media.rightsCleared === false) return 'rights';

  return 'audio';
}

export function isRightsPendingClaimable(
  media: { rightsStatus?: string; rightsCleared?: boolean } | null | undefined
): boolean {
  if (!media) return false;
  return media.rightsStatus === 'pending' && !media.rightsCleared;
}

export function enrichMediaWithPlayability<T extends MediaLike>(media: T): T & PlayabilityFields {
  const originalSources = normalizeSources(media.sources);
  const playable = isMediaPlayable({ ...media, sources: originalSources });
  const podcast = isPodcastLike(media);
  const written = isWrittenMedia(media);
  const hasHostedAudio = typeof media.hasHostedAudio === 'boolean'
    ? media.hasHostedAudio
    : (!podcast && !written && hasDirectAudioSource(originalSources));
  const clientSources = playable || podcast
    ? originalSources
    : stripDirectAudioSources(originalSources);
  const playabilityBlockReason = getPlayabilityBlockReason({
    ...media,
    sources: originalSources,
  });
  return {
    ...media,
    sources: clientSources,
    isPlayable: playable,
    supportMode: getSupportMode(media),
    isYouTubeOnly: isYouTubeOnly({ ...media, sources: originalSources }),
    awaitingUpload: !playable && !podcast && !written && !hasHostedAudio,
    playabilityBlockReason,
    hasHostedAudio,
  };
}
