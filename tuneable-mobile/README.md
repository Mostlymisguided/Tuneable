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
- [x] Wallet top-up via Stripe Checkout (browser + deep link)
- [ ] OAuth (P1)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Expo dev server |
| `npm run ios` | Open iOS simulator |
| `npm run android` | Open Android emulator |
| `npm run web` | Run in browser |

## Related

- Web: `tuneable-frontend-v2/`
- Backend: `tuneable-backend/`
- Legacy (to scrap after P0): Capacitor under `tuneable-frontend-v2`, native Swift in `tuneable-ios/`
