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
  duration?: number;
  coverArt?: string;
  partyMediaAggregate?: number;
  tags?: string[];
  status?: string;
  sources?: MediaSources;
  rightsCleared?: boolean;
  rightsStatus?: 'cleared' | 'pending' | 'disputed';
  isPlayable?: boolean;
}

export interface SortedMediaResponse {
  timePeriod: string;
  media: ChartMediaItem[];
  count: number;
}

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
