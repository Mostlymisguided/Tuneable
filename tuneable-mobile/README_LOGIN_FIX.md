# Fix for 503 Login Error

## Root Cause
The mobile app is getting a 503 error because it's trying to connect to the **production API** at `https://tuneable.stream`, which is currently:
- Returning HTTP 503 (Service Unavailable)
- Being blocked by Cloudflare (error code 1019)

## Solution: Use Local Development API

For local development and testing, you need to configure the app to use your **local backend** instead of the production server.

### Step 1: Determine Your Setup

#### If testing on iOS Simulator or Android Emulator:
Use `localhost:8000`

#### If testing on a Physical Device:
You need your Mac's **LAN IP address**. Find it with:
```bash
# On macOS
ipconfig getifaddr en0
# OR
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Your IP should look like `192.168.1.x` or `10.0.0.x`

### Step 2: Update `.env` File

The `.env` file has been created at `/workspace/tuneable-mobile/.env`:

```bash
# For Simulator/Emulator
EXPO_PUBLIC_API_URL=http://localhost:8000

# For Physical Device (replace with your actual IP)
# EXPO_PUBLIC_API_URL=http://192.168.1.XXX:8000

# Prefills the register invite field  
EXPO_PUBLIC_DEFAULT_INVITE_CODE=PE856
```

**If testing on a physical device:**
1. Find your Mac's LAN IP (see Step 1)
2. Edit `/workspace/tuneable-mobile/.env`
3. Replace `http://localhost:8000` with `http://YOUR_IP:8000`

### Step 3: Restart the Mobile App

The `.env` file is only read when the app starts, so you must restart:

```bash
cd /workspace/tuneable-mobile

# Clear the cache and restart
npx expo start -c
```

Then:
- **Simulator/Emulator**: Press `i` (iOS) or `a` (Android)
- **Physical Device**: Scan the QR code with Expo Go or your dev client

### Step 4: Verify Backend is Running

Before testing login, verify your local backend is accessible:

```bash
# On Simulator/Emulator
curl http://localhost:8000/api/test

# On Physical Device (replace with your IP)
curl http://YOUR_IP:8000/api/test
```

Expected response: `{"message":"API is working!"}`

### Step 5: Test Login

Try logging in again. The app should now connect to your local backend instead of the production server.

---

## About the Production Server Issue

The production API at `https://tuneable.stream` is currently unavailable:
- `/api/test` returns HTTP 503
- `/api/users/login` returns Cloudflare error 1019 (Access Denied)

This is likely a server or Cloudflare configuration issue that needs to be fixed separately.

## Build Configuration

- **Development builds** (expo-dev-client): Use `EXPO_PUBLIC_API_URL` from `.env`
- **Production builds** (via EAS): Use `https://tuneable.stream` (set in `eas.json`)

For local testing, always use a **development build** with the local API configured in `.env`.
