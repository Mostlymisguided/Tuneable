#!/usr/bin/env node

/**
 * TuneBytes Migration Script
 * 
 * This script calculates TuneBytes for all existing bids in the system.
 * It should be run once after implementing the TuneBytes system to backfill
 * rewards for users who have already placed bids.
 * 
 * Usage: node scripts/migrateTuneBytes.js [--dry-run] [--batch-size=100]
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const User = require('../models/User');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');
const tuneBytesService = require('../services/tuneBytesService');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 100;

console.log('🚀 TuneBytes Migration Script');
console.log('==============================');
console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE RUN'}`);
console.log(`Batch Size: ${batchSize}`);
console.log('');

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/tuneable', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

async function getBidsToProcess() {
  console.log('📊 Analyzing existing bids...');
  
  // Get all active/played bids
  const bids = await Bid.find({
    status: { $in: ['active', 'played'] }
  }).populate(['userId', 'mediaId']).sort({ createdAt: 1 });
  
  console.log(`Found ${bids.length} bids to process`);
  
  // Group by media to understand the scope
  const mediaGroups = {};
  bids.forEach(bid => {
    if (bid.mediaId && bid.mediaId._id) {
      const mediaId = bid.mediaId._id.toString();
      if (!mediaGroups[mediaId]) {
        mediaGroups[mediaId] = [];
      }
      mediaGroups[mediaId].push(bid);
    }
  });
  
  console.log(`Found ${Object.keys(mediaGroups).length} unique media items`);
  
  return { bids, mediaGroups };
}

async function processBatch(bids, startIndex) {
  const endIndex = Math.min(startIndex + batchSize, bids.length);
  const batch = bids.slice(startIndex, endIndex);
  
  console.log(`\n📦 Processing batch ${Math.floor(startIndex / batchSize) + 1} (bids ${startIndex + 1}-${endIndex})`);
  
  let processed = 0;
  let errors = 0;
  let totalTuneBytesAwarded = 0;
  
  for (const bid of batch) {
    try {
      if (isDryRun) {
        // In dry run, just calculate what would be awarded
        const calculation = await tuneBytesService.calculateTuneBytesForBid(bid._id);
        if (calculation.tuneBytesEarned > 0) {
          totalTuneBytesAwarded += calculation.tuneBytesEarned;
          console.log(`  [DRY RUN] Would award ${calculation.tuneBytesEarned.toFixed(2)} TuneBytes to ${bid.userId.username} for bid on "${bid.mediaId.title}"`);
        }
      } else {
        // Live run - actually award TuneBytes
        const result = await tuneBytesService.awardTuneBytesForBid(bid._id);
        if (result.tuneBytesEarned > 0) {
          totalTuneBytesAwarded += result.tuneBytesEarned;
          console.log(`  ✅ Awarded ${result.tuneBytesEarned.toFixed(2)} TuneBytes to ${bid.userId.username} for bid on "${bid.mediaId.title}"`);
        }
      }
      processed++;
    } catch (error) {
      console.error(`  ❌ Error processing bid ${bid._id}:`, error.message);
      errors++;
    }
  }
  
  console.log(`  📈 Batch complete: ${processed} processed, ${errors} errors, ${totalTuneBytesAwarded.toFixed(2)} total TuneBytes ${isDryRun ? 'would be' : ''} awarded`);
  
  return { processed, errors, totalTuneBytesAwarded };
}

async function generateReport(mediaGroups, totalStats) {
  console.log('\n📋 Migration Report');
  console.log('===================');
  
  // Top media by bid count
  const mediaStats = Object.entries(mediaGroups).map(([mediaId, bids]) => ({
    mediaId,
    title: bids[0].mediaId.title,
    artist: bids[0].mediaId.artist?.[0]?.name || 'Unknown',
    bidCount: bids.length,
    totalValue: bids.reduce((sum, bid) => sum + bid.amount, 0)
  })).sort((a, b) => b.bidCount - a.bidCount);
  
  console.log('\n🎵 Top 10 Media by Bid Count:');
  mediaStats.slice(0, 10).forEach((media, index) => {
    console.log(`  ${index + 1}. "${media.title}" by ${media.artist} - ${media.bidCount} bids, £${media.totalValue.toFixed(2)}`);
  });
  
  console.log('\n📊 Overall Statistics:');
  console.log(`  Total Bids Processed: ${totalStats.totalProcessed}`);
  console.log(`  Total Errors: ${totalStats.totalErrors}`);
  console.log(`  Total TuneBytes ${isDryRun ? 'Would Be' : ''} Awarded: ${totalStats.totalTuneBytesAwarded.toFixed(2)}`);
  console.log(`  Average TuneBytes per Bid: ${(totalStats.totalTuneBytesAwarded / totalStats.totalProcessed).toFixed(2)}`);
  
  if (!isDryRun) {
    console.log('\n✅ Migration completed successfully!');
    console.log('Users can now see their TuneBytes in their profile and dashboard.');
  } else {
    console.log('\n🔍 Dry run completed. No changes were made.');
    console.log('Run without --dry-run to execute the actual migration.');
  }
}

async function main() {
  try {
    await connectToDatabase();
    
    const { bids, mediaGroups } = await getBidsToProcess();
    
    if (bids.length === 0) {
      console.log('ℹ️  No bids found to process. Migration not needed.');
      return;
    }
    
    // Process bids in batches
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalTuneBytesAwarded = 0;
    
    for (let i = 0; i < bids.length; i += batchSize) {
      const batchStats = await processBatch(bids, i);
      totalProcessed += batchStats.processed;
      totalErrors += batchStats.errors;
      totalTuneBytesAwarded += batchStats.totalTuneBytesAwarded;
      
      // Small delay between batches to avoid overwhelming the database
      if (i + batchSize < bids.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    await generateReport(mediaGroups, {
      totalProcessed,
      totalErrors,
      totalTuneBytesAwarded
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️  Migration interrupted by user');
  await mongoose.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Migration terminated');
  await mongoose.disconnect();
  process.exit(0);
});

// Run the migration
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
