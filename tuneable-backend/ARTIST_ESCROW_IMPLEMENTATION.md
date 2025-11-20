# Artist Escrow System - Phase 1 Implementation Plan

## 🎯 Overview

This document outlines the implementation of Phase 1 (Internal Ledger) for Tuneable's artist escrow system. This allows artists to receive their share of revenue (70% of tips/bids) while maintaining a simple, MVP-ready approach.

## 📋 Architecture

### Revenue Split
- **70%** → Artists (split by `mediaOwners` percentages)
- **30%** → Tuneable platform fee

### Two-Tier System
1. **Registered Artists**: Revenue allocated to `User.artistEscrowBalance`
2. **Unknown Artists**: Revenue stored in `ArtistEscrowAllocation` model (matched later)

## 🗄️ Database Schema Changes

### 1. User Model Updates
```javascript
artistEscrowBalance: { 
  type: Number, 
  default: 0 
}, // Artist revenue in pence (unclaimed)
stripeConnectAccountId: { 
  type: String 
}, // For future Stripe Connect migration
artistEscrowHistory: [{
  mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
  bidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid' },
  amount: { type: Number }, // In pence
  allocatedAt: { type: Date, default: Date.now },
  claimedAt: { type: Date },
  status: { type: String, enum: ['pending', 'claimed'], default: 'pending' }
}]
```

### 2. New Model: ArtistEscrowAllocation
For unknown/unregistered artists:
```javascript
{
  mediaId: ObjectId (ref: Media),
  bidId: ObjectId (ref: Bid),
  artistName: String, // For matching
  artistUserId: ObjectId (ref: User) | null, // Set when artist registers
  matchingCriteria: {
    artistName: String,
    youtubeChannelId: String,
    externalIds: Map
  },
  percentage: Number, // From mediaOwners
  allocatedAmount: Number, // In pence
  claimed: Boolean,
  claimedAt: Date
}
```

## 🔧 Service Layer

### artistEscrowService.js
Core functions:
- `allocateEscrowForBid(bidId, mediaId, bidAmountPence)` - Main allocation logic
- `matchUnknownArtistToUser(artistName, matchingCriteria)` - Match unknown artists
- `claimEscrowForArtist(userId)` - Transfer unknown allocations to user
- `calculateArtistShare(bidAmountPence, percentage)` - Calculate individual share

## 🔗 Integration Points

### 1. Bid Placement (partyRoutes.js)
After bid is saved:
```javascript
const artistEscrowService = require('../services/artistEscrowService');
await artistEscrowService.allocateEscrowForBid(bid._id, media._id, bidAmountPence);
```

### 2. Artist Registration (userRoutes.js)
When artist signs up:
```javascript
// Match unknown artist allocations
await artistEscrowService.matchUnknownArtistToUser(userId, artistName);
```

### 3. Artist Dashboard (new route)
- View escrow balance
- View escrow history
- Request payout (future)

## 📊 Data Flow

### On Bid Placement:
1. User places bid → balance deducted
2. Bid saved to database
3. `artistEscrowService.allocateEscrowForBid()` called
4. For each `media.mediaOwner`:
   - Calculate share: `bidAmount * 0.70 * (percentage / 100)`
   - If `owner.userId` exists → add to `User.artistEscrowBalance`
   - If no `owner.userId` → create `ArtistEscrowAllocation`

### On Artist Registration:
1. Artist signs up with name/channel ID
2. Query `ArtistEscrowAllocation` by matching criteria
3. Transfer allocations to `User.artistEscrowBalance`
4. Mark allocations as `claimed`

## 🚀 Implementation Steps

1. ✅ Create `ArtistEscrowAllocation` model
2. ✅ Update `User` model with escrow fields
3. ✅ Create `artistEscrowService.js`
4. ✅ Integrate into bid placement flow
5. ✅ Create artist dashboard routes
6. ✅ Add artist matching logic
7. ✅ Create admin payout routes (manual for MVP)

## 📝 Legal/Regulatory Notes

**Terms of Service Update Required:**
- "Revenue is accrued and reserved for creators until claimed, but not held in trust"
- "Artists must register and verify identity to claim accumulated revenue"
- "Unclaimed revenue remains claimable indefinitely"

## 🔄 Migration Path to Stripe Connect

When ready for Phase 2:
1. Create Stripe Connect Express accounts for artists
2. Transfer `artistEscrowBalance` to Stripe Connect accounts
3. Use Stripe Transfers for future payouts
4. Keep internal ledger for unknown artists

