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

1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Set endpoint URL to: `https://yourdomain.com/api/payments/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
5. Copy the "Signing secret" (starts with `whsec_`)
6. Add to production environment variables:
   ```bash
   STRIPE_WEBHOOK_SECRET_TEST=whsec_...  # For test mode
   STRIPE_WEBHOOK_SECRET_LIVE=whsec_...   # For live mode
   ```

## Troubleshooting

### No webhook logs appearing

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

