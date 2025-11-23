/**
 * Script to find orphaned bids (bids referencing deleted parties or users)
 * 
 * Usage:
 *   node scripts/find-orphaned-bids.js [--dry-run] [--fix]
 * 
 * Options:
 *   --dry-run: Only report issues, don't fix them
 *   --fix: Automatically fix issues (mark bids as inactive, update partyId to global party if applicable)
 */

require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env' });
const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Party = require('../models/Party');
const User = require('../models/User');
const Media = require('../models/Media');

const DRY_RUN = process.argv.includes('--dry-run');
const FIX = process.argv.includes('--fix');

async function findOrphanedBids() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get all valid party IDs
        const validPartyIds = new Set();
        const parties = await Party.find({}).select('_id');
        parties.forEach(party => validPartyIds.add(party._id.toString()));
        console.log(`📋 Found ${validPartyIds.size} valid parties`);

        // Get all valid user IDs
        const validUserIds = new Set();
        const users = await User.find({}).select('_id');
        users.forEach(user => validUserIds.add(user._id.toString()));
        console.log(`👥 Found ${validUserIds.size} valid users`);

        // Get all valid media IDs
        const validMediaIds = new Set();
        const media = await Media.find({}).select('_id');
        media.forEach(m => validMediaIds.add(m._id.toString()));
        console.log(`🎵 Found ${validMediaIds.size} valid media items`);

        // Get global party ID
        const globalParty = await Party.getGlobalParty();
        const globalPartyId = globalParty ? globalParty._id.toString() : null;
        console.log(`🌍 Global party ID: ${globalPartyId || 'NOT FOUND'}`);

        // Find all bids
        const allBids = await Bid.find({}).lean();
        console.log(`\n🔍 Analyzing ${allBids.length} bids...\n`);

        const issues = {
            orphanedParty: [],
            orphanedUser: [],
            orphanedMedia: [],
            fixedToGlobal: []
        };

        for (const bid of allBids) {
            const bidPartyId = bid.partyId ? bid.partyId.toString() : null;
            const bidUserId = bid.userId ? bid.userId.toString() : null;
            const bidMediaId = bid.mediaId ? bid.mediaId.toString() : null;

            // Check for orphaned party reference
            if (bidPartyId && !validPartyIds.has(bidPartyId)) {
                issues.orphanedParty.push({
                    bidId: bid._id.toString(),
                    partyId: bidPartyId,
                    userId: bidUserId,
                    mediaId: bidMediaId,
                    amount: bid.amount,
                    status: bid.status
                });

                // If fix mode and global party exists, update to global party
                if (FIX && !DRY_RUN && globalPartyId && bid.status === 'active') {
                    try {
                        await Bid.findByIdAndUpdate(bid._id, {
                            $set: { partyId: globalPartyId }
                        });
                        issues.fixedToGlobal.push({
                            bidId: bid._id.toString(),
                            oldPartyId: bidPartyId,
                            newPartyId: globalPartyId
                        });
                        console.log(`✅ Fixed bid ${bid._id} - moved to global party`);
                    } catch (error) {
                        console.error(`❌ Error fixing bid ${bid._id}:`, error.message);
                    }
                }
            }

            // Check for orphaned user reference
            if (bidUserId && !validUserIds.has(bidUserId)) {
                issues.orphanedUser.push({
                    bidId: bid._id.toString(),
                    partyId: bidPartyId,
                    userId: bidUserId,
                    mediaId: bidMediaId,
                    amount: bid.amount,
                    status: bid.status
                });

                // If fix mode, mark bid as inactive
                if (FIX && !DRY_RUN && bid.status === 'active') {
                    try {
                        await Bid.findByIdAndUpdate(bid._id, {
                            $set: { status: 'inactive', notes: 'Auto-deactivated: user deleted' }
                        });
                        console.log(`✅ Deactivated bid ${bid._id} - user deleted`);
                    } catch (error) {
                        console.error(`❌ Error deactivating bid ${bid._id}:`, error.message);
                    }
                }
            }

            // Check for orphaned media reference
            if (bidMediaId && !validMediaIds.has(bidMediaId)) {
                issues.orphanedMedia.push({
                    bidId: bid._id.toString(),
                    partyId: bidPartyId,
                    userId: bidUserId,
                    mediaId: bidMediaId,
                    amount: bid.amount,
                    status: bid.status
                });

                // If fix mode, mark bid as inactive
                if (FIX && !DRY_RUN && bid.status === 'active') {
                    try {
                        await Bid.findByIdAndUpdate(bid._id, {
                            $set: { status: 'inactive', notes: 'Auto-deactivated: media deleted' }
                        });
                        console.log(`✅ Deactivated bid ${bid._id} - media deleted`);
                    } catch (error) {
                        console.error(`❌ Error deactivating bid ${bid._id}:`, error.message);
                    }
                }
            }
        }

        // Print summary
        console.log('\n📊 SUMMARY:\n');
        console.log(`🔴 Orphaned Party References: ${issues.orphanedParty.length}`);
        if (issues.orphanedParty.length > 0) {
            console.log('   Sample:', issues.orphanedParty.slice(0, 5).map(b => `Bid ${b.bidId} -> Party ${b.partyId}`).join(', '));
        }

        console.log(`🔴 Orphaned User References: ${issues.orphanedUser.length}`);
        if (issues.orphanedUser.length > 0) {
            console.log('   Sample:', issues.orphanedUser.slice(0, 5).map(b => `Bid ${b.bidId} -> User ${b.userId}`).join(', '));
        }

        console.log(`🔴 Orphaned Media References: ${issues.orphanedMedia.length}`);
        if (issues.orphanedMedia.length > 0) {
            console.log('   Sample:', issues.orphanedMedia.slice(0, 5).map(b => `Bid ${b.bidId} -> Media ${b.mediaId}`).join(', '));
        }

        if (FIX && !DRY_RUN) {
            console.log(`\n✅ Fixed ${issues.fixedToGlobal.length} bids (moved to global party)`);
        }

        if (DRY_RUN) {
            console.log('\n💡 Run with --fix to automatically fix issues');
        }

        console.log('\n✅ Analysis complete');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

findOrphanedBids();

