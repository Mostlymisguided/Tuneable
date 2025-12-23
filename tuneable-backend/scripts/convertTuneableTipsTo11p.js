/**
 * Script: Convert All Tips from Tuneable User to 11p
 * 
 * This script:
 * 1. Finds the Tuneable user
 * 2. Finds all active bids (tips) from the Tuneable user
 * 3. Updates bid amounts to 11 pence
 * 4. Updates corresponding TuneableLedger TIP entries to 11 pence
 * 5. Regenerates transaction hashes for updated ledger entries
 * 
 * WARNING: This script modifies production data. Use with caution!
 * 
 * Usage:
 * MONGO_URI="your_mongo_uri" node tuneable-backend/scripts/convertTuneableTipsTo11p.js
 * 
 * Dry Run (no changes):
 * DRY_RUN=true MONGO_URI="your_mongo_uri" node tuneable-backend/scripts/convertTuneableTipsTo11p.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tuneable';
const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

// Import models
const User = require('../models/User');
const Bid = require('../models/Bid');
const TuneableLedger = require('../models/TuneableLedger');

// Target amount: 11 pence
const TARGET_AMOUNT = 11;

async function connectDB() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function convertTuneableTipsTo11p() {
  try {
    if (DRY_RUN) {
      console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
    }
    console.log('\n🔄 Starting tip conversion process...\n');

    // Step 1: Find Tuneable user
    console.log('👤 Step 1: Finding Tuneable user...');
    const tuneableUser = await User.findOne({ username: 'Tuneable' });
    if (!tuneableUser) {
      throw new Error('Tuneable user not found. Please create the Tuneable user first.');
    }
    console.log(`✅ Found Tuneable user: ${tuneableUser.username} (${tuneableUser._id})`);

    // Step 2: Find all active bids from Tuneable user
    console.log('\n💰 Step 2: Finding all active bids from Tuneable user...');
    const activeBids = await Bid.find({
      userId: tuneableUser._id,
      status: 'active'
    });
    console.log(`✅ Found ${activeBids.length} active bids from Tuneable user`);

    if (activeBids.length === 0) {
      console.log('\n✅ No active bids found - nothing to convert');
      return;
    }

    // Step 3: Update bid amounts to 11p
    console.log(`\n📊 Step 3: ${DRY_RUN ? 'Analyzing' : 'Updating'} ${activeBids.length} bid amounts to ${TARGET_AMOUNT}p...`);
    let bidsUpdated = 0;
    let bidsSkipped = 0;
    const bidsToUpdate = [];

    for (const bid of activeBids) {
      try {
        // Skip if already 11p
        if (bid.amount === TARGET_AMOUNT) {
          bidsSkipped++;
          continue;
        }

        const oldAmount = bid.amount;
        bidsToUpdate.push({
          bidId: bid._id,
          oldAmount: oldAmount,
          newAmount: TARGET_AMOUNT,
          mediaTitle: bid.mediaTitle || 'Unknown'
        });

        if (!DRY_RUN) {
          bid.amount = TARGET_AMOUNT;
          await bid.save();
        }
        bidsUpdated++;

        // Log progress every 50 items
        if (bidsUpdated % 50 === 0) {
          console.log(`   Progress: ${bidsUpdated}/${activeBids.length} bids ${DRY_RUN ? 'would be updated' : 'updated'}...`);
        }
      } catch (error) {
        console.error(`   ❌ Error ${DRY_RUN ? 'analyzing' : 'updating'} bid ${bid._id}:`, error.message);
      }
    }

    if (DRY_RUN && bidsToUpdate.length > 0 && bidsToUpdate.length <= 20) {
      console.log('\n   Sample bids that would be updated:');
      bidsToUpdate.slice(0, 10).forEach(bid => {
        console.log(`   - Bid ${bid.bidId}: ${bid.oldAmount}p → ${bid.newAmount}p (${bid.mediaTitle})`);
      });
      if (bidsToUpdate.length > 10) {
        console.log(`   ... and ${bidsToUpdate.length - 10} more`);
      }
    }

    console.log(`${DRY_RUN ? '📋 Would update' : '✅ Updated'} ${bidsUpdated} bid amounts to ${TARGET_AMOUNT}p`);
    if (bidsSkipped > 0) {
      console.log(`   ℹ️  Skipped ${bidsSkipped} bids that were already ${TARGET_AMOUNT}p`);
    }

    // Step 4: Update corresponding TuneableLedger TIP entries
    console.log(`\n📝 Step 4: ${DRY_RUN ? 'Analyzing' : 'Updating'} TuneableLedger TIP entries...`);
    
    // Get all bid IDs from active bids
    const bidIds = activeBids.map(bid => bid._id);

    // Find all ledger entries for these bids
    const ledgerEntries = await TuneableLedger.find({
      userId: tuneableUser._id,
      transactionType: 'TIP',
      bidId: { $in: bidIds }
    });

    console.log(`   Found ${ledgerEntries.length} ledger entries to ${DRY_RUN ? 'analyze' : 'update'}`);

    let ledgerUpdated = 0;
    let ledgerSkipped = 0;
    const ledgerToUpdate = [];

    for (const entry of ledgerEntries) {
      try {
        // Skip if already 11p
        if (entry.amount === TARGET_AMOUNT) {
          ledgerSkipped++;
          continue;
        }

        const oldAmount = entry.amount;
        
        // Calculate what the new values would be
        const newUserBalancePost = entry.userBalancePre - TARGET_AMOUNT;
        const newUserAggregatePost = entry.userAggregatePre + TARGET_AMOUNT;
        const newMediaAggregatePost = entry.mediaAggregatePre !== null && entry.mediaAggregatePre !== undefined
          ? entry.mediaAggregatePre + TARGET_AMOUNT
          : null;
        const newGlobalAggregatePost = entry.globalAggregatePre !== null && entry.globalAggregatePre !== undefined
          ? entry.globalAggregatePre + TARGET_AMOUNT
          : null;

        ledgerToUpdate.push({
          entryId: entry._id,
          oldAmount: oldAmount,
          newAmount: TARGET_AMOUNT,
          mediaTitle: entry.mediaTitle || 'Unknown',
          oldUserBalancePost: entry.userBalancePost,
          newUserBalancePost: newUserBalancePost,
          oldUserAggregatePost: entry.userAggregatePost,
          newUserAggregatePost: newUserAggregatePost
        });
        
        if (!DRY_RUN) {
          // Update amount
          entry.amount = TARGET_AMOUNT;
          
          // Recalculate POST balances based on the new amount
          // PRE balances remain unchanged (they're historical snapshots)
          // POST balances are recalculated from PRE + transaction effect
          entry.userBalancePost = newUserBalancePost;
          entry.userAggregatePost = newUserAggregatePost;
          
          if (newMediaAggregatePost !== null) {
            entry.mediaAggregatePost = newMediaAggregatePost;
          }
          
          if (newGlobalAggregatePost !== null) {
            entry.globalAggregatePost = newGlobalAggregatePost;
          }
          
          // Update description to reflect new amount
          if (entry.mediaTitle) {
            entry.description = `Tip of £${(TARGET_AMOUNT / 100).toFixed(2)} on "${entry.mediaTitle}"`;
            if (entry.userTuneBytesPost !== null && entry.userTuneBytesPre !== null) {
              const tunebytesEarned = entry.userTuneBytesPost - entry.userTuneBytesPre;
              if (tunebytesEarned > 0) {
                entry.description += ` (earned ${tunebytesEarned.toFixed(2)} tunebytes)`;
              }
            }
          }
          
          // Save - this will regenerate the transaction hash automatically
          await entry.save();
        }
        
        ledgerUpdated++;

        // Log progress every 50 items
        if (ledgerUpdated % 50 === 0) {
          console.log(`   Progress: ${ledgerUpdated}/${ledgerEntries.length} ledger entries ${DRY_RUN ? 'analyzed' : 'updated'}...`);
        }
      } catch (error) {
        console.error(`   ❌ Error ${DRY_RUN ? 'analyzing' : 'updating'} ledger entry ${entry._id}:`, error.message);
      }
    }

    if (DRY_RUN && ledgerToUpdate.length > 0 && ledgerToUpdate.length <= 20) {
      console.log('\n   Sample ledger entries that would be updated:');
      ledgerToUpdate.slice(0, 5).forEach(entry => {
        console.log(`   - Entry ${entry.entryId}:`);
        console.log(`     Amount: ${entry.oldAmount}p → ${entry.newAmount}p`);
        console.log(`     User Balance Post: ${entry.oldUserBalancePost}p → ${entry.newUserBalancePost}p`);
        console.log(`     User Aggregate Post: ${entry.oldUserAggregatePost}p → ${entry.newUserAggregatePost}p`);
        console.log(`     Media: ${entry.mediaTitle}`);
      });
      if (ledgerToUpdate.length > 5) {
        console.log(`   ... and ${ledgerToUpdate.length - 5} more`);
      }
    }

    console.log(`${DRY_RUN ? '📋 Would update' : '✅ Updated'} ${ledgerUpdated} ledger entries to ${TARGET_AMOUNT}p`);
    if (ledgerSkipped > 0) {
      console.log(`   ℹ️  Skipped ${ledgerSkipped} ledger entries that were already ${TARGET_AMOUNT}p`);
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log(`   - Tuneable user: ${tuneableUser.username}`);
    console.log(`   - Active bids found: ${activeBids.length}`);
    console.log(`   - Bids ${DRY_RUN ? 'would be updated' : 'updated'} to ${TARGET_AMOUNT}p: ${bidsUpdated}`);
    console.log(`   - Bids already ${TARGET_AMOUNT}p: ${bidsSkipped}`);
    console.log(`   - Ledger entries found: ${ledgerEntries.length}`);
    console.log(`   - Ledger entries ${DRY_RUN ? 'would be updated' : 'updated'}: ${ledgerUpdated}`);
    console.log(`   - Ledger entries already ${TARGET_AMOUNT}p: ${ledgerSkipped}`);
    if (DRY_RUN) {
      console.log('\n🔍 DRY RUN COMPLETE - No changes were made');
      console.log('   To apply changes, run without DRY_RUN=true');
    } else {
      console.log('\n✅ Tip conversion process completed successfully!');
    }

  } catch (error) {
    console.error('\n❌ Error during tip conversion:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await connectDB();
    await convertTuneableTipsTo11p();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { convertTuneableTipsTo11p };

