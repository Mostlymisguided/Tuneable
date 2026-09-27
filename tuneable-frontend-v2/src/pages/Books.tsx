import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Crown,
  Facebook,
  Linkedin,
  Search,
  Share2,
  Tag,
  Twitter,
} from 'lucide-react';
import { toast } from '../utils/toast';
import { booksAPI, locationAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import BidConfirmationModal from '../components/BidConfirmationModal';
import BookQueueMediaCard, { bookAuthorLine, type BookChartCardData } from '../components/BookQueueMediaCard';
import {
  ChartSortPanel,
  ChartSortTrigger,
} from '../components/ChartSortControl';
import EntertainingLoader from '../components/EntertainingLoader';
import GlobalChartLocationHero, { type LocationQuickPick } from '../components/GlobalChartLocationHero';
import MediaChampions from '../components/MediaChampions';
import { penceToPounds, penceToPoundsNumber } from '../utils/currency';
import { sortChartItems, type ChartSortKey } from '../utils/chartSort';
import { getTipCurrentLocation } from '../utils/currentLocationCache';
import {
  formatLocation,
  getCountryPickFromLocation,
  locationScopeEmptyMessage,
  normalizeLocationScope,
  type LocationScope,
  type ResolvedLocation,
} from '../utils/locationHelpers';
import { generateTagSlug, getCanonicalTag } from '../utils/tagNormalizer';
import { resolveTipStatInputs } from '../utils/tipStats';

const BOOK_PAGE_SIZE = 10;

const TIME_PERIOD_OPTIONS = [
  { key: 'all-time', label: 'All Time' },
  { key: 'this-month', label: 'This Month' },
  { key: 'this-week', label: 'This Week' },
  { key: 'today', label: 'Today' },
] as const;

type TimePeriod = (typeof TIME_PERIOD_OPTIONS)[number]['key'];

const BOOK_SORT_HINT = 'Newest and oldest are when the book was added to Tuneable.';

function formatTimePeriodLabel(period: string): string {
  return TIME_PERIOD_OPTIONS.find((option) => option.key === period)?.label ?? period;
}

function normalizeTimePeriod(value: string | null): TimePeriod {
  if (value === 'this-month' || value === 'this-week' || value === 'today') return value;
  if (value === 'this-year') return 'this-month';
  return 'all-time';
}

function getPeriodStartDate(period: string): Date | null {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  if (period === 'today') return new Date(now - day);
  if (period === 'this-week') return new Date(now - 7 * day);
  if (period === 'this-month') return new Date(now - 28 * day);
  return null;
}

function bookMatchesQuery(book: BookChartCardData, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const title = (book.title || '').toLowerCase();
  const author = bookAuthorLine(book).toLowerCase();
  const tags = (Array.isArray(book.tags) ? book.tags : []).join(' ').toLowerCase();
  const publisher = (book.publisher || '').toLowerCase();
  return title.includes(q) || author.includes(q) || tags.includes(q) || publisher.includes(q);
}

function bookMatchesTags(book: BookChartCardData, selectedTags: string[]): boolean {
  if (!selectedTags.length) return true;
  const tags = (book.tags || [])
    .map((tag) => (typeof tag === 'string' ? getCanonicalTag(tag) : ''))
    .filter(Boolean);
  return selectedTags.some((selected) => tags.some((tag) => tag === getCanonicalTag(selected)));
}

const Books: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();

  const [books, setBooks] = useState<BookChartCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<TimePeriod>(() => normalizeTimePeriod(searchParams.get('period')));
  const [chartSort, setChartSort] = useState<ChartSortKey>('most-tipped');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(BOOK_PAGE_SIZE);
  const [showTagFilterCloud, setShowTagFilterCloud] = useState(false);
  const [showTimeFilter, setShowTimeFilter] = useState(false);
  const [showSortPanel, setShowSortPanel] = useState(false);
  const [showLocationFilter, setShowLocationFilter] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<ResolvedLocation | null>(null);
  const [locationScope, setLocationScope] = useState<LocationScope>(() =>
    normalizeLocationScope(searchParams.get('scope'))
  );
  const [isMobile, setIsMobile] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [selectedBook, setSelectedBook] = useState<BookChartCardData | null>(null);
  const [isTipping, setIsTipping] = useState(false);

  const shareDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const locationPlaceIdFromUrl = searchParams.get('location');
  const locationScopeFromUrl = searchParams.get('scope');
  const periodFromUrl = searchParams.get('period');

  useEffect(() => {
    const next = normalizeTimePeriod(periodFromUrl);
    setPeriod((prev) => (prev === next ? prev : next));
  }, [periodFromUrl]);

  useEffect(() => {
    const nextScope = normalizeLocationScope(locationScopeFromUrl);
    setLocationScope((prev) => (prev === nextScope ? prev : nextScope));
  }, [locationScopeFromUrl]);

  useEffect(() => {
    if (!locationPlaceIdFromUrl) {
      setSelectedLocation(null);
      return;
    }
    let cancelled = false;
    locationAPI.resolve(locationPlaceIdFromUrl)
      .then((response) => {
        if (!cancelled) setSelectedLocation(response.location as ResolvedLocation);
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedLocation({ placeId: locationPlaceIdFromUrl, display: locationPlaceIdFromUrl });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locationPlaceIdFromUrl]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shareDropdownRef.current && !shareDropdownRef.current.contains(event.target as Node)) {
        setShowShareDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setVisibleCount(BOOK_PAGE_SIZE);
  }, [period, selectedLocation?.placeId, locationScope, selectedTags, searchQuery, chartSort]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await booksAPI.getChart({
          limit: 50,
          timePeriod: period,
          locationPlaceId: selectedLocation?.placeId,
          locationScope: selectedLocation?.placeId ? locationScope : undefined,
        });
        if (!cancelled) setBooks(data.books || []);
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load books chart');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [period, selectedLocation?.placeId, locationScope]);

  const handleLocationFilterChange = (location: ResolvedLocation | null) => {
    setSelectedLocation(location);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (location?.placeId) next.set('location', location.placeId);
      else next.delete('location');
      return next;
    }, { replace: true });
  };

  const handleLocationScopeChange = (scope: LocationScope) => {
    setLocationScope(scope);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (scope === 'in') next.delete('scope');
      else next.set('scope', scope);
      return next;
    }, { replace: true });
  };

  const handleTimePeriodChange = (nextPeriod: TimePeriod) => {
    setPeriod(nextPeriod);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextPeriod === 'all-time') next.delete('period');
      else next.set('period', nextPeriod);
      return next;
    }, { replace: true });
  };

  const filteredBooks = useMemo(() => {
    const matched = books.filter(
      (book) => bookMatchesTags(book, selectedTags) && bookMatchesQuery(book, searchQuery)
    );
    return sortChartItems(matched, chartSort, {
      getTip: (book) => book.timePeriodBidValue ?? book.periodTotal ?? book.globalMediaAggregate ?? 0,
      getDate: (book) => book.createdAt || book.releaseDate,
    });
  }, [books, selectedTags, searchQuery, chartSort]);

  const visibleBooks = filteredBooks.slice(0, visibleCount);

  const topTags = useMemo(() => {
    const counts: Record<string, { total: number; count: number }> = {};
    for (const book of books) {
      const value = book.globalMediaAggregate || 0;
      for (const raw of book.tags || []) {
        const tag = (raw || '').trim().toLowerCase();
        if (!tag) continue;
        if (!counts[tag]) counts[tag] = { total: 0, count: 0 };
        counts[tag].total += value;
        counts[tag].count += 1;
      }
    }
    return Object.entries(counts)
      .map(([tag, value]) => ({ tag, total: value.total, count: value.count }))
      .sort((a, b) => b.total - a.total || b.count - a.count)
      .slice(0, 15);
  }, [books]);

  const topLocations = useMemo(() => {
    const startDate = getPeriodStartDate(period);
    const counts: Record<string, { pick: NonNullable<ReturnType<typeof getCountryPickFromLocation>>; total: number }> = {};
    for (const book of books) {
      for (const bid of book.bids || []) {
        if (bid.status && bid.status !== 'active') continue;
        if (startDate) {
          const created = bid.createdAt ? new Date(bid.createdAt) : null;
          if (!created || created < startDate) continue;
        }
        const countryPick = bid.bidderCountryPlaceId
          ? {
              placeId: bid.bidderCountryPlaceId,
              country: bid.bidderCountry || bid.bidderLocationDisplay || 'Country',
              countryCode: bid.bidderCountryCode || '',
              display: bid.bidderCountry || bid.bidderLocationDisplay || 'Country',
              label: bid.bidderCountry || undefined,
              kind: 'country' as const,
              featureType: 'country',
            }
          : getCountryPickFromLocation(bid.userId?.homeLocation)
            || getCountryPickFromLocation(bid.userId?.secondaryLocation);
        if (!countryPick?.placeId) continue;
        const amount = typeof bid.amount === 'number' ? bid.amount : 0;
        if (!counts[countryPick.placeId]) counts[countryPick.placeId] = { pick: countryPick, total: 0 };
        counts[countryPick.placeId].total += amount;
      }
    }
    return Object.values(counts).sort((a, b) => b.total - a.total);
  }, [books, period]);

  const locationQuickPicks = useMemo((): LocationQuickPick[] => {
    const maxPicks = isMobile ? 5 : 6;
    const userPick = getCountryPickFromLocation(user?.homeLocation)
      || getCountryPickFromLocation(user?.secondaryLocation);
    const picks: LocationQuickPick[] = [];
    if (userPick) {
      const userStats = topLocations.find((loc) => loc.pick.placeId === userPick.placeId);
      picks.push({ ...userPick, total: userStats?.total ?? 0, isUser: true });
    }
    for (const { pick, total } of topLocations) {
      if (picks.length >= maxPicks) break;
      if (picks.some((pickItem) => pickItem.placeId === pick.placeId)) continue;
      picks.push({ ...pick, total, isUser: false });
    }
    return picks;
  }, [topLocations, user?.homeLocation, user?.secondaryLocation, isMobile]);

  const selectedBookTipStats = useMemo(
    () => resolveTipStatInputs(selectedBook, user),
    [selectedBook, user]
  );

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = 'Check out the books chart on Tuneable. Tip the books you love and move them up.';

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Tuneable Books Chart', text: shareText, url: shareUrl });
      } catch (err: any) {
        if (err?.name !== 'AbortError') toast.error('Failed to share');
      }
    } else {
      await handleCopyLink();
    }
  };

  const handleShare = (platform: 'twitter' | 'facebook' | 'linkedin') => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);
    const shareUrls = {
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    };
    window.open(shareUrls[platform], '_blank', 'width=600,height=400');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      toast.success('Link copied');
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleTipClick = (book: BookChartCardData, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      navigate(`/login?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setSelectedBook(book);
    setShowTipModal(true);
  };

  const handleConfirmTip = async (_tags: string[], amount: number) => {
    if (!selectedBook?._id && !selectedBook?.id) return;
    const bookId = selectedBook._id || selectedBook.id || '';
    setIsTipping(true);
    try {
      const result = await booksAPI.boost(bookId, amount, getTipCurrentLocation());
      const tipPence = Math.round(amount * 100);
      setBooks((prev) =>
        prev.map((book) => {
          if ((book._id || book.id) !== bookId) return book;
          const nextBids = [...(book.bids || [])];
          if (user?.username) {
            nextBids.push({
              amount: tipPence,
              status: 'active',
              createdAt: new Date().toISOString(),
              userId: {
                username: user.username,
                profilePic: user.profilePic,
                uuid: user.uuid || user.id,
              },
            });
          }
          return {
            ...book,
            bids: nextBids,
            globalMediaAggregate: (book.globalMediaAggregate || 0) + tipPence,
          };
        })
      );
      setShowTipModal(false);
      setSelectedBook(null);
      toast.success('Tip placed');
      await refreshUser();
      if (result.book) {
        setBooks((prev) =>
          prev.map((book) => ((book._id || book.id) === bookId ? { ...book, ...result.book, bids: book.bids } : book))
        );
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to tip');
    } finally {
      setIsTipping(false);
    }
  };

  const filtersActive = selectedTags.length > 0 || searchQuery.trim().length > 0;
  const emptyMessage = filtersActive
    ? 'No books match these filters.'
    : selectedLocation?.placeId
      ? locationScopeEmptyMessage('books', formatLocation(selectedLocation), locationScope)
      : 'No books on the chart yet.';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white">
      <GlobalChartLocationHero
        chartKind="books"
        onChartKindChange={(kind) => {
          if (kind === 'books') return;
          navigate(kind === 'podcasts' ? '/podcasts' : '/party/global?period=all-time');
        }}
        contentNoun="Books"
        selectedLocation={selectedLocation}
        locationScope={locationScope}
        onLocationScopeChange={handleLocationScopeChange}
        showLocationFilter={showLocationFilter}
        onToggleLocationFilter={() => setShowLocationFilter((open) => !open)}
        onLocationChange={handleLocationFilterChange}
        locationQuickPicks={locationQuickPicks}
        popularLocationsLabel={period !== 'all-time' ? formatTimePeriodLabel(period).toLowerCase() : undefined}
      />

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-3">
        <div className="mb-4 md:mb-6">
          <div className="flex flex-wrap justify-center items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTagFilterCloud((open) => !open)}
              className={`px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
                showTagFilterCloud ? 'bg-gray-700 ring-1 ring-purple-500/50' : 'bg-gray-800'
              }`}
            >
              <Tag className="h-4 w-4 text-purple-400 flex-shrink-0" />
              Tag
              {selectedTags.length > 0 && (
                <span className="text-xs text-purple-300 font-normal truncate max-w-[8rem] sm:max-w-[12rem]">
                  ({selectedTags.map((tag) => `#${tag}`).join(', ')})
                </span>
              )}
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
                ({formatTimePeriodLabel(period)})
              </span>
            </button>
            <ChartSortTrigger
              sort={chartSort}
              open={showSortPanel}
              onToggle={() => setShowSortPanel((open) => !open)}
            />
            <div className="relative" ref={shareDropdownRef}>
              {isMobile && typeof navigator !== 'undefined' && 'share' in navigator ? (
                <button
                  type="button"
                  onClick={() => { void handleNativeShare(); }}
                  className="px-3 sm:px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5"
                >
                  <Share2 className="h-4 w-4 text-purple-400" />
                  Share
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowShareDropdown((open) => !open)}
                    className="px-3 sm:px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors text-xs sm:text-sm flex items-center gap-1.5"
                  >
                    <Share2 className="h-4 w-4 text-purple-400" />
                    Share
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showShareDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showShareDropdown && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
                      <div className="py-2">
                        <button type="button" onClick={() => { handleShare('twitter'); setShowShareDropdown(false); }} className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors">
                          <Twitter className="h-4 w-4 text-blue-400" /><span className="text-sm text-white">Twitter/X</span>
                        </button>
                        <button type="button" onClick={() => { handleShare('facebook'); setShowShareDropdown(false); }} className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors">
                          <Facebook className="h-4 w-4 text-blue-500" /><span className="text-sm text-white">Facebook</span>
                        </button>
                        <button type="button" onClick={() => { handleShare('linkedin'); setShowShareDropdown(false); }} className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors">
                          <Linkedin className="h-4 w-4 text-blue-600" /><span className="text-sm text-white">LinkedIn</span>
                        </button>
                        <div className="border-t border-gray-700 my-1" />
                        <button type="button" onClick={() => { void handleCopyLink(); setShowShareDropdown(false); }} className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-gray-800 transition-colors">
                          {copySuccess ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-gray-400" />}
                          <span className="text-sm text-white">{copySuccess ? 'Copied!' : 'Copy Link'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {showTagFilterCloud && (
            <div className="card p-3 md:p-6 mt-3">
              <div className="flex items-center justify-between mb-1 md:mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Tag className="h-4 w-4 mr-2 text-purple-400" />
                  Top Tags
                </h3>
                <div className="flex items-center gap-2">
                  {selectedTags.length > 0 && (
                    <button type="button" onClick={() => setSelectedTags([])} className="text-sm text-purple-300 hover:text-white">
                      Clear tags
                    </button>
                  )}
                  <button type="button" onClick={() => setShowTagFilterCloud(false)} className="text-sm text-gray-400 hover:text-white">
                    Hide
                  </button>
                </div>
              </div>
              {topTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {topTags.map(({ tag, total }) => {
                    const selected = selectedTags.some((item) => item.toLowerCase() === tag.toLowerCase());
                    const weight = Math.max(0.75, Math.min(1.25, total / 50));
                    const sizeClass = weight > 1.1 ? 'text-sm' : weight > 0.95 ? 'text-xs' : 'text-[10px]';
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setSelectedTags((prev) => (
                            selected
                              ? prev.filter((item) => item.toLowerCase() !== tag.toLowerCase())
                              : [...prev, tag]
                          ));
                        }}
                        className={`rounded-full px-3 py-1 transition-colors ${sizeClass} ${
                          selected ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-800'
                        }`}
                        title={`${penceToPounds(total)} total across books`}
                      >
                        #{tag}
                        <span className="ml-2 text-[10px] opacity-70">{penceToPounds(total)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No tags yet.</p>
              )}
              {selectedTags.length === 1 && (
                <div className="mt-4 pt-4 border-t border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="h-4 w-4 text-amber-400" />
                    <h4 className="text-sm font-semibold text-white">
                      Champions of #{selectedTags[0]}
                    </h4>
                  </div>
                  <MediaChampions
                    tagSlug={generateTagSlug(selectedTags[0])}
                    entityLabel={`#${selectedTags[0]}`}
                    seedLocation={selectedLocation}
                    compact
                    maxDisplay={10}
                  />
                </div>
              )}
            </div>
          )}

          {showTimeFilter && (
            <div className="card p-3 md:p-6 mt-3 max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Clock className="h-4 w-4 mr-2 text-purple-400" />
                  Time Period
                </h3>
                <button type="button" onClick={() => setShowTimeFilter(false)} className="text-sm text-gray-400 hover:text-white">
                  Hide
                </button>
              </div>
              <div className="flex flex-row flex-nowrap gap-1 sm:gap-2 justify-center items-center max-w-full overflow-hidden">
                {TIME_PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleTimePeriodChange(option.key)}
                    className={`flex-1 min-w-0 px-1.5 sm:px-3 py-1.5 sm:py-2 rounded-md font-medium transition-colors text-xs sm:text-sm truncate ${
                      period === option.key
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

          {showSortPanel && (
            <ChartSortPanel
              sort={chartSort}
              onChange={setChartSort}
              onHide={() => setShowSortPanel(false)}
              hint={BOOK_SORT_HINT}
            />
          )}

          <div className="w-full max-w-2xl mx-auto mt-3">
            <div className="relative flex items-center bg-gray-800 rounded-xl border border-gray-700 focus-within:border-purple-500 transition-colors">
              <Search className="ml-3 h-5 w-5 text-gray-400 flex-shrink-0" aria-hidden />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
                placeholder="Filter by title, author, or tag"
                className="flex-1 py-2.5 pl-2 pr-3 bg-transparent text-white placeholder-gray-400 focus:outline-none text-sm sm:text-base"
                aria-label="Filter books in this chart"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                const q = searchQuery.trim();
                navigate(q ? `/books/search?q=${encodeURIComponent(q)}` : '/books/search');
              }}
              className="mt-2 mx-auto flex items-center justify-center gap-2 text-sm font-semibold text-purple-300 hover:text-white transition-colors"
            >
              Can&apos;t find it? Add New Media
            </button>
            {searchQuery.trim() && filteredBooks.length > 0 && (
              <p className="text-xs text-purple-300 mt-2 text-center">
                {filteredBooks.length} book{filteredBooks.length !== 1 ? 's' : ''} in chart match
              </p>
            )}
            {searchQuery.trim() && filteredBooks.length === 0 && books.length > 0 && (
              <p className="text-xs text-gray-400 mt-2 text-center">
                No matches in this chart — add it from the catalogue
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-center text-red-400 mb-4">{error}</p>}

        {loading ? (
          <EntertainingLoader
            flavor="books"
            size="section"
            headline="Loading the books chart…"
            detail="Ranking tipped books."
          />
        ) : filteredBooks.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">{emptyMessage}</p>
            <p className="text-gray-500 text-sm mt-2">
              {filtersActive
                ? 'Try another title, author, or tag.'
                : 'Search Open Library or Google Books and import the first ones.'}
            </p>
            {!filtersActive && (
              <button
                type="button"
                onClick={() => navigate('/books/search')}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium"
              >
                Find books
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleBooks.map((book, index) => (
              <BookQueueMediaCard
                key={book._id || book.id || `${book.title}-${index}`}
                book={book}
                index={index}
                isTipping={isTipping && (selectedBook?._id || selectedBook?.id) === (book._id || book.id)}
                onTip={handleTipClick}
              />
            ))}
            {filteredBooks.length > visibleCount && (
              <div className="flex justify-center pt-4 pb-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + BOOK_PAGE_SIZE)}
                  className="px-6 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition-colors flex items-center gap-2"
                >
                  <ChevronDown className="h-5 w-5" />
                  Show more ({filteredBooks.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <BidConfirmationModal
        isOpen={showTipModal}
        onClose={() => {
          setShowTipModal(false);
          setSelectedBook(null);
        }}
        onConfirm={handleConfirmTip}
        bidAmount={user?.preferences?.defaultTip || 1.11}
        minTip={0.01}
        avgTip={selectedBookTipStats.avgTip}
        championAggregate={selectedBookTipStats.championAggregate}
        viewerAggregate={selectedBookTipStats.viewerAggregate}
        viewerIsChampion={selectedBookTipStats.viewerIsChampion}
        mediaTitle={selectedBook?.title || ''}
        mediaArtist={selectedBook ? bookAuthorLine(selectedBook) : ''}
        userBalance={user ? penceToPoundsNumber(user.balance) : 0}
        isLoading={isTipping}
        user={user}
        isNonPlayable
      />
    </div>
  );
};

export default Books;
