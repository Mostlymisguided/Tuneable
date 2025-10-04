// Simple types file to avoid module resolution issues
export interface User {
  id: string;
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
  host: string;
  partyCode: string;
  attendees: string[];
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
