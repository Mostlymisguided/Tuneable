# Tuneable Mobile (Capacitor)

## Quick start

```bash
cd tuneable-frontend-v2
npm run build
npx cap sync
npx cap open ios    # or: npx cap open android
```

Scripts: `npm run cap:sync`, `npm run cap:ios`, `npm run cap:android`

## Architecture

- **Web**: existing React app in `dist/`
- **Native shell**: `ios/` and `android/` (Capacitor)
- **Background audio**: `@mediagrid/capacitor-native-audio` via `src/services/nativeAudioPlayer.ts`
- **MP3 playback**: `MP3Player.tsx` uses native audio on device, HTML5 `<audio>` on web

## MP3 library migration

Match local iTunes library to YouTube catalog entries and attach uploads:

```bash
cd tuneable-backend

# Preview matches (scans Music/Artist/Album/*.mp3 recursively)
node scripts/bulkAttachMp3FromDirectory.js \
  --dir "/Users/admin/Music/iTunes/iTunes Media" \
  --dry-run

# Upload matched files to R2 and enable playback
node scripts/bulkAttachMp3FromDirectory.js \
  --dir "/Users/admin/Music/iTunes/iTunes Media" \
  --execute \
  --user-id YOUR_MONGO_USER_ID
```

Options: `--limit N` to cap uploads. Set `BULK_UPLOAD_USER_ID` in `.env` to skip `--user-id`.

Log output: `tuneable-backend/scripts/bulk-attach-log.txt`

## iOS notes

- `UIBackgroundModes: audio` is set in `ios/App/App/Info.plist`
- In Xcode, also enable **Background Modes → Audio** on the App target if needed
- Test background playback on a **physical device** (simulator is unreliable)

## Android notes

- Foreground service permissions are in `AndroidManifest.xml`
- Test on a physical device for lock-screen controls

## Env / API URL

Production builds bundle `dist/` locally. Set `VITE_API_URL` at build time to point at your API (e.g. `https://api.tuneable.stream/api`).

For live-reload dev against local Vite, you can temporarily set `server.url` in `capacitor.config.ts` (not for store builds).
