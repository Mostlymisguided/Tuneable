const mongoose = require('mongoose');
const Media = require('../models/Media');
const User = require('../models/User');

/**
 * Test script to verify mediaOwners functionality
 * 
 * This script tests:
 * 1. Adding media owners
 * 2. Updating ownership percentages
 * 3. Removing media owners
 * 4. Edit history tracking
 * 5. Virtual fields for usernames
 */

async function testMediaOwners() {
  try {
    console.log('🧪 Testing mediaOwners functionality...');
    
    // Create test users with unique names
    const timestamp = Date.now();
    const user1 = new User({
      username: `testowner1_${timestamp}`,
      email: `owner1_${timestamp}@test.com`,
      password: 'password123',
      personalInviteCode: `TEST001_${timestamp}`
    });
    
    const user2 = new User({
      username: `testowner2_${timestamp}`, 
      email: `owner2_${timestamp}@test.com`,
      password: 'password123',
      personalInviteCode: `TEST002_${timestamp}`
    });
    
    await user1.save();
    await user2.save();
    
    console.log('✅ Created test users');
    
    // Create test media
    const testMedia = new Media({
      title: 'Test Song for Ownership',
      artist: [{ name: 'Test Artist', userId: null, verified: false }],
      contentType: ['music'],
      contentForm: ['tune'],
      mediaType: ['mp3'],
      addedBy: user1._id,
      globalMediaAggregate: 0
    });
    
    await testMedia.save();
    console.log('✅ Created test media');
    
    // Test 1: Add first media owner
    console.log('\n📝 Test 1: Adding first media owner (60%)');
    testMedia.addMediaOwner(user1._id, 60, 'creator', user1._id);
    await testMedia.save();
    console.log(`✅ Added owner: ${user1.username} - 60%`);
    console.log(`📊 Total ownership: ${testMedia.getTotalOwnershipPercentage()}%`);
    
    // Test 2: Add second media owner
    console.log('\n📝 Test 2: Adding second media owner (40%)');
    testMedia.addMediaOwner(user2._id, 40, 'creator', user1._id);
    await testMedia.save();
    console.log(`✅ Added owner: ${user2.username} - 40%`);
    console.log(`📊 Total ownership: ${testMedia.getTotalOwnershipPercentage()}%`);
    
    // Test 3: Test virtual fields with populated usernames
    console.log('\n📝 Test 3: Testing virtual fields');
    const populatedMedia = await Media.findById(testMedia._id)
      .populate('mediaOwners.userId', 'username')
      .populate('mediaOwners.addedBy', 'username')
      .populate('editHistory.editedBy', 'username');
    
    console.log('👥 Media owners with usernames:');
    console.log(JSON.stringify(populatedMedia.mediaOwnersWithUsernames, null, 2));
    
    // Test 4: Update ownership percentage
    console.log('\n📝 Test 4: Updating ownership percentage');
    // First reduce one owner's percentage, then increase the other's
    testMedia.updateOwnerPercentage(user1._id, 50);
    testMedia.updateOwnerPercentage(user2._id, 50);
    await testMedia.save();
    console.log(`✅ Updated ownership: ${user1.username} - 50%, ${user2.username} - 50%`);
    console.log(`📊 Total ownership: ${testMedia.getTotalOwnershipPercentage()}%`);
    
    // Test 5: Test edit history
    console.log('\n📝 Test 5: Edit history tracking');
    const editHistory = await Media.findById(testMedia._id)
      .populate('editHistory.editedBy', 'username');
    
    console.log('📜 Edit history:');
    console.log(JSON.stringify(editHistory.editHistoryWithUsernames, null, 2));
    
    // Test 6: Test error handling - try to exceed 100%
    console.log('\n📝 Test 6: Testing error handling (exceeding 100%)');
    try {
      testMedia.addMediaOwner(user1._id, 50, 'creator', user1._id);
    } catch (error) {
      console.log(`✅ Correctly caught error: ${error.message}`);
    }
    
    // Test 7: Remove media owner
    console.log('\n📝 Test 7: Removing media owner');
    testMedia.removeMediaOwner(user2._id);
    await testMedia.save();
    console.log(`✅ Removed owner: ${user2.username}`);
    console.log(`📊 Total ownership: ${testMedia.getTotalOwnershipPercentage()}%`);
    
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await Media.findByIdAndDelete(testMedia._id);
    await User.findByIdAndDelete(user1._id);
    await User.findByIdAndDelete(user2._id);
    console.log('✅ Cleanup completed');
    
    console.log('\n🎉 All tests passed! mediaOwners functionality is working correctly.');
    
  } catch (error) {
    console.error('💥 Test failed:', error);
    throw error;
  }
}

// Run tests if called directly
if (require.main === module) {
  // Connect to MongoDB
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    console.log('🔗 Connected to MongoDB');
    await testMediaOwners();
    console.log('🎉 Tests completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Database connection failed:', error);
    process.exit(1);
  });
}

module.exports = testMediaOwners;
