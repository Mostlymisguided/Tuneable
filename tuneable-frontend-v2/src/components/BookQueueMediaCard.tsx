import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Loader } from 'lucide-react';
import MiniSupportersBar from './MiniSupportersBar';
import TagList from './TagList';
import BookCover from './BookCover';
import {
  getCountryLabelFromLocation,
  getCountryPlaceProfilePath,
  type ResolvedLocation,
} from '../utils/locationHelpers';

const META_LINK_CLASS =
  'truncate max-w-[9rem] md:max-w-[12rem] text-gray-300 hover:text-white hover:underline underline-offset-2 transition-colors no-underline';

export interface BookChartCardData {
  _id?: string;
  id?: string;
  title: string;
  coverArt?: string;
  authors?: string[];
  creatorDisplay?: string;
  author?: Array<{ name?: string }>;
  tags?: string[];
  globalMediaAggregate?: number;
  timePeriodBidValue?: number;
  periodTotal?: number;
  createdAt?: string;
  releaseDate?: string;
  publisher?: string;
  pages?: number;
  pageCount?: number;
  releaseYear?: number | null;
  publishedYear?: number | null;
  primaryLocation?: ResolvedLocation | null;
  bids?: Array<{
    _id?: string;
    userId: {
      username: string;
      profilePic?: string;
      uuid: string;
      homeLocation?: ResolvedLocation;
      secondaryLocation?: ResolvedLocation;
    };
    amount: number;
    createdAt: string;
    status?: string;
    bidderCountryPlaceId?: string | null;
    bidderCountry?: string | null;
    bidderCountryCode?: string | null;
    bidderPlaceLabel?: string | null;
    bidderFeatureType?: string | null;
    bidderHomePlaceId?: string | null;
    bidderLocationDisplay?: string | null;
  }>;
}

export function bookAuthorLine(book: BookChartCardData): string {
  if (book.creatorDisplay) return book.creatorDisplay;
  if (book.authors?.length) return book.authors.join(', ');
  if (book.author?.length) return book.author.map((a) => a.name).filter(Boolean).join(', ');
  return 'Unknown author';
}

function releaseYear(book: BookChartCardData): number | null {
  const year = book.releaseYear ?? book.publishedYear;
  if (typeof year === 'number' && year >= 1000 && year <= 2100) return Math.trunc(year);
  return null;
}

export interface BookQueueMediaCardProps {
  book: BookChartCardData;
  index: number;
  showRank?: boolean;
  isTipping?: boolean;
  onTip: (book: BookChartCardData, event: React.MouseEvent) => void;
}

const BookQueueMediaCard: React.FC<BookQueueMediaCardProps> = ({
  book,
  index,
  showRank = true,
  isTipping = false,
  onTip,
}) => {
  const tags = Array.isArray(book.tags) ? book.tags : [];
  const mediaId = book._id || book.id || '';
  const href = mediaId ? `/book/${mediaId}` : undefined;
  const author = bookAuthorLine(book);
  const year = releaseYear(book);
  const pages = book.pages || book.pageCount || null;
  const country = getCountryLabelFromLocation(book.primaryLocation);
  const countryPath = getCountryPlaceProfilePath(book.primaryLocation);
  const rank = index + 1;

  const metaParts: React.ReactNode[] = [];
  if (year != null) {
    metaParts.push(
      <span key="year" className="tabular-nums">
        {year}
      </span>
    );
  }
  if (pages) {
    metaParts.push(
      <span key="pages" className="tabular-nums">
        {pages}p
      </span>
    );
  }
  if (country) {
    metaParts.push(
      countryPath ? (
        <Link
          key="country"
          to={countryPath}
          title={country}
          onClick={(e) => e.stopPropagation()}
          className={META_LINK_CLASS}
        >
          {country}
        </Link>
      ) : (
        <span key="country" title={country} className="truncate max-w-[9rem] md:max-w-[12rem]">
          {country}
        </span>
      )
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden backdrop-blur-md bg-gray-900/50 border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center hover:shadow-[0_0_30px_rgba(168,85,247,0.15)] transition-shadow relative p-1.5 md:p-4">
      <div className="flex flex-row items-start gap-2 md:contents">
        <div className="relative w-12 h-12 md:w-20 md:h-20 rounded overflow-hidden group flex-shrink-0">
          {href ? (
            <Link to={href} className="block w-full h-full" tabIndex={-1}>
              <BookCover
                src={book.coverArt}
                alt={book.title}
                className="w-full h-full object-cover"
              />
            </Link>
          ) : (
            <BookCover
              src={book.coverArt}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          )}
          {showRank && (
            <span
              className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35 text-white font-bold tabular-nums leading-none ${
                rank >= 100 ? 'text-xs md:text-sm' : 'text-sm md:text-lg'
              }`}
              aria-label={`Chart position ${rank}`}
            >
              {rank}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 md:ml-4 pr-11 md:pr-0">
          <div className="flex items-center gap-2 min-w-0">
            <h4 className="flex-1 min-w-0 font-medium text-white text-sm truncate">
              {href ? (
                <Link to={href} className="hover:text-purple-300 transition-colors">
                  {book.title}
                </Link>
              ) : (
                book.title
              )}
            </h4>
            {metaParts.length > 0 && (
              <div className="flex items-center gap-1.5 flex-shrink-0 text-xs text-gray-400">
                {metaParts.flatMap((part, i) =>
                  i === 0
                    ? [part]
                    : [
                        <span key={`sep-${i}`} className="text-gray-600" aria-hidden>
                          ·
                        </span>,
                        part,
                      ]
                )}
              </div>
            )}
          </div>
          <p className="text-gray-400 text-xs truncate">{author}</p>
          {tags.length > 0 && (
            <div className="hidden md:block mt-1">
              <TagList tags={tags} mediaId={mediaId} limit={5} />
            </div>
          )}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="md:hidden mt-1">
          <TagList tags={tags} mediaId={mediaId} limit={3} />
        </div>
      )}

      <div className="flex items-center md:ml-2 md:mr-4 flex-shrink-0">
        <MiniSupportersBar bids={book.bids || []} maxVisible={5} scrollable />
      </div>

      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 md:static md:translate-y-0 md:flex md:items-center md:justify-center md:ml-auto flex-shrink-0 z-10">
        <button
          type="button"
          onClick={(event) => onTip(book, event)}
          disabled={isTipping}
          title="Send a tip"
          aria-label="Send a tip"
          className="group flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full bg-purple-900/40 border border-purple-500/40 text-purple-300 hover:bg-purple-600 hover:text-white hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isTipping ? (
            <Loader className="h-5 w-5 animate-spin" />
          ) : (
            <Heart className="h-5 w-5 md:h-6 md:w-6 transition-transform group-hover:scale-110" />
          )}
        </button>
      </div>
    </div>
  );
};

export default BookQueueMediaCard;
