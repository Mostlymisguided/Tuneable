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
  artist?: string | Array<string | { name?: string; userId?: string | { _id?: string; uuid?: string } }>;
  creatorDisplay?: string;
  artists?: Array<string | { name?: string; userId?: string | { _id?: string; id?: string }; collectiveId?: string | { _id?: string }; verified?: boolean; relationToNext?: string | null }>;
  producer?: Array<string | { name?: string; userId?: string | { _id?: string } }>;
  featuring?: Array<string | { name?: string; userId?: string | { _id?: string }; verified?: boolean }>;
  composer?: Array<string | { name?: string }>;
  songwriter?: Array<string | { name?: string }>;
  host?: Array<string | { name?: string; userId?: string | { _id?: string }; verified?: boolean }>;
  author?: Array<string | { name?: string; userId?: string | { _id?: string }; verified?: boolean }>;
  authors?: string[];
  label?: string | Array<string | { name?: string; labelId?: string | { _id?: string } }>;
  mediaOwners?: Array<{
    userId?: string | { _id?: string; id?: string; uuid?: string };
    verified?: boolean;
  }>;
  contentType?: string[];
  explicit?: boolean;
  isrc?: string | null;
  upc?: string | null;
  lyrics?: string | null;
  language?: string | null;
  timeSignature?: string | null;
  pitch?: number | null;
  encodedBy?: string | null;
  copySharePercent?: number | null;
  elements?: string[];
  productionStack?: {
    daws?: Array<{ name?: string; version?: string; role?: string | null; gearId?: string }>;
    plugins?: Array<{ name?: string; manufacturer?: string; category?: string; role?: string | null; gearId?: string }>;
    hardware?: Array<{ name?: string; manufacturer?: string; category?: string; role?: string | null; gearId?: string }>;
  };
  aiUsage?: {
    used?: boolean;
    disclosure?: string;
    notes?: string;
    tools?: Array<{ name?: string; category?: string; provider?: string }>;
  };
  duration?: number;
  coverArt?: string;
  partyMediaAggregate?: number;
  timePeriodBidValue?: number;
  globalMediaAggregate?: number;
  tuneBytesEarned?: number;
  supporterCount?: number;
  globalMediaAggregateTop?: number;
  globalMediaAggregateTopRank?: number;
  tipCount?: number;
  globalMediaAggregateTopUser?: {
    _id?: string;
    uuid?: string;
    username?: string;
  };
  bpm?: number | null;
  key?: string | null;
  album?: string | null;
  releaseDate?: string | null;
  releaseYear?: number | null;
  primaryLocation?: import('@/src/types/user').ResolvedLocation | null;
  secondaryLocation?: import('@/src/types/user').ResolvedLocation | null;
  description?: string | null;
  tags?: string[];
  genres?: string[];
  category?: string;
  status?: string;
  createdAt?: string | null;
  uploadedAt?: string | null;
  queuedAt?: string | Date | null;
  lastBidAt?: string | null;
  sources?: MediaSources;
  audioUrl?: string;
  enclosure?: { url?: string; type?: string };
  podcastTitle?: string;
  podcastSeries?:
    | string
    | {
        _id?: string;
        title?: string;
        coverArt?: string;
        genres?: string[];
        tags?: string[];
      }
    | null;
  contentForm?: string[];
  isbn?: string | null;
  externalIds?: Record<string, string> | null;
  rightsCleared?: boolean;
  rightsStatus?: 'cleared' | 'pending' | 'permitted' | 'disputed';
  isPlayable?: boolean;
  hasHostedAudio?: boolean;
  playabilityBlockReason?: 'rights' | 'audio' | 'disputed' | null;
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
      /** Set by the server when either side has blocked the other. */
      anonymous?: boolean;
    };
  }>;
}

export interface RelatedMediaItem {
  mediaId?: string;
  _id?: string;
  uuid?: string;
  title?: string;
  artist?: string;
  coverArt?: string | null;
  duration?: number;
  bpm?: number | null;
  tags?: string[];
  globalMediaAggregate?: number;
  sources?: MediaSources;
}

export interface RelatedPlaylistsResponse {
  relatedMedia?: RelatedMediaItem[];
  fansAlsoTip?: RelatedMediaItem[];
  sourceTitle?: string | null;
}

export interface MediaProfileResponse {
  message?: string;
  media: ChartMediaItem;
  rankedTags?: Array<{
    tag: string;
    canonicalTag?: string;
    aggregate?: number;
    tipperCount?: number;
  }>;
}

export interface MediaTagRanking {
  tag: string;
  rank: number;
  total: number;
  percentile?: number;
  aggregate?: number;
}

export interface MediaTagRankingsResponse {
  tagRankings: MediaTagRanking[];
}

export interface MediaLocationRanking {
  placeId: string;
  name: string;
  featureType?: string | null;
  rank: number;
  total: number;
  percentile?: number;
  aggregate?: number;
}

export interface MediaLocationRankingsResponse {
  locationRankings: MediaLocationRanking[];
}

export interface MediaChampion {
  rank?: number;
  totalAmount: number;
  bidCount?: number;
  user: {
    _id?: string;
    uuid?: string;
    username: string;
    profilePic?: string | null;
  };
}

export interface MediaChampionsResponse {
  champions?: MediaChampion[];
  rankings?: MediaChampion[];
  hasChampions?: boolean;
}

export interface SortedMediaResponse {
  timePeriod: string;
  media: ChartMediaItem[];
  count: number;
  hiddenCount?: number;
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
