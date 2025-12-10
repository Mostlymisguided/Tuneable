# Transaction Verification System

## Overview

A layered security system for financial transaction audit and tamper detection. This system provides cryptographic verification of all financial transactions without the performance overhead of a full blockchain.

## Features

- **Transaction Hashing**: Every financial transaction gets a SHA-256 hash of its critical data
- **Separate Verification Storage**: Hashes stored in read-only `VerificationHash` collection
- **Tamper Detection**: Automatic detection of data modifications
- **Verification Endpoints**: API endpoints for manual and automated verification
- **Background Jobs**: Scheduled verification jobs to detect anomalies

## Transaction Types Covered

1. **WalletTransaction** - Wallet top-ups, refunds, adjustments
2. **Bid** - All tips/bids placed
3. **TuneBytesTransaction** - TuneBytes earned from bids
4. **ArtistEscrowAllocation** - Escrow allocations for artists
5. **PayoutRequest** - Artist payout requests

## How It Works

### 1. Transaction Creation

When a transaction is created:
1. Transaction model automatically generates a hash (via pre-save hook)
2. Hash includes all critical financial fields (amount, userId, timestamps, etc.)
3. Hash is stored in the transaction document
4. Hash is also stored separately in `VerificationHash` collection

### 2. Hash Generation

Each transaction type has a `generateHash()` method that creates a SHA-256 hash of:
- Transaction UUID
- User ID and UUID
- Amount (in pence)
- Status
- Type-specific fields
- Timestamp

### 3. Verification

Verification compares:
- Current hash (generated from current transaction data)
- Original hash (stored in VerificationHash collection)

If they don't match → **Tampering detected!**

## Usage

### Manual Verification

```javascript
// Verify a specific transaction
GET /api/verification/transaction/:transactionId?type=WalletTransaction

// Get verification statistics
GET /api/verification/stats

// Get transactions with mismatches
GET /api/verification/anomalies

// Verify all transactions of a type
POST /api/verification/verify-type
{
  "type": "Bid",
  "limit": 1000
}

// Verify all financial transactions
POST /api/verification/verify-all
{
  "limit": 1000
}
```

### Background Verification Job

Run the verification script periodically (e.g., daily via cron):

```bash
# Verify all transactions
node scripts/verifyTransactions.js

# Verify specific type
node scripts/verifyTransactions.js --type=Bid --limit=5000

# Verify with custom limit
node scripts/verifyTransactions.js --limit=10000
```

The script will:
- Check all transactions
- Compare hashes
- Report mismatches
- Exit with error code if anomalies found (for cron alerts)

### Programmatic Verification

```javascript
const verificationService = require('./services/transactionVerificationService');

// Verify single transaction
const result = await verificationService.verifyTransaction(
  transactionId, 
  'WalletTransaction'
);

// Verify all transactions
const results = await verificationService.verifyAllFinancialTransactions({
  limit: 1000
});

// Get statistics
const stats = await verificationService.getVerificationStats();
```

## Security Layers

1. **Database Access Control**: Limit who can write to financial collections
2. **Application Permissions**: Only admins can modify transactions
3. **Transaction Hashing**: Cryptographic verification of data integrity
4. **Separate Verification Storage**: Read-only hash log (harder to tamper)
5. **Regular Verification Jobs**: Detect changes after the fact
6. **Immutable Audit Log**: Corrections create new entries, don't edit old ones

## What the Hash Protects Against

✅ **Accidental corruption** - Data corruption, bugs  
✅ **Unauthorized changes** - Direct database edits bypassing app  
✅ **Verification** - Prove transaction hasn't changed  
✅ **Backup comparison** - Compare current vs backup hashes  

## Limitations

⚠️ **Not a real blockchain** - Centralized database, not distributed  
⚠️ **Admin access** - Admins with database write access can still modify  
⚠️ **Hash storage** - If attacker has full DB access, they can change both data and hash  

## Best Practices

1. **Restrict Database Access**: Only trusted admins should have write access
2. **Run Verification Daily**: Set up cron job to verify all transactions
3. **Monitor Anomalies**: Alert on hash mismatches immediately
4. **Regular Backups**: Compare current hashes to backup hashes
5. **Immutable Corrections**: Create new transaction entries for corrections, don't edit old ones

## API Endpoints

All endpoints require authentication. Admin endpoints require admin role.

- `GET /api/verification/transaction/:transactionId` - Verify single transaction
- `GET /api/verification/stats` - Get verification statistics (admin)
- `GET /api/verification/anomalies` - Get hash mismatches (admin)
- `POST /api/verification/verify-type` - Verify all of a type (admin)
- `POST /api/verification/verify-all` - Verify all transactions (admin)

## Models

### VerificationHash

Separate collection storing original transaction hashes:

```javascript
{
  transactionId: ObjectId,
  transactionType: String,
  originalHash: String,  // Immutable - set once
  lastVerifiedHash: String,
  verificationStatus: 'verified' | 'mismatch' | 'not_verified',
  verificationCount: Number,
  mismatchCount: Number
}
```

## Performance

- **Hash Generation**: ~1ms per transaction
- **Verification**: ~2-5ms per transaction
- **No Sequential Bottleneck**: Each transaction is independent
- **Scalable**: Handles concurrent transactions without issues

## Future Enhancements

- Merkle tree for batch verification
- External hash storage (separate database/service)
- Real-time verification on transaction updates
- Automated alerts on hash mismatches
- Integration with monitoring systems

