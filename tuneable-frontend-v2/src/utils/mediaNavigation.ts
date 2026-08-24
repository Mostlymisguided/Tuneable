type MediaPathFields = {
  _id?: string;
  mediaId?: string;
  uuid?: string;
  mediaUuid?: string;
  contentForm?: string[] | string;
  contentType?: string[] | string;
};

function formList(value?: string[] | string): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

/**
 * Profile URL for a media item based on contentForm / contentType.
 */
export const getMediaProfileUrl = (media: MediaPathFields): string => {
  const id = media._id || media.mediaId || media.uuid || media.mediaUuid || '';
  const contentForm = formList(media.contentForm);
  const contentType = formList(media.contentType);

  if (contentForm.includes('podcastepisode')) {
    return `/podcasts/${id}`;
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

