export interface User {
  id: string;
  _id?: string;
  uuid?: string;
  username: string;
  email: string;
  profilePic?: string;
  personalInviteCode?: string;
  primaryInviteCode?: string;
  balance: number; // pence
  tuneBytes?: number;
  role: string[];
  isActive: boolean;
  emailVerified?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
  homeLocation?: ResolvedLocation | null;
  secondaryLocation?: ResolvedLocation | null;
  preferences?: {
    defaultTip?: number; // pounds
    anonymousMode?: boolean;
  };
}

/** Canonical default avatar — keep in sync with backend User.profilePic default */
export const DEFAULT_PROFILE_PIC =
  'https://uploads.tuneable.stream/profile-pictures/default-profile.png';

export interface LocationAncestor {
  placeId?: string;
  placetype?: string;
  label?: string;
  countryCode?: string;
}

export interface ResolvedLocation {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  display?: string;
  placeId?: string;
  featureType?: string;
  label?: string;
  ancestors?: LocationAncestor[];
}

export interface UserStats {
  totalBids: number;
  totalAmountBid: number;
  averageBidAmount: number;
  uniqueSongsCount: number;
}

export interface TuneBytesTagRanking {
  tag: string;
  tuneBytesEarned: number;
  rank: number;
  totalUsers: number;
  percentile: number;
}

export interface UserLibraryBid {
  userId?: {
    _id?: string;
    uuid?: string;
    username?: string;
    profilePic?: string;
  };
  amount?: number;
  createdAt?: string;
  status?: string;
}

export interface UserLibraryItem {
  mediaId: string;
  mediaUuid?: string;
  title: string;
  artist: string;
  coverArt?: string | null;
  duration?: number | null;
  bpm?: number | null;
  tags?: string[];
  contentForm?: string[];
  sources?: Record<string, string>;
  globalMediaAggregate?: number;
  globalMediaAggregateAvg?: number;
  globalUserMediaAggregate?: number;
  bidCount?: number;
  tuneBytesEarned?: number;
  lastBidAt?: string;
  firstBidAt?: string;
  bids?: UserLibraryBid[];
}

export interface UserProfileResponse {
  message?: string;
  user: User;
  stats: UserStats;
  topBids?: Array<{
    _id?: string;
    amount?: number;
    mediaId?: {
      _id?: string;
      uuid?: string;
      title?: string;
      artist?: string;
      coverArt?: string;
    };
  }>;
  mediaWithBids?: Array<{
    media?: {
      _id?: string;
      uuid?: string;
      title?: string;
      artist?: string;
      coverArt?: string;
      duration?: number;
      globalMediaAggregate?: number;
      tags?: string[];
    };
    totalAmount?: number;
    bidCount?: number;
  }>;
}

export interface UserLibraryResponse {
  library: UserLibraryItem[];
  total: number;
}

export interface TuneBytesTagRankingsResponse {
  tuneBytesTagRankings: TuneBytesTagRanking[];
}

export interface TipTagChampion {
  tag: string;
  rank: number;
  totalAmount: number;
  bidCount?: number;
  totalUsers?: number;
  medal?: string | null;
}

export interface MediaChampionTitle {
  mediaId: string;
  uuid?: string;
  title: string;
  rank: number;
  totalAmount: number;
  bidCount?: number;
  medal?: string | null;
}

export interface ChampionTitlesResponse {
  tags: TipTagChampion[];
  media: MediaChampionTitle[];
  podiumSize?: number;
  scope?: string;
  locationPlaceId?: string | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}
