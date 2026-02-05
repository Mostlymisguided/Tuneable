# Amount Storage Audit - Pence Storage (Post-Migration)

## Summary

**Current State**: All monetary amounts are stored in **pence** (integer format) in the database. This is the industry standard for financial systems and eliminates floating-point precision issues.

See `docs/MIGRATION_GUIDE.md` for the migration from pounds to pence.

## Storage Formats by Entity

### 1. Bid Amounts (`Bid.amount`)
- **Storage Format**: **Pence** (integer, e.g., `33`, `150`, `1100`)
- **Location**: `tuneable-backend/models/Bid.js:105-111`
- **Example**: `amount: 33` represents £0.33, `amount: 1100` represents £11.00
- **API Input**: User input is in pounds; backend converts with `Math.round(amount * 100)`

### 2. User Balance (`User.balance`)
- **Storage Format**: **Pence** (integer)
- **Location**: `tuneable-backend/models/User.js:37-38`
- **Example**: `balance: 1050` represents £10.50
- **Display**: Frontend must use `penceToPounds(balance)` for display

### 3. Media Aggregates (`Media.globalMediaAggregate`, `globalMediaBidTop`, etc.)
- **Storage Format**: **Pence** (integer)
- **Location**: `tuneable-backend/models/Media.js:317`
- **Calculation**: Sum of bid amounts (already in pence)
- **Updated By**: `BidMetricsEngine` via Mongoose hooks (post-save)

### 4. Label Stats (`Label.stats.*`)
- **Storage Format**: **Pence** (integer)
- **Updated By**: `labelStatsService.calculateAndUpdateLabelStats()`

### 5. Payment Processing (Stripe)
- **API**: Stripe expects pence; our DB already stores pence
- **Top-up flow**: User pays in pounds → we receive pence from Stripe → we add to `user.balance` (pence)

## Frontend Display

### Correct Display
Use `utils/currency.ts`:
```typescript
import { penceToPounds, penceToPoundsNumber, poundsToPence } from '../utils/currency';

// For display
penceToPounds(balance)  // → "£10.50"

// For numeric comparison (balance check before placing tip)
const balancePence = user.balance;  // Already in pence
const bidPence = poundsToPence(bidAmount);  // Convert user input (pounds) to pence
if (balancePence < bidPence) { /* insufficient */ }
```

## API Conventions

- **User input**: All tip/bid amounts from frontend are in **pounds** (e.g. `1.10` for £1.10)
- **Backend storage**: All amounts stored in **pence**
- **API responses**: Amounts returned in **pence** (balance, aggregates, bid amounts)

