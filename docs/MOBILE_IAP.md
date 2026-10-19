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

Set the **base price in GBP** in both consoles and generate the other territories from that base. Do not type the same digits into AUD, CAD, USD, and so on. The wallet is still credited the fixed pound amount above. The store price is what the customer pays in their local currency.

## Local price floor

A £5 pack bought as A$4.99 is not a £5 payment. Before crediting, the server converts the price the customer paid into pounds (ECB rates via Frankfurter, with a fallback table) and refuses the credit when that is under 80% of the pack. Override with `IAP_MIN_PAID_RATIO` (0–1).

80% matches Apple's equalization: other storefronts are priced from the UK amount before VAT, so a no-tax country pays about 83% of a VAT-inclusive GBP sticker. A same-digits foreign price (A$4.99 or US $4.99 for £5) falls well under the floor. Set the United Kingdom as the base storefront and let Apple generate the other prices. GBP points are fine enough to match the credit: £5.00, £10.00, £20.00 and £50.00 all exist (£0.10 steps up to £9.99, £0.50 steps from £10 to £49.99, £1 steps from £50, plus .99 / .00 / .90 / .95 endings).

The app calls `POST /api/payments/iap/price-preview` with each store price and disables a pack that would fail, so the store does not charge them. Verification still checks the receipt:

- **Apple:** `price` (milliunits) and `currency` on the signed transaction
- **Google:** `orders.get` on the order id. The Play service account needs **View financial data** in Play Console, or Android top-ups are refused

Acknowledgement runs only after the credit succeeds. Google refunds an unacknowledged purchase after 3 days. `IAP_DEV_BYPASS` skips the floor and is ignored in production.

## Flow

1. Mobile app loads store products and previews their prices
2. Mobile app purchases a consumable via `expo-iap`
3. App sends purchase to `POST /api/payments/iap/verify`
4. Backend verifies with Apple App Store Server API or Google Play Developer API, then checks the local price against the GBP credit
5. Backend credits `User.balance` + writes `WalletTransaction` (`apple_iap` / `google_play`)
6. App finishes the Apple transaction, or the server acknowledges the Play purchase

List packs: `GET /api/payments/iap/products` (auth required)

## Backend env

See `tuneable-backend/env.example`:

- **Apple (preferred):** `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_BUNDLE_ID`
- **Apple (legacy optional):** `APPLE_IAP_SHARED_SECRET`
- **Google:** service account with Play Android Developer access, **View financial data**, + `GOOGLE_PLAY_PACKAGE_NAME`
- **Price floor:** `IAP_MIN_PAID_RATIO` (default `0.80`)
- **Local only:** `IAP_DEV_BYPASS=true` (ignored when `NODE_ENV=production`)

## Client notes

- Requires a **development build** / TestFlight / Play internal testing — not Expo Go
- Plugin: `expo-iap` in `tuneable-mobile/app.json`
- Web Expo target still uses Stripe Checkout for arbitrary amounts
