# Stripe Webhook Setup Guide

## Local Development

Stripe webhooks cannot reach `localhost` directly. You need to use **Stripe CLI** to forward webhooks to your local server.

### Step 1: Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Or download from: https://stripe.com/docs/stripe-cli
```

### Step 2: Login to Stripe CLI

```bash
stripe login
```

This will open your browser to authenticate with Stripe.

### Step 3: Forward Webhooks to Local Server

In a **separate terminal window**, run:

```bash
stripe listen --forward-to localhost:8000/api/payments/webhook
```

This will:
- Start listening for Stripe webhook events
- Forward them to your local server at `http://localhost:8000/api/payments/webhook`
- Display a webhook signing secret (starts with `whsec_`)

### Step 4: Update Your .env File

Copy the webhook signing secret from Step 3 and add it to your `.env`:

```bash
STRIPE_WEBHOOK_SECRET_TEST=whsec_...  # Copy from Stripe CLI output
```

### Step 5: Restart Your Backend Server

After updating `.env`, restart your backend server to load the new webhook secret.

### Step 6: Test a Top-Up

1. Make sure Stripe CLI is running (`stripe listen --forward-to localhost:8000/api/payments/webhook`)
2. Perform a wallet top-up in your app
3. Check your backend logs - you should now see:
   - `🔔 Stripe webhook received - checking signature...`
   - `✅ Webhook signature verified`
   - `📦 Checkout session completed`
   - `🔔 Webhook received for wallet top-up`
   - `✅ Ledger entry created successfully`

## Production

For production, configure webhooks in the Stripe Dashboard:

### Step 1: Verify Webhook Endpoint is Accessible

First, test that your webhook endpoint is reachable:

```bash
curl https://yourdomain.com/api/payments/webhook/test
```

You should get a JSON response like:
```json
{
  "status": "ok",
  "message": "Webhook endpoint is accessible",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "url": "/api/payments/webhook"
}
```

If this fails, check:
- Your server is running
- The route is correctly registered
- No firewall is blocking the endpoint

### Step 2: Configure Webhook in Stripe Dashboard

1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Set endpoint URL to: `https://yourdomain.com/api/payments/webhook`
   - **IMPORTANT**: Use HTTPS, not HTTP
   - **IMPORTANT**: Include the full path `/api/payments/webhook`
4. Select events to listen for:
   - `checkout.session.completed` (required for wallet top-ups)
5. Click "Add endpoint"
6. Copy the "Signing secret" (starts with `whsec_`)
7. Add to production environment variables:
   ```bash
   STRIPE_WEBHOOK_SECRET_TEST=whsec_...  # For test mode
   STRIPE_WEBHOOK_SECRET_LIVE=whsec_...   # For live mode
   ```
8. **Restart your backend server** after adding the secret

### Step 3: Test the Webhook

1. Perform a test wallet top-up
2. Go to Stripe Dashboard → Webhooks → Your endpoint → "Recent events"
3. Check if the `checkout.session.completed` event appears
4. Click on the event to see:
   - **Status**: Should be "Succeeded" (green)
   - **Response**: Should show `{"received": true}`
   - **Response time**: Should be under 5 seconds

### Step 4: Check Backend Logs

After a top-up, check your backend logs for:
- `🔔 Stripe webhook received - checking signature...`
- `✅ Webhook signature verified`
- `📦 Checkout session completed`
- `🔔 Webhook received for wallet top-up`
- `✅ Ledger entry created successfully`

If you don't see these logs, the webhook isn't being called.

## Troubleshooting

### No webhook logs appearing (Production)

**Most common issue**: Webhook not configured in Stripe Dashboard

1. **Check webhook is configured**:
   - Go to https://dashboard.stripe.com/webhooks
   - Verify an endpoint exists for your production URL
   - Check the endpoint URL matches exactly: `https://yourdomain.com/api/payments/webhook`

2. **Check webhook secret**:
   - In Stripe Dashboard → Webhooks → Your endpoint → "Signing secret"
   - Copy the secret and verify it matches `STRIPE_WEBHOOK_SECRET_TEST` or `STRIPE_WEBHOOK_SECRET_LIVE` in your `.env`
   - **Restart your backend** after updating the secret

3. **Check webhook events**:
   - Go to Stripe Dashboard → Webhooks → Your endpoint → "Recent events"
   - After a top-up, check if `checkout.session.completed` event appears
   - If event shows "Failed" (red), click it to see the error

4. **Check endpoint accessibility**:
   ```bash
   curl https://yourdomain.com/api/payments/webhook/test
   ```
   Should return JSON with `"status": "ok"`

5. **Check Stripe mode**:
   - Verify you're using the correct Stripe mode (test vs live)
   - Check AdminSettings → Stripe mode matches your webhook configuration
   - Test mode webhooks need `STRIPE_WEBHOOK_SECRET_TEST`
   - Live mode webhooks need `STRIPE_WEBHOOK_SECRET_LIVE`

### No webhook logs appearing (Local Development)

- **Check Stripe CLI is running**: Make sure `stripe listen` is running in a separate terminal
- **Check webhook secret**: Ensure `STRIPE_WEBHOOK_SECRET_TEST` matches the secret from `stripe listen`
- **Check endpoint URL**: Verify the webhook endpoint is `/api/payments/webhook`
- **Check backend is running**: Ensure your backend server is running on port 8000

### Webhook signature verification failed

- **Wrong secret**: Make sure the webhook secret in `.env` matches the one from Stripe CLI
- **Test vs Live mode**: Ensure you're using the correct secret for the mode you're testing

### Ledger entries not created

- **Check webhook logs**: Look for `🔔 Webhook received for wallet top-up` in backend logs
- **Check ledger service logs**: Look for `💾 Saving ledger entry to database` and any errors
- **Check database**: Query the `TuneableLedger` collection to see if entries exist

## Testing Without Stripe CLI (Fallback)

If you can't use Stripe CLI, the app has a fallback mechanism:

1. After completing payment, the frontend redirects to `/wallet?success=true&amount=X`
2. The frontend calls `/api/payments/update-balance` endpoint
3. This endpoint checks if the webhook already processed the payment
4. If not, it processes the payment directly (fallback)

However, **this fallback does NOT create ledger entries**. For complete functionality including ledger entries, you must use Stripe CLI for local development.

