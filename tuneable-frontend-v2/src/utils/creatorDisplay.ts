/**
 * Utility function to get creator display string
 * Uses creatorDisplay if available, otherwise falls back to formatting artist/featuring arrays
 */
export function getCreatorDisplay(media: any): string {
  // If creatorDisplay is set, use it
  if (media.creatorDisplay) {
    return media.creatorDisplay;
  }
  
  // Fallback: format from artist and featuring arrays
  const artistNames: string[] = [];
  
  if (Array.isArray(media.artist)) {
    artistNames.push(...media.artist.map((a: any) => a.name || a).filter(Boolean));
  } else if (media.artist) {
    artistNames.push(media.artist);
  }
  
  if (artistNames.length === 0) {
    return 'Unknown Artist';
  }
  
  let display = artistNames.join(' & ');
  
  // Add featuring if available
  if (media.featuring && Array.isArray(media.featuring) && media.featuring.length > 0) {
    const featNames = media.featuring.map((f: any) => f.name || f).filter(Boolean);
    if (featNames.length > 0) {
      display += ` ft. ${featNames.join(', ')}`;
    }
  }
  
  return display;
}

