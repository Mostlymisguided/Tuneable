# Facebook OAuth Setup Guide

## Backend Configuration

Add these environment variables to your `.env` file:

```env
# Facebook OAuth Configuration
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=http://localhost:8000/api/auth/facebook/callback

# Session Secret (for OAuth)
SESSION_SECRET=your-session-secret-key-here

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

## Facebook App Setup

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or use an existing one
3. Add "Facebook Login" product to your app
4. Configure OAuth redirect URIs:
   - Development: `http://localhost:8000/api/auth/facebook/callback`
   - Production: `https://yourdomain.com/api/auth/facebook/callback`
5. Get your App ID and App Secret from the app settings
6. Add your domain to the app domains in Facebook app settings

### Facebook OAuth Scopes

Our implementation requests the following Facebook permissions:
- **`email`** - User's email address (if available)
- **`user_location`** - User's location information

**Note:** These scopes must be added to your Facebook app's use cases in the Facebook Developer Console. The implementation:
- Requests email and location permissions from Facebook
- Handles cases where email or location might not be provided
- Creates users with Facebook ID and generates usernames automatically
- Links accounts by email when available
- Imports location data to user's home location

### Required URLs for Facebook App Review

Facebook requires these URLs for app approval and compliance:

**Privacy Policy URL:**
- Development: `http://localhost:5173/privacy-policy`
- Production: `https://yourdomain.com/privacy-policy`

**Data Deletion Instructions URL:**
- Development: `http://localhost:5173/data-deletion`
- Production: `https://yourdomain.com/data-deletion`

### App Review Requirements

When submitting your app for Facebook review, you'll need to provide:

1. **Privacy Policy URL** - Points to your privacy policy page
2. **Data Deletion Instructions URL** - Points to your data deletion instructions page
3. **App Purpose** - Clear description of how you use Facebook login
4. **Data Usage** - What data you collect and how you use it
5. **User Consent** - How users consent to data collection

### Facebook App Settings

In your Facebook app settings, add these URLs:

1. **App Domains:**
   - `localhost` (for development)
   - `yourdomain.com` (for production)

2. **Privacy Policy URL:**
   - `https://yourdomain.com/privacy-policy`

3. **Data Deletion Instructions URL:**
   - `https://yourdomain.com/data-deletion`

4. **Valid OAuth Redirect URIs:**
   - `http://localhost:8000/api/auth/facebook/callback` (development)
   - `https://yourdomain.com/api/auth/facebook/callback` (production)

## Testing

1. Start the backend server: `npm start`
2. Start the frontend: `npm run dev`
3. Go to `/login` or `/register`
4. Click "Continue with Facebook"
5. Complete the Facebook OAuth flow
6. You should be redirected back to your app and logged in

## Features Implemented

- ✅ Facebook OAuth login/signup
- ✅ Automatic user creation from Facebook profile
- ✅ Linking existing accounts by email
- ✅ JWT token generation for OAuth users
- ✅ Frontend integration with Facebook login buttons
- ✅ OAuth callback handling

## Notes

- Users created via Facebook OAuth will have a generated username if not provided
- Email linking: If a user with the same email exists, the Facebook account will be linked
- Profile pictures from Facebook are automatically imported
- OAuth users don't need a password (password field is optional in User model)
