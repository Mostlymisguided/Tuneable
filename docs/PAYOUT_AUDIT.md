# Artist Payout Flow Audit

**Date:** 2024
**Audited by:** AI Assistant
**Scope:** Complete artist payout flow from request to completion

---

## 📋 Executive Summary

This audit covers the complete artist payout flow, including:
1. Artist payout request flow
2. Admin payout processing flow
3. Notifications and communications
4. Data integrity and security
5. Identified issues and recommendations

---

## 🔄 Complete Payout Flow

### 1. Artist Requests Payout

**Frontend:** `tuneable-frontend-v2/src/pages/ArtistEscrowDashboard.tsx`
- Artist clicks "Request Payout" button (line 186)
- Triggers `handleRequestPayout()` function (line 108)
- Calls `artistEscrowAPI.requestPayout()` with no parameters (defaults to full balance)

**Backend:** `tuneable-backend/routes/artistEscrowRoutes.js`
- **Route:** `POST /api/artist-escrow/request-payout` (line 114)
- **Middleware:** `authMiddleware` (requires authentication)
- **Process:**
  1. Validates user exists (line 119-126)
  2. Checks if user has escrow balance > 0 (line 128-135)
  3. Validates requested amount (defaults to full balance, minimum £1.00) (line 137-151)
  4. Checks for existing pending/processing requests (line 154-165)
  5. Creates `PayoutRequest` document (line 168-180)
  6. Sends in-app notification to all admins (line 184-197)
  7. Sends email notification to admin (line 204-210)

**Data Model:** `tuneable-backend/models/PayoutRequest.js`
- Stores: userId, requestedAmount (in pence), payoutMethod, payoutDetails, status, etc.
- Status options: `pending`, `processing`, `completed`, `rejected`

**Notifications:**
- ✅ In-app notification sent to all admin users
- ✅ Email sent to admin via `sendPayoutRequestNotification()`
- ⚠️ **ISSUE #1:** Artist is told they'll receive an email when payout is processed, but no email is sent on completion/rejection

---

### 2. Admin Views Payout Requests

**Frontend:** `tuneable-frontend-v2/src/pages/Admin.tsx`
- Admin navigates to "Artist Payouts" tab (line 867)
- `loadPayouts()` function fetches requests (line 756-768)
- Calls `artistEscrowAPI.getPayouts(payoutStatusFilter)` with optional status filter

**Backend:** `tuneable-backend/routes/artistEscrowRoutes.js`
- **Route:** `GET /api/artist-escrow/admin/payouts` (line 321)
- **Middleware:** `authMiddleware` + `adminMiddleware` (requires admin role)
- **Process:**
  1. Validates status filter (line 327-333)
  2. Queries `PayoutRequest` collection with filter (line 336-346)
  3. Populates user data and processedBy user (line 342-345)
  4. Formats response with requestedAmountPounds, availableBalance, etc. (line 349-375)
  5. Calculates totals for pending requests (line 378-387)

**UI Features:**
- Filter by status: `pending`, `processing`, `completed`, `rejected`, `all`
- Shows: artist name, amount, available balance, payout method, request date
- Shows payout details if provided (line 3006-3017)
- Shows notes if any (line 3018-3022)
- Shows processed by/date if processed (line 3023-3027)

---

### 3. Admin Processes Payout

**Frontend:** `tuneable-frontend-v2/src/pages/Admin.tsx`
- Admin clicks "Complete" or "Reject" button (line 3031-3050)
- Opens modal to enter details:
  - For completion: payout method, transaction ID, notes (line 3075-3102)
  - For rejection: rejection reason (required) (line 3103-3113)
- Calls `handleProcessPayout()` (line 776-799)
- Calls `artistEscrowAPI.processPayout()` with requestId, status, method, details, notes

