# Cloudflare iOS App Setup Guide

Guide for setting up a third-party iOS Cloudflare management app (like Cloudflare Manager, CF Manager, or similar) with your Tuneable infrastructure.

## Prerequisites

- Cloudflare account with `tuneable.stream` domain configured
- Access to Cloudflare Dashboard
- Third-party iOS Cloudflare management app installed

## Creating the API Token

### Step 1: Go to API Tokens Page

1. Open your browser and go to: https://dash.cloudflare.com/profile/api-tokens
2. Or follow the iOS app's instructions: Profile Icon → My Profile → API Tokens

### Step 2: Create Custom Token

Click **"Create Token"** and then **"Use template"** or **"Create Custom Token"**

### Recommended Permissions for Tuneable Management

Based on your infrastructure (Workers, Pages, Domain), configure these permissions:

#### For Full Management (Recommended):

| Resource | Permission | Reason |
|----------|-----------|---------|
| **Account → Workers Scripts** | Edit | Manage your API proxy worker |
| **Account → Cloudflare Pages** | Edit | Deploy and manage frontend |
| **Zone → Zone** | Read | View domain information |
| **Zone → DNS** | Edit | Manage DNS records |
| **Zone → Analytics** | Read | Monitor traffic and performance |
| **Zone → Logs** | Read | View request logs |
| **Account → Account Settings** | Read | View account info |
| **User → API Tokens** | Read | Manage API tokens |

#### For Read-Only Monitoring:

| Resource | Permission | Reason |
|----------|-----------|---------|
| **Zone → Zone** | Read | View domain information |
| **Zone → Analytics** | Read | Monitor traffic |
| **Zone → Logs** | Read | View logs |
| **Account → Workers Scripts** | Read | View worker status |

#### Zone Resources:
- Select **Specific zone** → **tuneable.stream**

#### Token Expiration:
- Set to **1 year** (recommended for mobile apps)
- Or **Custom** if you need longer

### Step 3: Create and Copy Token

1. Click **"Continue to summary"**
2. Review permissions
3. Click **"Create Token"**
4. **IMPORTANT**: Copy the token immediately - it won't be shown again!

### Step 4: Paste Token in iOS App

1. Return to your iOS Cloudflare management app
2. Paste the token in the **"Paste your Cloudflare API token"** field
3. Tap **"Next"** to complete setup

## Security Best Practices

### Token Storage
- The iOS app stores your token securely in the device's Keychain
- Never share your API token with others
- Don't paste it in public channels (Discord, GitHub issues, etc.)

### Token Management
- Create separate tokens for different apps/purposes
- Use specific permissions (not "Edit All")
- Set reasonable expiration dates
- Revoke unused tokens in Cloudflare Dashboard

### If Token is Compromised
1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Find the compromised token
3. Click **"Roll"** to regenerate or **"Delete"** to revoke
4. Create a new token and update your iOS app

## Testing the Token

Once configured in the iOS app, verify it works:

1. **View Zones**: Should see `tuneable.stream` listed
2. **View Workers**: Should see `tuneable-api-proxy` worker
3. **View Analytics**: Should see traffic stats
4. **View DNS**: Should see your DNS records

## Troubleshooting

### "Invalid API Token" Error
- Token may have been copied incorrectly (check for extra spaces)
- Token may have expired
- Permissions may be insufficient
- Create a new token and try again

### "Insufficient Permissions" Error
- The app is trying to access resources not included in your token
- Recreate the token with broader permissions (see "Full Management" above)

### Cannot See tuneable.stream Domain
- Make sure you selected "Specific zone → tuneable.stream" when creating the token
- Or use "All zones" permission if you manage multiple domains

## Current Tuneable Cloudflare Infrastructure

Your iOS app will have access to manage:

### Workers
- **tuneable-api-proxy**: Proxies `/api/*` requests to backend
- Location: `cloudflare-worker/api-proxy.js`
- Routes: `tuneable.stream/api/*` and `www.tuneable.stream/api/*`

### Pages
- **Frontend**: React app deployed on Cloudflare Pages
- Source: `tuneable-frontend-v2/`
- URL: `tuneable.stream` (or `tuneable.pages.dev`)

### DNS Records (tuneable.stream)
- A/AAAA records for root and www
- MX records for email (if configured)
- TXT records for verification

### Secrets/Environment Variables
- `BACKEND_URL`: Set in Worker (points to backend server)
- `VITE_*`: Set in Pages (frontend config)

## Useful iOS App Features

Once configured, you can use the iOS app to:

- 📊 **Monitor Analytics**: Real-time traffic, bandwidth, threats blocked
- 🚀 **Deploy Workers**: Edit and deploy worker scripts on-the-go
- 🌐 **Manage DNS**: Add/edit/delete DNS records
- 🔍 **View Logs**: Debug API requests and errors
- 📈 **Performance Metrics**: Core Web Vitals, page load times
- 🛡️ **Security Dashboard**: See blocked threats, firewall events
- ⚡ **Purge Cache**: Clear Cloudflare cache when deploying updates

## Related Documentation

- `cloudflare-worker/README.md` - Worker setup and deployment
- `docs/CLOUDFLARE_PAGES_CONFIG.md` - Pages deployment config
- `docs/CLOUDFLARE_API_PROXY_SETUP.md` - API proxy configuration
- `CLOUDFLARE_503_FIX.md` - Troubleshooting circular routing

## Need Help?

- **Cloudflare API Tokens Docs**: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- **Tuneable Discord**: https://discord.gg/hwGMZV89up
- **Email**: t@tuneable.stream

---

**Note**: This guide is for third-party iOS apps that manage Cloudflare infrastructure. For the Tuneable iOS app itself (Swift/SwiftUI app in `tuneable-ios/`), see `tuneable-ios/README.md`.
