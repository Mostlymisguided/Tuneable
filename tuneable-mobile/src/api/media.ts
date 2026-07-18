import { api } from './client';
import type {
  ChartMediaItem,
  MediaProfileResponse,
  RelatedPlaylistsResponse,
} from '@/src/types/media';

export type PlaceGlobalBidResponse = {
  message?: string;
  updatedBalance?: number; // pence
  bid?: { amount?: number };
  media?: { globalMediaAggregate?: number };
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

  /** Tip a chart item. `amount` is in pounds (e.g. 0.50). */
  placeGlobalBid: async (
    mediaId: string,
    amount: number
  ): Promise<PlaceGlobalBidResponse> => {
    const response = await api.post<PlaceGlobalBidResponse>(
      `/media/${mediaId}/global-bid`,
      { amount }
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
