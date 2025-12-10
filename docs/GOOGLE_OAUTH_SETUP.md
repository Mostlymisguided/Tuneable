# Google OAuth Setup Guide

## Backend Configuration

Add these environment variables to your `.env` file:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8000/api/auth/google/callback

# Session Secret (for OAuth)
SESSION_SECRET=your-session-secret-key-here

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

For production on Render, use:
```env
GOOGLE_CALLBACK_URL=https://tuneable.onrender.com/api/auth/google/callback
FRONTEND_URL=https://your-frontend-domain.com
```

## Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API** (or use the newer **Google Identity Services**):
   - Go to **APIs & Services** → **Library**
   - Search for "Google+ API" or "Google Identity Services"
   - Click **Enable**

4. **Enable YouTube Data API v3** (required for YouTube import feature):
   - Go to **APIs & Services** → **Library**
   - Search for "YouTube Data API v3"
   - Click **Enable**

5. Create OAuth 2.0 Credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Select **Web application** as the application type
   - Configure the OAuth consent screen first if prompted

6. Configure OAuth Consent Screen:
   - Go to **APIs & Services** → **OAuth consent screen**
   - Choose **External** (for testing) or **Internal** (for Google Workspace)
   - Fill in required fields:
     - App name: Tuneable
     - User support email: your-email@example.com
     - Developer contact: your-email@example.com
   - Add scopes:
     - `profile`
     - `email`
     - ~~`https://www.googleapis.com/auth/youtube.readonly`~~ (Optional - currently commented out to avoid verification requirement)

7. Configure OAuth 2.0 Client:
   - **Name**: Tuneable OAuth Client (or your preferred name)
   - **Authorized JavaScript origins**:
     - `http://localhost:8000` (for local development)
     - `https://tuneable.onrender.com` (for production)
   - **Authorized redirect URIs**:
     - `http://localhost:8000/api/auth/google/callback` (for local development)
     - `https://tuneable.onrender.com/api/auth/google/callback` (for production)

8. Save and copy your credentials:
   - **Client ID** → Use as `GOOGLE_CLIENT_ID`
   - **Client Secret** → Use as `GOOGLE_CLIENT_SECRET`

### Google OAuth Scopes

Our implementation requests the following Google permissions:
- **`profile`** - User's basic profile information
- **`email`** - User's email address
- **`https://www.googleapis.com/auth/youtube.readonly`** - Read-only access to YouTube account (for YouTube liked videos import feature) - **Currently commented out to avoid Google verification requirement**

**Note:** The YouTube scope requires Google app verification. It's currently commented out in `authRoutes.js`. If you want to enable YouTube import feature later, uncomment the scope and submit for Google verification.

### Testing

1. Make sure all environment variables are set correctly
2. Restart your backend server
3. Navigate to the login page
4. Click "Sign in with Google"
5. You should be redirected to Google's consent screen
6. After authorization, you should be redirected back to your app

### Troubleshooting

**Error: "Google OAuth not configured"**
- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in your `.env` file
- Verify the environment variables are loaded (restart server after adding them)
- On Render: Make sure the environment variables are added in the Render dashboard under your service's **Environment** tab

**Error: "redirect_uri_mismatch"**
- Verify the callback URL in Google Cloud Console matches exactly:
  - Production: `https://tuneable.onrender.com/api/auth/google/callback`
  - Development: `http://localhost:8000/api/auth/google/callback`
- Make sure there are no trailing slashes or typos
- The URL must match exactly, including the protocol (http vs https)

**Error: "access_denied"**
- User may have denied permission
- Check OAuth consent screen configuration
- Verify required scopes are added to the consent screen

**Error: "invalid_client"**
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Check that the credentials haven't been regenerated
- Ensure the OAuth client is enabled in Google Cloud Console

### Production Checklist

Before deploying to production:

- [ ] Set `GOOGLE_CALLBACK_URL` to production URL
- [ ] Add production callback URL to Google Cloud Console
- [ ] Add production JavaScript origin to Google Cloud Console
- [ ] Verify OAuth consent screen is configured (only profile and email scopes)
- [ ] Publish OAuth consent screen (should work without verification for basic scopes)
- [ ] Test the flow on production environment
- [ ] (Optional) Uncomment YouTube scope and submit for verification if YouTube import is needed

