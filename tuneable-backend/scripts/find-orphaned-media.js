/**
 * Script to find orphaned media entries in party.media arrays
 * (media entries where the media document no longer exists)
 * 
 * Usage:
 *   node scripts/find-orphaned-media.js [--dry-run] [--fix]
 * 
 * Options:
 *   --dry-run: Only report issues, don't fix them
 *   --fix: Automatically remove orphaned media entries from party.media arrays
 */

require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env.production' : '.env' });
const mongoose = require('mongoose');
const Party = require('../models/Party');
const Media = require('../models/Media');

const DRY_RUN = process.argv.includes('--dry-run');
const FIX = process.argv.includes('--fix');

async function findOrphanedMedia() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get all valid media IDs
        const validMediaIds = new Set();
        const media = await Media.find({}).select('_id');
        media.forEach(m => validMediaIds.add(m._id.toString()));
        console.log(`🎵 Found ${validMediaIds.size} valid media items`);

        // Find all parties
        const parties = await Party.find({}).lean();
        console.log(`📋 Found ${parties.length} parties\n`);

        const issues = {
            orphanedEntries: [],
            fixedParties: []
        };

        for (const party of parties) {
            if (!party.media || party.media.length === 0) continue;

            const orphanedIndices = [];
            const orphanedEntries = [];

            party.media.forEach((entry, index) => {
                if (!entry.mediaId) {
                    // Entry has no mediaId reference
                    orphanedIndices.push(index);
                    orphanedEntries.push({ index, entry, reason: 'No mediaId reference' });
                } else {
                    const mediaId = entry.mediaId.toString();
                    if (!validMediaIds.has(mediaId)) {
                        // Media document doesn't exist
                        orphanedIndices.push(index);
                        orphanedEntries.push({ index, entry, reason: `Media ${mediaId} not found` });
                    }
                }
            });

            if (orphanedEntries.length > 0) {
                issues.orphanedEntries.push({
                    partyId: party._id.toString(),
                    partyName: party.name,
                    partyType: party.type,
                    orphanedCount: orphanedEntries.length,
                    totalMedia: party.media.length,
                    entries: orphanedEntries
                });

                // If fix mode, remove orphaned entries
                if (FIX && !DRY_RUN) {
                    try {
                        // Remove entries in reverse order to maintain indices
                        const sortedIndices = [...orphanedIndices].sort((a, b) => b - a);
                        
                        for (const index of sortedIndices) {
                            party.media.splice(index, 1);
                        }

                        // Use direct MongoDB update to avoid Mongoose validation issues
                        await mongoose.connection.db.collection('parties').updateOne(
                            { _id: party._id },
                            { $set: { media: party.media } }
                        );

                        issues.fixedParties.push({
                            partyId: party._id.toString(),
                            partyName: party.name,
                            removedCount: orphanedEntries.length
                        });

                        console.log(`✅ Fixed party ${party.name} (${party._id}) - removed ${orphanedEntries.length} orphaned entries`);
                    } catch (error) {
                        console.error(`❌ Error fixing party ${party._id}:`, error.message);
                    }
                }
            }
        }

        // Print summary
        console.log('\n📊 SUMMARY:\n');
        
        const totalOrphaned = issues.orphanedEntries.reduce((sum, p) => sum + p.orphanedCount, 0);
        console.log(`🔴 Parties with orphaned media entries: ${issues.orphanedEntries.length}`);
        console.log(`🔴 Total orphaned media entries: ${totalOrphaned}`);

        if (issues.orphanedEntries.length > 0) {
            console.log('\n📋 Affected parties:');
            issues.orphanedEntries.slice(0, 10).forEach(p => {
                console.log(`   - ${p.partyName} (${p.partyType}): ${p.orphanedCount}/${p.totalMedia} orphaned`);
            });
            if (issues.orphanedEntries.length > 10) {
                console.log(`   ... and ${issues.orphanedEntries.length - 10} more`);
            }
        }

        if (FIX && !DRY_RUN) {
            console.log(`\n✅ Fixed ${issues.fixedParties.length} parties`);
        }

        if (DRY_RUN) {
            console.log('\n💡 Run with --fix to automatically remove orphaned entries');
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

findOrphanedMedia();

