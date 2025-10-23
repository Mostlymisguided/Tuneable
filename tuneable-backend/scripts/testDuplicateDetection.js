/**
 * Test Script: Test Duplicate Media Detection
 * 
 * This script tests that the duplicate detection logic works correctly
 * when adding media to parties.
 */

const mongoose = require('mongoose');
const Media = require('../models/Media');

async function testDuplicateDetection() {
  try {
    console.log('🧪 Testing Duplicate Media Detection...');
    
    // Find some existing media to test with
    const existingMedia = await Media.findOne({}).select('title artist sources');
    
    if (!existingMedia) {
      console.log('❌ No existing media found to test with');
      return;
    }
    
    console.log(`✅ Found test media: "${existingMedia.title}"`);
    console.log(`   Artist: ${existingMedia.artist?.[0]?.name || 'Unknown'}`);
    console.log(`   Sources: ${JSON.stringify(existingMedia.sources)}`);
    
    // Test the duplicate detection logic
    console.log('\n🔍 Testing duplicate detection logic...');
    
    // Test 1: Find by URL
    if (existingMedia.sources) {
      const sources = existingMedia.sources;
      const testUrl = sources.youtube || sources.spotify || sources.upload;
      
      if (testUrl) {
        console.log(`\n📋 Test 1: Finding by URL: ${testUrl}`);
        
        const foundByUrl = await Media.findOne({
          $or: [
            { 'sources.youtube': testUrl },
            { 'sources.spotify': testUrl },
            { 'sources.upload': testUrl }
          ]
        });
        
        if (foundByUrl) {
          console.log(`✅ Found by URL: "${foundByUrl.title}" (${foundByUrl._id})`);
          console.log(`   Match: ${foundByUrl._id.toString() === existingMedia._id.toString()}`);
        } else {
          console.log('❌ Not found by URL');
        }
      }
    }
    
    // Test 2: Find by title + artist
    console.log(`\n📋 Test 2: Finding by title + artist`);
    console.log(`   Title: "${existingMedia.title}"`);
    console.log(`   Artist: "${existingMedia.artist?.[0]?.name || 'Unknown'}"`);
    
    const foundByTitleArtist = await Media.findOne({
      title: existingMedia.title,
      'artist.name': existingMedia.artist?.[0]?.name
    });
    
    if (foundByTitleArtist) {
      console.log(`✅ Found by title + artist: "${foundByTitleArtist.title}" (${foundByTitleArtist._id})`);
      console.log(`   Match: ${foundByTitleArtist._id.toString() === existingMedia._id.toString()}`);
    } else {
      console.log('❌ Not found by title + artist');
    }
    
    // Test 3: Check for actual duplicates in database
    console.log(`\n📋 Test 3: Checking for existing duplicates in database`);
    
    const duplicateCheck = await Media.aggregate([
      {
        $group: {
          _id: {
            title: '$title',
            artistName: '$artist.name'
          },
          count: { $sum: 1 },
          documents: { $push: { id: '$_id', title: '$title', artist: '$artist.name' } }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);
    
    if (duplicateCheck.length > 0) {
      console.log(`⚠️  Found ${duplicateCheck.length} sets of duplicate media:`);
      duplicateCheck.forEach((group, index) => {
        console.log(`   ${index + 1}. "${group._id.title}" by ${group._id.artistName}`);
        console.log(`      Count: ${group.count}`);
        console.log(`      IDs: ${group.documents.map(d => d.id).join(', ')}`);
      });
    } else {
      console.log('✅ No duplicates found in database');
    }
    
    console.log('\n🎉 Duplicate detection test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable')
  .then(async () => {
    console.log('Connected to MongoDB');
    await testDuplicateDetection();
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  });
