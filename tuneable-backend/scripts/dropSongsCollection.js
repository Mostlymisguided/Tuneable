/**
 * Drop Songs Collection
 * 
 * This script drops the legacy Songs collection from the database.
 * Run this ONLY after verifying all Songs have been migrated to Media.
 * 
 * Usage: node scripts/dropSongsCollection.js [--dry-run]
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable';
const DRY_RUN = process.argv.includes('--dry-run');

async function dropSongs() {
    try {
        console.log('🗑️  Song Collection Removal\n');
        console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '⚠️  LIVE (will drop collection)'}\n`);
        
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Check if songs collection exists
        const collections = await mongoose.connection.db.listCollections().toArray();
        const songsExists = collections.some(col => col.name === 'songs');

        if (!songsExists) {
            console.log('✅ Songs collection does not exist. Already removed!');
            return;
        }

        // Count songs before dropping
        const songCount = await mongoose.connection.db.collection('songs').countDocuments();
        console.log(`📊 Found ${songCount} documents in Songs collection\n`);

        if (DRY_RUN) {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`Would drop Songs collection (${songCount} documents)`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            console.log('💡 Run without --dry-run to actually drop the collection\n');
        } else {
            console.log('⚠️  WARNING: About to drop Songs collection!');
            console.log(`This will permanently delete ${songCount} Song documents.\n`);
            
            // Drop the collection
            await mongoose.connection.db.dropCollection('songs');
            
            console.log('✅ Songs collection dropped successfully!\n');
            
            // Verify it's gone
            const collectionsAfter = await mongoose.connection.db.listCollections().toArray();
            const songsExistsAfter = collectionsAfter.some(col => col.name === 'songs');
            
            if (!songsExistsAfter) {
                console.log('✅ Verified: Songs collection no longer exists');
            } else {
                console.log('❌ Error: Songs collection still exists');
            }
        }

    } catch (error) {
        console.error('❌ Error dropping songs collection:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

dropSongs();

