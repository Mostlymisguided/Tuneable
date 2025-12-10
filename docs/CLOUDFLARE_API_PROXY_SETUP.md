# Cloudflare API Proxy Setup Guide

This guide helps you set up a proxy so that `/api/*` requests are forwarded to your backend server instead of being served by your frontend.

## Quick Decision: Which Approach?

### ✅ **Use Cloudflare Pages Functions** (Recommended if frontend is on Cloudflare Pages)

- **Location**: `cloudflare-pages-functions/`
- **Best for**: Frontend deployed on Cloudflare Pages
- **Setup time**: ~5 minutes
- **See**: `cloudflare-pages-functions/README.md`

### ✅ **Use Standalone Cloudflare Worker** (If you need more control)

- **Location**: `cloudflare-worker/`
- **Best for**: More complex routing, separate management
- **Setup time**: ~10 minutes
- **See**: `cloudflare-worker/README.md`

---

## Option 1: Cloudflare Pages Functions (Recommended)

### Why This is Better for Pages:
- ✅ Automatically deployed with your frontend
- ✅ No separate service to manage
- ✅ Simpler setup
- ✅ Integrated with Pages deployment

### Quick Setup:

1. **Add the function file to your frontend project**:
   ```bash
   cd tuneable-frontend-v2
   mkdir -p functions/api
   cp ../cloudflare-pages-functions/api/[[path]].js functions/api/[[path]].js
   ```

2. **Verify environment variable in Cloudflare Dashboard**:
   - Go to: Pages → Your project → Settings → Environment Variables
   - The function uses `VITE_BACKEND_URL` if it exists (which you likely already have!)
   - If not set, add: `VITE_BACKEND_URL` = `https://tuneable.onrender.com` (or your backend URL)

3. **Deploy**:
   ```bash
   git add functions/api/[[path]].js
   git commit -m "Add API proxy function"
   git push
   ```

4. **Test**:
   ```bash
   curl https://tuneable.stream/api/payments/webhook/test
   ```

**Full instructions**: See `cloudflare-pages-functions/README.md`

---

## Option 2: Standalone Cloudflare Worker

### When to Use This:
- You want to manage the proxy separately
- You need more complex routing logic
- You're not using Cloudflare Pages for frontend

### Quick Setup:

1. **Install Wrangler**:
   ```bash
   npm install -g wrangler
   ```

2. **Login**:
   ```bash
   wrangler login
   ```

3. **Set backend URL**:
   ```bash
   cd cloudflare-worker
   wrangler secret put BACKEND_URL
   # Enter: https://tuneable.onrender.com
   ```

4. **Deploy**:
   ```bash
   wrangler deploy
   ```

5. **Configure routes in Cloudflare Dashboard**:
   - Workers & Pages → Your Worker → Triggers
   - Add route: `tuneable.stream/api/*`

**Full instructions**: See `cloudflare-worker/README.md`

---

## Testing After Setup

Once deployed, test that it's working:

```bash
# Should return JSON (not HTML)
curl https://tuneable.stream/api/payments/webhook/test
```

Expected response:
```json
{
  "status": "ok",
  "message": "Webhook endpoint is accessible",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "url": "/api/payments/webhook"
}
```

If you still get HTML, check:
1. Function/Worker is deployed and active
2. Routes are configured correctly
3. `BACKEND_URL` environment variable is set
4. Backend server is accessible

---

## Troubleshooting

### Still Getting HTML Response?

1. **Check deployment**:
   - Pages Functions: Dashboard → Pages → Your project → Functions tab
   - Worker: Dashboard → Workers & Pages → Your Worker → Logs

2. **Verify routes**:
   - Should match: `tuneable.stream/api/*`
   - Check route is active/enabled

3. **Check backend URL**:
   - Verify `BACKEND_URL` is set correctly
   - Test backend directly: `curl https://your-backend-url/api/payments/webhook/test`

4. **View logs**:
   - Check function/worker logs for errors
   - Look for proxy attempts in logs

### 405 Method Not Allowed?

- Verify POST requests are allowed
- Check backend CORS configuration
- Ensure worker/function forwards all HTTP methods

### Backend Connection Errors?

- Verify backend URL is correct
- Check backend server is running
- Test backend directly (bypass proxy)

---

## Next Steps

After the proxy is working:

1. ✅ Test webhook endpoint: `curl https://tuneable.stream/api/payments/webhook/test`
2. ✅ Configure Stripe webhook URL: `https://tuneable.stream/api/payments/webhook`
3. ✅ Test a real payment to verify webhook works
4. ✅ Check backend logs for webhook processing

See `WEBHOOK_FIX_INSTRUCTIONS.md` for complete Stripe webhook setup.

