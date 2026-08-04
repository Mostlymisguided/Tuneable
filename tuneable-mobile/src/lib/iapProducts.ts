/** Must match App Store Connect / Play Console + backend iapProducts.js */
export const WALLET_IAP_PRODUCTS = [
  {
    productId: 'stream.tuneable.app.wallet.5',
    creditPounds: 5,
    label: '£5',
  },
  {
    productId: 'stream.tuneable.app.wallet.10',
    creditPounds: 10,
    label: '£10',
  },
  {
    productId: 'stream.tuneable.app.wallet.20',
    creditPounds: 20,
    label: '£20',
  },
  {
    productId: 'stream.tuneable.app.wallet.50',
    creditPounds: 50,
    label: '£50',
  },
] as const;

export const WALLET_IAP_SKUS = WALLET_IAP_PRODUCTS.map((p) => p.productId);

export type WalletIapProductId = (typeof WALLET_IAP_PRODUCTS)[number]['productId'];

export function getPackByProductId(productId: string) {
  return WALLET_IAP_PRODUCTS.find((p) => p.productId === productId) ?? null;
}
