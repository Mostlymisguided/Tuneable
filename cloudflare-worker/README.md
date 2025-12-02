# Cloudflare Worker - API Proxy

This Cloudflare Worker proxies all `/api/*` requests to your backend server while allowing the frontend (Cloudflare Pages) to serve all other routes.

**Note**: If your frontend is deployed on Cloudflare Pages, consider using **Cloudflare Pages Functions** instead (see `../cloudflare-pages-functions/README.md`). It's simpler and automatically deployed with your Pages project.

## Setup Instructions

### Prerequisites

1. **Cloudflare account** with your domain (`tuneable.stream`) configured
2. **Wrangler CLI** installed (Cloudflare's deployment tool)
3. **Backend URL** - Your backend server URL (e.g., `https://tuneable.onrender.com`)

### Step 1: Install Wrangler

```bash
npm install -g wrangler
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

This will open a browser window to authenticate with Cloudflare.

### Step 3: Set Backend URL Secret

Set your backend URL as a secret (this keeps it secure):

```bash
wrangler secret put BACKEND_URL
```

When prompted, enter your backend URL, e.g.:
```
https://tuneable.onrender.com
```

### Step 4: Configure Routes

You have two options:

#### Option A: Deploy via Wrangler (Recommended)

1. Update `wrangler.toml` with your domain:
   ```toml
   [env.production]
   routes = [
     { pattern = "tuneable.stream/api/*", zone_name = "tuneable.stream" },
     { pattern = "www.tuneable.stream/api/*", zone_name = "tuneable.stream" }
   ]
   ```

2. Deploy the worker:
   ```bash
   cd cloudflare-worker
   wrangler deploy
   ```

#### Option B: Deploy via Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your domain (`tuneable.stream`)
3. Go to **Workers & Pages** → **Create** → **Worker**
4. Copy the contents of `api-proxy.js` into the editor
5. Click **Save and Deploy**
6. Go to **Triggers** tab
7. Add a route: `tuneable.stream/api/*`
8. Add another route: `www.tuneable.stream/api/*`
9. Go to **Settings** → **Variables** → **Secrets**
10. Add `BACKEND_URL` secret with your backend URL

### Step 5: Verify Deployment

Test that the worker is working:

```bash
# Test the webhook test endpoint
curl https://tuneable.stream/api/payments/webhook/test
```

You should get JSON response:
```json
{
  "status": "ok",
  "message": "Webhook endpoint is accessible",
  ...
}
```

If you still get HTML, the worker might not be active. Check:
1. Worker is deployed and active
2. Routes are correctly configured
3. Backend URL secret is set correctly

## How It Works

1. **API Requests** (`/api/*`):
   - Worker intercepts the request
   - Forwards it to your backend server
   - Returns the backend response with CORS headers

2. **Frontend Requests** (everything else):
   - Passed through to Cloudflare Pages
   - Served by your React app

## Troubleshooting

### Worker not intercepting requests

- Check routes are configured: `tuneable.stream/api/*`
- Verify worker is active in Cloudflare Dashboard
- Check worker logs in Cloudflare Dashboard → Workers → Your Worker → Logs

### Backend connection errors

- Verify `BACKEND_URL` secret is set correctly
- Test backend directly: `curl https://your-backend-url/api/payments/webhook/test`
- Check backend server is running and accessible

### CORS errors

- The worker adds CORS headers automatically
- If issues persist, check backend CORS configuration

## Alternative: Cloudflare Page Rules

If you prefer not to use Workers, you can use Cloudflare Page Rules (limited free tier):

1. Go to Cloudflare Dashboard → **Rules** → **Page Rules**
2. Create a new rule:
   - **URL Pattern**: `*tuneable.stream/api/*`
   - **Setting**: **Forwarding URL** → **301/302 Redirect** or **Dynamic Redirect**
   - **Destination**: `https://your-backend-url$1` (where `$1` is the path)

**Note**: Page Rules have limitations and Workers are more flexible and recommended.

## Updating the Worker

After making changes to `api-proxy.js`:

```bash
cd cloudflare-worker
wrangler deploy
```

## Monitoring

View worker logs in Cloudflare Dashboard:
- **Workers & Pages** → Your Worker → **Logs**

This shows all proxied requests and any errors.

