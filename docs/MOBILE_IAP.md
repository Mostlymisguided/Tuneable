# Mobile wallet IAP (Apple / Google Play)

Native Tuneable top-ups use **App Store / Play Billing**. Web wallet top-ups stay on **Stripe**.

## Product catalog

Create **consumable** in-app products with these IDs on both stores:

| Product ID | Wallet credit |
|------------|---------------|
| `stream.tuneable.app.wallet.5` | £5 |
| `stream.tuneable.app.wallet.10` | £10 |
| `stream.tuneable.app.wallet.20` | £20 |
| `stream.tuneable.app.wallet.50` | £50 |

Bundle / application ID: `stream.tuneable.app`

## Flow

1. Mobile app purchases a consumable via `expo-iap`
2. App sends purchase to `POST /api/payments/iap/verify`
3. Backend verifies with Apple App Store Server API or Google Play Developer API
4. Backend credits `User.balance` + writes `WalletTransaction` (`apple_iap` / `google_play`)
5. App finishes / consumes the store transaction

List packs: `GET /api/payments/iap/products` (auth required)

## Backend env

See `tuneable-backend/env.example`:

- **Apple (preferred):** `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_BUNDLE_ID`
- **Apple (legacy optional):** `APPLE_IAP_SHARED_SECRET`
- **Google:** service account with Play Android Developer access + `GOOGLE_PLAY_PACKAGE_NAME`
- **Local only:** `IAP_DEV_BYPASS=true` (ignored when `NODE_ENV=production`)

## Client notes

- Requires a **development build** / TestFlight / Play internal testing — not Expo Go
- Plugin: `expo-iap` in `tuneable-mobile/app.json`
- Web Expo target still uses Stripe Checkout for arbitrary amounts
