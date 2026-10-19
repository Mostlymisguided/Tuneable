import { api } from './client';

export type LabelInviteType = 'admin' | 'artist';

export const labelAPI = {
  acceptInvite: async (slug: string, inviteType: LabelInviteType) => {
    const response = await api.post<{ success: boolean; message?: string }>(
      `/labels/${encodeURIComponent(slug)}/accept-invite`,
      { inviteType }
    );
    return response.data;
  },

  declineInvite: async (slug: string, inviteType: LabelInviteType) => {
    const response = await api.post<{ success: boolean; message?: string }>(
      `/labels/${encodeURIComponent(slug)}/decline-invite`,
      { inviteType }
    );
    return response.data;
  },
};
