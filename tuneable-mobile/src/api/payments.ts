import { api } from './client';

export type IapPlatform = 'ios' | 'android';

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

  getIapProducts: async () => {
    const response = await api.get<{
      products: Array<{
        productId: string;
        creditPence: number;
        creditPounds: number;
        label: string;
      }>;
    }>('/payments/iap/products');
    return response.data.products;
  },

  verifyIapPurchase: async (payload: {
    platform: IapPlatform;
    productId: string;
    transactionId?: string;
    purchaseToken?: string | null;
    receiptData?: string;
    packageName?: string;
  }) => {
    const response = await api.post<{
      message: string;
      balance: number;
      creditPence: number;
      creditPounds: number;
      alreadyProcessed: boolean;
      storeTransactionId: string;
    }>('/payments/iap/verify', payload);
    return response.data;
  },
};
