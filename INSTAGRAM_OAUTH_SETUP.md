# Instagram OAuth Setup Guide

## Overview
Instagram OAuth integration has been successfully implemented in the Tuneable platform. Instagram uses Facebook's infrastructure for authentication and requires additional setup including webhooks and app review.

## Implementation Complete ✅

### Backend Changes:
1. **User Model** (`tuneable-backend/models/User.js`)
   - Added `instagramId` field
   - Added `instagramUsername` field
   - Added `instagramAccessToken` field

2. **Passport Strategy** (`tuneable-backend/config/passport.js`)
   - Implemented Instagram OAuth strategy using Instagram Graph API
   - Handles new user creation and account linking
   - Updates profile pictures and usernames from Instagram

3. **Auth Routes** (`tuneable-backend/routes/authRoutes.js`)
   - Added `/api/auth/instagram` route (OAuth initiation)
   - Added `/api/auth/instagram/callback` route (OAuth callback)
   - Follows the same pattern as Facebook/Google OAuth

4. **Webhook Endpoint** (`tuneable-backend/routes/instagramWebhooks.js`)
   - Handles Instagram webhook verification
   - Processes Instagram webhook events (comments, mentions, etc.)
   - Route: `/api/webhooks/instagram`

5. **Package Installation**
   - Installed `passport-instagram-graph` package

### Frontend Changes:
1. **User Profile Component** (`tuneable-frontend-v2/src/pages/UserProfile.tsx`)
   - Added Instagram button display
   - Links to user's Instagram profile
   - Uses Instagram icon from lucide-react
   - Pink hover color for brand consistency

## Environment Variables Required

Add these to your `.env` file in the `tuneable-backend` directory:

```bash
# Instagram OAuth Configuration
INSTAGRAM_APP_ID=2215545785608346
INSTAGRAM_APP_SECRET=your_instagram_app_secret_here
INSTAGRAM_CALLBACK_URL=http://localhost:8000/api/auth/instagram/callback

# Instagram Webhook Configuration
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=tuneable_ig_webhook_bananas_peachy_secure
```

For production, update the URLs:
```bash
INSTAGRAM_CALLBACK_URL=https://yourdomain.com/api/auth/instagram/callback
```

## Instagram App Configuration

### Prerequisites
1. **Instagram Business Account Required**
   - Your Instagram account must be a Business or Creator account
   - Must be linked to a Facebook Page
   - Convert in Instagram app: Settings → Account → Switch to Professional Account

2. **Facebook Developer Account**
   - Instagram API is managed through Facebook for Developers
   - Visit: https://developers.facebook.com/

### Step 1: Set Up Instagram Business Login

In your Instagram App settings on Facebook for Developers:

**OAuth Redirect URI:**
```
http://localhost:8000/api/auth/instagram/callback
```

**Production:**
```
https://yourdomain.com/api/auth/instagram/callback
```

### Step 2: Configure Webhooks

**Callback URL:**
```
http://localhost:8000/api/webhooks/instagram
```

**Verify Token:**
```
tuneable_ig_webhook_2024_secure
```
(This must match `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` in your `.env`)

**Production Webhook URL:**
```
https://yourdomain.com/api/webhooks/instagram
```

**Note:** For local development, you'll need to expose your localhost using a tool like:
- ngrok
- localtunnel
- Visual Studio Port Forwarding

### Step 3: Set Legal Pages

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

**Data Deletion URL:**
```
http://localhost:5173/data-deletion  (development)
https://yourdomain.com/data-deletion  (production)
```

### Step 4: Add Instagram Testers

Before app review, you must add Instagram tester accounts:

1. In Facebook Developer Dashboard → Your App → Roles → Roles
2. Click "Add People" → Select "Instagram Tester"
3. Enter the Instagram username
4. The tester receives an invitation in their Instagram app
5. Accept the invitation: Instagram App → Settings → Apps and Websites → Tester Invites

### Step 5: Request Permissions

Required permissions for Tuneable:
- `instagram_basic` - Basic profile information
- `instagram_content_publish` - (Optional) For publishing features
- `pages_show_list` - To access connected Facebook Pages

### Step 6: App Review (Required for Production)

Instagram requires app review before your app can access data from non-tester accounts.

**What to prepare:**
1. **Screencast Video** showing:
   - User clicking "Connect with Instagram"
   - Authorization flow
   - How Instagram data is used in your app
   - User profile showing Instagram connection

2. **Usage Description:** Explain how each permission is used:
   - `instagram_basic`: "We use this to allow users to connect their Instagram accounts and display their Instagram profile links on their Tuneable user profile."

3. **Step-by-Step Instructions** for reviewers

