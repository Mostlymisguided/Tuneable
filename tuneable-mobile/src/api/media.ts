import { api } from './client';
import type {
  ChartMediaItem,
  MediaChampionsResponse,
  MediaLocationRankingsResponse,
  MediaProfileResponse,
  MediaTagRankingsResponse,
  RelatedPlaylistsResponse,
} from '@/src/types/media';

export type PlaceGlobalBidResponse = {
  message?: string;
  updatedBalance?: number; // pence
  bid?: { amount?: number };
  media?: {
    _id?: string;
    uuid?: string;
    tags?: string[];
    elements?: string[];
    globalMediaAggregate?: number;
  };
  rankedTags?: RankedMediaTag[];
  suggestedAgreeTags?: string[];
  canAgreeTopTags?: boolean;
};

export type RankedMediaTag = {
  tag: string;
  canonicalTag?: string;
  aggregate?: number;
  tipperCount?: number;
};

export type ClaimMediaTagsResponse = {
  message?: string;
  claimedTags?: string[];
  tags?: string[];
  elements?: string[];
  rankedTags?: RankedMediaTag[];
  userTipPence?: number;
};

export type AudioFileAsset = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
};

export type UploadMediaFields = {
  title: string;
  artistName?: string;
  tags?: string;
  description?: string;
  explicit?: boolean;
};

export type UploadMediaResponse = {
  message?: string;
  media: ChartMediaItem;
};

export type AttachUploadResponse = {
  message?: string;
  media: ChartMediaItem;
};

const UPLOAD_TIMEOUT_MS = 120000;

function appendAudioFile(form: FormData, file: AudioFileAsset) {
  const name = file.name.endsWith('.mp3') ? file.name : `${file.name}.mp3`;
  form.append('audioFile', {
    uri: file.uri,
    name,
    type: file.mimeType || 'audio/mpeg',
  } as unknown as Blob);
}

export const mediaAPI = {
  getProfile: async (mediaId: string): Promise<MediaProfileResponse> => {
    const response = await api.get<MediaProfileResponse>(
      `/media/${mediaId}/profile`
    );
    return response.data;
  },

  getRelatedPlaylists: async (
    mediaId: string,
    params?: { relatedLimit?: number; fansLimit?: number }
  ): Promise<RelatedPlaylistsResponse> => {
    const response = await api.get<RelatedPlaylistsResponse>(
      `/media/${mediaId}/related-playlists`,
      { params }
    );
    return response.data;
  },

  getTagRankings: async (mediaId: string): Promise<MediaTagRankingsResponse> => {
    const response = await api.get<MediaTagRankingsResponse>(
      `/media/${mediaId}/tag-rankings`
    );
    return response.data;
  },

  getLocationRankings: async (
    mediaId: string,
    limit = 3
  ): Promise<MediaLocationRankingsResponse> => {
    const response = await api.get<MediaLocationRankingsResponse>(
      `/media/${mediaId}/location-rankings`,
      { params: { limit } }
    );
    return response.data;
  },

  getChampions: async (
    mediaId: string,
    params?: { limit?: number }
  ): Promise<MediaChampionsResponse> => {
    const response = await api.get<MediaChampionsResponse>(
      `/media/${mediaId}/champions`,
      { params: { limit: params?.limit } }
    );
    return response.data;
  },

  /** Tip a chart item. `amount` is in pounds (e.g. 0.50). */
  placeGlobalBid: async (
    mediaId: string,
    amount: number,
    options?: {
      tags?: string[];
      currentLocation?: import('@/src/types/user').ResolvedLocation | null;
    }
  ): Promise<PlaceGlobalBidResponse> => {
    const { getTipCurrentLocation } = await import('@/src/lib/currentLocation');
    const tags = options?.tags?.filter(Boolean) ?? [];
    const currentLocation =
      options?.currentLocation === undefined
        ? getTipCurrentLocation()
        : options.currentLocation;
    const response = await api.post<PlaceGlobalBidResponse>(
      `/media/${mediaId}/global-bid`,
      {
        amount,
        ...(tags.length > 0 ? { tags } : {}),
        ...(currentLocation ? { currentLocation } : {}),
      }
    );
    return response.data;
  },

  /** Tipper claims tags post-tip, or agrees with top £-backed tags. */
  claimTags: async (
    mediaId: string,
    body: { tags?: string[]; agreeTop?: boolean; agreeLimit?: number }
  ): Promise<ClaimMediaTagsResponse> => {
    const response = await api.post<ClaimMediaTagsResponse>(
      `/media/${mediaId}/tag-claims`,
      body
    );
    return response.data;
  },

  /** Create a new media item from an MP3 upload (creators/admins). */
  uploadMedia: async (
    file: AudioFileAsset,
    fields: UploadMediaFields
  ): Promise<UploadMediaResponse> => {
    const form = new FormData();
    appendAudioFile(form, file);
    form.append('title', fields.title.trim());
    if (fields.artistName?.trim()) {
      form.append('artistName', fields.artistName.trim());
    }
    if (fields.tags?.trim()) {
      form.append('tags', fields.tags.trim());
    }
    if (fields.description?.trim()) {
      form.append('description', fields.description.trim());
    }
    form.append('explicit', String(Boolean(fields.explicit)));

    const response = await api.post<UploadMediaResponse>(
      '/media/upload',
      form,
      { timeout: UPLOAD_TIMEOUT_MS }
    );
    return response.data;
  },

  /** Attach MP3 to an existing catalog entry so it becomes playable. */
  attachUpload: async (
    mediaId: string,
    file: AudioFileAsset,
    options?: { replaceExisting?: boolean }
  ): Promise<AttachUploadResponse> => {
    const form = new FormData();
    appendAudioFile(form, file);
    form.append('rightsConfirmed', 'true');
    form.append('uploaderRole', 'owner');
    if (options?.replaceExisting) {
      form.append('replaceExisting', 'true');
    }

    const response = await api.post<AttachUploadResponse>(
      `/media/${mediaId}/attach-upload`,
      form,
      { timeout: UPLOAD_TIMEOUT_MS }
    );
    return response.data;
  },
};
