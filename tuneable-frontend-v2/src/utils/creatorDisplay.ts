/**
 * Utility function to get creator display string
 * Uses creatorDisplay if available, otherwise falls back to formatting artist/featuring arrays
 */
export function getCreatorDisplay(media: any): string {
  // Handle null/undefined media
  if (!media) {
    return 'Unknown Artist';
  }
  
  // If creatorDisplay is set, use it
  if (media.creatorDisplay) {
    return media.creatorDisplay;
  }
  
  // Fallback: format from artist and featuring arrays
  const artistEntries: Array<{ name: string; relationToNext?: string | null }> = [];
  
  if (Array.isArray(media.artist)) {
    media.artist.forEach((artist: any) => {
      if (!artist) return;
      if (typeof artist === 'string') {
        artistEntries.push({ name: artist, relationToNext: null });
      } else if (artist.name) {
        artistEntries.push({
          name: artist.name,
          relationToNext: artist.relationToNext || null
        });
      }
    });
  } else if (media.artist) {
    artistEntries.push({ name: media.artist, relationToNext: null });
  }
  
  if (artistEntries.length === 0) {
    return 'Unknown Artist';
  }
  
  let display = '';
  artistEntries.forEach((artist, index) => {
    display += artist.name;
    const isLast = index === artistEntries.length - 1;
    if (!isLast) {
      const relation = artist.relationToNext || '&';
      if (relation === ',') {
        display += ', ';
      } else {
        display += ` ${relation.trim()} `;
      }
    }
  });
  
  // Add featuring if available
  if (media.featuring && Array.isArray(media.featuring) && media.featuring.length > 0) {
    const featNames = media.featuring.map((f: any) => f.name || f).filter(Boolean);
    if (featNames.length > 0) {
      display += ` ft. ${featNames.join(', ')}`;
    }
  }
  
  return display;
}