**Backend:** `tuneable-backend/routes/artistEscrowRoutes.js`
- **Route:** `POST /api/artist-escrow/admin/process-payout` (line 413)
- **Middleware:** `authMiddleware` + `adminMiddleware` (requires admin role)
- **Process for "completed" status:**
  1. Validates requestId and status (line 418-430)
  2. Finds payout request and populates user (line 433)
  3. Validates request is pending/processing (line 442-447)
  4. Validates user exists (line 449-455)
  5. **Validates balance >= requested amount** (line 461-467) ⚠️ **ISSUE #2**
  6. Deducts from `user.artistEscrowBalance` (line 470)
  7. **Marks ALL pending history entries as claimed** (line 473-484) ⚠️ **ISSUE #4**
  8. Saves user (line 486)
  9. Updates payout request status, processedBy, processedAt (line 489-495)
  10. Sends in-app notification to artist (line 498-511)
  11. Returns success response (line 520-538)
  
- **Process for "rejected" status:**
  1. Updates payout request to rejected (line 542-546)
  2. Sends in-app notification to artist (line 549-562)
  3. Returns success response (line 570-587)

**Notifications:**
- ✅ In-app notification sent to artist
- ❌ **ISSUE #3:** No email sent to artist when payout is completed
- ❌ **ISSUE #3:** No email sent to artist when payout is rejected

---

## 🐛 Issues Identified

### Issue #1: Missing Email Notifications for Completion/Rejection

**Severity:** Medium  
**Location:** `tuneable-backend/routes/artistEscrowRoutes.js` (lines 497-511, 549-562)

**Problem:**
- When payout is completed or rejected, only in-app notifications are sent
- No email is sent to the artist, even though they're told they'll receive an email
- Backend code at line 226 tells user: "You will receive an email when your payout is processed"

**Current Behavior:**
```javascript
// Line 497-511: Only in-app notification
const notification = new Notification({
  userId: user._id,
  type: 'payout_processed',
  title: 'Payout Processed',
  message: `Your payout of £${(requestedAmount / 100).toFixed(2)} has been processed...`,
  link: '/artist-escrow',
  linkText: 'View Escrow'
});
await notification.save();
// ❌ No email sent
```

**Recommendation:**
Add email notifications for payout completion/rejection similar to `sendPayoutRequestNotification()`:
- Create `sendPayoutCompletedNotification(payoutRequest, user)`
- Create `sendPayoutRejectedNotification(payoutRequest, user, reason)`
- Call these functions when processing payouts

---

### Issue #2: Race Condition Risk in Balance Validation

**Severity:** Medium  
**Location:** `tuneable-backend/routes/artistEscrowRoutes.js` (line 461-467)

**Problem:**
- Balance is validated before deducting, but there's a time gap between validation and update
- If multiple admins process payout requests simultaneously, or if user requests another payout, balance could become negative
- No database transaction/locking mechanism to prevent concurrent modifications

**Current Code:**
```javascript
// Line 457-467
const availableBalance = user.artistEscrowBalance || 0;
const requestedAmount = payoutRequest.requestedAmount;

if (status === 'completed') {
  // Validate balance
  if (availableBalance < requestedAmount) {
    return res.status(400).json({...});
  }
  
  // Deduct from escrow balance
  user.artistEscrowBalance = user.artistEscrowBalance - requestedAmount;
  // ⚠️ No transaction/lock - race condition possible
}
```

**Recommendation:**
1. Use MongoDB transactions or atomic update operators
2. Use `findOneAndUpdate` with balance check in the query:
   ```javascript
   const result = await User.findOneAndUpdate(
     { _id: userId, artistEscrowBalance: { $gte: requestedAmount } },
     { $inc: { artistEscrowBalance: -requestedAmount } },
     { new: true }
   );
   if (!result) {
     return res.status(400).json({ error: 'Insufficient balance' });
   }
   ```
3. Add unique index or constraint to prevent multiple pending requests per user

---

### Issue #3: Incorrect History Entry Claiming Logic

**Severity:** High  
**Location:** `tuneable-backend/routes/artistEscrowRoutes.js` (line 473-484)

**Problem:**
- When a payout is completed, ALL pending history entries are marked as claimed
- This is incorrect if the payout amount doesn't cover all pending allocations
- Should only mark entries as claimed up to the payout amount

