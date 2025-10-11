/**
 * Migration Script: Backfill Denormalized Fields in Existing Bids
 * 
 * This script populates the new denormalized fields for all existing bids
 * that were created before the migration.
 * 
 * Usage: node scripts/backfillBidFields.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be updated without making changes
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const User = require('../models/User');
const Party = require('../models/Party');
const Media = require('../models/Media');
const Song = require('../models/Song');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable';
const DRY_RUN = process.argv.includes('--dry-run');

async function backfillBids() {
    try {
        console.log('🚀 Starting Bid Migration...\n');
        console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✍️  LIVE (will update database)'}\n`);
        
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find all bids that need migration (missing username field)
        const bidsToMigrate = await Bid.find({ 
            username: { $exists: false } 
        });

        console.log(`📊 Found ${bidsToMigrate.length} bids to migrate\n`);

        if (bidsToMigrate.length === 0) {
            console.log('✅ All bids are already up to date!');
            return;
        }

        if (DRY_RUN) {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('DRY RUN - Showing first 5 bids that would be updated:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        for (let i = 0; i < bidsToMigrate.length; i++) {
            const bid = bidsToMigrate[i];
            
            try {
                // Show progress every 10 bids
                if (i > 0 && i % 10 === 0) {
                    console.log(`Progress: ${i}/${bidsToMigrate.length} bids processed...`);
                }

                // Fetch referenced documents
                const user = await User.findById(bid.userId);
                const party = await Party.findById(bid.partyId);
                
                // Get media (try mediaId first, fall back to songId/episodeId)
                let media = null;
                if (bid.mediaId) {
                    media = await Media.findById(bid.mediaId);
                } else if (bid.songId) {
                    media = await Song.findById(bid.songId);
                } else if (bid.episodeId) {
                    const PodcastEpisode = require('../models/PodcastEpisode');
                    media = await PodcastEpisode.findById(bid.episodeId);
                }

                // Check if we have all required data
                if (!user || !party || !media) {
                    throw new Error(`Missing references: user=${!!user}, party=${!!party}, media=${!!media}`);
                }

                // Prepare update data
                // Note: party.type is the party type (remote/live), not party.privacy (public/private)
                const updateData = {
                    // Required fields
                    username: user.username || 'Unknown User',
                    partyName: party.name || 'Unknown Party',
                    mediaTitle: media.title || 'Unknown Media',
                    partyType: party.type && ['remote', 'live'].includes(party.type) ? party.type : 'remote',
                    
                    // Recommended fields
                    mediaArtist: Array.isArray(media.artist) && media.artist.length > 0 
                        ? media.artist[0].name 
                        : (typeof media.artist === 'string' ? media.artist : 'Unknown Artist'),
                    mediaCoverArt: media.coverArt,
                    mediaContentType: media.contentType,
                    mediaContentForm: media.contentForm,
                    mediaDuration: media.duration,
                    
                    // Set platform to unknown for legacy bids
                    platform: 'unknown',
                    
                    // Can't determine these for legacy bids, set to null/defaults
                    isInitialBid: null,
                    queuePosition: null,
                    queueSize: null
                };

                // Calculate time fields if createdAt exists
                if (bid.createdAt) {
                    const date = new Date(bid.createdAt);
                    updateData.dayOfWeek = date.getDay();
                    updateData.hourOfDay = date.getHours();
                }

                // Show sample in dry-run mode
                if (DRY_RUN && i < 5) {
                    console.log(`Bid ${i + 1}:`);
                    console.log(`  Amount: £${bid.amount.toFixed(2)}`);
                    console.log(`  Created: ${bid.createdAt}`);
                    console.log(`  Would add:`);
                    console.log(`    - username: "${updateData.username}"`);
                    console.log(`    - partyName: "${updateData.partyName}"`);
                    console.log(`    - mediaTitle: "${updateData.mediaTitle}"`);
                    console.log(`    - partyType: "${updateData.partyType}"`);
                    console.log(`    - mediaArtist: "${updateData.mediaArtist}"`);
                    console.log(`    - dayOfWeek: ${updateData.dayOfWeek} (${getDayName(updateData.dayOfWeek)})`);
                    console.log(`    - hourOfDay: ${updateData.hourOfDay}:00`);
                    console.log('');
                }

                // Update the bid if not in dry-run mode
                if (!DRY_RUN) {
                    Object.assign(bid, updateData);
                    await bid.save();
                }

                successCount++;

            } catch (error) {
                errorCount++;
                errors.push({
                    bidId: bid._id,
                    error: error.message
                });
                
                if (!DRY_RUN) {
                    console.log(`❌ Error migrating bid ${bid._id}: ${error.message}`);
                }
            }
        }

        // Summary
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 MIGRATION SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        if (DRY_RUN) {
            console.log(`Would migrate: ${successCount} bids`);
            console.log(`Would fail: ${errorCount} bids`);
            console.log('\n💡 Run without --dry-run to actually update the database');
        } else {
            console.log(`✅ Successfully migrated: ${successCount} bids`);
            console.log(`❌ Failed: ${errorCount} bids`);
            
            if (errorCount > 0) {
                console.log('\nFailed bids:');
                errors.forEach(err => {
                    console.log(`  - ${err.bidId}: ${err.error}`);
                });
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (!DRY_RUN && successCount > 0) {
            console.log('\n🎉 Migration complete! All bids now have denormalized fields.');
            console.log('🚀 Run "node scripts/testBidFields.js" to verify.');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

function getDayName(dayOfWeek) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek] || 'Unknown';
}

// Run the migration
backfillBids();

