# Tuneable iOS

Native Swift/SwiftUI iOS app for [Tuneable](https://tuneable.stream) — democratic music curation and group listening. Uses the same REST API as the web app (`tuneable-backend`).

## Requirements

- Xcode 15+ (Swift 5.9, iOS 17+)
- macOS for building and running the simulator
- Backend running (local or deployed) for login and parties

## Setup

### 1. Open the Xcode project

The Xcode project is included. From the repo:

```bash
cd tuneable-ios
open Tuneable.xcodeproj
```

(Optional: to regenerate with XcodeGen, run `brew install xcodegen` then `xcodegen generate` from `tuneable-ios`.)


### 2. Set the API base URL

- **Simulator:** Default is `http://localhost:8000`. Ensure the backend is running and that in **Info.plist** → `TUNEABLE_API_URL` is empty (so the default is used), or set it to `http://localhost:8000`.
- **Device:** Use your Mac’s IP (e.g. `http://192.168.1.10:8000`) so the phone can reach the backend. Add that URL in **Info.plist** → `TUNEABLE_API_URL`, or in the target’s **Info** tab add `TUNEABLE_API_URL` = `http://YOUR_IP:8000`.

If you use HTTPS in production, set `TUNEABLE_API_URL` to your API base (e.g. `https://api.tuneable.stream`) and ensure **App Transport Security** allows that host (or use the existing `NSExceptionDomains` in `Info.plist` for localhost).

### 3. Run the app

1. Run the backend (from repo root: `cd tuneable-backend && npm run dev`).
2. In Xcode, select a simulator or device and run (⌘R).
3. Sign in with an existing Tuneable account (email/password). You can create one on the web app or via the backend.

## Project structure

```
tuneable-ios/
├── Tuneable.xcodeproj        # Open this in Xcode (no XcodeGen required)
├── project.yml               # Optional: XcodeGen spec to regenerate project
├── Tuneable/
│   ├── TuneableApp.swift    # App entry
│   ├── ContentView.swift    # Root: login vs main tabs
│   ├── Config/
│   │   └── AppConfig.swift  # API base URL
│   ├── Services/
│   │   ├── APIClient.swift  # REST client, JWT in Keychain
│   │   ├── AuthService.swift
│   │   ├── KeychainHelper.swift
│   │   └── PartyService.swift
│   ├── Models/
│   │   ├── User.swift
│   │   └── Party.swift
│   ├── ViewModels/
│   │   └── AuthViewModel.swift
│   ├── Views/
│   │   ├── LoginView.swift
│   │   ├── HomeView.swift
│   │   ├── PartiesListView.swift
│   │   └── ProfileView.swift
│   └── Info.plist
└── README.md
```

## Features (current)

- Email/password login (JWT stored in Keychain)
- Profile and balance on Home and Profile
- List parties and join by code
- Party detail (info and queue)
- Sign out

## Next steps

- **Socket.IO:** Add [Socket.IO-Client-Swift](https://github.com/socketio/socket.io-client-swift) for real-time party updates (play/pause, queue, etc.).
- **OAuth:** Use ASWebAuthenticationSession for Google (and other providers) with backend OAuth routes.
- **Payments:** Integrate Stripe SDK for wallet top-up.
- **Audio:** Use AVFoundation for in-app playback when the party plays media.

## Env / config reference

| Key / concept | Where | Purpose |
|---------------|--------|---------|
| `TUNEABLE_API_URL` | Info.plist (optional) | Base URL without path, e.g. `http://localhost:8000` or `https://api.tuneable.stream`. If unset, Debug uses `http://localhost:8000`, Release uses `https://api.tuneable.stream`. |
| Backend CORS | `tuneable-backend` | Backend allows requests with no origin (e.g. native app). No change needed for iOS. |

See `env.example` in this directory for a checklist of backend env vars the API expects.