**Current Code:**
```javascript
// Line 473-484
if (user.artistEscrowHistory) {
  user.artistEscrowHistory = user.artistEscrowHistory.map(entry => {
    if (entry.status === 'pending') {
      return {
        ...entry,
        status: 'claimed',
        claimedAt: new Date()
      };
    }
    return entry;
  });
}
// ⚠️ Marks ALL pending entries as claimed, regardless of payout amount
```

**Example Scenario:**
- User has £50 in escrow from 5 allocations of £10 each
- User requests payout of £20
- After payout: Balance = £30, but ALL 5 allocations are marked as "claimed"
- Should only mark 2 allocations as claimed

**Recommendation:**
Mark only the entries that were paid out, in FIFO order:
```javascript
let remainingPayout = requestedAmount;
if (user.artistEscrowHistory) {
  user.artistEscrowHistory = user.artistEscrowHistory.map(entry => {
    if (entry.status === 'pending' && remainingPayout > 0) {
      const claimAmount = Math.min(entry.amount, remainingPayout);
      remainingPayout -= claimAmount;
      if (claimAmount === entry.amount) {
        return {
          ...entry,
          status: 'claimed',
          claimedAt: new Date()
        };
      }
    }
    return entry;
  });
}
```

---

### Issue #4: No Payout History View for Artists

**Severity:** Low  
**Location:** `tuneable-frontend-v2/src/pages/ArtistEscrowDashboard.tsx`

**Problem:**
- Artists can see their escrow balance and allocation history
- But there's no way to view their payout request history (past requests, status, amounts, dates)
- No UI to track completed/rejected payouts

**Current State:**
- Only shows current balance and allocations
- No payout request history section

**Recommendation:**
1. Add API endpoint: `GET /api/artist-escrow/payout-history` to fetch user's payout requests
2. Add "Payout History" section to ArtistEscrowDashboard
3. Show: request date, amount, status, processed date, notes

---

### Issue #5: No Audit Trail for Financial Transactions

**Severity:** Medium  
**Location:** Throughout payout flow

**Problem:**
- Financial transactions (payouts, balance deductions) are only logged via `console.log()`
- No structured audit trail or transaction log
- No way to reconstruct financial history if database is compromised
- No way to track who processed payouts for compliance

**Current State:**
- Only console.log statements (line 513-518, 564-568)
- No persistent audit log

**Recommendation:**
1. Create `PayoutTransaction` model to log all payout operations
2. Log: timestamp, requestId, userId, amount, status, processedBy, beforeBalance, afterBalance
3. Never delete audit records
4. Add admin view to audit trail

---

### Issue #6: Minimum Payout Validation Only on Request

**Severity:** Low  
**Location:** `tuneable-backend/routes/artistEscrowRoutes.js`

**Problem:**
- Minimum payout (£1.00) is validated when artist requests payout (line 146-151)
- But admin can process any amount through admin panel, even below minimum
- No validation on admin side

**Current Code:**
```javascript
// Line 146-151: Only validated on request
if (requestedAmount < 100) { // Minimum £1.00
  return res.status(400).json({
    success: false,
    error: 'Minimum payout amount is £1.00'
  });
}
```

**Recommendation:**
- Add minimum validation in admin processing route as well
- Or remove minimum check if admin should be able to process any amount

---

### Issue #7: No Payout Method Validation

**Severity:** Low  
**Location:** `tuneable-backend/models/PayoutRequest.js`

**Problem:**
- Payout method enum exists: `bank_transfer`, `paypal`, `stripe`, `manual`, `other` (line 60)
- But admin can enter any value through the UI
- No validation that payout method matches enum

**Recommendation:**
- Validate payout method matches enum when admin processes payout
- Or update model to allow custom methods

---

### Issue #8: Balance Check Uses Stale Data

**Severity:** Medium  
**Location:** `tuneable-backend/routes/artistEscrowRoutes.js` (line 433)

