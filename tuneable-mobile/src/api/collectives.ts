import { apiClient } from './client';
import type { ResolvedLocation } from '../types/user';

export interface CollectiveStats {
  memberCount?: number;
  releaseCount?: number;
  globalCollectiveAggregate?: number;
  globalCollectiveBidAvg?: number;
  globalCollectiveBidTop?: number;
  globalCollectiveBidCount?: number;
}

export interface CollectiveMember {
  userId: string | { _id: string; username?: string; profilePic?: string; uuid?: string };
  role: 'founder' | 'member' | 'admin';
  instrument?: string;
  joinedAt?: string;
  leftAt?: string;
  verified?: boolean;
}

export interface Collective {
  _id: string;
  name: string;
  slug: string;
  description: string;
  profilePicture: string;
  coverImage: string;
  email: string;
  website: string;
  type: ('band' | 'collective' | 'production_company' | 'venue' | 'other') | ('band' | 'collective' | 'production_company' | 'venue' | 'other')[];
  venueKind?: 'bar' | 'club' | 'hostel' | 'cafe' | 'restaurant' | 'festival' | 'other';
  location?: ResolvedLocation;
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    soundcloud?: string;
    spotify?: string;
    youtube?: string;
    twitter?: string;
    tiktok?: string;
  };
  foundedYear?: number;
  genres?: string[];
  stats?: CollectiveStats;
  verificationStatus?: string;
  createdAt?: string;
  members?: CollectiveMember[];
}

export interface CollectiveMedia {
  _id: string;
  uuid?: string;
  title: string;
  artist: string;
  coverArt: string;
  releaseDate: string;
  stats: {
    totalBidAmount: number;
    bidCount: number;
  };
}

export interface CollectiveProfileResponse {
  collective: Collective;
  recentReleases: CollectiveMedia[];
  topMedia: CollectiveMedia[];
  members: CollectiveMember[];
}

export const collectiveAPI = {
  async getProfile(slug: string): Promise<CollectiveProfileResponse> {
    const response = await apiClient.get(`/api/collectives/${slug}`);
    return response.data;
  },

  async getAll(params?: {
    page?: number;
    limit?: number;
    genre?: string;
    type?: string;
    placeId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  }): Promise<{
    collectives: Collective[];
    totalPages: number;
    currentPage: number;
    total: number;
  }> {
    const response = await apiClient.get('/api/collectives', { params });
    return response.data;
  },
};
