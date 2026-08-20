export interface PodcastSeriesRef {
  _id?: string;
  title?: string;
  coverArt?: string;
  genres?: string[];
  tags?: string[];
}

export interface PodcastEpisodeBid {
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
}

export type PodcastCatalogSource = 'local' | 'taddy' | 'apple' | 'podcastindex';

export interface PodcastEpisode {
  _id?: string;
  id?: string;
  uuid?: string;
  title?: string;
  description?: string;
  coverArt?: string;
  duration?: number;
  globalMediaAggregate?: number;
  releaseDate?: string;
  publishedAt?: string;
  podcastSeries?: PodcastSeriesRef;
  podcastTitle?: string;
  podcastAuthor?: string;
  podcastImage?: string;
  genres?: string[];
  tags?: string[];
  category?: string;
  sources?: Record<string, string> | Array<{ platform?: string; url?: string }>;
  audioUrl?: string;
  enclosure?: { url?: string; type?: string };
  bids?: PodcastEpisodeBid[];
  source?: PodcastCatalogSource;
  isExternal?: boolean;
  taddyUuid?: string;
  podcastSeriesUuid?: string;
  appleId?: string;
  collectionId?: string | number;
  feedId?: number;
  podcastIndexId?: number | string;
  rssUrl?: string;
  guid?: string;
  episodeNumber?: number;
  seasonNumber?: number;
}

export interface PodcastEpisodeSearchResponse {
  episodes: PodcastEpisode[];
  count?: number;
  total?: number;
  offset?: number;
  hasMore?: boolean;
  page?: number;
  pagesCount?: number;
  source?: PodcastCatalogSource;
}

export interface ImportSingleEpisodeResponse {
  success?: boolean;
  message?: string;
  episode: PodcastEpisode;
}

export interface PodcastChartResponse {
  episodes: PodcastEpisode[];
  filters?: {
    categories?: string[];
    genres?: string[];
    tags?: string[];
  };
}

export interface PodcastSeriesResponse {
  series?: PodcastSeriesRef & { _id?: string; title?: string };
  episodes?: PodcastEpisode[];
}

export const PODCAST_CHART_PAGE_SIZE = 20;

export const PODCAST_TIME_RANGES = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
] as const;

export type PodcastTimeRangeKey = (typeof PODCAST_TIME_RANGES)[number]['key'];

export const DEFAULT_PODCAST_COVER =
  'https://uploads.tuneable.stream/cover-art/default-cover.png';
