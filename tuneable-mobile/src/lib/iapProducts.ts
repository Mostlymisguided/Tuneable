/** In-app fallback when the store price has not loaded. The payment sheet name is set in App Store Connect. Product ids must match the stores and backend iapProducts.js. */
export const WALLET_IAP_PRODUCTS = [
  {
    productId: 'stream.tuneable.app.wallet.5',
    creditPounds: 5,
    label: 'Top-up 5',
  },
  {
    productId: 'stream.tuneable.app.wallet.10',
    creditPounds: 10,
    label: 'Top-up 10',
  },
  {
    productId: 'stream.tuneable.app.wallet.20',
    creditPounds: 20,
    label: 'Top-up 20',
  },
  {
    productId: 'stream.tuneable.app.wallet.50',
    creditPounds: 50,
    label: 'Top-up 50',
  },
] as const;

export const WALLET_IAP_SKUS = WALLET_IAP_PRODUCTS.map((p) => p.productId);

export type WalletIapProductId = (typeof WALLET_IAP_PRODUCTS)[number]['productId'];

export function getPackByProductId(productId: string) {
  return WALLET_IAP_PRODUCTS.find((p) => p.productId === productId) ?? null;
}
