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

// Legacy Song interface (for backward compatibility)
export interface Song {
  id: string;
  title: string;
  artist: string;
  producer?: string;
  featuring?: string[];
  rightsHolder?: string;
  album?: string;
  genre?: string;
  releaseDate?: string;
  duration: number;
  coverArt?: string;
  explicit: boolean;
  sources: Record<string, string>;
  globalBidValue: number;
  addedBy: string;
  uploadedAt: string;
  updatedAt: string;
  playCount: number;
  popularity: number;
  lyrics?: string;
}

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
  
  // Bidding
  globalBidValue: number;
  bids?: Array<{
    userId: {
      username: string;
      profilePic?: string;
      uuid: string;
    };
    amount: number;
  }>;
  
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
}

export interface PartySong {
  songId: string;
  addedBy: string;
}

export interface Party {
  id: string;
  name: string;
  location: string;
  host: string | { id: string; username: string; uuid?: string; userId?: string; _id?: string };
  host_uuid?: string; // UUID reference for host
  partyCode: string;
  attendees: (string | { id: string; username: string; uuid?: string; userId?: string; _id?: string })[];
  songs: PartySong[];
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
  queue?: PartySong[];
  song?: PartySong;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}
