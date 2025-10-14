#!/usr/bin/env node

/**
 * Backfill Media Bid Metrics
 * 
 * This script recalculates all bid metrics for Media documents from existing Bid data.
 * It uses the same logic as the BidMetricsEngine to ensure consistency.
 * 
 * Metrics calculated:
 * - globalMediaAggregate: Sum of all bids for this media
 * - globalMediaBidTop: Highest individual bid amount
 * - globalMediaBidTopUser: User who made the highest bid
 * - globalMediaAggregateTop: Highest user aggregate (sum of all bids by one user)
 * - globalMediaAggregateTopUser: User with highest aggregate
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User'); // Import User model for populate to work

async function backfillMediaBidMetrics() {
  try {
    console.log('🚀 Starting Media bid metrics backfill...\n');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get all media items that have bids
    const mediaWithBids = await Media.find({ 
      bids: { $exists: true, $ne: [] } 
    }).select('_id title bids');

    console.log(`📊 Found ${mediaWithBids.length} media items with bids\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const media of mediaWithBids) {
      try {
        console.log(`Processing: ${media.title} (${media._id})`);

        // Get all active/played bids for this media
        const bids = await Bid.find({
          mediaId: media._id,
          status: { $in: ['active', 'played'] }
        }).populate('userId', 'username');

        if (bids.length === 0) {
          console.log(`  ⏭️  No active/played bids, skipping\n`);
          skipped++;
          continue;
        }

        // Calculate globalMediaAggregate (sum of all bid amounts)
        const globalMediaAggregate = bids.reduce((sum, bid) => sum + bid.amount, 0);

        // Find globalMediaBidTop (highest individual bid)
        const topBid = bids.reduce((max, bid) => bid.amount > max.amount ? bid : max, bids[0]);
        const globalMediaBidTop = topBid.amount;
        const globalMediaBidTopUser = topBid.userId?._id || topBid.userId;

        // Calculate user aggregates to find globalMediaAggregateTop
        const userAggregates = {};
        bids.forEach(bid => {
          const userId = bid.userId?._id?.toString() || bid.userId?.toString();
          if (!userAggregates[userId]) {
            userAggregates[userId] = {
              userId: bid.userId?._id || bid.userId,
              total: 0
            };
          }
          userAggregates[userId].total += bid.amount;
        });

        // Find user with highest aggregate
        const topAggregate = Object.values(userAggregates).reduce(
          (max, user) => user.total > max.total ? user : max,
          { total: 0, userId: null }
        );
        const globalMediaAggregateTop = topAggregate.total;
        const globalMediaAggregateTopUser = topAggregate.userId;

        // Update the media document
        const updateFields = {
          globalMediaAggregate,
          globalMediaBidTop,
          globalMediaBidTopUser,
          globalMediaAggregateTop,
          globalMediaAggregateTopUser
        };

        await Media.findByIdAndUpdate(media._id, updateFields);

        console.log(`  ✅ Updated metrics:`);
        console.log(`     - globalMediaAggregate: £${globalMediaAggregate.toFixed(2)}`);
        console.log(`     - globalMediaBidTop: £${globalMediaBidTop.toFixed(2)} (by ${topBid.userId?.username || 'unknown'})`);
        console.log(`     - globalMediaAggregateTop: £${globalMediaAggregateTop.toFixed(2)}`);
        console.log(``);

        updated++;

      } catch (error) {
        console.error(`  ❌ Error processing ${media.title}:`, error.message);
        errors++;
      }
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Backfill Summary:`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Successfully updated: ${updated} media items`);
    console.log(`⏭️  Skipped (no bids): ${skipped} media items`);
    console.log(`❌ Errors: ${errors} media items`);
    console.log(`📝 Total processed: ${mediaWithBids.length} media items`);
    console.log(`${'='.repeat(60)}\n`);

    // Verification - show some examples
    console.log('🔍 Verification - Sample updated media:\n');
    const samples = await Media.find({ 
      globalMediaAggregate: { $gt: 0 } 
    })
    .select('title globalMediaAggregate globalMediaBidTop globalMediaAggregateTop')
    .limit(5);

    samples.forEach(sample => {
      console.log(`📀 ${sample.title}`);
      console.log(`   Aggregate: £${sample.globalMediaAggregate?.toFixed(2) || 0}`);
      console.log(`   Top Bid: £${sample.globalMediaBidTop?.toFixed(2) || 0}`);
      console.log(`   Top User Aggregate: £${sample.globalMediaAggregateTop?.toFixed(2) || 0}\n`);
    });

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run backfill if called directly
if (require.main === module) {
  backfillMediaBidMetrics()
    .then(() => {
      console.log('🎉 Media bid metrics backfill completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Media bid metrics backfill failed:', error);
      process.exit(1);
    });
}

module.exports = backfillMediaBidMetrics;

