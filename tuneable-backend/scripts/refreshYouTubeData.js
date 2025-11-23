#!/usr/bin/env node

/**
 * YouTube Data Refresh Script
 * 
 * This script refreshes YouTube video availability for all media items.
 * It checks if videos are still available without overwriting manually edited titles/artists.
 * 
 * Run monthly via cron or manually:
 * node scripts/refreshYouTubeData.js
 * 
 * Options:
 * --force: Refresh all items regardless of last refresh time
 * --batch-size: Number of items to process per batch (default: 50)
 * --delay: Delay in ms between batches (default: 1000)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { refreshAllYouTubeData } = require('../services/youtubeRefreshService');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tuneable';

// Parse command line arguments
const args = process.argv.slice(2);
const force = args.includes('--force');
const batchSizeIndex = args.indexOf('--batch-size');
const delayIndex = args.indexOf('--delay');

const batchSize = batchSizeIndex !== -1 && args[batchSizeIndex + 1] 
  ? parseInt(args[batchSizeIndex + 1]) 
  : 50;

const delay = delayIndex !== -1 && args[delayIndex + 1] 
  ? parseInt(args[delayIndex + 1]) 
  : 1000;

async function main() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const options = {
      batchSize,
      delayBetweenBatches: delay,
      onlyRefreshOlderThan: force ? new Date(0) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago, or all if force
    };

    console.log(`\n⚙️  Options:`, options);
    if (force) {
      console.log('⚠️  FORCE MODE: Refreshing all items regardless of last refresh time');
    }

    const summary = await refreshAllYouTubeData(options);

    console.log('\n📈 Final Summary:');
    console.log(`   Total items: ${summary.total}`);
    console.log(`   Processed: ${summary.processed}`);
    console.log(`   Available: ${summary.available}`);
    console.log(`   Unavailable: ${summary.unavailable}`);
    console.log(`   Errors: ${summary.errors}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

main();

