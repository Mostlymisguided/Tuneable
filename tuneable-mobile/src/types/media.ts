export type MediaSources =
  | Record<string, string>
  | Array<{ platform?: string; url?: string }>
  | null
  | undefined;

export interface ChartMediaItem {
  id?: string;
  _id?: string;
  uuid?: string;
  title?: string;
  artist?: string | Array<string | { name?: string }>;
  creatorDisplay?: string;
  duration?: number;
  coverArt?: string;
  partyMediaAggregate?: number;
  timePeriodBidValue?: number;
  globalMediaAggregate?: number;
  bpm?: number | null;
  globalMediaAggregateTopRank?: number;
  album?: string | null;
  tags?: string[];
  category?: string;
  status?: string;
  sources?: MediaSources;
  rightsCleared?: boolean;
  rightsStatus?: 'cleared' | 'pending' | 'disputed';
  isPlayable?: boolean;
  addedBy?: {
    _id?: string;
    username?: string;
    profilePic?: string;
    uuid?: string;
  };
  bids?: Array<{
    _id?: string;
    amount?: number;
    status?: string;
    createdAt?: string;
    userId?: {
      _id?: string;
      username?: string;
      profilePic?: string;
      uuid?: string;
      homeLocation?: import('@/src/types/user').ResolvedLocation | null;
    };
  }>;
}

export interface MediaProfileResponse {
  message?: string;
  media: ChartMediaItem;
}

export interface SortedMediaResponse {
  timePeriod: string;
  media: ChartMediaItem[];
  count: number;
  locationFilter?: { placeId: string } | null;
}

export const CHART_PAGE_SIZE = 20;

export const TIME_PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'this-week', label: 'This Week' },
  { key: 'this-month', label: 'This Month' },
  { key: 'all-time', label: 'All Time' },
] as const;

export type TimePeriodKey = (typeof TIME_PERIODS)[number]['key'];

export const GLOBAL_PARTY_ID = 'global';

export const DEFAULT_COVER_ART =
  'https://uploads.tuneable.stream/cover-art/default-cover.png';
