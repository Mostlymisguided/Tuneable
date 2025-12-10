# Fix Stripe Webhook Configuration

## Current Issue

Your Stripe webhook is pointing to the wrong endpoint:
- **Current**: `https://pledgepod.base44.app/api/...bf042e43/functions/stripeWebhook`
- **Should be**: `https://your-tuneable-domain.com/api/payments/webhook`

## Solution: Add New Webhook Endpoint for Tuneable

### Step 1: Add New Webhook Endpoint

1. Go to: https://dashboard.stripe.com/webhooks
2. Click **"Add endpoint"** (don't modify the existing one)
3. Set **Endpoint URL** to:
   ```
   https://your-tuneable-domain.com/api/payments/webhook
   ```
   Replace `your-tuneable-domain.com` with your actual Tuneable production domain.

4. Under **"Events to send"**, select:
   - `checkout.session.completed` ✅ (required for wallet top-ups)

5. Click **"Add endpoint"**

### Step 2: Get the Webhook Signing Secret

1. After creating the endpoint, click on it in the webhooks list
2. Find **"Signing secret"** section
3. Click **"Reveal"** to show the secret (starts with `whsec_`)
4. Copy the secret

### Step 3: Add Secret to Environment Variables

Add the webhook secret to your production environment:

**For Test Mode:**
```bash
STRIPE_WEBHOOK_SECRET_TEST=whsec_...  # Paste the secret here
```

**For Live Mode:**
```bash
STRIPE_WEBHOOK_SECRET_LIVE=whsec_...  # Paste the secret here
```

**Important**: Use the secret that matches your Stripe mode:
- If AdminSettings → Stripe mode = "test" → use `STRIPE_WEBHOOK_SECRET_TEST`
- If AdminSettings → Stripe mode = "live" → use `STRIPE_WEBHOOK_SECRET_LIVE`

### Step 4: Restart Backend Server

After adding the webhook secret, **restart your backend server** to load the new environment variable.

### Step 5: Test

1. Perform a test wallet top-up
2. Go to Stripe Dashboard → Webhooks → Your new Tuneable endpoint → "Recent events"
3. Check if `checkout.session.completed` event appears with status "Succeeded" (green)
4. Check your backend logs for:
   - `🔔 Stripe webhook received - checking signature...`
   - `✅ Webhook signature verified`
   - `📦 Checkout session completed`
   - `🔔 Webhook received for wallet top-up`
   - `✅ Ledger entry created successfully`

## Verify Webhook Endpoint is Accessible

Before configuring in Stripe, test that your endpoint is reachable:

```bash
curl https://your-tuneable-domain.com/api/payments/webhook/test
```

Should return:
```json
{
  "status": "ok",
  "message": "Webhook endpoint is accessible",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "url": "/api/payments/webhook"
}
```

## Important Notes

- **Don't delete the existing webhook** (`elegant-bliss`) - it might be used by another service
- **Create a new webhook endpoint** specifically for Tuneable
- **Use HTTPS** - Stripe requires HTTPS for webhooks
- **Match the Stripe mode** - Test mode webhooks need test secrets, Live mode needs live secrets
- **Restart backend** after adding the secret

## Troubleshooting

### Getting HTML response instead of JSON (Frontend serving API routes)

**Symptom**: `curl https://tuneable.stream/api/payments/webhook/test` returns HTML instead of JSON

**Cause**: The frontend (likely Cloudflare Pages or similar) is serving all routes, including `/api/*`, before requests reach the backend.

**Solution**: Configure your reverse proxy/CDN to forward `/api/*` requests to the backend:

1. **If using Cloudflare Pages + Render/Backend**:
   - ✅ **See `cloudflare-worker/README.md` for complete setup instructions**
   - Set up a Cloudflare Worker to proxy `/api/*` to your backend
   - The worker code is ready in `cloudflare-worker/api-proxy.js`

2. **If using nginx**:
   ```nginx
   location /api/ {
       proxy_pass http://your-backend-url:8000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   ```

3. **If using a different setup**:
   - Ensure `/api/*` routes are proxied to the backend server
   - The frontend should only serve non-API routes

### Getting 405 Method Not Allowed

**Symptom**: Stripe webhook shows "405 ERR" in dashboard

**Possible causes**:
1. Route not registered - Check backend logs for webhook registration
2. Reverse proxy blocking POST requests - Ensure POST is allowed for `/api/payments/webhook`
3. CORS issue - The webhook route should allow POST from Stripe's IPs

**Solution**:
- Check backend server logs to see if the request reaches the backend
- Verify the route is registered before the catch-all frontend route
- Test locally: `curl -X POST http://localhost:8000/api/payments/webhook/test`

### Still no webhook logs?

1. **Check the webhook URL is correct** - Must be exactly: `https://your-domain.com/api/payments/webhook`
2. **Check the webhook secret matches** - Compare Stripe Dashboard secret with your `.env` file
3. **Check Stripe mode** - Verify AdminSettings → Stripe mode matches the webhook you configured
4. **Check Recent Events** - In Stripe Dashboard, see if events are being sent and what the response is
5. **Check backend logs** - Look for any error messages when webhook is received
6. **Verify backend is reachable** - Test with `curl https://your-backend-url/api/payments/webhook/test` (if backend has direct URL)

### Webhook shows "Failed" in Stripe Dashboard?

1. Click on the failed event to see the error message
2. Common errors:
   - **400 Bad Request**: Signature verification failed (wrong secret)
   - **404 Not Found**: Wrong URL or route not registered (or frontend serving the route)
   - **405 Method Not Allowed**: Route exists but doesn't accept POST (check reverse proxy config)
   - **500 Internal Server Error**: Check backend logs for the actual error

