# SoundCloud OAuth Setup Guide

## Overview
SoundCloud OAuth integration has been successfully implemented in the Tuneable platform. This allows users to connect their SoundCloud accounts and display them on their profile.

## Implementation Complete ✅

### Backend Changes:
1. **User Model** (`tuneable-backend/models/User.js`)
   - Added `soundcloudId` field
   - Added `soundcloudUsername` field
   - Added `soundcloudAccessToken` field

2. **Passport Strategy** (`tuneable-backend/config/passport.js`)
   - Implemented SoundCloud OAuth strategy
   - Handles new user creation and account linking
   - Updates profile pictures and usernames from SoundCloud

3. **Auth Routes** (`tuneable-backend/routes/authRoutes.js`)
   - Added `/api/auth/soundcloud` route (OAuth initiation)
   - Added `/api/auth/soundcloud/callback` route (OAuth callback)
   - Both routes follow the same pattern as Facebook/Google OAuth

4. **Package Installation**
   - Installed `passport-soundcloud` package

### Frontend Changes:
1. **User Profile Component** (`tuneable-frontend-v2/src/pages/UserProfile.tsx`)
   - Added SoundCloud button display
   - Links to user's SoundCloud profile
   - Uses Music2 icon from lucide-react
   - Orange hover color for brand consistency

## Environment Variables Required

Add these to your `.env` file in the `tuneable-backend` directory:

```bash
# SoundCloud OAuth Configuration
SOUNDCLOUD_CLIENT_ID=your_soundcloud_client_id_here
SOUNDCLOUD_CLIENT_SECRET=your_soundcloud_client_secret_here
SOUNDCLOUD_CALLBACK_URL=http://localhost:8000/api/auth/soundcloud/callback
```

For production, update the callback URL:
```bash
SOUNDCLOUD_CALLBACK_URL=https://yourdomain.com/api/auth/soundcloud/callback
```

## SoundCloud App Configuration

### 1. Register Your Application
Go to: https://developers.soundcloud.com/

### 2. Create a New App
- Fill in your application details
- Note down the Client ID and Client Secret

### 3. Set Redirect URI
In your SoundCloud app settings, add the redirect URI:

**Local Development:**
```
http://localhost:8000/api/auth/soundcloud/callback
```

**Production:**
```
https://yourdomain.com/api/auth/soundcloud/callback
```

### 4. Set Legal Pages URLs
SoundCloud requires links to your legal pages:

**Privacy Policy URL:**
```
http://localhost:5173/privacy-policy  (development)
https://yourdomain.com/privacy-policy  (production)
```

**Terms of Service URL:**
```
http://localhost:5173/terms-of-service  (development)
https://yourdomain.com/terms-of-service  (production)
```

## How It Works

1. **User Clicks "Connect SoundCloud"**
   - Frontend redirects to `/api/auth/soundcloud`
   - Backend redirects to SoundCloud OAuth page

2. **User Authorizes**
   - SoundCloud redirects back to `/api/auth/soundcloud/callback`
   - Backend receives access token and user profile

3. **Account Linking**
   - If user exists: Link SoundCloud to existing account
   - If new user: Create new account with SoundCloud credentials
   - Store: `soundcloudId`, `soundcloudUsername`, `soundcloudAccessToken`

4. **Profile Display**
   - SoundCloud button appears on user profile
   - Links to `https://soundcloud.com/{username}`
   - Orange hover effect with Music2 icon

## API Endpoints

### Start OAuth Flow
```
GET /api/auth/soundcloud
```
Redirects user to SoundCloud OAuth authorization page.

### OAuth Callback
```
GET /api/auth/soundcloud/callback
```
Receives OAuth callback from SoundCloud. Creates/updates user and redirects to frontend with JWT token.

## Testing

1. Set up environment variables
2. Restart the backend server
3. Navigate to login/signup page
4. Click "Connect with SoundCloud"
5. Authorize the application
6. Check that SoundCloud button appears on profile

## Frontend Flow

The SoundCloud button will automatically appear on user profiles if `soundcloudId` is present in the user object. The button:
- Links to the user's SoundCloud profile
- Uses the `soundcloudUsername` if available
- Falls back to `user-{soundcloudId}` format if username is not available
- Opens in a new tab with proper security attributes

## Notes

- SoundCloud OAuth does not always provide email addresses
- Username uniqueness is enforced automatically
- Profile pictures from SoundCloud are automatically imported
- Access tokens are stored for potential future features (playlist import, etc.)
- Follows the same security patterns as Facebook and Google OAuth

## Related Files

- `tuneable-backend/models/User.js`
- `tuneable-backend/config/passport.js`
- `tuneable-backend/routes/authRoutes.js`
- `tuneable-frontend-v2/src/pages/UserProfile.tsx`

