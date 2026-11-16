export type HomeListenQueueItem = {
  mediaId: string;
  mediaUuid: string;
  slug?: string | null;
  title: string;
  artist: string;
  coverArt?: string | null;
  duration?: number | null;
  contentForm?: string[];
  tags?: string[];
  sources?: Record<string, string>;
  rightsStatus?: 'cleared' | 'pending' | 'permitted' | 'disputed';
  rightsCleared?: boolean;
  isPlayable?: boolean;
  hasHostedAudio?: boolean;
  playabilityBlockReason?: 'rights' | 'audio' | 'disputed' | null;
  queued: boolean;
  addedAt?: string | null;
  heard: boolean;
  qualifiedAt?: string | null;
  tipped: boolean;
  userBidTotal: number;
  lastBidAt?: string | null;
};

export type HomeListenQueueResponse = {
  unheard: HomeListenQueueItem[];
  heard: HomeListenQueueItem[];
  counts: { unheard: number; heard: number; tipped: number };
};
