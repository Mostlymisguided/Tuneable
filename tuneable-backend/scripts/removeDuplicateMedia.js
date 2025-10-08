const mongoose = require('mongoose');
require('dotenv').config();

const Media = require('../models/Media');
const Bid = require('../models/Bid');

async function removeDuplicates() {
  try {
    console.log('🧹 Starting duplicate Media cleanup...');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find all duplicates by title and artist name
    const duplicates = await Media.aggregate([
      {
        $project: {
          title: 1,
          artistName: { $arrayElemAt: ['$artist.name', 0] },
          globalBidValue: 1,
          createdAt: 1,
          _id: 1
        }
      },
      {
        $group: {
          _id: { title: '$title', artist: '$artistName' },
          count: { $sum: 1 },
          docs: { 
            $push: { 
              id: '$_id', 
              bidValue: '$globalBidValue',
              createdAt: '$createdAt'
            } 
          }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);
    
    console.log(`\n📊 Found ${duplicates.length} sets of duplicates`);
    
    let totalRemoved = 0;
    
    for (const dupGroup of duplicates) {
      // Sort docs by createdAt (keep newest) then by bidValue (keep highest)
      const sorted = dupGroup.docs.sort((a, b) => {
        // First, prefer the one with highest bid value
        if (b.bidValue !== a.bidValue) {
          return b.bidValue - a.bidValue;
        }
        // If same bid value, prefer newest
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      
      const keepId = sorted[0].id;
      const removeIds = sorted.slice(1).map(d => d.id);
      
      console.log(`\n🔄 Processing: ${dupGroup._id.title} by ${dupGroup._id.artist}`);
      console.log(`   Keeping: ${keepId} (£${sorted[0].bidValue})`);
      console.log(`   Removing: ${removeIds.length} duplicates`);
      
      // Update any bids that reference the duplicates to point to the kept one
      for (const removeId of removeIds) {
        await Bid.updateMany(
          { mediaId: removeId },
          { $set: { mediaId: keepId } }
        );
      }
      
      // Delete the duplicate Media items
      const result = await Media.deleteMany({ _id: { $in: removeIds } });
      totalRemoved += result.deletedCount;
      
      console.log(`   ✅ Removed ${result.deletedCount} duplicates`);
    }
    
    console.log(`\n🎊 Cleanup completed successfully!`);
    console.log(`📊 Total duplicates removed: ${totalRemoved}`);
    
    // Re-count
    const totalMedia = await Media.countDocuments();
    console.log(`📊 Remaining media items: ${totalMedia}`);
    
  } catch (error) {
    console.error('💥 Cleanup failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

if (require.main === module) {
  removeDuplicates()
    .then(() => {
      console.log('✅ Duplicate removal script completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Duplicate removal script failed:', err);
      process.exit(1);
    });
}

module.exports = removeDuplicates;

