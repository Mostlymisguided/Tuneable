type MediaPathFields = {
  _id?: string;
  mediaId?: string;
  uuid?: string;
  mediaUuid?: string;
  slug?: string | null;
  contentForm?: string[] | string;
  contentType?: string[] | string;
};

function formList(value?: string[] | string): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function mediaIdentifier(media: MediaPathFields): string {
  let ident = String(media.slug || media.uuid || media.mediaUuid || media._id || media.mediaId || '').trim();
  if (!ident) return '';
  if (/^https?:\/\//i.test(ident)) {
    try {
      ident = new URL(ident).pathname;
    } catch {
      // Keep the raw value if it is not a parseable URL.
    }
  }
  ident = ident.replace(/^\/+/, '').replace(/^(tune|podcasts|podcast|book)\//, '');
  return encodeURIComponent(ident);
}

/** Prefix the current site once. A path that is already absolute is left alone. */
export function toAbsoluteUrl(pathOrUrl: string, origin = window.location.origin): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${origin.replace(/\/$/, '')}${path}`;
}

/** Pick slug/uuid/_id from mixed list payloads (library rows, queue items, history). */
export function toMediaPathFields(media?: Record<string, any> | null): MediaPathFields {
  if (!media) return {};
  return {
    slug: media.slug || undefined,
    uuid: media.uuid || media.mediaUuid,
    mediaUuid: media.mediaUuid,
    _id: media._id || media.id,
    mediaId: media.mediaId,
    contentForm: media.contentForm,
    contentType: media.contentType,
  };
}

/**
 * Profile URL for a media item based on contentForm / contentType.
 * Prefers human-readable slug when present.
 */
export const getMediaProfileUrl = (media: MediaPathFields): string => {
  const id = mediaIdentifier(media);
  const contentForm = formList(media.contentForm);
  const contentType = formList(media.contentType);

  if (contentForm.includes('podcastepisode')) {
    return `/podcasts/${id}`;
  }
  if (contentForm.includes('podcastseries')) {
    return `/podcast/${id}`;
  }
  if (
    contentType.includes('written') ||
    contentForm.includes('book') ||
    contentForm.includes('article')
  ) {
    return `/book/${id}`;
  }
  return `/tune/${id}`;
};

/**
 * Check if a media item is a podcast episode
 */
export const isPodcastEpisode = (media: { contentForm?: string[] | string }): boolean => {
  const contentForm = Array.isArray(media.contentForm) 
    ? media.contentForm 
    : media.contentForm 
    ? [media.contentForm] 
    : [];
  
  return contentForm.includes('podcastepisode');
};

export const isBookMedia = (media: { contentForm?: string[] | string; contentType?: string[] | string }): boolean => {
  const types = Array.isArray(media.contentType) ? media.contentType : media.contentType ? [media.contentType] : [];
  if (types.includes('written')) return true;
  const contentForm = Array.isArray(media.contentForm) 
    ? media.contentForm 
    : media.contentForm 
    ? [media.contentForm] 
    : [];
  return contentForm.includes('book') || contentForm.includes('article');
};

