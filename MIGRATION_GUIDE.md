# Migration Guide: Pounds to Pence Storage

## Overview

This migration converts all monetary amounts from pounds (decimal) to pence (integer) storage format. This is the industry standard for financial systems and eliminates floating-point precision issues.

## What Changed

### Database Storage
- **Bid.amount**: Now stored in pence (33 = £0.33)
- **User.balance**: Now stored in pence (1050 = £10.50)
- **Media.globalMediaAggregate**: Now stored in pence (66 = £0.66)
- **Media.globalMediaBidTop**: Now stored in pence
- **Media.globalMediaAggregateTop**: Now stored in pence
- **Label.stats.totalBidAmount**: Now stored in pence
- **Label.stats.averageBidAmount**: Now stored in pence
- **Label.stats.topBidAmount**: Now stored in pence

### Backend Changes
- User input (pounds) is converted to pence before storage: `Math.round(amount * 100)`
- Balance checks work directly with pence (no conversion needed)
- Stripe integration already uses pence (no change needed)
- TuneBytes calculations use pence directly (no conversion needed)

### Frontend Changes
- Created `utils/currency.ts` with conversion utilities:
  - `penceToPounds(pence)` - Convert pence to formatted string (£0.33)
  - `penceToPoundsNumber(pence)` - Convert pence to pounds number
  - `poundsToPence(pounds)` - Convert pounds to pence
  - `formatCurrency(pence)` - Format pence as currency string
- All display code now uses `penceToPounds()` for formatting

## Running the Migration

### Step 1: Backup Database
```bash
# Create a backup of your database before running migration
mongodump --uri="YOUR_MONGO_URI" --out=backup-$(date +%Y%m%d)
```

### Step 2: Run Migration Script
```bash
cd tuneable-backend
MONGO_URI="your_mongo_uri" node scripts/migrateAmountsToPence.js
```

The script will:
- Convert all Bid amounts from pounds to pence
- Convert all User balances from pounds to pence
- Convert all Media aggregates from pounds to pence
- Convert all Label stats from pounds to pence

### Step 3: Verify Migration
After running the migration, verify:
- Bid amounts are integers (e.g., 33, 150, 1000)
- User balances are integers (e.g., 1050, 3300)
- Media aggregates are integers (e.g., 66, 200)
- Label stats are integers

### Step 4: Deploy Code Changes
Deploy the updated code that:
- Stores new amounts in pence
- Displays amounts using `penceToPounds()` utility
- Works with pence values directly

## Testing Checklist

After migration, test:
- [ ] Creating new bids (amounts stored in pence)
- [ ] User balance display (shows correct pounds)
- [ ] Placing bids (balance deduction works)
- [ ] Media aggregates display correctly
- [ ] Label stats display correctly
- [ ] Payment processing (Stripe integration)
- [ ] TuneBytes calculations
- [ ] Creator Dashboard (all amounts display correctly)
- [ ] My Media section (amounts display correctly)
- [ ] Labels section (amounts display correctly)

## Rollback Plan

If migration fails:
1. Restore database from backup
2. Revert code changes to previous commit
3. Investigate issues and fix migration script

## Notes

- The migration script checks if amounts are already in pence (if > 1000) to avoid double conversion
- All new code should store amounts in pence directly
- Frontend should always use `penceToPounds()` for display
- Backend should convert user input (pounds) to pence before storage

