import type { AxiosRequestConfig } from 'axios';
import { api } from './client';
import { AUDIO_FORMAT_MIME, getAudioUploadFormat } from '@/src/lib/audioUpload';
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

// WAV uploads can be up to 100MB, which takes minutes on mobile data.
const UPLOAD_TIMEOUT_MS = 600000;

function appendAudioFile(form: FormData, file: AudioFileAsset) {
  const format = getAudioUploadFormat(file.name, file.mimeType) ?? 'mp3';
  const ext = format === 'wav' ? /\.(wav|wave)$/i : /\.mp3$/i;
  const name = ext.test(file.name) ? file.name : `${file.name}.${format}`;
  form.append('audioFile', {
    uri: file.uri,
    name,
    // The backend checks extension and MIME together, so send the canonical type.
    type: AUDIO_FORMAT_MIME[format],
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
    fields: UploadMediaFields,
    request?: Pick<AxiosRequestConfig, 'onUploadProgress' | 'signal'>
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
    form.append('rightsConfirmed', 'true');

    const response = await api.post<UploadMediaResponse>(
      '/media/upload',
      form,
      { timeout: UPLOAD_TIMEOUT_MS, ...request }
    );
    return response.data;
  },

  /** Metadata update. Caller must be an admin, media owner, or verified creator. */
  updateMedia: async (
    mediaId: string,
    updates: Record<string, unknown>
  ): Promise<{ message?: string; media?: ChartMediaItem }> => {
    const response = await api.put<{ message?: string; media?: ChartMediaItem }>(
      `/media/${mediaId}`,
      updates
    );
    return response.data;
  },

  uploadCoverArt: async (
    mediaId: string,
    file: { uri: string; name: string; mimeType: string }
  ): Promise<{ coverArt?: string; message?: string }> => {
    const form = new FormData();
    form.append('coverArtFile', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);
    const response = await api.put<{ coverArt?: string; message?: string }>(
      `/media/${mediaId}/cover-art`,
      form,
      { timeout: 120000 }
    );
    return response.data;
  },

  removeCoverArt: async (
    mediaId: string
  ): Promise<{ coverArt?: string; message?: string }> => {
    const response = await api.delete<{ coverArt?: string; message?: string }>(
      `/media/${mediaId}/cover-art`
    );
    return response.data;
  },

  attachUpload: async (
    mediaId: string,
    file: AudioFileAsset,
    options: { replaceExisting: boolean },
    request?: Pick<AxiosRequestConfig, 'onUploadProgress' | 'signal'>
  ): Promise<{ message?: string; media?: ChartMediaItem }> => {
    const form = new FormData();
    appendAudioFile(form, file);
    form.append('rightsConfirmed', 'true');
    form.append('uploaderRole', 'owner');
    if (options.replaceExisting) {
      form.append('replaceExisting', 'true');
    }
    const response = await api.post<{ message?: string; media?: ChartMediaItem }>(
      `/media/${mediaId}/attach-upload`,
      form,
      { timeout: UPLOAD_TIMEOUT_MS, ...request }
    );
    return response.data;
  },

  deleteMedia: async (
    mediaId: string,
    reason?: string
  ): Promise<{ message?: string }> => {
    const response = await api.delete<{ message?: string }>(`/media/${mediaId}`, {
      data: reason ? { reason } : undefined,
    });
    return response.data;
  },
};
