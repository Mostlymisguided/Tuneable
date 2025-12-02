# Cloudflare Pages Functions - API Proxy

This is the **simpler alternative** for Cloudflare Pages. If your frontend is deployed on Cloudflare Pages, use this approach instead of the standalone Worker.

## Setup Instructions

### Step 1: Add Function to Your Pages Project

1. In your `tuneable-frontend-v2` project, create the functions directory:
   ```bash
   mkdir -p functions/api
   ```

2. Copy the function file:
   ```bash
   cp cloudflare-pages-functions/api/[[path]].js tuneable-frontend-v2/functions/api/[[path]].js
   ```

   Or manually create `tuneable-frontend-v2/functions/api/[[path]].js` with the contents from `cloudflare-pages-functions/api/[[path]].js`

### Step 2: Verify Environment Variable in Cloudflare Pages

The function will use `VITE_BACKEND_URL` if it's already set, or `BACKEND_URL` as a fallback.

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Pages** → Your project (`tuneable-frontend-v2` or similar)
3. Go to **Settings** → **Environment Variables**
4. **If `VITE_BACKEND_URL` already exists**: You're all set! The function will use it automatically.
5. **If not set**: Add a new variable:
   - **Variable name**: `VITE_BACKEND_URL` (or `BACKEND_URL`)
   - **Value**: Your backend URL (e.g., `https://tuneable.onrender.com`)
   - **Environment**: Select **Production** (and **Preview** if you want it for preview deployments too)

### Step 3: Redeploy Your Pages Project

The function will be automatically deployed with your next Pages deployment:

```bash
# If using Git integration, just push:
git add functions/api/[[path]].js
git commit -m "Add API proxy function for Cloudflare Pages"
git push

# Cloudflare Pages will automatically detect and deploy the function
```

Or if deploying manually:
- Trigger a new deployment from Cloudflare Dashboard

### Step 4: Verify It Works

Test that the function is working:

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

## How It Works

- The `[[path]]` syntax in the filename creates a catch-all route for `/api/*`
- All requests to `/api/*` are intercepted by this function
- The function forwards requests to your backend server
- All other requests are served by your React app (Cloudflare Pages)

## File Structure

Your Pages project should have this structure:

```
tuneable-frontend-v2/
├── functions/
│   └── api/
│       └── [[path]].js    ← This file
├── src/
├── public/
└── ...
```

## Troubleshooting

### Function not working

1. **Check function is deployed**:
   - Go to Cloudflare Dashboard → Pages → Your project → **Functions** tab
   - You should see `api/[[path]]` listed

2. **Check environment variable**:
   - Go to **Settings** → **Environment Variables**
   - Verify `BACKEND_URL` is set correctly

3. **Check function logs**:
   - Go to **Deployments** → Click on latest deployment → **Functions** tab
   - View logs to see if requests are being proxied

### Still getting HTML response

- Verify the function file is in the correct location: `functions/api/[[path]].js`
- Check that the deployment includes the functions directory
- Try redeploying the project

## Advantages Over Standalone Worker

- ✅ Automatically deployed with your Pages project
- ✅ No separate worker to manage
- ✅ Simpler setup (just one file + env variable)
- ✅ Integrated with Pages deployment pipeline

## When to Use Standalone Worker Instead

Use the standalone Worker (`cloudflare-worker/`) if:
- You want to manage the proxy separately from your frontend
- You need more complex routing logic
- You want to use Worker-specific features

