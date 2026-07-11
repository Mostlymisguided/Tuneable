export interface PodcastSeriesRef {
  _id?: string;
  title?: string;
  coverArt?: string;
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
  sources?: Record<string, string> | Array<{ platform?: string; url?: string }>;
  audioUrl?: string;
  enclosure?: { url?: string; type?: string };
}

export interface PodcastChartResponse {
  episodes: PodcastEpisode[];
  filters?: {
    categories?: string[];
    genres?: string[];
    tags?: string[];
  };
}

export const DEFAULT_PODCAST_COVER =
  'https://uploads.tuneable.stream/cover-art/default-cover.png';
