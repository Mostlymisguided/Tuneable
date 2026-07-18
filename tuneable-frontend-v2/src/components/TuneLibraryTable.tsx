import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Music, Podcast, Play, Heart, Plus, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import ClickableArtistDisplay from './ClickableArtistDisplay';
import TagList from './TagList';
import MiniSupportersBar from './MiniSupportersBar';

export interface LibraryBid {
  userId?: {
    _id?: string;
    uuid?: string;
    username: string;
    profilePic?: string;
  };
  amount?: number;
}

export interface LibraryItem {
  mediaId: string;
  mediaUuid: string;
  title: string;
  artist: string;
  coverArt?: string;
  duration?: number;
  bpm?: number;
  tags?: string[];
  contentForm?: string[];
  sources?: Record<string, string>;
  globalMediaAggregate: number;
  globalMediaAggregateAvg: number;
  globalMediaAggregateTop?: number;
  globalMediaAggregateTopUser?: string | { _id?: string; uuid?: string; id?: string };
  globalUserMediaAggregate: number;
  bidCount: number;
  tuneBytesEarned: number;
  lastBidAt: string;
  firstBidAt?: string;
  bids?: LibraryBid[];
}

export interface TuneLibraryTableProps {
  items: LibraryItem[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSort: (field: string) => void;
  onPlay: (item: LibraryItem, index: number) => void;
  onTip?: (item: LibraryItem) => void;
  onQueue?: (item: LibraryItem) => void;
  showTipButton?: boolean;
  showQueueButton?: boolean;
  artistColumnLabel?: string;
  artworkIcon?: 'music' | 'podcast';
  itemPath?: (item: LibraryItem) => string;
  initialVisibleCount?: number;
}

function formatDuration(seconds?: number) {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const TuneLibraryTable: React.FC<TuneLibraryTableProps> = ({
  items,
  sortField,
  sortDirection,
  onSort,
  onPlay,
  onTip,
  onQueue,
  showTipButton = false,
  showQueueButton = false,
  artistColumnLabel = 'Artist',
  artworkIcon = 'music',
  itemPath,
  initialVisibleCount,
}) => {
  const [showAll, setShowAll] = useState(false);

  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-gray-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="h-4 w-4 ml-1 text-purple-400" />
      : <ArrowDown className="h-4 w-4 ml-1 text-purple-400" />;
  };

  const resolvePath = (item: LibraryItem) =>
    itemPath ? itemPath(item) : `/tune/${item.mediaId || item.mediaUuid}`;

  const visibleItems =
    initialVisibleCount && !showAll ? items.slice(0, initialVisibleCount) : items;

  const isPodcast = (item: LibraryItem) => {
    const cf = item.contentForm;
    return Array.isArray(cf) ? cf.includes('podcastepisode') : cf === 'podcastepisode';
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-800">
          <tr>
            <th className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
              Artwork
            </th>
            <th
              className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors max-w-[220px] w-[220px]"
              onClick={() => onSort('title')}
            >
              <div className="flex items-center truncate">
                Title
                {getSortIcon('title')}
              </div>
            </th>
            <th
              className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors max-w-[220px] w-[220px]"
              onClick={() => onSort('artist')}
            >
              <div className="flex items-center truncate">
                {artistColumnLabel}
                {getSortIcon('artist')}
              </div>
            </th>
            <th
              className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
              onClick={() => onSort('duration')}
            >
              <div className="flex items-center">
                Duration
                {getSortIcon('duration')}
              </div>
            </th>
            <th className="hidden md:table-cell px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
              Tags
            </th>
            <th className="hidden lg:table-cell px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider min-w-[180px]">
              Supporters
            </th>
            <th
              className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
              onClick={() => onSort('tuneBytesEarned')}
            >
              <div className="flex items-center">
                TuneBytes
                {getSortIcon('tuneBytesEarned')}
              </div>
            </th>
            <th className="px-2 md:px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-14">
              &nbsp;
            </th>
          </tr>
        </thead>
        <tbody className="bg-gray-800 divide-y divide-gray-700">
          {visibleItems.map((item) => {
            const actualIndex = items.findIndex((libItem) => libItem.mediaId === item.mediaId);
            const mediaId = item.mediaUuid || item.mediaId;
            const tags = item.tags ?? [];
            const ArtworkFallback = isPodcast(item)
              ? Podcast
              : artworkIcon === 'podcast'
                ? Podcast
                : Music;

            return (
              <tr key={item.mediaId} className="hover:bg-gray-700/50 transition-colors">
                <td className="px-2 md:px-4 py-3 whitespace-nowrap">
                  <div
                    className="relative w-12 h-12 group cursor-pointer"
                    onClick={() => onPlay(item, actualIndex)}
                  >
                    {item.coverArt ? (
                      <img
                        src={item.coverArt}
                        alt={item.title}
                        className="w-full h-full rounded object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-700 rounded flex items-center justify-center">
                        <ArtworkFallback className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors shadow-lg">
                        <Play className="h-4 w-4 text-white ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 md:px-4 py-3 max-w-[220px] w-[220px]">
                  <Link
                    to={resolvePath(item)}
                    className="block w-full min-w-0 truncate text-sm font-medium text-white hover:text-purple-400 transition-colors text-left"
                    title={item.title}
                  >
                    {item.title}
                  </Link>
                  {tags.length > 0 && (
                    <div className="md:hidden mt-1">
                      <TagList tags={tags} mediaId={mediaId} limit={2} />
                    </div>
                  )}
                </td>
                <td className="px-2 md:px-4 py-3 max-w-[220px] w-[220px]">
                  <div className="min-w-0 truncate text-sm text-gray-300" title={item.artist}>
                    <ClickableArtistDisplay media={item} />
                  </div>
                </td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap">
                  <div className="text-sm text-gray-300">{formatDuration(item.duration)}</div>
                </td>
                <td className="hidden md:table-cell px-2 md:px-4 py-3 max-w-[200px]">
                  {tags.length > 0 ? (
                    <TagList tags={tags} mediaId={mediaId} limit={3} />
                  ) : (
                    <span className="text-xs text-gray-500">—</span>
                  )}
                </td>
                <td className="hidden lg:table-cell px-2 md:px-4 py-3 max-w-[240px]">
                  {item.bids && item.bids.length > 0 ? (
                    <MiniSupportersBar bids={item.bids} maxVisible={3} scrollable={true} />
                  ) : (
                    <span className="text-xs text-gray-500">—</span>
                  )}
                </td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap">
                  <div className="text-sm font-semibold text-yellow-400">
                    {item.tuneBytesEarned.toFixed(1)}
                  </div>
                </td>
                <td className="px-2 md:px-4 py-3 whitespace-nowrap">
                  {showTipButton && (onTip || onQueue) ? (
                    <div className="flex items-center gap-2">
                      {showQueueButton && onQueue && (
                        <button
                          type="button"
                          onClick={() => onQueue(item)}
                          title="Add to queue"
                          aria-label="Add to queue"
                          className="group flex items-center justify-center w-10 h-10 rounded-full bg-gray-900/60 border border-gray-600 text-gray-200 hover:bg-purple-600 hover:text-white hover:border-purple-500 transition-colors"
                        >
                          <Plus className="h-5 w-5 transition-transform group-hover:scale-110" />
                        </button>
                      )}
                      {onTip && (
                        <button
                          type="button"
                          onClick={() => onTip(item)}
                          title="Send a tip"
                          aria-label="Send a tip"
                          className="group flex items-center justify-center w-10 h-10 rounded-full bg-purple-900/40 border border-purple-500/40 text-purple-300 hover:bg-purple-600 hover:text-white hover:border-purple-500 transition-colors"
                        >
                          <Heart className="h-5 w-5 transition-transform group-hover:scale-110" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <Link
                      to={resolvePath(item)}
                      className="inline-flex items-center px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                      title="View"
                    >
                      View
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {initialVisibleCount && items.length > initialVisibleCount && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <span>
              {showAll ? 'Show Less' : `Show More (${items.length - initialVisibleCount} more)`}
            </span>
            {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
};

export default TuneLibraryTable;
