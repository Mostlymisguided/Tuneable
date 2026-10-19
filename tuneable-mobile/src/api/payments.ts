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

  updateBalance: async (amount: number, stripeSessionId?: string) => {
    const response = await api.post<{
      message?: string;
      balance?: number;
      alreadyProcessed?: boolean;
    }>('/payments/update-balance', { amount, stripeSessionId });
    return response.data;
  },

  confirmCheckoutSession: async (sessionId: string) => {
    const response = await api.post<{
      message?: string;
      balance?: number;
      alreadyProcessed?: boolean;
    }>('/payments/confirm-checkout-session', { stripeSessionId: sessionId });
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

  previewIapPrices: async (
    items: Array<{ productId: string; amountMajor: number; currency: string }>
  ) => {
    const response = await api.post<{
      results: Array<{
        productId: string;
        accepted: boolean | null;
        paidPenceEstimate?: number;
        reason?: string;
      }>;
    }>('/payments/iap/price-preview', { items });
    return response.data.results;
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
