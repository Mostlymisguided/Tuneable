#!/usr/bin/env node

const mongoose = require('mongoose');
require('dotenv').config();

async function checkBidValues() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable';
    await mongoose.connect(mongoUri);
    
    const db = mongoose.connection.db;
    const media = db.collection('media');
    
    // Check the document we saw earlier with bid values
    const doc = await media.findOne({ uuid: '068e6713-9ae2-7ab1-83a2-3683eb6c23b7' });
    
    if (doc) {
      console.log('Stop Talking - bid values after migration:');
      console.log({
        title: doc.title,
        globalMediaBidTop: doc.globalMediaBidTop,
        globalMediaAggregateTop: doc.globalMediaAggregateTop,
        globalMediaAggregate: doc.globalMediaAggregate,
        globalMediaBidTopUser: doc.globalMediaBidTopUser,
        globalMediaAggregateTopUser: doc.globalMediaAggregateTopUser
      });
    }
    
    // Check if any documents have non-zero bid values
    const withBids = await media.findOne({ 
      $or: [
        { globalMediaBidTop: { $gt: 0 } },
        { globalMediaAggregateTop: { $gt: 0 } },
        { globalMediaAggregate: { $gt: 0 } }
      ]
    });
    
    if (withBids) {
      console.log('\nFound document with non-zero bid values:', {
        title: withBids.title,
        globalMediaBidTop: withBids.globalMediaBidTop,
        globalMediaAggregateTop: withBids.globalMediaAggregateTop,
        globalMediaAggregate: withBids.globalMediaAggregate
      });
    } else {
      console.log('\n⚠️  No documents found with non-zero bid values!');
      console.log('This suggests the migration may have reset values to 0.');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkBidValues();

