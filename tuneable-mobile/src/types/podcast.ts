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
  podcastSeries?: PodcastSeriesRef;
  podcastTitle?: string;
  genres?: string[];
  tags?: string[];
  category?: string;
  sources?: Record<string, string> | Array<{ platform?: string; url?: string }>;
  audioUrl?: string;
  enclosure?: { url?: string; type?: string };
  bids?: PodcastEpisodeBid[];
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
