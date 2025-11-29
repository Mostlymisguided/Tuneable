# Top-Up Fee Handling Audit & Fix

## Issue Identified

The top-up logic was crediting users with the **requested amount** (what they paid) instead of the **amount received** (what was actually received after Stripe fees). This caused the ledger to be inaccurate because:

1. User requests top-up: £10.00
2. Stripe charges user: £10.00 (user pays this)
3. Stripe fees deducted: ~£0.34 (1.4% + 20p for UK cards)
4. Stripe deposits to Tuneable: £9.66 (net)
5. **Previous behavior**: User wallet credited with £10.00 ❌
6. **Correct behavior**: User wallet credited with £9.66 ✅

This discrepancy would accumulate over time and make the ledger incorrect, as the platform would be absorbing Stripe fees.

## Root Cause

In `/tuneable-backend/routes/paymentRoutes.js`, the webhook handler was using:
- `session.metadata.amount` - the gross amount requested by the user
- Instead of retrieving the actual `amount_received` from the PaymentIntent

## Solution Implemented

### Changes Made

1. **Retrieve PaymentIntent from Stripe**
   - After receiving `checkout.session.completed` webhook, retrieve the PaymentIntent object
   - Extract `amount_received` (net amount after fees)
   - Extract `amount` (requested amount charged to customer)

2. **Use Net Amount for Wallet Credit**
   - User wallet is now credited with `amount_received` (net amount)
   - This matches what actually lands in the Stripe account

3. **Fee Tracking & Transparency**
   - Calculate Stripe fee: `amountRequested - amountReceived`
   - Store fee details in transaction metadata:
     - `amountRequested` (what user paid)
     - `amountReceived` (what Tuneable received)
     - `stripeFees` / `stripeFeesPounds` (fees absorbed by user)

4. **Frontend Fee Display**
   - Calculate estimated fees: 1.4% + 20p for UK cards
   - Show total charge amount before checkout
   - Display fee breakdown for transparency

5. **Ledger Accuracy**
   - Both `WalletTransaction` and `TuneableLedger` entries use net amount
   - Fee details stored in metadata for full audit trail
   - Description includes fee information for transparency

### Code Changes

**File**: `tuneable-backend/routes/paymentRoutes.js`

**Key Changes**:
- Retrieve PaymentIntent: `await stripeInstance.paymentIntents.retrieve(session.payment_intent)`
- Use `paymentIntent.amount_received` for wallet credit (net amount)
- Store fee breakdown in transaction metadata
- Update ledger entries to use net amount

### Fallback Handling

If PaymentIntent retrieval fails:
- Falls back to `session.amount_total` if available
- Logs warning for manual review
- Still processes transaction to avoid webhook failures

## Impact

### Before Fix
- User requests: £10.00
- Stripe charges: £10.00
- Stripe fee: £0.34 (1.4% + 20p)
- Platform receives: £9.66
- User wallet credited: £10.00 ❌ (Platform absorbs £0.34 fee)
- Ledger discrepancy: +£0.34 per transaction

### After Fix
- User requests: £10.00
- Stripe charges: £10.00
- Stripe fee: £0.34 (1.4% + 20p)
- Platform receives: £9.66
- User wallet credited: £9.66 ✅ (User absorbs fee)
- Frontend shows: "You'll be charged £10.00 (includes £0.34 Stripe fees)"
- Ledger accuracy: Matches actual Stripe receipts

## Testing Recommendations

1. **Test Transaction**
   - Create a test top-up via Stripe Checkout
   - Verify webhook processes correctly
   - Check `WalletTransaction` record:
     - `amount` should be net amount (after fees)
     - `metadata.stripeFeePence` should show fee amount
   - Check `TuneableLedger` entry:
     - `amount` should match net amount
     - Metadata should include fee breakdown

2. **Verify Ledger Balance**
   - Sum of all top-ups should match total Stripe receipts
   - User wallet balance should reflect net amounts only

3. **Monitor Logs**
   - Check for any PaymentIntent retrieval failures
   - Verify fee calculations are logged correctly

## Stripe Fee Structure Reference

Stripe fees vary by:
- **Country**: UK cards typically 1.4% + 20p
- **Card type**: Some cards have different rates
- **Payment method**: Card vs other methods

The `amount_received` field automatically accounts for all fees, so we don't need to calculate them manually.

## Metadata Fields Added

Transaction metadata now includes:
```javascript
{
  amountRequested: 1000,        // Amount charged to customer (pence) - what user paid
  amountReceived: 966,          // Amount received after fees (pence) - what Tuneable received
  stripeFees: 34,               // Stripe fee amount (pence) - fees absorbed by user
  stripeFeesPounds: "0.34",     // Human-readable fee amount
  isLiveMode: false             // Whether this was a live or test transaction
}
```

## Frontend Fee Display

The Wallet page now shows fee information before checkout:

**Quick Top-Up Buttons:**
- Shows: "£10"
- Subtitle: "You'll be charged £10.34"
- Fee note: "(includes £0.34 Stripe fees)"

**Custom Amount Section:**
- Shows requested amount: "£10.00"
- Shows total charge: "You'll be charged £10.34"
- Fee breakdown: "(includes £0.34 Stripe processing fees)"

**Fee Calculation:**
- UK cards: 1.4% + 20p fixed fee
- Example: £10.00 → £0.14 (1.4%) + £0.20 (fixed) = £0.34 fee
- Total charge: £10.00 + £0.34 = £10.34

## Notes

- Fees are now **absorbed by the user** (deducted from their top-up amount)
- This ensures ledger accuracy and matches actual Stripe receipts
- Fee information is stored for transparency and auditing
- The platform no longer absorbs Stripe processing fees
- Users see fee breakdown before checkout for full transparency
- Fee calculation: 1.4% + 20p for UK cards (standard Stripe rate)