**Timeline:** Instagram app review typically takes 1-7 days.

## How It Works

### OAuth Flow

1. **User Clicks "Connect Instagram"**
   - Frontend redirects to `/api/auth/instagram`
   - Backend redirects to Instagram OAuth authorization page
   - User must have Instagram Business/Creator account

2. **User Authorizes**
   - Instagram redirects back to `/api/auth/instagram/callback`
   - Backend receives access token and user profile
   - Scopes requested: `user_profile`, `user_media`

3. **Account Linking**
   - If user exists: Link Instagram to existing account
   - If new user: Create new account with Instagram credentials
   - Store: `instagramId`, `instagramUsername`, `instagramAccessToken`

4. **Profile Display**
   - Instagram button appears on user profile
   - Links to `https://instagram.com/{username}`
   - Pink hover effect with Instagram icon

### Webhook Flow

1. **Verification (GET request)**
   - Instagram sends verification request to your webhook URL
   - Your server responds with the challenge token
   - This happens when you first configure the webhook

2. **Event Reception (POST request)**
   - Instagram sends events to your webhook URL
   - Events include: comments, mentions, story insights
   - Your server processes and responds with 200 OK

## API Endpoints

### Start OAuth Flow
```
GET /api/auth/instagram
```
Redirects user to Instagram OAuth authorization page.

### OAuth Callback
```
GET /api/auth/instagram/callback
```
Receives OAuth callback from Instagram. Creates/updates user and redirects to frontend with JWT token.

### Webhook Verification
```
GET /api/webhooks/instagram
```
Handles Instagram webhook verification requests.

### Webhook Events
```
POST /api/webhooks/instagram
```
Receives Instagram webhook events (comments, mentions, etc.).

## Testing

### Local Development Testing

1. **Set up environment variables**
2. **Expose local webhook using ngrok:**
   ```bash
   ngrok http 8000
   ```
3. **Update webhook URL in Instagram app settings** to ngrok URL:
   ```
   https://your-ngrok-url.ngrok.io/api/webhooks/instagram
   ```
4. **Add your Instagram account as a tester**
5. **Restart the backend server**
6. **Navigate to login/signup page**
7. **Click "Connect with Instagram"**
8. **Authorize the application**
9. **Check that Instagram button appears on profile**

### Production Testing

1. Deploy backend with production environment variables
2. Update webhook URL to production domain
3. Complete app review process
4. Test with non-tester accounts

## Important Notes

### Account Requirements
- ❗ **Instagram Business or Creator account required** - Personal accounts won't work
- Must be linked to a Facebook Page
- Page must be owned or have admin access

### Webhook Requirements
- Must be publicly accessible (localhost won't work directly)
- Must use HTTPS in production
- Must respond quickly (within 20 seconds)
- App mode must be "Live" to receive webhooks

### Token Management
- Access tokens have expiration dates
- Long-lived tokens last 60 days
- Implement token refresh logic for production use

### Rate Limits
- Instagram API has rate limits
- 200 calls per hour per user
- Plan accordingly for features that make API calls

## Troubleshooting

### "Redirect URI Mismatch" Error
- Ensure callback URL in your `.env` matches exactly what's configured in Instagram app settings
- Check for trailing slashes

### Webhook Verification Fails
- Verify that `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` matches what you entered in Instagram app settings
- Check server logs for the verification request

### "Instagram Business Account Required" Error
- User's Instagram account must be converted to Business or Creator
- Must be linked to a Facebook Page

### App Review Rejected
- Provide clearer screencast showing exact use case
- Ensure all legal pages are accessible
- Respond to reviewer feedback and resubmit

## Related Files

- `tuneable-backend/models/User.js`
- `tuneable-backend/config/passport.js`
- `tuneable-backend/routes/authRoutes.js`
- `tuneable-backend/routes/instagramWebhooks.js`
- `tuneable-backend/index.js`
- `tuneable-frontend-v2/src/pages/UserProfile.tsx`

## Next Steps

1. ✅ Backend implementation complete
2. ✅ Frontend integration complete
3. ⏳ Set up ngrok or similar for local webhook testing
4. ⏳ Add Instagram testers
5. ⏳ Test OAuth flow with tester accounts
6. ⏳ Prepare app review materials
7. ⏳ Submit for app review
8. ⏳ Go live after approval

## Resources

- [Instagram Graph API Documentation](https://developers.facebook.com/docs/instagram-api)
- [Instagram Basic Display API](https://developers.facebook.com/docs/instagram-basic-display-api)
- [Webhooks for Instagram](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-instagram)
- [App Review Guidelines](https://developers.facebook.com/docs/apps/review)

