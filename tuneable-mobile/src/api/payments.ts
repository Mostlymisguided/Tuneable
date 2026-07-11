import { api } from './client';

export const paymentAPI = {
  createCheckoutSession: async (
    amount: number,
    currency: string = 'gbp',
    totalCharge?: number,
    redirects?: { successUrl?: string; cancelUrl?: string }
  ) => {
    const response = await api.post<{ sessionId: string; url: string }>(
      '/payments/create-checkout-session',
      {
        amount,
        totalCharge,
        currency,
        successUrl: redirects?.successUrl,
        cancelUrl: redirects?.cancelUrl,
      }
    );
    return response.data;
  },

  updateBalance: async (amount: number) => {
    const response = await api.post<{
      message?: string;
      balance?: number;
    }>('/payments/update-balance', { amount });
    return response.data;
  },
};
