import React, { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { getCreatorDisplay } from '../utils/creatorDisplay';
import { getUserProfileUrl } from '../utils/profileNavigation';
import {
  catalogPathForName,
  getArtistCatalogIndex,
  subscribeArtistCatalogIndex,
} from '../utils/artistCatalogIndex';

interface Artist {
  name: string;
  userId?: string | { _id: string; uuid?: string; username?: string } | null;
  collectiveId?: string | { _id: string } | null;
  verified?: boolean;
}

interface ClickableArtistDisplayProps {
  media: {
    artist?: Artist[] | string;
    artists?: Artist[]; // Full artist array (backend sends this separately)
    featuring?: Artist[] | string[];
    creatorDisplay?: string;
    host?: Artist[] | string[];
    author?: Artist[] | string[];
    contentForm?: string[] | string;
    podcastTitle?: string;
    podcastSeries?: { title?: string } | string | null;
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
  const catalogIndex = useSyncExternalStore(
    subscribeArtistCatalogIndex,
    getArtistCatalogIndex,
    getArtistCatalogIndex
  );

  const hrefFor = (person: Artist): string | null => {
    const catalogPath = catalogPathForName(person.name || '', catalogIndex);
    if (catalogPath) return catalogPath;

    const populated = typeof person.userId === 'object' && person.userId
      ? person.userId
      : null;
    if (populated) return getUserProfileUrl(populated);

    const userId = typeof person.userId === 'string' ? person.userId : null;
    return userId ? getUserProfileUrl(userId) : null;
  };

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

  const hasLink = artistArray.some((artist) => hrefFor(artist))
    || (showFeaturing && featuringArray.some((artist) => hrefFor(artist)));

  // If we have artist array with a profile or catalog page, render with links
  if (artistArray.length > 0 && hasLink) {
      // Render with clickable links
      return (
        <span className={className}>
          {artistArray.map((artist, idx) => {
            const linkPath = hrefFor(artist);
            
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
                const linkPath = hrefFor(feat);
                
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

  // Fallback: use creatorDisplay or getCreatorDisplay helper
  const displayText = media.creatorDisplay || getCreatorDisplay(media);
  
  // Try to parse creatorDisplay and match back to artist array for userIds
  // This is a simple approach - for complex cases, we'd need more sophisticated parsing
  if (displayText && artistArray.length > 0) {
    const linkPath = hrefFor(artistArray[0]);
    
    if (linkPath) {
      // If first artist has a page, make the whole display clickable
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

