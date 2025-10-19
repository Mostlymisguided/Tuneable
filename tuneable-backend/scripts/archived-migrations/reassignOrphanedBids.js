/**
 * Reassign Script: Move Orphaned Bids to Global Party
 * 
 * This script reassigns bids that reference non-existent parties to the Global Party,
 * preserving historical bid data rather than deleting it.
 * 
 * Usage: node scripts/reassignOrphanedBids.js [--dry-run]
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

// Global Party ID
const GLOBAL_PARTY_ID = '67c6a02895baad05d3a97cf4';

async function reassignOrphanedBids() {
    try {
        console.log('🔄 Starting Orphaned Bid Reassignment...\n');
        console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✍️  LIVE (will reassign bids)'}\n`);
        
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Verify Global Party exists
        const globalParty = await Party.findById(GLOBAL_PARTY_ID);
        if (!globalParty) {
            console.error(`❌ Global Party not found (ID: ${GLOBAL_PARTY_ID})`);
            console.error('Please verify the Global Party ID is correct.');
            return;
        }

        console.log(`✅ Found Global Party: "${globalParty.name}"\n`);

        // Get all bids
        const allBids = await Bid.find({});
        console.log(`📊 Total bids in database: ${allBids.length}\n`);

        const bidsToReassign = [];
        const bidsToDelete = []; // Bids with missing media AND user (unrecoverable)
        let alreadyValid = 0;

        console.log('🔍 Checking each bid...\n');

        for (let i = 0; i < allBids.length; i++) {
            const bid = allBids[i];
            
            if (i > 0 && i % 50 === 0) {
                console.log(`Progress: ${i}/${allBids.length} bids checked...`);
            }

            // Check if party exists
            const party = await Party.findById(bid.partyId);
            
            // Check if user exists
            const user = await User.findById(bid.userId);
            
            // Check if media exists
            let media = null;
            if (bid.mediaId) {
                media = await Media.findById(bid.mediaId);
            } else if (bid.songId) {
                media = await Song.findById(bid.songId);
            } else if (bid.episodeId) {
                const PodcastEpisode = require('../models/PodcastEpisode');
                media = await PodcastEpisode.findById(bid.episodeId);
            }

            // If missing user AND media, can't recover - mark for deletion
            if (!user && !media) {
                bidsToDelete.push({
                    _id: bid._id,
                    amount: bid.amount,
                    reason: 'Missing both user and media'
                });
                continue;
            }

            // If missing party, reassign to Global Party
            if (!party) {
                bidsToReassign.push({
                    bid: bid,
                    user: user,
                    media: media,
                    hasUser: !!user,
                    hasMedia: !!media
                });
            } else {
                alreadyValid++;
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 ANALYSIS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log(`Total bids: ${allBids.length}`);
        console.log(`Already valid: ${alreadyValid}`);
        console.log(`Will reassign to Global Party: ${bidsToReassign.length}`);
        console.log(`Will delete (unrecoverable): ${bidsToDelete.length}\n`);

        // Process reassignments
        if (bidsToReassign.length > 0) {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🔄 REASSIGNING BIDS TO GLOBAL PARTY');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            let reassignedCount = 0;
            let failedCount = 0;

            for (const item of bidsToReassign) {
                try {
                    const { bid, user, media } = item;

                    if (!DRY_RUN) {
                        // Update bid to reference Global Party
                        bid.partyId = globalParty._id;
                        bid.party_uuid = globalParty.uuid;
                        bid.partyName = globalParty.name;
                        bid.partyType = globalParty.type;

                        // If user exists, update username
                        if (user) {
                            bid.username = user.username;
                        } else {
                            bid.username = 'Deleted User';
                        }

                        // If media exists, update media fields
                        if (media) {
                            bid.mediaTitle = media.title;
                            bid.mediaArtist = Array.isArray(media.artist) && media.artist.length > 0 
                                ? media.artist[0].name 
                                : (typeof media.artist === 'string' ? media.artist : 'Unknown Artist');
                            bid.mediaCoverArt = media.coverArt;
                            bid.mediaContentType = media.contentType;
                            bid.mediaContentForm = media.contentForm;
                            bid.mediaDuration = media.duration;
                        } else {
                            bid.mediaTitle = 'Deleted Media';
                            bid.mediaArtist = 'Unknown';
                        }

                        // Set platform to unknown for old bids
                        if (!bid.platform) {
                            bid.platform = 'unknown';
                        }

                        // Calculate time fields if not set
                        if (bid.createdAt && (bid.dayOfWeek === undefined || bid.hourOfDay === undefined)) {
                            const date = new Date(bid.createdAt);
                            bid.dayOfWeek = date.getDay();
                            bid.hourOfDay = date.getHours();
                        }

                        await bid.save();
                        reassignedCount++;
                    }
                } catch (error) {
                    failedCount++;
                    console.log(`❌ Error reassigning bid ${item.bid._id}: ${error.message}`);
                }
            }

            if (DRY_RUN) {
                console.log(`Would reassign ${bidsToReassign.length} bids to Global Party\n`);
            } else {
                console.log(`✅ Reassigned ${reassignedCount} bids to Global Party`);
                console.log(`❌ Failed to reassign: ${failedCount} bids\n`);
            }
        }

        // Process deletions (unrecoverable bids)
        if (bidsToDelete.length > 0) {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🗑️  DELETING UNRECOVERABLE BIDS');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            console.log(`Bids missing both user AND media: ${bidsToDelete.length}`);
            
            if (DRY_RUN) {
                console.log('Sample (first 5):');
                bidsToDelete.slice(0, 5).forEach((bid, i) => {
                    console.log(`  ${i + 1}. £${bid.amount.toFixed(2)} - ${bid.reason}`);
                });
                console.log('');
            } else {
                const bidIdsToDelete = bidsToDelete.map(b => b._id);
                const deleteResult = await Bid.deleteMany({ 
                    _id: { $in: bidIdsToDelete } 
                });
                console.log(`✅ Deleted ${deleteResult.deletedCount} unrecoverable bids\n`);
            }
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 FINAL SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (DRY_RUN) {
            console.log(`Would reassign: ${bidsToReassign.length} bids`);
            console.log(`Would delete: ${bidsToDelete.length} bids`);
            console.log(`Would remain valid: ${alreadyValid} bids`);
            console.log(`\nTotal after cleanup: ${alreadyValid + bidsToReassign.length} bids\n`);
            console.log('💡 Run without --dry-run to actually make these changes\n');
        } else {
            console.log(`✅ Valid bids: ${alreadyValid}`);
            console.log(`✅ Reassigned bids: ${bidsToReassign.length}`);
            console.log(`❌ Deleted bids: ${bidsToDelete.length}`);
            console.log(`\n🎉 Total bids in database: ${alreadyValid + bidsToReassign.length}\n`);
            console.log('🚀 Run "node scripts/testBidFields.js" to verify\n');
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
        console.error('❌ Reassignment failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the reassignment
reassignOrphanedBids();

