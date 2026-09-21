type MediaPathFields = {
  _id?: string;
  mediaId?: string;
  uuid?: string;
  mediaUuid?: string;
  slug?: string;
  contentForm?: string[] | string;
  contentType?: string[] | string;
};

function formList(value?: string[] | string): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function mediaIdentifier(media: MediaPathFields): string {
  const ident = media.slug || media.uuid || media.mediaUuid || media._id || media.mediaId || '';
  return ident ? encodeURIComponent(String(ident)) : '';
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

