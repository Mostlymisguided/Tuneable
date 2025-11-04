/**
 * Migration Script: Convert All Amounts from Pounds to Pence
 * 
 * This script migrates all monetary amounts in the database from pounds (decimal)
 * to pence (integer) format.
 * 
 * Fields to migrate:
 * - Bid.amount
 * - User.balance
 * - Media.globalMediaAggregate
 * - Media.globalMediaBidTop
 * - Media.globalMediaAggregateTop
 * - Label.stats.totalBidAmount
 * - Label.stats.averageBidAmount
 * - Label.stats.topBidAmount
 * 
 * Usage:
 * MONGO_URI="your_mongo_uri" node tuneable-backend/scripts/migrateAmountsToPence.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI environment variable is required');
  process.exit(1);
}

// Import models
const Bid = require('../models/Bid');
const User = require('../models/User');
const Media = require('../models/Media');
const Label = require('../models/Label');

async function migrateAmountsToPence() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    let totalBids = 0;
    let totalUsers = 0;
    let totalMedia = 0;
    let totalLabels = 0;

    // 1. Migrate Bid amounts
    console.log('\n📊 Migrating Bid amounts...');
    const bids = await Bid.find({});
    console.log(`   Found ${bids.length} bids to migrate`);
    
    let skippedBids = 0;
    for (const bid of bids) {
      // Skip bids without required fields (invalid data)
      if (!bid.mediaId) {
        skippedBids++;
        if (skippedBids <= 5) {
          console.log(`   ⚠️  Skipping bid ${bid._id} - missing mediaId`);
        }
        continue;
      }
      
      if (bid.amount && typeof bid.amount === 'number') {
        // Only convert if amount is less than 1000 (likely already in pounds)
        // If it's already a large number, it might already be in pence
        if (bid.amount < 1000) {
          const oldAmount = bid.amount;
          bid.amount = Math.round(bid.amount * 100);
          // Use save with runValidators: false to skip validation during migration
          await bid.save({ validateBeforeSave: false });
          totalBids++;
          if (totalBids % 100 === 0) {
            console.log(`   Migrated ${totalBids} bids...`);
          }
        }
      }
    }
    if (skippedBids > 0) {
      console.log(`   ⚠️  Skipped ${skippedBids} invalid bids (missing mediaId)`);
    }
    console.log(`✅ Migrated ${totalBids} bid amounts`);

    // 2. Migrate User balances
    console.log('\n💰 Migrating User balances...');
    const users = await User.find({});
    console.log(`   Found ${users.length} users to check`);
    
    for (const user of users) {
      if (user.balance !== undefined && user.balance !== null && typeof user.balance === 'number') {
        // Only convert if balance is less than 100000 (likely already in pounds)
        if (user.balance < 100000) {
          const oldBalance = user.balance;
          user.balance = Math.round(user.balance * 100);
          await user.save({ validateBeforeSave: false });
          totalUsers++;
          if (totalUsers % 50 === 0) {
            console.log(`   Migrated ${totalUsers} user balances...`);
          }
        }
      }
    }
    console.log(`✅ Migrated ${totalUsers} user balances`);

    // 3. Migrate Media aggregates
    console.log('\n🎵 Migrating Media aggregates...');
    const media = await Media.find({});
    console.log(`   Found ${media.length} media items to check`);
    
    for (const m of media) {
      let updated = false;
      
      if (m.globalMediaAggregate !== undefined && m.globalMediaAggregate !== null && typeof m.globalMediaAggregate === 'number') {
        if (m.globalMediaAggregate < 100000) {
          m.globalMediaAggregate = Math.round(m.globalMediaAggregate * 100);
          updated = true;
        }
      }
      
      if (m.globalMediaBidTop !== undefined && m.globalMediaBidTop !== null && typeof m.globalMediaBidTop === 'number') {
        if (m.globalMediaBidTop < 100000) {
          m.globalMediaBidTop = Math.round(m.globalMediaBidTop * 100);
          updated = true;
        }
      }
      
      if (m.globalMediaAggregateTop !== undefined && m.globalMediaAggregateTop !== null && typeof m.globalMediaAggregateTop === 'number') {
        if (m.globalMediaAggregateTop < 100000) {
          m.globalMediaAggregateTop = Math.round(m.globalMediaAggregateTop * 100);
          updated = true;
        }
      }
      
      if (updated) {
        await m.save({ validateBeforeSave: false });
        totalMedia++;
        if (totalMedia % 50 === 0) {
          console.log(`   Migrated ${totalMedia} media items...`);
        }
      }
    }
    console.log(`✅ Migrated ${totalMedia} media aggregates`);

    // 4. Migrate Label stats
    console.log('\n🏷️  Migrating Label stats...');
    const labels = await Label.find({});
    console.log(`   Found ${labels.length} labels to check`);
    
    for (const label of labels) {
      if (label.stats && typeof label.stats === 'object') {
        let updated = false;
        
        if (label.stats.totalBidAmount !== undefined && label.stats.totalBidAmount !== null && typeof label.stats.totalBidAmount === 'number') {
          if (label.stats.totalBidAmount < 100000) {
            label.stats.totalBidAmount = Math.round(label.stats.totalBidAmount * 100);
            updated = true;
          }
        }
        
        if (label.stats.averageBidAmount !== undefined && label.stats.averageBidAmount !== null && typeof label.stats.averageBidAmount === 'number') {
          if (label.stats.averageBidAmount < 100000) {
            label.stats.averageBidAmount = Math.round(label.stats.averageBidAmount * 100);
            updated = true;
          }
        }
        
        if (label.stats.topBidAmount !== undefined && label.stats.topBidAmount !== null && typeof label.stats.topBidAmount === 'number') {
          if (label.stats.topBidAmount < 100000) {
            label.stats.topBidAmount = Math.round(label.stats.topBidAmount * 100);
            updated = true;
          }
        }
        
        if (updated) {
          await label.save({ validateBeforeSave: false });
          totalLabels++;
          if (totalLabels % 10 === 0) {
            console.log(`   Migrated ${totalLabels} labels...`);
          }
        }
      }
    }
    console.log(`✅ Migrated ${totalLabels} label stats`);

    console.log('\n📊 Migration Summary:');
    console.log(`   Bids: ${totalBids}`);
    console.log(`   Users: ${totalUsers}`);
    console.log(`   Media: ${totalMedia}`);
    console.log(`   Labels: ${totalLabels}`);
    console.log('\n✅ Migration complete! All amounts are now stored in pence.');

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  migrateAmountsToPence()
    .then(() => {
      console.log('✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateAmountsToPence };

