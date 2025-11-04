/**
 * Migration Script: Reduce Large Bid Amounts
 * 
 * This script reduces bid amounts that are over 1000 pence (£10) by dividing by 100.
 * This is useful for correcting bid amounts that were incorrectly multiplied during migration.
 * 
 * Fields to adjust:
 * - Bid.amount (if > 1000 pence)
 * 
 * Usage:
 * DRY_RUN=true MONGO_URI="your_mongo_uri" node tuneable-backend/scripts/reduceLargeBids.js
 * 
 * To actually run the migration (remove DRY_RUN or set to false):
 * MONGO_URI="your_mongo_uri" node tuneable-backend/scripts/reduceLargeBids.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI environment variable is required');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN !== 'false' && process.env.DRY_RUN !== '0'; // Default to true for safety

// Import models
const Bid = require('../models/Bid');
const User = require('../models/User');
const Media = require('../models/Media');

async function reduceLargeBids() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    if (DRY_RUN) {
      console.log('\n🔍 DRY RUN MODE - No changes will be made\n');
    } else {
      console.log('\n⚠️  LIVE MODE - Changes will be permanently applied\n');
    }

    // Find all bids with amount > 1000 pence
    console.log('📊 Finding bids with amount > 1000 pence...');
    const largeBids = await Bid.find({ 
      amount: { $gt: 1000 } 
    }).populate('userId', 'username balance').populate('mediaId', 'title globalMediaAggregate');
    
    console.log(`   Found ${largeBids.length} bids with amount > 1000 pence`);
    
    if (largeBids.length === 0) {
      console.log('✅ No large bids found. Nothing to do.');
      await mongoose.disconnect();
      return;
    }

    // Statistics
    let totalBidsToUpdate = 0;
    let totalAmountBefore = 0;
    let totalAmountAfter = 0;
    let maxBidBefore = 0;
    let minBidBefore = Infinity;
    const affectedUsers = new Set();
    const affectedMedia = new Set();
    
    // Sample bids to show
    const sampleBids = [];
    
    for (const bid of largeBids) {
      const oldAmount = bid.amount;
      const newAmount = Math.round(oldAmount / 100);
      
      totalBidsToUpdate++;
      totalAmountBefore += oldAmount;
      totalAmountAfter += newAmount;
      
      if (oldAmount > maxBidBefore) maxBidBefore = oldAmount;
      if (oldAmount < minBidBefore) minBidBefore = oldAmount;
      
      if (bid.userId) {
        affectedUsers.add(bid.userId._id.toString());
      }
      if (bid.mediaId) {
        affectedMedia.add(bid.mediaId._id.toString());
      }
      
      // Collect sample bids (first 10)
      if (sampleBids.length < 10) {
        sampleBids.push({
          bidId: bid._id.toString(),
          username: bid.userId?.username || 'Unknown',
          mediaTitle: bid.mediaId?.title || 'Unknown',
          oldAmount: oldAmount,
          oldAmountPounds: (oldAmount / 100).toFixed(2),
          newAmount: newAmount,
          newAmountPounds: (newAmount / 100).toFixed(2),
          reduction: oldAmount - newAmount,
          reductionPounds: ((oldAmount - newAmount) / 100).toFixed(2)
        });
      }
    }

    // Display statistics
    console.log('\n📈 Statistics:');
    console.log(`   Total bids to update: ${totalBidsToUpdate}`);
    console.log(`   Total amount before: ${totalAmountBefore.toLocaleString()} pence (£${(totalAmountBefore / 100).toFixed(2)})`);
    console.log(`   Total amount after: ${totalAmountAfter.toLocaleString()} pence (£${(totalAmountAfter / 100).toFixed(2)})`);
    console.log(`   Total reduction: ${(totalAmountBefore - totalAmountAfter).toLocaleString()} pence (£${((totalAmountBefore - totalAmountAfter) / 100).toFixed(2)})`);
    console.log(`   Highest bid: ${maxBidBefore.toLocaleString()} pence (£${(maxBidBefore / 100).toFixed(2)})`);
    console.log(`   Lowest bid affected: ${minBidBefore.toLocaleString()} pence (£${(minBidBefore / 100).toFixed(2)})`);
    console.log(`   Affected users: ${affectedUsers.size}`);
    console.log(`   Affected media: ${affectedMedia.size}`);
    
    // Show sample bids
    console.log('\n📋 Sample bids to be updated:');
    sampleBids.forEach((sample, index) => {
      console.log(`\n   ${index + 1}. Bid ID: ${sample.bidId}`);
      console.log(`      User: ${sample.username}`);
      console.log(`      Media: ${sample.mediaTitle}`);
      console.log(`      Amount: £${sample.oldAmountPounds} → £${sample.newAmountPounds} (£${sample.reductionPounds} reduction)`);
    });
    
    if (totalBidsToUpdate > sampleBids.length) {
      console.log(`\n   ... and ${totalBidsToUpdate - sampleBids.length} more bids`);
    }

    // Check affected user balances
    console.log('\n💰 Checking affected user balances...');
    const affectedUserIds = Array.from(affectedUsers);
    const users = await User.find({ _id: { $in: affectedUserIds } });
    let usersWithLargeBalances = 0;
    let totalUserBalanceBefore = 0;
    let totalUserBalanceAfter = 0;
    
    for (const user of users) {
      if (user.balance && user.balance > 1000) {
        usersWithLargeBalances++;
        totalUserBalanceBefore += user.balance;
        totalUserBalanceAfter += Math.round(user.balance / 100);
      }
    }
    
    if (usersWithLargeBalances > 0) {
      console.log(`   ⚠️  Found ${usersWithLargeBalances} users with balances > 1000 pence`);
      console.log(`   Total user balance before: ${totalUserBalanceBefore.toLocaleString()} pence (£${(totalUserBalanceBefore / 100).toFixed(2)})`);
      console.log(`   Total user balance after: ${totalUserBalanceAfter.toLocaleString()} pence (£${(totalUserBalanceAfter / 100).toFixed(2)})`);
      console.log(`   ⚠️  NOTE: This script does NOT adjust user balances. You may need to run a separate script for that.`);
    }

    // Check affected media aggregates
    console.log('\n🎵 Checking affected media aggregates...');
    const affectedMediaIds = Array.from(affectedMedia);
    const media = await Media.find({ _id: { $in: affectedMediaIds } });
    let mediaWithLargeAggregates = 0;
    let totalMediaAggregateBefore = 0;
    let totalMediaAggregateAfter = 0;
    
    for (const m of media) {
      if (m.globalMediaAggregate && m.globalMediaAggregate > 1000) {
        mediaWithLargeAggregates++;
        totalMediaAggregateBefore += m.globalMediaAggregate;
        totalMediaAggregateAfter += Math.round(m.globalMediaAggregate / 100);
      }
    }
    
    if (mediaWithLargeAggregates > 0) {
      console.log(`   ⚠️  Found ${mediaWithLargeAggregates} media with aggregates > 1000 pence`);
      console.log(`   Total media aggregate before: ${totalMediaAggregateBefore.toLocaleString()} pence (£${(totalMediaAggregateBefore / 100).toFixed(2)})`);
      console.log(`   Total media aggregate after: ${totalMediaAggregateAfter.toLocaleString()} pence (£${(totalMediaAggregateAfter / 100).toFixed(2)})`);
      console.log(`   ⚠️  NOTE: This script does NOT adjust media aggregates. These should be recalculated after bid updates.`);
    }

    // Actually perform the migration if not in dry run mode
    if (!DRY_RUN) {
      console.log('\n🔄 Starting migration...');
      let updatedCount = 0;
      
      for (const bid of largeBids) {
        const oldAmount = bid.amount;
        bid.amount = Math.round(oldAmount / 100);
        await bid.save({ validateBeforeSave: false });
        updatedCount++;
        
        if (updatedCount % 100 === 0) {
          console.log(`   Updated ${updatedCount}/${totalBidsToUpdate} bids...`);
        }
      }
      
      console.log(`\n✅ Successfully updated ${updatedCount} bid amounts`);
      console.log('\n⚠️  IMPORTANT: You may need to:');
      console.log('   1. Recalculate media aggregates (globalMediaAggregate, etc.)');
      console.log('   2. Adjust user balances if they were also affected');
      console.log('   3. Recalculate label stats if needed');
    } else {
      console.log('\n✅ Dry run completed. No changes were made.');
      console.log('   To apply changes, run: DRY_RUN=false MONGO_URI="..." node tuneable-backend/scripts/reduceLargeBids.js');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    console.error('Stack:', error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the migration
reduceLargeBids();
