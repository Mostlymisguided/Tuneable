import React from 'react';
import { Link } from 'react-router-dom';
import { getCreatorDisplay } from '../utils/creatorDisplay';

interface Artist {
  name: string;
  userId?: string | { _id: string; uuid?: string } | null;
  collectiveId?: string | { _id: string } | null;
  verified?: boolean;
}

interface ClickableArtistDisplayProps {
  media: {
    artist?: Artist[] | string;
    artists?: Artist[]; // Full artist array (backend sends this separately)
    featuring?: Artist[] | string[];
    creatorDisplay?: string;
  };
  className?: string;
  showFeaturing?: boolean;
}

/**
 * Component to display artist/creatorDisplay with clickable links when userId exists
 * Handles both artist array format and creatorDisplay string format
 */
const ClickableArtistDisplay: React.FC<ClickableArtistDisplayProps> = ({
  media,
  className = '',
  showFeaturing = true
}) => {
  // Get artist array (handle both array and string formats)
  // Prefer 'artists' array if available (backend sends this with userIds)
  // Otherwise use 'artist' field
  const artistArray: Artist[] = Array.isArray(media.artists) && media.artists.length > 0
    ? media.artists
    : Array.isArray(media.artist) && media.artist.length > 0
    ? media.artist
    : media.artist && typeof media.artist === 'string'
    ? [{ name: media.artist }]
    : [];

  // Get featuring array (handle both array of objects and array of strings)
  const featuringArray: Artist[] = Array.isArray(media.featuring)
    ? media.featuring.map(f => 
        typeof f === 'string' 
          ? { name: f } 
          : f
      )
    : [];

  // If we have artist array with userIds, render with links
  if (artistArray.length > 0) {
    // Check if any artist has a userId (handle both ObjectId strings and populated objects)
    const hasAnyUserId = artistArray.some(a => {
      const userId = a.userId;
      return userId !== null && userId !== undefined && 
             (typeof userId === 'string' || typeof userId === 'object');
    }) || (showFeaturing && featuringArray.some(f => {
      const userId = f.userId;
      return userId !== null && userId !== undefined && 
             (typeof userId === 'string' || typeof userId === 'object');
    }));
    
    if (hasAnyUserId) {
      // Render with clickable links
      return (
        <span className={className}>
          {artistArray.map((artist, idx) => {
            const userId = typeof artist.userId === 'object' && artist.userId?._id
              ? artist.userId._id
              : typeof artist.userId === 'string'
              ? artist.userId
              : null;
            
            const uuid = typeof artist.userId === 'object' && artist.userId?.uuid
              ? artist.userId.uuid
              : null;
            
            const linkPath = uuid ? `/user/${uuid}` : userId ? `/user/${userId}` : null;
            
            const relation = (artist as any)?.relationToNext;
            const relationText = relation && relation !== ','
              ? ` ${relation.trim()} `
              : relation === ','
              ? ', '
              : ' & ';

            return (
              <React.Fragment key={idx}>
                {linkPath ? (
                  <Link
                    to={linkPath}
                    className="hover:text-purple-200 hover:underline transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {artist.name}
                  </Link>
                ) : (
                  <span>{artist.name}</span>
                )}
                {idx < artistArray.length - 1 && (
                  <span>{relationText}</span>
                )}
              </React.Fragment>
            );
          })}
          {showFeaturing && featuringArray.length > 0 && (
            <>
              <span> ft. </span>
              {featuringArray.map((feat, idx) => {
                const userId = typeof feat.userId === 'object' && feat.userId?._id
                  ? feat.userId._id
                  : typeof feat.userId === 'string'
                  ? feat.userId
                  : null;
                
                const uuid = typeof feat.userId === 'object' && feat.userId?.uuid
                  ? feat.userId.uuid
                  : null;
                
                const linkPath = uuid ? `/user/${uuid}` : userId ? `/user/${userId}` : null;
                
                return (
                  <React.Fragment key={idx}>
                    {linkPath ? (
                      <Link
                        to={linkPath}
                        className="hover:text-purple-200 hover:underline transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {feat.name}
                      </Link>
                    ) : (
                      <span>{feat.name}</span>
                    )}
                    {idx < featuringArray.length - 1 && <span>, </span>}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </span>
      );
    }
  }

  // Fallback: use creatorDisplay or getCreatorDisplay helper
  const displayText = media.creatorDisplay || getCreatorDisplay(media);
  
  // Try to parse creatorDisplay and match back to artist array for userIds
  // This is a simple approach - for complex cases, we'd need more sophisticated parsing
  if (displayText && artistArray.length > 0) {
    // Check if first artist has userId
    const firstArtist = artistArray[0];
    const userId = typeof firstArtist.userId === 'object' && firstArtist.userId?._id
      ? firstArtist.userId._id
      : typeof firstArtist.userId === 'string'
      ? firstArtist.userId
      : null;
    
    const uuid = typeof firstArtist.userId === 'object' && firstArtist.userId?.uuid
      ? firstArtist.userId.uuid
      : null;
    
    const linkPath = uuid ? `/user/${uuid}` : userId ? `/user/${userId}` : null;
    
    if (linkPath) {
      // If first artist has userId, make the whole display clickable
      // (Future: could parse and make individual artists clickable)
      return (
        <Link
          to={linkPath}
          className={`hover:text-purple-200 hover:underline transition-colors ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {displayText}
        </Link>
      );
    }
  }

  // Final fallback: plain text
  return <span className={className}>{displayText || 'Unknown Artist'}</span>;
};

export default ClickableArtistDisplay;

