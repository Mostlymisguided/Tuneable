import React, { useState } from 'react';
import { DEFAULT_BOOK_COVER_ART } from '../constants';
import { resolveBookCoverArt } from '../utils/coverArt';

type BookCoverProps = {
  src?: string | null;
  alt?: string;
  className?: string;
};

/** Book jacket, or the shared placeholder when the source is missing or fails to load. */
const BookCover: React.FC<BookCoverProps> = ({ src, alt = '', className }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolved = resolveBookCoverArt(src);
  const showPlaceholder = failedSrc != null && failedSrc === (src || '');
  const imageSrc = showPlaceholder ? DEFAULT_BOOK_COVER_ART : resolved;

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onLoad={(event) => {
        const img = event.currentTarget;
        // Open Library answers missing jackets with a tiny GIF and HTTP 200.
        if (img.naturalWidth > 0 && img.naturalWidth < 20 && imageSrc !== DEFAULT_BOOK_COVER_ART) {
          setFailedSrc(src || '');
        }
      }}
      onError={() => {
        if (imageSrc !== DEFAULT_BOOK_COVER_ART) setFailedSrc(src || '');
      }}
    />
  );
};

export default BookCover;
