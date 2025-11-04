# Amount Storage Audit - Pounds vs Pence

## Summary

**Current State**: Most monetary amounts are stored in **pounds** (decimal format) in the database, with conversions to pence/cents only for:
- Payment processing (Stripe)
- Internal calculations requiring precision (TuneBytes)

**Issue Found**: Frontend was incorrectly dividing amounts by 100, assuming they were stored in pence when they were actually in pounds.

## Storage Formats by Entity

### 1. Bid Amounts (`Bid.amount`)
- **Storage Format**: **Pounds** (decimal, e.g., `0.33`, `1.50`, `10.00`)
- **Location**: `tuneable-backend/models/Bid.js:106-110`
- **Example**: `amount: 0.33` represents £0.33
- **Usage**: Directly stored when creating bids, no conversion
- **References**:
  - `tuneable-backend/routes/partyRoutes.js:694` - `amount: bidAmount`
  - `tuneable-backend/routes/mediaRoutes.js:1295` - `amount: amount`

### 2. User Balance (`User.balance`)
- **Storage Format**: **Pounds** (decimal, e.g., `10.50`, `100.00`)
- **Location**: `tuneable-backend/models/User.js:28`
- **Example**: `balance: 10.50` represents £10.50
- **Conversion**: Converted to pence only for balance checks and updates:
  ```javascript
  const userBalancePence = Math.round(user.balance * 100);
  const bidAmountPence = Math.round(bidAmount * 100);
  if (userBalancePence < bidAmountPence) { /* error */ }
  user.balance = (userBalancePence - bidAmountPence) / 100;
  ```
- **References**:
  - `tuneable-backend/routes/partyRoutes.js:593-594, 816, 938-939, 1139`
  - `tuneable-backend/routes/mediaRoutes.js:1250-1251, 1435`

### 3. Media Aggregates (`Media.globalMediaAggregate`, `globalMediaBidTop`, etc.)
- **Storage Format**: **Pounds** (decimal)
- **Location**: `tuneable-backend/models/Media.js:212-214`
- **Calculation**: Sum of bid amounts (which are in pounds)
- **Example**: Two bids of £0.33 each = `globalMediaAggregate: 0.66`
- **Updated By**: `BidMetricsEngine` via Mongoose hooks (post-save)

### 4. Label Stats (`Label.stats.totalBidAmount`)
- **Storage Format**: **Pounds** (decimal)
- **Location**: `tuneable-backend/models/Label.js` (stats object)
- **Calculation**: Sum of bid amounts for media linked to the label
- **Updated By**: `labelStatsService.calculateAndUpdateLabelStats()`

### 5. Payment Processing (Stripe)
- **Storage Format**: **Pence** (integer, converted from pounds)
- **Location**: `tuneable-backend/routes/paymentRoutes.js:22, 54`
- **Conversion**: 
  ```javascript
  amount: amount * 100,  // Convert pounds to pence for Stripe
  unit_amount: Math.round(amount * 100),  // Convert to pence
  ```
- **Reason**: Stripe API requires amounts in smallest currency unit (pence for GBP)

### 6. TuneBytes Calculations
- **Storage Format**: **Pence** (for calculations only)
- **Location**: `tuneable-backend/services/tuneBytesService.js:65`
- **Conversion**:
  ```javascript
  const userBidPence = Math.round(bid.amount * 100);
  // Used in formula: (currentTotal - bidTimeTotal) * ∛(userBidPence) * discoveryBonus
  ```
- **Reason**: Cubed root calculation benefits from integer precision
- **Note**: `userBidPence` is stored in `TuneBytesTransaction.calculationSnapshot.userBidPence` for historical record

## Frontend Display

### Current Issues (FIXED)
- **Problem**: Frontend was dividing by 100, assuming amounts were in pence
- **Fix**: Removed `/100` division in all display locations
- **Locations Fixed**:
  - `tuneable-frontend-v2/src/pages/Dashboard.tsx:525` - Creator Stats Overview
  - `tuneable-frontend-v2/src/pages/Dashboard.tsx:610` - My Media section
  - `tuneable-frontend-v2/src/pages/Dashboard.tsx:757` - My Media table
  - `tuneable-frontend-v2/src/pages/Dashboard.tsx:1024, 1191, 1364` - Labels section

### Correct Display Format
```typescript
£{((amount || 0)).toFixed(2)}  // Display pounds directly
// Example: £0.66, £10.50, £100.00
```

## Recommendations

### ✅ Standard Approach (Current)
1. **Store in pounds** (decimal format) in database
2. **Convert to pence** only when:
   - Interfacing with payment APIs (Stripe)
   - Performing calculations requiring integer precision (TuneBytes)
3. **Display in pounds** directly (no conversion needed)

### ⚠️ Consistency Checks Needed
1. **Verify all frontend displays** are not dividing by 100
2. **Ensure all backend calculations** correctly handle pounds
3. **Document conversion points** clearly in code comments

### 📝 Code Patterns

**Database Storage (Pounds)**:
```javascript
// Bid model
amount: 0.33  // £0.33

// User model
balance: 10.50  // £10.50

// Media model
globalMediaAggregate: 0.66  // £0.66
```

**Conversion to Pence (for calculations/payments)**:
```javascript
// For Stripe
const amountPence = Math.round(amount * 100);  // 0.33 → 33

// For balance checks
const balancePence = Math.round(balance * 100);  // 10.50 → 1050

// For TuneBytes calculations
const bidPence = Math.round(bid.amount * 100);  // 0.33 → 33
```

**Display (Pounds)**:
```typescript
// Frontend
£{amount.toFixed(2)}  // 0.66 → "£0.66"
```

## Files to Check for Consistency

### Backend
- ✅ `tuneable-backend/models/Bid.js` - Bid amounts in pounds
- ✅ `tuneable-backend/models/User.js` - Balance in pounds
- ✅ `tuneable-backend/models/Media.js` - Aggregates in pounds
- ✅ `tuneable-backend/models/Label.js` - Stats in pounds
- ✅ `tuneable-backend/routes/partyRoutes.js` - Balance checks convert to pence
- ✅ `tuneable-backend/routes/mediaRoutes.js` - Balance checks convert to pence
- ✅ `tuneable-backend/routes/paymentRoutes.js` - Converts to pence for Stripe
- ✅ `tuneable-backend/services/tuneBytesService.js` - Converts to pence for calculations

### Frontend
- ✅ `tuneable-frontend-v2/src/pages/Dashboard.tsx` - Fixed: removed /100 divisions
- ⚠️ Check other components for similar issues (TuneProfile, UserProfile, Party, etc.)

## Testing Checklist

- [ ] Verify bid amounts display correctly (£0.33, £0.66, etc.)
- [ ] Verify user balance displays correctly (£10.50, etc.)
- [ ] Verify media aggregates display correctly in all views
- [ ] Verify label stats display correctly
- [ ] Verify payment processing still works (converts to pence correctly)
- [ ] Verify TuneBytes calculations still work (uses pence correctly)

