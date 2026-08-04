import { api } from './client';

export type ClaimIntent = 'claim_keep' | 'takedown';

export type SubmitClaimParams = {
  mediaId: string;
  proofText: string;
  intent: ClaimIntent;
};

export const claimsAPI = {
  submitClaim: async ({ mediaId, proofText, intent }: SubmitClaimParams) => {
    const formData = new FormData();
    formData.append('mediaId', mediaId);
    formData.append('proofText', proofText);
    formData.append('intent', intent);

    const response = await api.post('/claims/submit', formData);
    return response.data as {
      message?: string;
      claim?: { _id?: string; status?: string; intent?: string };
    };
  },
};
