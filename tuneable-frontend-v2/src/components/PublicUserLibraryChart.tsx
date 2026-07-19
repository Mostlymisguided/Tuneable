import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Gauge,
  Music,
  Play,
  Search,
  Tag,
  Plus,
  Minus,
} from 'lucide-react';
import QueueMediaCard, { normalizeQueueMediaData } from './QueueMediaCard';
import type { LibraryItem } from './TuneLibraryTable';
import { getCanonicalTag } from '../utils/tagNormalizer';
import { penceToPounds } from '../utils/currency';

const MEDIA_PAGE_SIZE = 10;

const TIME_PERIOD_OPTIONS = [
  { key: 'all-time', label: 'All Time' },
  { key: 'this-month', label: 'This Month' },
  { key: 'this-week', label: 'This Week' },
  { key: 'today', label: 'Today' },
] as const;

const BPM_FILTER_OPTIONS = [
  { key: 'all', label: 'All', min: null, max: null },
  { key: 'under-90', label: '<90', min: null, max: 90 },
  { key: '90-110', label: '90–110', min: 90, max: 110 },
  { key: '110-130', label: '110–130', min: 110, max: 130 },
  { key: '130-150', label: '130–150', min: 130, max: 150 },
  { key: '150-plus', label: '150+', min: 150, max: null },
] as const;

type TimePeriod = (typeof TIME_PERIOD_OPTIONS)[number]['key'];
type BpmFilterRange = (typeof BPM_FILTER_OPTIONS)[number]['key'];

