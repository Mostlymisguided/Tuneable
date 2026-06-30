# Tuneable Mobile (Capacitor)

## Quick start (local dev API)

```bash
cd tuneable-frontend-v2
npm run cap:ios      # or cap:android
```

## Production / TestFlight builds

Bundle the **live API** into `dist/` before syncing to native:

```bash
cd tuneable-frontend-v2
npm run cap:ios:prod    # or cap:android:prod
```

This runs `build:prod` with `VITE_API_URL=https://tuneable.stream/api`, then `cap sync`.

Override via `env.production.local` (copy from `env.production.example`).

## Architecture

- **Web**: React app in `dist/`
- **Native shell**: `ios/` and `android/`
- **Background audio**: `@mediagrid/capacitor-native-audio` → lock-screen controls
- **MP3 playback**: `MP3Player.tsx` uses native audio on device, HTML5 on web
- **OAuth**: system browser (`@capacitor/browser`) → deep link `stream.tuneable.app://auth/callback?...`

## iOS → TestFlight checklist

1. `npm run cap:ios:prod`
2. Xcode → **Signing & Capabilities** → select your team, bundle `stream.tuneable.app`
3. Confirm **Background Modes → Audio** is enabled
4. **Product → Archive** → Distribute → App Store Connect
5. App Store Connect → TestFlight → add internal testers
6. Test on a **physical device**: login (Google), MP3 playback, background/lock screen

## Android → internal testing

1. `npm run cap:android:prod`
2. Android Studio → Build → Generate Signed Bundle (AAB)
3. Play Console → Internal testing → upload AAB
4. Test login + background playback on device

## OAuth deep links

| Platform | Config |
|----------|--------|
| iOS | `CFBundleURLSchemes`: `stream.tuneable.app` in `Info.plist` |
| Android | intent-filter `stream.tuneable.app` / host `auth` in `AndroidManifest.xml` |
| App code | `AuthDeepLinkListener` routes to `/auth/callback` |

Social login opens Safari/Chrome; after auth the backend redirects to  
`stream.tuneable.app://auth/callback?oauth_success=true&token=...` which re-opens the app.

No Google Cloud Console change needed — the Google redirect URI remains your **backend** callback URL.

## App icon & splash (TODO)

Replace Capacitor defaults in:

- iOS: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- Android: `android/app/src/main/res/mipmap-*/`

Source asset: `public/Tuneable-Logo-180x180.svg` (export 1024×1024 PNG for App Store).

## Env reference

| Variable | Example | When |
|----------|---------|------|
| `VITE_API_URL` | `https://tuneable.stream/api` | Required for prod mobile builds |
| `VITE_BACKEND_URL` | `https://tuneable.stream` | Stripe key fetch, optional |

## Day-to-day dev loop

```bash
npm run cap:sync:prod   # after frontend changes
# Xcode / Android Studio → Run on device
```

For live-reload against local Vite (dev only), temporarily set `server.url` in `capacitor.config.ts` — not for store builds.
