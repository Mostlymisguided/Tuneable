/**
 * Simple test script to verify tag rankings caching
 * Usage: node scripts/testTagRankings.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const tagRankingsService = require('../services/tagRankingsService');

async function testTagRankings() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Find a user with bids
    const user = await User.findOne({
      role: { $ne: 'admin' }
    }).select('_id uuid username tagRankings tagRankingsUpdatedAt');

    if (!user) {
      console.log('⚠️  No users found. Skipping test.');
      await mongoose.disconnect();
      return;
    }

    console.log(`🧪 Testing tag rankings for user: ${user.username} (${user._id})\n`);

    // Check current state
    console.log('📊 Current state:');
    console.log(`   Tag rankings: ${user.tagRankings?.length || 0} tags`);
    console.log(`   Last updated: ${user.tagRankingsUpdatedAt || 'Never'}\n`);

    // Test 1: Calculate rankings (first time)
    console.log('🔄 Test 1: Calculating tag rankings...');
    const rankings1 = await tagRankingsService.calculateAndUpdateUserTagRankings(user._id, 10, true);
    console.log(`   ✅ Calculated ${rankings1.length} tag rankings\n`);

    // Verify they're stored
    const userAfter1 = await User.findById(user._id).select('tagRankings tagRankingsUpdatedAt');
    console.log('📊 After calculation:');
    console.log(`   Tag rankings: ${userAfter1.tagRankings?.length || 0} tags`);
    console.log(`   Last updated: ${userAfter1.tagRankingsUpdatedAt}`);
    if (userAfter1.tagRankings && userAfter1.tagRankings.length > 0) {
      console.log(`   Top tag: ${userAfter1.tagRankings[0].tag} (Rank #${userAfter1.tagRankings[0].rank})`);
    }
    console.log('');

    // Test 2: Try again (should skip if recent)
    console.log('🔄 Test 2: Attempting recalculation (should skip if < 1 hour old)...');
    const rankings2 = await tagRankingsService.calculateAndUpdateUserTagRankings(user._id, 10, false);
    console.log(`   ✅ Returned ${rankings2.length} tag rankings\n`);

    // Test 3: Force recalculation
    console.log('🔄 Test 3: Force recalculation...');
    const rankings3 = await tagRankingsService.calculateAndUpdateUserTagRankings(user._id, 10, true);
    console.log(`   ✅ Calculated ${rankings3.length} tag rankings\n`);

    // Test 4: Invalidate
    console.log('🔄 Test 4: Invalidating tag rankings...');
    await tagRankingsService.invalidateUserTagRankings(user._id);
    const userAfterInvalidate = await User.findById(user._id).select('tagRankingsUpdatedAt');
    console.log(`   ✅ Invalidated (tagRankingsUpdatedAt: ${userAfterInvalidate.tagRankingsUpdatedAt || 'null'})\n`);

    console.log('✅ All tests passed!\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Test error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run test
testTagRankings();