function formatTimePeriodLabel(period: string): string {
  return (
    TIME_PERIOD_OPTIONS.find((p) => p.key === period)?.label ??
    period.replace('-', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

function formatBpmFilterLabel(range: BpmFilterRange): string {
  return BPM_FILTER_OPTIONS.find((o) => o.key === range)?.label ?? 'All';
}

function getPeriodStart(period: TimePeriod): Date | null {
  if (period === 'all-time') return null;
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === 'this-week') {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === 'this-month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}

function itemInTimePeriod(item: LibraryItem, period: TimePeriod): boolean {
  const start = getPeriodStart(period);
  if (!start) return true;
  const last = item.lastBidAt ? new Date(item.lastBidAt).getTime() : 0;
  const first = (item as LibraryItem & { firstBidAt?: string }).firstBidAt
    ? new Date((item as LibraryItem & { firstBidAt?: string }).firstBidAt!).getTime()
    : last;
  const startMs = start.getTime();
  // Include if any tip activity window overlaps the period
  return last >= startMs || first >= startMs;
}

function mediaMatchesBpmFilter(item: LibraryItem, range: BpmFilterRange): boolean {
  if (range === 'all') return true;
  const option = BPM_FILTER_OPTIONS.find((o) => o.key === range);
  if (!option) return true;
  const bpm = typeof item.bpm === 'number' && item.bpm > 0 ? item.bpm : null;
  if (bpm == null) return false;
  if (option.min != null && bpm < option.min) return false;
  if (option.max != null && bpm >= option.max) return false;
  return true;
}

function isPodcastLibraryItem(item: LibraryItem) {
  const cf = item.contentForm;
  return cf && (Array.isArray(cf) ? cf.includes('podcastepisode') : cf === 'podcastepisode');
}

function libraryItemToQueueShape(item: LibraryItem) {
  return {
    ...item,
    _id: item.mediaId,
    id: item.mediaUuid || item.mediaId,
    uuid: item.mediaUuid || item.mediaId,
    title: item.title,
    artist: item.artist,
    coverArt: item.coverArt,
    duration: item.duration,
    bpm: item.bpm,
    releaseDate: item.releaseDate ?? null,
    releaseYear: item.releaseYear ?? null,
    tags: item.tags || [],
    bids: item.bids || [],
    globalMediaAggregate: item.globalMediaAggregate,
  };
}

export interface PublicUserLibraryChartProps {
  items: LibraryItem[];
  isLoading?: boolean;
  username?: string;
  onPlay: (item: LibraryItem, index: number, list: LibraryItem[]) => void;
  onTip: (item: LibraryItem) => void;
  emptyMessage?: string;
}

const PublicUserLibraryChart: React.FC<PublicUserLibraryChartProps> = ({
  items,
  isLoading = false,
  username,
  onPlay,
  onTip,
  emptyMessage,
}) => {
  const [showTagFilterCloud, setShowTagFilterCloud] = useState(false);
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [showBpmFilter, setShowBpmFilter] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>('all-time');
  const [bpmFilterRange, setBpmFilterRange] = useState<BpmFilterRange>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [topTagsExpanded, setTopTagsExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MEDIA_PAGE_SIZE);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setVisibleCount(MEDIA_PAGE_SIZE);
  }, [selectedTags, selectedTimePeriod, bpmFilterRange, searchQuery, items]);

  const topTags = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const item of items) {
      for (const raw of item.tags || []) {
        const tag = getCanonicalTag(raw);
        if (!tag) continue;
        totals[tag] = (totals[tag] || 0) + (item.globalUserMediaAggregate || 0);
      }
    }
    return Object.entries(totals)
      .map(([tag, total]) => ({ tag, total }))
      .sort((a, b) => b.total - a.total);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = items.filter((item) => itemInTimePeriod(item, selectedTimePeriod));

    if (selectedTags.length > 0) {
      const wanted = selectedTags.map((t) => getCanonicalTag(t));
      list = list.filter((item) => {
        const itemTags = (item.tags || []).map((t) => getCanonicalTag(t));
        return wanted.every((tag) => itemTags.includes(tag));
      });
    }

    if (bpmFilterRange !== 'all') {
      list = list.filter((item) => mediaMatchesBpmFilter(item, bpmFilterRange));
    }

    if (q) {
      list = list.filter((item) => {
        const title = (item.title || '').toLowerCase();
        const artist = (item.artist || '').toLowerCase();
        const tags = (item.tags || []).join(' ').toLowerCase();
        return title.includes(q) || artist.includes(q) || tags.includes(q);
      });
    }

    // Default chart order: this user's tip stake on each tune
    return [...list].sort(
      (a, b) => (b.globalUserMediaAggregate || 0) - (a.globalUserMediaAggregate || 0)
    );
  }, [items, selectedTags, selectedTimePeriod, bpmFilterRange, searchQuery]);

  const visibleItems = filteredItems.slice(0, visibleCount);

  const handlePlayQueue = () => {
    if (filteredItems.length === 0) return;
    onPlay(filteredItems[0], 0, filteredItems);
  };

  const handleCardPlay = (_item: unknown, index: number) => {
    const libItem = visibleItems[index];
    if (!libItem) return;
    const fullIndex = filteredItems.findIndex((i) => i.mediaId === libItem.mediaId);
    onPlay(libItem, Math.max(fullIndex, 0), filteredItems);
  };

  const handleCardTip = (cardItem: unknown) => {
    const shaped = cardItem as { mediaId?: string; mediaUuid?: string; _id?: string };
    const id = String(shaped.mediaUuid || shaped.mediaId || shaped._id || '');
    const match =
      items.find((i) => i.mediaUuid === id || i.mediaId === id) ||
      visibleItems.find((i) => i.mediaUuid === id || i.mediaId === id);
    if (match) onTip(match);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="space-y-6">
      <div className="mb-4 md:mb-6">
        <div className="flex flex-wrap justify-center items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTagFilterCloud((open) => !open)}
            className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
              showTagFilterCloud || selectedTags.length > 0
                ? 'bg-gray-700 ring-1 ring-purple-500/50'
                : 'bg-gray-800'
            }`}
          >
            <Tag className="h-4 w-4 text-purple-400 flex-shrink-0" />
            Tag
            {selectedTags.length > 0 ? (
              <span className="text-xs text-purple-300 font-normal truncate max-w-[8rem] sm:max-w-[12rem]">
                ({selectedTags.map((t) => `#${t}`).join(', ')})
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setShowTimeFilter((open) => !open)}
            className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
              showTimeFilter ? 'bg-gray-700 ring-1 ring-purple-500/50' : 'bg-gray-800'
            }`}
          >
            <Clock className="h-4 w-4 text-purple-400 flex-shrink-0" />
            Time
            <span className="text-xs text-purple-300 font-normal">
              ({formatTimePeriodLabel(selectedTimePeriod)})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowBpmFilter((open) => !open)}
            className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
              showBpmFilter || bpmFilterRange !== 'all'
                ? 'bg-gray-700 ring-1 ring-purple-500/50'
                : 'bg-gray-800'
            }`}
          >
            <Gauge className="h-4 w-4 text-purple-400 flex-shrink-0" />
            BPM
            <span className="text-xs text-purple-300 font-normal">
              ({formatBpmFilterLabel(bpmFilterRange)})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowSearchPanel((open) => !open)}
            className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
              showSearchPanel || searchQuery.trim()
                ? 'bg-gray-700 ring-1 ring-purple-500/50'
                : 'bg-gray-800'
            }`}
          >
            <Search className="h-4 w-4 text-purple-400 flex-shrink-0" />
            Search
            {searchQuery.trim() ? (
              <span className="text-xs text-purple-300 font-normal truncate max-w-[8rem] sm:max-w-[12rem]">
                ({searchQuery.trim()})
              </span>
            ) : null}
          </button>
        </div>

        {filteredItems.length > 0 && (
          <div className="flex justify-center mt-2 sm:mt-3">
            <button
              type="button"
              onClick={handlePlayQueue}
              className="px-3 sm:px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 shadow-lg"
              title={`Play ${filteredItems.length} track${filteredItems.length !== 1 ? 's' : ''} from the top`}
            >
              <Play className="h-4 w-4" />
              Play
            </button>
          </div>
        )}

        {showTagFilterCloud && (
          <div className="card p-3 md:p-6 mt-3">
            <div className="flex items-center justify-between mb-1 md:mb-3">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <Tag className="h-4 w-4 mr-2 text-purple-400" />
                Top Tags
              </h3>
              <div className="flex items-center gap-2">
                {selectedTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTags([])}
                    className="text-sm text-purple-300 hover:text-white"
                  >
                    Clear tags
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowTagFilterCloud(false)}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  Hide
                </button>
              </div>
            </div>
            {topTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(topTagsExpanded ? topTags : topTags.slice(0, isMobile ? 6 : 10)).map(
                  ({ tag, total }) => {
                    const selected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`rounded-full px-3 py-1 text-xs transition-colors ${
                          selected
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 text-gray-200 hover:bg-gray-800'
                        }`}
                        title={`${penceToPounds(total)} tipped by ${username || 'user'}`}
                      >
                        #{tag}
                        <span className="ml-2 text-[10px] opacity-70">
                          {penceToPounds(total)}
                        </span>
                      </button>
                    );
                  }
                )}
                {topTags.length > (isMobile ? 6 : 10) && (
                  <div className="w-full flex justify-center">
                    <button
                      type="button"
                      onClick={() => setTopTagsExpanded((e) => !e)}
                      className="rounded-full px-3 py-1 text-xs bg-gray-600 text-gray-200 hover:bg-gray-500 transition-colors inline-flex items-center gap-1"
                      aria-expanded={topTagsExpanded}
                    >
                      {topTagsExpanded ? (
                        <>
                          <Minus className="w-3 h-3" />
                          Show less
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          Show More
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No tags in this library yet.</p>
            )}
          </div>
        )}

        {showTimeFilter && (
          <div className="card p-3 md:p-6 mt-3 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <Clock className="h-4 w-4 mr-2 text-purple-400" />
                Sort by Time
              </h3>
              <button
                type="button"
                onClick={() => setShowTimeFilter(false)}
                className="text-sm text-gray-400 hover:text-white"
              >
                Hide
              </button>
            </div>
            <div className="flex flex-row flex-nowrap gap-1 sm:gap-2 justify-center items-center max-w-full overflow-hidden">
              {TIME_PERIOD_OPTIONS.map((period) => (
                <button
                  key={period.key}
                  type="button"
                  onClick={() => setSelectedTimePeriod(period.key)}
                  className={`flex-1 min-w-0 px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-md font-medium transition-colors text-xs sm:text-sm truncate ${
                    selectedTimePeriod === period.key
                      ? 'bg-purple-700 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {showBpmFilter && (
          <div className="card p-3 md:p-6 mt-3 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <Gauge className="h-4 w-4 mr-2 text-purple-400" />
                Filter by BPM
              </h3>
              <button
                type="button"
                onClick={() => setShowBpmFilter(false)}
                className="text-sm text-gray-400 hover:text-white"
              >
                Hide
              </button>
            </div>
            <div className="flex flex-row flex-nowrap gap-1 sm:gap-2 justify-center items-center max-w-full overflow-hidden">
              {BPM_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setBpmFilterRange(option.key)}
                  className={`flex-1 min-w-0 px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-md font-medium transition-colors text-xs sm:text-sm truncate ${
                    bpmFilterRange === option.key
                      ? 'bg-purple-700 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showSearchPanel && (
        <div className="mb-4 md:mb-6">
          <div className="w-full max-w-2xl mx-auto">
            <div className="relative flex flex-1 items-center bg-gray-800 rounded-xl border border-gray-700 focus-within:border-purple-500 transition-colors">
              <Search className="ml-3 h-5 w-5 text-gray-400 flex-shrink-0" aria-hidden />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter this library…"
                aria-label="Search tunes in library"
                className="flex-1 bg-transparent px-3 py-3 text-white placeholder-gray-500 focus:outline-none text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mr-3 text-xs text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Music className="h-12 w-12 mx-auto mb-4 text-gray-500" />
          <p>
            {items.length === 0
              ? emptyMessage || "This user hasn't tipped on anything yet."
              : 'No tunes match these filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item, index) => {
            const queueShape = libraryItemToQueueShape(item);
            const mediaData = normalizeQueueMediaData(queueShape);
            const mediaId = item.mediaUuid || item.mediaId;
            const mediaHref = isPodcastLibraryItem(item)
              ? `/podcasts/${mediaId}`
              : `/tune/${mediaId}`;
            return (
              <QueueMediaCard
                key={`lib-${item.mediaId}-${index}`}
                item={queueShape}
                index={index}
                mediaData={mediaData}
                showActions={false}
                isBidding={false}
                onActionClick={() => {}}
                onPlay={handleCardPlay}
                onTip={handleCardTip}
                mediaHref={mediaHref}
              />
            );
          })}
          {filteredItems.length > visibleCount && (
            <div className="flex justify-center pt-4 pb-2">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + MEDIA_PAGE_SIZE)}
                className="px-6 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors flex items-center gap-2"
              >
                <ChevronDown className="h-5 w-5" />
                Show more ({filteredItems.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PublicUserLibraryChart;
