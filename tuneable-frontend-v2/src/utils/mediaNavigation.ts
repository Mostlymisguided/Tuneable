/**
 * Utility function to determine the correct profile URL for a media item
 * based on its contentForm
 */
export const getMediaProfileUrl = (media: { _id: string; contentForm?: string[] | string }): string => {
  const contentForm = Array.isArray(media.contentForm) 
    ? media.contentForm 
    : media.contentForm 
    ? [media.contentForm] 
    : [];
  
  if (contentForm.includes('podcastepisode')) {
    return `/podcasts/${media._id}`;
  }
  return `/tune/${media._id}`;
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

