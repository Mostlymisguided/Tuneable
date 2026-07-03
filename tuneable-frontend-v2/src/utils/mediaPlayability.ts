/**
 * Client-side playability checks (mirrors tuneable-backend/utils/mediaPlayability.js).
 */

export type SupportMode = 'tip';

export interface PlayabilityFields {
  isPlayable?: boolean;
  supportMode?: SupportMode;
  isYouTubeOnly?: boolean;
  awaitingUpload?: boolean;
}

type MediaLike = PlayabilityFields & {
  sources?: Record<string, string> | Array<{ platform?: string; url?: string; youtube?: string }> | null;
  rightsCleared?: boolean;
  rightsStatus?: 'cleared' | 'pending' | 'disputed';
  contentForm?: string | string[];
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

export function isPodcastLike(media: MediaLike | null | undefined): boolean {
  const forms = media?.contentForm;
  if (!forms) return false;
  const list = Array.isArray(forms) ? forms : [forms];
  return list.some((f) =>
    ['podcastepisode', 'podcast', 'episode', 'audiobook'].includes(f)
  );
}

function hasDirectAudioSource(sources: Record<string, string>): boolean {
  return !!(
    sources.upload ||
    sources.audio_direct ||
    sources.audio ||
    sources.enclosure
  );
}

export function isYouTubeOnly(media: MediaLike | null | undefined): boolean {
  const sources = normalizeSources(media?.sources);
  return !!sources.youtube && !sources.upload;
}

export function isMediaPlayable(media: MediaLike | null | undefined): boolean {
  if (!media) return false;

  if (typeof media.isPlayable === 'boolean') {
    return media.isPlayable;
  }

  const sources = normalizeSources(media.sources);

  if (isPodcastLike(media)) {
    return hasDirectAudioSource(sources);
  }

  if (isPodcastLike(media)) {
    return hasDirectAudioSource(sources);
  }

  if (media.rightsStatus === 'disputed') {
    return false;
  }
  if (media.rightsStatus === 'pending') {
    return !!sources.upload;
  }

  return !!(sources.upload && (media.rightsCleared ?? true));
}

export function getSupportMode(media: MediaLike | null | undefined): SupportMode {
  if (media?.supportMode === 'tip') return 'tip';
  return 'tip';
}

export function enrichMediaWithPlayability<T extends MediaLike>(media: T): T & PlayabilityFields {
  const playable = isMediaPlayable(media);
  return {
    ...media,
    isPlayable: playable,
    supportMode: getSupportMode(media),
    isYouTubeOnly: isYouTubeOnly(media),
    awaitingUpload: !playable && !isPodcastLike(media),
  };
}
