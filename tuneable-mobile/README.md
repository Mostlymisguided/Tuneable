# Tuneable Mobile (Expo)

React Native / Expo app for Tuneable. Replaces the Capacitor shell and the Swift `tuneable-ios` track as the native client going forward.

## Stack

- Expo SDK 54 + Expo Router (tabs) — matches App Store Expo Go (SDK 57 Go is still pending Apple review)
- TypeScript
- Axios → same `tuneable-backend` REST API as web
- JWT in SecureStore (native) / localStorage (web)

## Setup

```bash
cd tuneable-mobile
cp .env.example .env
npm install
npx expo start
```

### API URL

Set `EXPO_PUBLIC_API_URL` in `.env`:

| Environment | Example |
|-------------|---------|
| Simulator / web | `http://localhost:8000` |
| Physical device | `http://192.168.x.x:8000` (your Mac's LAN IP) |
| Production | `https://tuneable.stream` (or your API origin; `/api` is appended) |

Restart Expo after changing `.env`.

## Current status (P0 scaffold)

- [x] Email/username + password login
- [x] Tabs: Home · Music · Podcasts · Profile
- [x] Profile / balance / sign out
- [x] Global music chart + upload playback (mini bar)
- [x] Podcast chart + enclosure playback (shared mini bar)
- [x] Tip on music/podcast charts (global bid)
- [x] Wallet top-up via Apple / Google Play IAP (native) + Stripe on web
- [x] Google OAuth (browser + deep link)
- [x] Facebook OAuth (same pattern)
- [x] Sign in with Apple (native; iOS store/dev builds)
- [x] In-app account deletion + Privacy/Terms links
- [x] Music search + Add & tip to global chart
- [ ] SoundCloud OAuth / polish

## App Store / EAS

```bash
npm i -g eas-cli
eas login
eas build:configure   # once — writes EAS projectId
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Production/preview profiles set `EXPO_PUBLIC_API_URL=https://tuneable.stream`. Enable **Sign in with Apple** on the App ID. Create IAP products before TestFlight wallet testing.

## Wallet payments

| Client | Rail |
|--------|------|
| iOS / Android (dev or store build) | Consumable IAP via `expo-iap` → `POST /api/payments/iap/verify` |
| Web / Expo web | Stripe Checkout (unchanged) |
| Expo Go | IAP unavailable — use a development build |

Product IDs (must match App Store Connect + Play Console):

- `stream.tuneable.app.wallet.5` (£5)
- `stream.tuneable.app.wallet.10` (£10)
- `stream.tuneable.app.wallet.20` (£20)
- `stream.tuneable.app.wallet.50` (£50)

Backend needs Apple App Store Server API keys and/or Google Play service-account credentials (see `tuneable-backend/env.example`). For local credit-path testing only: `IAP_DEV_BYPASS=true` when `NODE_ENV` is not `production`.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Expo dev server |
| `npm run ios` | Open iOS simulator |
| `npm run android` | Open Android emulator |
| `npm run web` | Run in browser (Stripe wallet) |

IAP requires a custom native build (`npx expo run:ios` / `run:android` or EAS), not Expo Go.

## Related

- Web: `tuneable-frontend-v2/`
- Backend: `tuneable-backend/`
- Legacy (to scrap after P0): Capacitor under `tuneable-frontend-v2`, native Swift in `tuneable-ios/`
