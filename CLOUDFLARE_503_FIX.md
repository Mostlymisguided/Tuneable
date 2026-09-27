# Fix for Cloudflare 503 Error - Circular Routing

## What Went Wrong

You changed `VITE_BACKEND_URL` from `tuneable.onrender.com` to `tuneable.stream`, which created a **circular routing loop**:

```
User → tuneable.stream (Cloudflare Pages) 
    → /api/* proxy function 
    → VITE_BACKEND_URL = tuneable.stream (WRONG!)
    → Back to Cloudflare Pages (loop!)
    → 503 error
```

## The Correct Architecture

Your stack should work like this:

```
tuneable.stream (Cloudflare Pages - Frontend)
    ↓ serves static files
    ↓ proxies /api/* requests to backend
    ↓
tuneable.onrender.com (Render - Backend)
    ↓ actual Node.js/Express server
    ↓ MongoDB, API endpoints, OAuth
```

## The Fix

### Step 1: Update Cloudflare Pages Environment Variables

Go to your Cloudflare Dashboard:
1. Navigate to: **Workers & Pages** → **tuneable-frontend-v2** (or your Pages project name)
2. Click **Settings** → **Environment variables**
3. Find or add these variables for **Production**:

| Variable Name | Correct Value | Why |
|---------------|---------------|-----|
| `VITE_BACKEND_URL` | `https://tuneable.onrender.com` | The actual backend on Render |
| `VITE_API_URL` | `https://tuneable.stream/api` | Public API endpoint (via Cloudflare proxy) |
| `NODE_VERSION` | `20` | Build requirement |

**CRITICAL**: `VITE_BACKEND_URL` must point to your **Render backend** (`tuneable.onrender.com`), NOT to `tuneable.stream`.

### Step 2: Verify the Proxy Function

The Cloudflare Pages function at `/tuneable-frontend-v2/functions/api/[[path]].js` is correctly configured:

```javascript
const backendUrl = env.VITE_BACKEND_URL || env.BACKEND_URL || 'https://tuneable.onrender.com';
```

This means:
- ✅ If `VITE_BACKEND_URL` is not set, it defaults to `tuneable.onrender.com` (correct!)
- ❌ If `VITE_BACKEND_URL` is set to `tuneable.stream`, it creates a loop (wrong!)

### Step 3: Verify Render Backend is Running

Make sure your backend on Render is actually running:

```bash
curl https://tuneable.onrender.com/api/test
```

Expected: `{"message":"API is working!"}`

If this returns 503, your Render backend is down or sleeping (free tier spins down after 15 min of inactivity).

### Step 4: Redeploy Cloudflare Pages

After fixing the environment variables:

**Option A: Automatic (via GitHub)**
- Push any change to trigger a rebuild, OR
- Go to **Deployments** → Click **⋯** on latest deployment → **Retry deployment**

**Option B: Manual**
```bash
cd /workspace/tuneable-frontend-v2
npm install
npm run build:prod
# Then upload via Cloudflare dashboard or use wrangler
```

### Step 5: Clear Cloudflare Cache

After redeployment:
1. Go to **Caching** → **Configuration**
2. Click **Purge Everything**
3. Confirm purge

Or use:
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

## How to Verify the Fix

1. **Check the proxy is working:**
   ```bash
   curl https://tuneable.stream/api/test
   ```
   Should return: `{"message":"API is working!"}`

2. **Test login from the web app:**
   - Go to https://tuneable.stream
   - Try logging in
   - Should NOT return 503

3. **Check Cloudflare logs:**
   - Go to **Workers & Pages** → Your project → **Logs**
   - Look for `[Pages Function] Proxying` messages
   - Verify it's proxying to `tuneable.onrender.com`, not `tuneable.stream`

## Why This Happened

The `.stream` domain is your **public-facing frontend** on Cloudflare Pages. The `.onrender.com` domain is your **actual backend server** on Render.

When you changed the environment variable to point the backend proxy to `.stream` instead of `.onrender.com`, the proxy function started trying to proxy requests to itself, creating an infinite loop that Cloudflare caught and returned as a 503.

## Quick Reference

| Domain | What It Is | Points To |
|--------|------------|-----------|
| `tuneable.stream` | Frontend (Cloudflare Pages) | Static files + API proxy |
| `tuneable.onrender.com` | Backend (Render) | Node.js/Express API server |

The proxy function on Cloudflare bridges these two domains:
- Public requests to `tuneable.stream/api/*`
- Get proxied to `tuneable.onrender.com/api/*`
- Response returned to user

## Related Files

- **Proxy function**: `/tuneable-frontend-v2/functions/api/[[path]].js`
- **Build script**: `/tuneable-frontend-v2/package.json` (build:prod)
- **Documentation**: 
  - `/docs/CLOUDFLARE_PAGES_CONFIG.md`
  - `/docs/CLOUDFLARE_API_PROXY_SETUP.md`

## After the Fix

Once this is fixed:
- ✅ Web app at `tuneable.stream` will work
- ✅ Mobile app can continue using local backend for development
- ✅ Production mobile builds will work with `tuneable.stream` API
- ✅ OAuth flows will work correctly (no more redirect loops)
