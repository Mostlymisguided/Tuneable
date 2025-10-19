// Simple types file to avoid module resolution issues
export interface User {
  id: string;
  uuid?: string; // UUIDv7 for external API
  username: string;
  email: string;
  profilePic?: string;
  personalInviteCode: string;
  balance: number;
  homeLocation: {
    city: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  role: string[];
  isActive: boolean;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  inviteCode: string;
  cellPhone?: string;
  givenName?: string;
  familyName?: string;
  homeLocation?: {
    city: string;
    country: string;
  };
}

// Creator subdocument interface
export interface Creator {
  name: string;
  userId?: string | null;
  verified: boolean;
}

// Legacy Song type - now points to Media for backwards compatibility
export type Song = Media;

// Media relationship interface
export interface MediaRelationship {
  type: 'remix_of' | 'cover_of' | 'sampled_in' | 'uses_sample' | 'same_series' | 'inspired_by' | 'references' | 'other';
  target_uuid: string;
  description?: string;
}

// New unified Media interface
export interface Media {
  id: string;
  uuid: string;
  title: string;
  
  // Content classification
  contentType: string[];
  contentForm: string[];
  mediaType: string[];
  
  // Creators (hybrid subdocuments)
  artist?: Creator[];
  producer?: Creator[];
  featuring?: Creator[];
  songwriter?: Creator[];
  composer?: Creator[];
  host?: Creator[];
  guest?: Creator[];
  narrator?: Creator[];
  director?: Creator[];
  cinematographer?: Creator[];
  editor?: Creator[];
  author?: Creator[];
  label?: Creator[];
  
  // Auto-generated creator names
  creatorNames: string[];
  
  // Metadata
  duration?: number;
  fileSize?: number;
  coverArt?: string;
  description?: string;
  tags: string[];
  genres: string[];
  category?: string;
  
  // Release information
  album?: string;
  EP?: string;
  releaseDate?: string;
  
  // Episode/Series
  episodeNumber?: number;
  seasonNumber?: number;
  
  // Music-specific metadata
  explicit?: boolean;
  isrc?: string;
  upc?: string;
  lyrics?: string;
  bpm?: number;
  key?: string;
  pitch?: number;
  timeSignature?: string;
  bitrate?: number;
  sampleRate?: number;
  elements?: string[];
  rightsHolder?: string;
  
  // Video/Image metadata
  resolution?: string;
  aspectRatio?: string;
  colorSpace?: string;
  
  // Written content metadata
  pages?: number;
  wordCount?: number;
  language?: string;
  
  // Platform sources
  sources: Record<string, string>;
  
  // External platform IDs (for deduplication & syncing)
  externalIds?: Record<string, string>;
  
  // Podcast series reference
  podcastSeries?: string;
  
  // Transcript (for podcasts/videos)
  transcript?: string;
  
  // Bidding metrics (aligned with schema grammar)
  globalMediaAggregate: number; // Total bid value across all parties/users
  bids?: Array<{
    userId: {
      username: string;
      profilePic?: string;
      uuid: string;
    };
    amount: number;
  }>;
  
  // Top bid tracking (individual amounts)
  globalMediaBidTop?: number; // Highest individual bid
  globalMediaBidTopUser?: string; // User who made top bid
  
  // Top aggregate bid tracking (user totals)
  globalMediaAggregateTop?: number; // Highest user aggregate
  globalMediaAggregateTopUser?: string; // User with highest aggregate
  
  // Relationships
  relationships?: MediaRelationship[];
  
  // System metadata
  addedBy: string;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
  playCount: number;
  popularity: number;
}

export interface SearchResult {
  id: string;
  title: string;
  artist: string;
  coverArt: string;
  duration: number;
  sources: Record<string, string>;
}

export interface Bid {
  id: string;
  userId: string;
  partyId: string;
  songId: string;
  amount: number;
  createdAt: string;
  status: 'requested' | 'active' | 'played' | 'vetoed' | 'refunded';
  
  // User aggregate tracking
  partyAggregateBidValue?: number;
  globalAggregateBidValue?: number;
}

export interface PartyMedia {
  mediaId: string;
  media_uuid?: string;
  addedBy: string;
  addedBy_uuid?: string;
  
  // Party-media scope metrics (aligned with schema grammar)
  partyMediaAggregate: number; // Total bid value for this media in party
  partyMediaBidTop?: number; // Highest individual bid for this media in party
  partyMediaBidTopUser?: string; // User who made highest bid
  partyMediaAggregateTop?: number; // Highest user aggregate for this media in party
  partyMediaAggregateTopUser?: string; // User with highest aggregate
  
  status: 'queued' | 'playing' | 'played' | 'vetoed';
  queuedAt?: string;
  playedAt?: string;
  completedAt?: string;
  vetoedAt?: string;
  vetoedBy?: string;
}

export interface Party {
  id: string;
  name: string;
  location: string;
  host: string | { id: string; username: string; uuid?: string; userId?: string; _id?: string };
  host_uuid?: string; // UUID reference for host
  partyCode: string;
  partiers: (string | { id: string; username: string; uuid?: string; userId?: string; _id?: string })[];
  media: PartyMedia[];
  songs?: PartyMedia[]; // Legacy support during migration
  
  // Party-level metrics (aligned with schema grammar)
  partyBidTop?: number; // Highest bid across all media in party
  partyBidTopUser?: string; // User who made highest bid
  partyUserAggregateTop?: number; // Highest user aggregate in party
  partyUserAggregateTopUser?: string; // User with highest aggregate
  partyUserBidTop?: number; // Highest user bid in party
  partyUserBidTopUser?: string; // User who made highest bid
  
  startTime: string;
  musicSource: 'youtube' | 'spotify' | 'direct_upload';
  endTime?: string;
  privacy: 'public' | 'private';
  type: 'remote' | 'live';
  status: 'scheduled' | 'active' | 'ended';
  watershed: boolean;
  minimumBid: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebSocketMessage {
  type: 'JOIN' | 'UPDATE_QUEUE' | 'PLAY' | 'PAUSE' | 'SKIP' | 'TRANSITION_SONG' | 'SET_HOST' | 'PLAY_NEXT';
  partyId?: string;
  userId?: string;
  queue?: PartyMedia[];
  song?: PartyMedia;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}
