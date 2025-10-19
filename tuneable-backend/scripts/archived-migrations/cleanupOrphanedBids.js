/**
 * Cleanup Script: Remove Orphaned Bids
 * 
 * This script removes bids that reference non-existent parties, users, or media.
 * Useful for cleaning up dev data after parties/users/media have been deleted.
 * 
 * Usage: node scripts/cleanupOrphanedBids.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be deleted without making changes
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

async function cleanupOrphanedBids() {
    try {
        console.log('🧹 Starting Orphaned Bid Cleanup...\n');
        console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no deletions)' : '✍️  LIVE (will delete orphaned bids)'}\n`);
        
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get all bids
        const allBids = await Bid.find({});
        console.log(`📊 Total bids in database: ${allBids.length}\n`);

        const orphanedBids = [];
        const reasons = {
            missingParty: [],
            missingUser: [],
            missingMedia: []
        };

        console.log('🔍 Checking each bid for missing references...\n');

        for (let i = 0; i < allBids.length; i++) {
            const bid = allBids[i];
            
            if (i > 0 && i % 50 === 0) {
                console.log(`Progress: ${i}/${allBids.length} bids checked...`);
            }

            let isOrphaned = false;
            const bidReasons = [];

            // Check if user exists
            const user = await User.findById(bid.userId);
            if (!user) {
                isOrphaned = true;
                bidReasons.push('user missing');
                reasons.missingUser.push(bid._id);
            }

            // Check if party exists
            const party = await Party.findById(bid.partyId);
            if (!party) {
                isOrphaned = true;
                bidReasons.push('party missing');
                reasons.missingParty.push(bid._id);
            }

            // Check if media/song/episode exists
            let hasValidMedia = false;
            if (bid.mediaId) {
                const media = await Media.findById(bid.mediaId);
                if (media) hasValidMedia = true;
            }
            if (!hasValidMedia && bid.songId) {
                const song = await Song.findById(bid.songId);
                if (song) hasValidMedia = true;
            }
            if (!hasValidMedia && bid.episodeId) {
                const PodcastEpisode = require('../models/PodcastEpisode');
                const episode = await PodcastEpisode.findById(bid.episodeId);
                if (episode) hasValidMedia = true;
            }

            if (!hasValidMedia) {
                isOrphaned = true;
                bidReasons.push('media missing');
                reasons.missingMedia.push(bid._id);
            }

            if (isOrphaned) {
                orphanedBids.push({
                    _id: bid._id,
                    amount: bid.amount,
                    createdAt: bid.createdAt,
                    reasons: bidReasons
                });
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 ORPHANED BIDS ANALYSIS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log(`Total bids: ${allBids.length}`);
        console.log(`Valid bids: ${allBids.length - orphanedBids.length}`);
        console.log(`Orphaned bids: ${orphanedBids.length}\n`);

        console.log('Breakdown by missing reference:');
        console.log(`  - Missing party: ${reasons.missingParty.length} bids`);
        console.log(`  - Missing user: ${reasons.missingUser.length} bids`);
        console.log(`  - Missing media: ${reasons.missingMedia.length} bids\n`);

        if (orphanedBids.length === 0) {
            console.log('✅ No orphaned bids found! Database is clean.');
            return;
        }

        // Show sample orphaned bids
        if (DRY_RUN && orphanedBids.length > 0) {
            console.log('Sample orphaned bids (first 10):');
            orphanedBids.slice(0, 10).forEach((bid, i) => {
                console.log(`  ${i + 1}. £${bid.amount.toFixed(2)} - ${bid.reasons.join(', ')} - ${bid.createdAt}`);
            });
            console.log('');
        }

        // Delete orphaned bids
        if (!DRY_RUN) {
            console.log('🗑️  Deleting orphaned bids...\n');
            
            const bidIdsToDelete = orphanedBids.map(b => b._id);
            const deleteResult = await Bid.deleteMany({ 
                _id: { $in: bidIdsToDelete } 
            });

            console.log(`✅ Deleted ${deleteResult.deletedCount} orphaned bids\n`);
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (DRY_RUN) {
            console.log(`💡 Would delete ${orphanedBids.length} orphaned bids`);
            console.log('💡 Run without --dry-run to actually delete them\n');
        } else {
            console.log('🎉 Cleanup complete!');
            console.log(`📊 Remaining valid bids: ${allBids.length - orphanedBids.length}\n`);
        }

    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
    }
}

// Run the cleanup
cleanupOrphanedBids();

