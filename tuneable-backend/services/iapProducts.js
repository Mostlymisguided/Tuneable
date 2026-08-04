/**
 * Wallet top-up packs sold via Apple IAP / Google Play Billing.
 * Product IDs must match App Store Connect + Play Console exactly.
 *
 * Wallet credit is always GBP (pence). Store price is set per territory
 * in the consoles; we credit the pack face value after server verification.
 */

const WALLET_IAP_PRODUCTS = [
  {
    productId: 'stream.tuneable.app.wallet.5',
    creditPence: 500,
    creditPounds: 5,
    label: '£5',
  },
  {
    productId: 'stream.tuneable.app.wallet.10',
    creditPence: 1000,
    creditPounds: 10,
    label: '£10',
  },
  {
    productId: 'stream.tuneable.app.wallet.20',
    creditPence: 2000,
    creditPounds: 20,
    label: '£20',
  },
  {
    productId: 'stream.tuneable.app.wallet.50',
    creditPence: 5000,
    creditPounds: 50,
    label: '£50',
  },
];

const PRODUCT_BY_ID = Object.fromEntries(
  WALLET_IAP_PRODUCTS.map((p) => [p.productId, p])
);

function getWalletIapProducts() {
  return WALLET_IAP_PRODUCTS.map(({ productId, creditPence, creditPounds, label }) => ({
    productId,
    creditPence,
    creditPounds,
    label,
  }));
}

function getProductById(productId) {
  return PRODUCT_BY_ID[productId] || null;
}

function getProductIds() {
  return WALLET_IAP_PRODUCTS.map((p) => p.productId);
}

module.exports = {
  WALLET_IAP_PRODUCTS,
  getWalletIapProducts,
  getProductById,
  getProductIds,
};
