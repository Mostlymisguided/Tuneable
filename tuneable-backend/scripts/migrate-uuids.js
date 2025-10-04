const mongoose = require('mongoose');
const { uuidv7 } = require('uuidv7');
require('dotenv').config();

// Import models
const Song = require('../models/Song');
const Party = require('../models/Party');
const Bid = require('../models/Bid');
const User = require('../models/User');

async function connectDB() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function migrateUsers() {
  console.log('\n👤 Migrating Users...');
  
  const usersToMigrate = await User.find({ uuid: { $exists: false } });
  console.log(`📊 Found ${usersToMigrate.length} users to migrate`);

  if (usersToMigrate.length === 0) {
    console.log('✅ No users need migration');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const user of usersToMigrate) {
    try {
      await User.findByIdAndUpdate(user._id, {
        uuid: uuidv7()
      });
      console.log(`✅ Updated user: ${user.username}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error updating user ${user._id}:`, error.message);
      errorCount++;
    }
  }

  console.log(`📈 Users Migration Summary: ${successCount} success, ${errorCount} errors`);
}

async function migrateSongs() {
  console.log('\n🎵 Migrating Songs...');
  
  const songsToMigrate = await Song.find({ uuid: { $exists: false } });
  console.log(`📊 Found ${songsToMigrate.length} songs to migrate`);

  if (songsToMigrate.length === 0) {
    console.log('✅ No songs need migration');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const song of songsToMigrate) {
    try {
      // Get addedBy user UUID
      const addedByUser = await User.findById(song.addedBy);
      const addedBy_uuid = addedByUser ? addedByUser.uuid : null;

      await Song.findByIdAndUpdate(song._id, {
        uuid: uuidv7(),
        addedBy_uuid: addedBy_uuid
      });
      console.log(`✅ Updated song: ${song.title}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error updating song ${song._id}:`, error.message);
      errorCount++;
    }
  }

  console.log(`📈 Songs Migration Summary: ${successCount} success, ${errorCount} errors`);
}

async function migrateParties() {
  console.log('\n🎉 Migrating Parties...');
  
  const partiesToMigrate = await Party.find({ uuid: { $exists: false } });
  console.log(`📊 Found ${partiesToMigrate.length} parties to migrate`);

  if (partiesToMigrate.length === 0) {
    console.log('✅ No parties need migration');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const party of partiesToMigrate) {
    try {
      // Get host UUID
      const hostUser = await User.findById(party.host);
      const host_uuid = hostUser ? hostUser.uuid : null;

      // Get attendee UUIDs
      const attendeeUsers = await User.find({ _id: { $in: party.attendees } });
      const attendee_uuids = attendeeUsers.map(user => user.uuid);

      // Update songs in party with UUIDs
      const updatedSongs = await Promise.all(party.songs.map(async (songEntry) => {
        const song = await Song.findById(songEntry.songId);
        const episode = songEntry.episodeId ? await require('../models/PodcastEpisode').findById(songEntry.episodeId) : null;
        const addedByUser = await User.findById(songEntry.addedBy);
        const vetoedByUser = songEntry.vetoedBy ? await User.findById(songEntry.vetoedBy) : null;

        return {
          ...songEntry.toObject(),
          song_uuid: song ? song.uuid : null,
          episode_uuid: episode ? episode.uuid : null,
          addedBy_uuid: addedByUser ? addedByUser.uuid : null,
          vetoedBy_uuid: vetoedByUser ? vetoedByUser.uuid : null
        };
      }));

      await Party.findByIdAndUpdate(party._id, {
        uuid: uuidv7(),
        host_uuid: host_uuid,
        attendee_uuids: attendee_uuids,
        songs: updatedSongs
      });
      console.log(`✅ Updated party: ${party.name}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error updating party ${party._id}:`, error.message);
      errorCount++;
    }
  }

  console.log(`📈 Parties Migration Summary: ${successCount} success, ${errorCount} errors`);
}

async function migrateBids() {
  console.log('\n💰 Migrating Bids...');
  
  const bidsToMigrate = await Bid.find({ uuid: { $exists: false } });
  console.log(`📊 Found ${bidsToMigrate.length} bids to migrate`);

  if (bidsToMigrate.length === 0) {
    console.log('✅ No bids need migration');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const bid of bidsToMigrate) {
    try {
      // Get related UUIDs
      const user = await User.findById(bid.userId);
      const party = await Party.findById(bid.partyId);
      const song = bid.songId ? await Song.findById(bid.songId) : null;
      const episode = bid.episodeId ? await require('../models/PodcastEpisode').findById(bid.episodeId) : null;

      await Bid.findByIdAndUpdate(bid._id, {
        uuid: uuidv7(),
        user_uuid: user ? user.uuid : null,
        party_uuid: party ? party.uuid : null,
        song_uuid: song ? song.uuid : null,
        episode_uuid: episode ? episode.uuid : null
      });
      console.log(`✅ Updated bid: ${bid.amount} by ${user ? user.username : 'unknown'}`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error updating bid ${bid._id}:`, error.message);
      errorCount++;
    }
  }

  console.log(`📈 Bids Migration Summary: ${successCount} success, ${errorCount} errors`);
}

async function migrateAll() {
  try {
    console.log('🚀 Starting UUID migration...');
    
    // Migrate in order of dependencies
    await migrateUsers();
    await migrateSongs();
    await migrateParties();
    await migrateBids();

    console.log('\n🎉 UUID migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

async function main() {
  await connectDB();
  await migrateAll();
}

main().catch(console.error);
