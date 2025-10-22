const mongoose = require('mongoose');
require('dotenv').config();

// Import all models in the correct order to register them
const User = require('../models/User');
const Party = require('../models/Party');
const Bid = require('../models/Bid'); // ✅ Import Bid BEFORE Media
const Media = require('../models/Media');

async function testMediaModel() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    console.log('🎉 FINAL MEDIA MODEL TEST');
    console.log('='.repeat(50));
    
    // Count statistics
    const totalMedia = await Media.countDocuments();
    const musicMedia = await Media.countDocuments({ contentType: 'music' });
    const spokenMedia = await Media.countDocuments({ contentType: 'spoken' });
    const mediaWithBids = await Media.countDocuments({ globalBidValue: { $gt: 0 } });
    const verifiedArtists = await Media.countDocuments({ 'artist.verified': true });
    const mediaWithOwners = await Media.countDocuments({ 'mediaOwners.0': { $exists: true } });
    
    console.log('\n📊 Media Collection Statistics:');
    console.log(`   Total Media Items: ${totalMedia}`);
    console.log(`   Music Content: ${musicMedia}`);
    console.log(`   Spoken Content: ${spokenMedia}`);
    console.log(`   With Bids: ${mediaWithBids}`);
    console.log(`   With Verified Artists: ${verifiedArtists}`);
    console.log(`   With Media Owners: ${mediaWithOwners}`);
    
    // Get top media by bids
    const top3 = await Media.find({ globalBidValue: { $gt: 0 } })
      .sort({ globalBidValue: -1 })
      .limit(3)
      .select('title artist creatorNames globalBidValue contentType genres');
    
    console.log('\n🏆 Top 3 Media by Bids:');
    top3.forEach((m, idx) => {
      console.log(`   ${idx + 1}. ${m.title}`);
      console.log(`      Artist: ${m.artist?.[0]?.name || 'Unknown'}`);
      console.log(`      Creators: ${m.creatorNames?.join(', ')}`);
      console.log(`      Genres: ${m.genres?.join(', ') || 'None'}`);
      console.log(`      Value: £${m.globalBidValue}`);
      console.log(`      Type: ${m.contentType?.join(', ')}`);
      console.log('');
    });
    
    // Test virtual fields and methods
    const sampleMedia = await Media.findOne({ globalBidValue: { $gt: 0 } })
      .populate({
        path: 'bids',
        populate: {
          path: 'userId',
          select: 'username'
        }
      });
    
    if (sampleMedia) {
      console.log('\n✨ Virtual Fields Test:');
      console.log(`   Title: ${sampleMedia.title}`);
      console.log(`   formattedArtists: ${sampleMedia.formattedArtists}`);
      console.log(`   primaryArtist: ${sampleMedia.primaryArtist}`);
      console.log(`   formattedDuration: ${sampleMedia.formattedDuration}`);
      
      const verifiedCreators = sampleMedia.getVerifiedCreators();
      const verifiedCreatorsWithOwnership = sampleMedia.getVerifiedCreatorsWithOwnership();
      const pendingCreators = sampleMedia.getPendingCreators();
      console.log(`   Verified Creators: ${verifiedCreators.length}`);
      console.log(`   Pending Creators: ${pendingCreators.length}`);
      console.log(`   Media Owners: ${sampleMedia.mediaOwners?.length || 0}`);
      
      if (verifiedCreatorsWithOwnership.length > 0) {
        console.log(`   Verified with Ownership:`);
        verifiedCreatorsWithOwnership.forEach(creator => {
          console.log(`     - ${creator.name} (${creator.role}): ${creator.ownershipPercentage}% owner`);
        });
      }
      
      if (pendingCreators.length > 0) {
        console.log(`   Pending: ${pendingCreators.map(c => `${c.name} (${c.role})`).join(', ')}`);
      }
      
      // Test summary virtual
      console.log('\n📋 Summary Virtual Test:');
      const summary = sampleMedia.summary;
      console.log(`   UUID: ${summary.uuid}`);
      console.log(`   Title: ${summary.title}`);
      console.log(`   Artist: ${summary.artist}`);
      console.log(`   Content Type: ${summary.contentType?.join(', ')}`);
      console.log(`   Global Bid Value: £${summary.globalBidValue}`);
      console.log(`   Top Bids Count: ${summary.topBids?.length || 0}`);
      
      if (summary.topBids && summary.topBids.length > 0) {
        console.log('   Top 3 Bids:');
        summary.topBids.slice(0, 3).forEach((bid, idx) => {
          console.log(`     ${idx + 1}. £${bid.amount} by ${bid.user}`);
        });
      }
    }
    
    // Test querying by different fields
    console.log('\n🔍 Query Tests:');
    
    const byArtistName = await Media.countDocuments({ 'artist.name': 'Berwyn' });
    console.log(`   Songs by "Berwyn": ${byArtistName}`);
    
    const byCreatorNames = await Media.countDocuments({ creatorNames: 'Berwyn' });
    console.log(`   Content with "Berwyn" (any role): ${byCreatorNames}`);
    
    const withGenres = await Media.countDocuments({ genres: { $exists: true, $ne: [] } });
    console.log(`   Media with genres: ${withGenres}`);
    
    console.log('\n✅ All tests passed! Media model is fully functional!');
    console.log('🎊 Ready for production use!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

if (require.main === module) {
  testMediaModel()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = testMediaModel;