**Problem:**
- User data is fetched with `.populate()` at line 433
- Balance is checked at line 457-467
- But user data might be stale if balance was updated after the request was created
- Should fetch fresh balance at processing time

**Current Code:**
```javascript
// Line 433: Fetched when request is processed
const payoutRequest = await PayoutRequest.findById(requestId)
  .populate('userId', 'username email artistEscrowBalance artistEscrowHistory');

// Line 457: Uses populated data
const availableBalance = user.artistEscrowBalance || 0;
// ⚠️ Might be stale
```

**Recommendation:**
- Fetch fresh user data right before balance check
- Or use atomic update as recommended in Issue #2

---

## ✅ What's Working Well

1. **Request Validation:** Good validation of balance, minimum amount, duplicate requests
2. **Admin Notifications:** Admins are notified immediately when payout is requested
3. **UI/UX:** Clean admin interface for viewing and processing payouts
4. **Status Tracking:** Clear status flow: pending → processing → completed/rejected
5. **Payout Details:** Flexible payout details storage for transaction IDs, etc.
6. **Email Template:** Good email template for payout requests (though missing for completion/rejection)

---

## 🔧 Recommended Fixes (Priority Order)

### High Priority
1. **Fix Issue #3:** Correct history entry claiming logic to only mark entries that were actually paid
2. **Fix Issue #2:** Add atomic balance updates to prevent race conditions

### Medium Priority
3. **Fix Issue #1:** Add email notifications for payout completion/rejection
4. **Fix Issue #8:** Fetch fresh balance data before processing
5. **Fix Issue #5:** Add audit trail for financial transactions

### Low Priority
6. **Fix Issue #4:** Add payout history view for artists
7. **Fix Issue #6:** Add minimum payout validation on admin side (or document that admin can override)
8. **Fix Issue #7:** Validate payout method enum

---

## 📊 Flow Diagram

```
Artist Requests Payout
  ↓
[Validate balance, minimum, duplicates]
  ↓
[Create PayoutRequest (status: pending)]
  ↓
[Notify Admins (in-app + email)]
  ↓
Admin Views Payouts
  ↓
Admin Clicks "Complete" or "Reject"
  ↓
[If Complete]
  ↓
[Validate balance ≥ requested amount] ⚠️ Race condition risk
  ↓
[Deduct from balance] ⚠️ Race condition risk
  ↓
[Mark ALL pending history as claimed] ⚠️ Incorrect logic
  ↓
[Update request status → completed]
  ↓
[Notify artist (in-app only)] ❌ No email
  ↓
[If Reject]
  ↓
[Update request status → rejected]
  ↓
[Notify artist (in-app only)] ❌ No email
```

---

## 🔐 Security Considerations

1. **Admin Access:** ✅ Properly protected with `adminMiddleware`
2. **Balance Deduction:** ⚠️ No transaction/locking - potential race condition
3. **Audit Trail:** ❌ No persistent audit log for financial transactions
4. **Email Security:** ✅ Email notifications use Resend service

---

## 📝 Testing Recommendations

1. **Test concurrent payout processing:** Two admins processing payouts for same user simultaneously
2. **Test partial payout:** User with multiple allocations requests partial payout
3. **Test balance edge cases:** Requesting payout when balance changes during processing
4. **Test email delivery:** Verify emails are sent for request, completion, and rejection
5. **Test history marking:** Verify only paid allocations are marked as claimed

---

## 📚 Related Files

### Backend
- `tuneable-backend/routes/artistEscrowRoutes.js` - Main payout routes
- `tuneable-backend/models/PayoutRequest.js` - Payout request model
- `tuneable-backend/services/artistEscrowService.js` - Escrow allocation service
- `tuneable-backend/utils/emailService.js` - Email notifications (incomplete)

### Frontend
- `tuneable-frontend-v2/src/pages/ArtistEscrowDashboard.tsx` - Artist payout request UI
- `tuneable-frontend-v2/src/pages/Admin.tsx` - Admin payout processing UI
- `tuneable-frontend-v2/src/lib/api.ts` - API client functions

---

**End of Audit**

