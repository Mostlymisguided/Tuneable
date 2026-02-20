/**
 * Script: Transfer All Tips from Tuneable User to Misguided User
 *
 * This script:
 * 1. Finds Tuneable and Misguided users
 * 2. Finds all active bids (tips) from Tuneable
 * 3. Updates Bid documents: userId, user_uuid, username -> Misguided
 * 4. Updates TuneableLedger TIP entries: userId, user_uuid, username -> Misguided
 * 5. Adjusts User balances: add total to Tuneable, subtract from Misguided
 *
 * WARNING: This modifies database data. Use with caution!
 *
 * Usage:
 *   MONGO_URI="..." node tuneable-backend/scripts/transferTuneableTipsToMisguided.js
 *
 * Dry Run (no changes):
 *   DRY_RUN=true MONGO_URI="..." node tuneable-backend/scripts/transferTuneableTipsToMisguided.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tuneable';
const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

const User = require('../models/User');
const Bid = require('../models/Bid');
const TuneableLedger = require('../models/TuneableLedger');

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

async function transferTuneableTipsToMisguided() {
  try {
    if (DRY_RUN) {
      console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
    }
    console.log('\n🔄 Starting Tuneable → Misguided tip transfer...\n');

    // Step 1: Find users
    console.log('👤 Step 1: Finding Tuneable and Misguided users...');
    const tuneableUser = await User.findOne({ username: 'Tuneable' });
    const misguidedUser = await User.findOne({ username: 'Misguided' });

    if (!tuneableUser) {
      throw new Error('Tuneable user not found.');
    }
    if (!misguidedUser) {
      throw new Error('Misguided user not found.');
    }

    console.log(`✅ Tuneable: ${tuneableUser._id}`);
    console.log(`✅ Misguided: ${misguidedUser._id}`);

    // Step 2: Find all active bids from Tuneable
    console.log('\n💰 Step 2: Finding all active bids from Tuneable...');
    const activeBids = await Bid.find({
      userId: tuneableUser._id,
      status: 'active'
    }).lean();

    console.log(`✅ Found ${activeBids.length} active bids`);

    if (activeBids.length === 0) {
      console.log('\n✅ No active bids - nothing to transfer');
      return;
    }

    const totalPence = activeBids.reduce((sum, b) => sum + (b.amount || 0), 0);
    console.log(`   Total tip amount: £${(totalPence / 100).toFixed(2)} (${totalPence} pence)`);

    // Step 3: Find corresponding TuneableLedger TIP entries
    const bidIds = activeBids.map(b => b._id);
    const ledgerEntries = await TuneableLedger.find({
      userId: tuneableUser._id,
      transactionType: 'TIP',
      bidId: { $in: bidIds }
    }).lean();

    console.log(`✅ Found ${ledgerEntries.length} TuneableLedger TIP entries`);

    // Balance check for Misguided
    const misguidedBalance = misguidedUser.balance || 0;
    if (misguidedBalance < totalPence && !DRY_RUN) {
      console.warn(`\n⚠️  Misguided balance (${misguidedBalance}p) is less than total tips (${totalPence}p)`);
      console.warn('   Consider topping up Misguided before running without DRY_RUN.');
    } else if (DRY_RUN && misguidedBalance < totalPence) {
      console.log(`\n⚠️  Misguided balance (${misguidedBalance}p) < total tips (${totalPence}p) - top up before live run`);
    }

    // Dry run: report only
    if (DRY_RUN) {
      console.log('\n📋 DRY RUN - Would perform the following:');
      console.log(`   1. Update ${activeBids.length} Bid documents (userId, user_uuid, username -> Misguided)`);
      console.log(`   2. Update ${ledgerEntries.length} TuneableLedger TIP entries (userId, user_uuid, username -> Misguided)`);
      console.log(`   3. Tuneable balance: +£${(totalPence / 100).toFixed(2)} (currently ${(tuneableUser.balance || 0) / 100})`);
      console.log(`   4. Misguided balance: -£${(totalPence / 100).toFixed(2)} (currently £${(misguidedBalance / 100).toFixed(2)})`);

      if (activeBids.length <= 10) {
        console.log('\n   Sample bids:');
        activeBids.slice(0, 5).forEach((b, i) => {
          console.log(`     ${i + 1}. ${b.mediaTitle || 'Unknown'} - ${b.amount}p`);
        });
      }
      console.log('\n🔍 DRY RUN complete. Run without DRY_RUN=true to apply changes.');
      return;
    }

    // LIVE: Perform updates
    console.log('\n📝 Step 3: Updating Bid documents...');
    const bidResult = await Bid.updateMany(
      { _id: { $in: bidIds } },
      {
        $set: {
          userId: misguidedUser._id,
          user_uuid: misguidedUser.uuid,
          username: misguidedUser.username
        }
      }
    );
    console.log(`✅ Updated ${bidResult.modifiedCount} bids`);

    console.log('\n📝 Step 4: Updating TuneableLedger TIP entries...');
    const ledgerResult = await TuneableLedger.updateMany(
      { userId: tuneableUser._id, transactionType: 'TIP', bidId: { $in: bidIds } },
      {
        $set: {
          userId: misguidedUser._id,
          user_uuid: misguidedUser.uuid,
          username: misguidedUser.username
        }
      }
    );
    console.log(`✅ Updated ${ledgerResult.modifiedCount} ledger entries`);

    console.log('\n📝 Step 5: Adjusting User balances...');
    await User.findByIdAndUpdate(tuneableUser._id, { $inc: { balance: totalPence } });
    await User.findByIdAndUpdate(misguidedUser._id, { $inc: { balance: -totalPence } });
    console.log(`✅ Tuneable: +£${(totalPence / 100).toFixed(2)}`);
    console.log(`✅ Misguided: -£${(totalPence / 100).toFixed(2)}`);

    console.log('\n✅ Tip transfer completed successfully!');
  } catch (error) {
    console.error('\n❌ Error during transfer:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectDB();
    await transferTuneableTipsToMisguided();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

if (require.main === module) {
  main();
}

module.exports = { transferTuneableTipsToMisguided };
