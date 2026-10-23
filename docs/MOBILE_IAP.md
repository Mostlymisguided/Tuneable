# Mobile wallet IAP (Apple / Google Play)

Native Tuneable top-ups use **App Store / Play Billing**. Web wallet top-ups stay on **Stripe**.

## Product catalog

Create **consumable** in-app products with these IDs on both stores:

| Product ID | Display name |
|------------|--------------|
| `stream.tuneable.app.wallet.5` | Top-up 5 |
| `stream.tuneable.app.wallet.10` | Top-up 10 |
| `stream.tuneable.app.wallet.20` | Top-up 20 |
| `stream.tuneable.app.wallet.50` | Top-up 50 |

The display name is set in App Store Connect and Play Console. It is not a price. The store shows the local price beside it. Description for each: `Adds this price's pound value to your wallet.`

Bundle / application ID: `stream.tuneable.app`

The wallet is credited the **pound value of the price the store charged**, at the mid-market rate on that day. A US $4.99 purchase adds about £3.74 while the pound is strong, not a fixed £5. That is the amount the customer paid, so the balance is not a pound claim Tuneable has to fund from somewhere else. Card top-ups on the website are already in pounds and still credit the amount charged.

## What gets added

The server converts the receipt price into pounds (ECB rates via Frankfurter, with a fallback table) and credits that many pence. A zero price is refused. Unpaid Play grants (license testers, promos) still credit the catalogue amount, because there is no customer price on those receipts.

The app calls `POST /api/payments/iap/price-preview` and shows “Adds £3.74” before the purchase. Verification still checks the receipt:

- **Apple:** `price` (milliunits) and `currency` on the signed transaction
- **Google:** `orders.get` on the order id. The Play service account needs **View financial data** in Play Console, or Android top-ups are refused

Acknowledgement runs only after the credit succeeds. Google refunds an unacknowledged purchase after 3 days. `IAP_DEV_BYPASS` credits the catalogue amount and is ignored in production.

## Flow

1. Mobile app loads store products and previews their prices
2. Mobile app purchases a consumable via `expo-iap`
3. App sends purchase to `POST /api/payments/iap/verify`
4. Backend verifies with Apple App Store Server API or Google Play Developer API, then converts the receipt price into pounds
5. Backend credits that pound value to `User.balance` and writes `WalletTransaction` (`apple_iap` / `google_play`)
6. App finishes the Apple transaction, or the server acknowledges the Play purchase

List packs: `GET /api/payments/iap/products` (auth required)

## Backend env

See `tuneable-backend/env.example`:

- **Apple (preferred):** `APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY`, `APPLE_IAP_BUNDLE_ID`
- **Apple (legacy optional):** `APPLE_IAP_SHARED_SECRET`
- **Google:** service account with Play Android Developer access, **View financial data**, + `GOOGLE_PLAY_PACKAGE_NAME`
- **Local only:** `IAP_DEV_BYPASS=true` (ignored when `NODE_ENV=production`; credits the catalogue amount)

## Client notes

- Requires a **development build** / TestFlight / Play internal testing — not Expo Go
- Plugin: `expo-iap` in `tuneable-mobile/app.json`
- Web Expo target still uses Stripe Checkout for arbitrary amounts
