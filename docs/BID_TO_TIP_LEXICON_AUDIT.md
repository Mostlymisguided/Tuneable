# Bid to Tip Lexicon Audit

## Summary
This document summarizes the changes made to update user-facing text from "bid/bidding" to "tip/tipping" terminology, and identifies remaining "bid" references that are code-related and should remain unchanged.

## ✅ Completed Changes

### Backend - Notification System
1. **Notification Model** (`tuneable-backend/models/Notification.js`)
   - Updated comments: "bid on your media" → "tip on your media"
   - Updated comments: "outbid" → "outtipped"
   - Updated groupKey comment example

2. **Notification Service** (`tuneable-backend/services/notificationService.js`)
   - `notifyBidReceived`: "New Bid Received" → "New Tip Received", "placed a bid" → "placed a tip"
   - `notifyOutbid`: "You Were Outbid" → "You Were Outtipped", "higher bid" → "higher tip"
   - `notifyMediaVetoed`: "Your bid" → "Your tip"
   - `notifyMediaUnvetoed`: "can bid on it" → "can tip on it"
   - Updated function comments and error log messages

3. **Email Service** (`tuneable-backend/utils/emailService.js`)
   - Updated comment: "high-value bids" → "high-value tips"
   - Email content already uses "tip" terminology

4. **Party Routes** (`tuneable-backend/routes/partyRoutes.js`)
   - Updated comments: "bidder" → "tipper", "outbid" → "outtipped"
   - Updated notification error messages

### Frontend - User-Facing Text
1. **NotificationsManager** (`tuneable-frontend-v2/src/components/NotificationsManager.tsx`)
   - "Bid Received" → "Tip Received"
   - "Bid Outbid" → "Outtipped"

2. **UserProfile** (`tuneable-frontend-v2/src/pages/UserProfile.tsx`)
   - "Bidding Statistics" comment → "Tipping Statistics"
   - Notification preferences: "Bid Received" → "Tip Received", "Outbid" → "Outtipped"
   - Preference descriptions updated

3. **Admin Panel** (`tuneable-frontend-v2/src/pages/Admin.tsx`)
   - "Bid Management" → "Tip Management"
   - "No bids found" → "No tips found"
   - Toast messages: "Bid vetoed" → "Tip vetoed", "Failed to veto bid" → "Failed to veto tip"
   - Tooltips: "Veto bid" → "Veto tip"
   - Confirmation messages: "can bid again" → "can tip again"

4. **TuneProfile** (`tuneable-frontend-v2/src/pages/TuneProfile.tsx`)
   - Toast: "Placed bid" → "Placed tip"
   - Error: "Failed to place bid" → "Failed to place tip"

5. **Dashboard** (`tuneable-frontend-v2/src/pages/Dashboard.tsx`)
   - Toast: "place a bid" → "place a tip"
   - Prompt: "Enter bid amount" → "Enter tip amount"
   - Error: "Minimum bid" → "Minimum tip"
   - Success: "Added with bid" → "Added with tip"

6. **Help Page** (`tuneable-frontend-v2/src/pages/Help.tsx`)
   - "bidding platform" → "tipping platform"
   - "bid on songs" → "tip on songs"
   - "bids help" → "tips help"
   - "Bidding & Credits" → "Tipping & Credits"
   - "How Bidding Works" → "How Tipping Works"
   - All "bid on" → "tip on" references

7. **BidModal** (`tuneable-frontend-v2/src/components/BidModal.tsx`)
   - Title: "Place a Bid" → "Place a Tip"
   - "Current bid" → "Current tip"
   - "Your Bid Amount" → "Your Tip Amount"
   - Button: "Placing Bid..." → "Placing Tip...", "Place Bid" → "Place Tip"

8. **Party Page** (`tuneable-frontend-v2/src/pages/Party.tsx`)
   - Confirmation: "who bid on it" → "who tipped on it", "can bid again" → "can tip again"
   - Tooltip: "see new bids" → "see new tips"

## 🔧 Remaining "Bid" References (Code-Related - Should NOT Be Changed)

These are internal code names, API endpoints, variable names, and component names that should remain as "bid" for:
- Backward compatibility with the backend
- Code clarity and consistency
- API endpoint naming conventions

### API Functions (Backend Interface)
- `placeBid()` - API function name
- `placeGlobalBid()` - API function name
- `getBids()` - API function name
- `getVetoedBids()` - API function name
- `vetoBid()` - API function name

### Component Names
- `BidConfirmationModal` - Component name (internal)
- `BidModal` - Component name (internal)
- `TopBidders` - Component name (internal)

### State Variables
- `isBidding` - State variable for loading state
- `setIsBidding` - State setter
- `bidAmount` - Variable name for amount
- `bidId` - Variable name for ID
- `bid.` - Object property access (e.g., `bid.amount`, `bid.status`)

### API Endpoints (Backend Routes)
- `/api/parties/:partyId/media/:mediaId/bid` - API endpoint
- `/api/media/:mediaId/global-bid` - API endpoint

### Database Models & Fields
- `Bid` model - Database model name
- `bidId` - Database field reference
- `relatedBidId` - Database field reference
- `bid_received`, `bid_outbid` - Notification type enum values (backend enum)

### File Names
- `BidModal.tsx` - File name
- `BidConfirmationModal.tsx` - File name
- `TopBidders.tsx` - File name

### TypeScript Interfaces
- `interface Bid` - Type definition
- Function parameters named `bid` - Parameter names

## 📝 Notes

1. **Notification Type Enum Values**: The backend still uses `bid_received` and `bid_outbid` as enum values. These should remain unchanged as they are part of the database schema and API contract. Only the display labels have been changed.

2. **Component Names**: Component names like `BidModal` and `TopBidders` are internal code identifiers and don't need to change. The user-facing text within these components has been updated.

3. **API Endpoints**: Backend API endpoints should remain as `/bid` for backward compatibility and to avoid breaking changes for any external integrations.

4. **Variable Names**: Internal variable names like `bidAmount`, `isBidding`, etc. are fine to remain as they are code identifiers.

## ✅ Verification

All user-facing text that mentions "bid" or "bidding" has been changed to "tip" or "tipping" in:
- ✅ Notification titles and messages
- ✅ Toast messages
- ✅ Button labels
- ✅ Form labels
- ✅ Help text
- ✅ Page titles and headings
- ✅ Error messages
- ✅ Confirmation dialogs

Code-related references (functions, variables, API endpoints) remain as "bid" for technical reasons.

