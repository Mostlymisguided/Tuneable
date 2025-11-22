/**
 * Cleanup Script: Remove Orphaned Partiers
 * 
 * This script removes invalid user references from Party.partiers arrays
 * and invalid party references from User.joinedParties arrays.
 * 
 * Useful for cleaning up dev data after users have been deleted.
 * 
 * Usage: node scripts/cleanup-orphaned-partiers.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be cleaned without making changes
 */

const mongoose = require('mongoose');
const Party = require('../models/Party');
const User = require('../models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'connectionstring';
const isDryRun = process.argv.includes('--dry-run');

async function cleanupOrphanedPartiers() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        if (isDryRun) {
            console.log('🔍 DRY RUN MODE - No changes will be made\n');
        }

        // Step 1: Get all valid user IDs
        console.log('📊 Step 1: Getting all valid users...');
        const allUsers = await User.find({}).select('_id');
        const validUserIds = new Set(allUsers.map(u => u._id.toString()));
        console.log(`   Found ${validUserIds.size} valid users\n`);

        // Step 2: Clean up Party.partiers arrays
        console.log('🧹 Step 2: Cleaning up Party.partiers arrays...');
        // Use lean() to get plain JavaScript objects without Mongoose validation
        // This allows us to read documents even if they have invalid enum values
        const allParties = await Party.find({}).lean();
        console.log(`   Found ${allParties.length} parties to check\n`);

        let partiesUpdated = 0;
        let totalOrphanedRemoved = 0;

        for (const party of allParties) {
            if (!party.partiers || party.partiers.length === 0) {
                continue;
            }

            const originalCount = party.partiers.length;
            const orphanedIds = [];
            
            // Filter out invalid user references
            party.partiers = party.partiers.filter(partierId => {
                const partierIdStr = partierId.toString();
                if (!validUserIds.has(partierIdStr)) {
                    orphanedIds.push(partierIdStr);
                    return false;
                }
                return true;
            });

            const newCount = party.partiers.length;
            const removed = originalCount - newCount;

            // ✅ Also fix invalid media status values (e.g., 'queued' → 'active')
            let statusFixed = 0;
            const invalidStatusIndices = [];
            if (party.media && Array.isArray(party.media)) {
                party.media.forEach((mediaItem, index) => {
                    // Track invalid status values (legacy 'queued' status)
                    if (mediaItem.status && !['active', 'vetoed'].includes(mediaItem.status)) {
                        const oldStatus = mediaItem.status;
                        invalidStatusIndices.push({ index, oldStatus });
                        statusFixed++;
                        if (statusFixed <= 3) {
                            console.log(`      ⚠️  Found invalid media status: "${oldStatus}" → will fix to "active"`);
                        }
                    }
                });
            }

            if (removed > 0 || statusFixed > 0) {
                if (removed > 0) {
                    totalOrphanedRemoved += removed;
                    console.log(`   🗑️  Party "${party.name}" (${party._id}):`);
                    console.log(`      Removed ${removed} orphaned partier(s) (${originalCount} → ${newCount})`);
                    
                    if (removed <= 5) {
                        console.log(`      Orphaned IDs: ${orphanedIds.join(', ')}`);
                    } else {
                        console.log(`      Orphaned IDs: ${orphanedIds.slice(0, 5).join(', ')}... (${removed} total)`);
                    }
                }
                
                if (statusFixed > 0) {
                    if (removed === 0) {
                        console.log(`   ⚠️  Party "${party.name}" (${party._id}):`);
                    }
                    console.log(`      Fixed ${statusFixed} invalid media status value(s)`);
                }

                if (!isDryRun) {
                    // Use direct MongoDB update to avoid Mongoose validation errors
                    // Convert ObjectIds back to MongoDB format if needed
                    const db = mongoose.connection.db;
                    const partiesCollection = db.collection('parties');
                    
                    // Convert partiers to ObjectIds if they're strings
                    const partiersToUpdate = party.partiers.map(p => {
                        if (typeof p === 'string') {
                            return new mongoose.Types.ObjectId(p);
                        }
                        return p;
                    });
                    
                    // Update partiers array
                    await partiesCollection.updateOne(
                        { _id: new mongoose.Types.ObjectId(party._id) },
                        { $set: { partiers: partiersToUpdate } }
                    );
                    
                    // Also fix invalid media status values if any were found
                    if (statusFixed > 0 && invalidStatusIndices.length > 0) {
                        // Update each invalid status value using the tracked indices
                        for (const { index, oldStatus } of invalidStatusIndices) {
                            await partiesCollection.updateOne(
                                { _id: new mongoose.Types.ObjectId(party._id) },
                                { $set: { [`media.${index}.status`]: 'active' } }
                            );
                        }
                    }
                    
                    partiesUpdated++;
                }
            }
        }

        console.log(`\n✅ Party cleanup complete:`);
        console.log(`   - ${partiesUpdated} parties updated${isDryRun ? ' (would be)' : ''}`);
        console.log(`   - ${totalOrphanedRemoved} orphaned references removed${isDryRun ? ' (would be)' : ''}\n`);

        // Step 3: Clean up User.joinedParties arrays
        console.log('🧹 Step 3: Cleaning up User.joinedParties arrays...');
        const allPartiesForLookup = new Set((await Party.find({}).select('_id')).map(p => p._id.toString()));
        const usersWithJoinedParties = await User.find({ 
            joinedParties: { $exists: true, $ne: [] } 
        });

        console.log(`   Found ${usersWithJoinedParties.length} users with joinedParties to check\n`);

        let usersUpdated = 0;
        let totalOrphanedJoinedParties = 0;

        for (const user of usersWithJoinedParties) {
            if (!user.joinedParties || user.joinedParties.length === 0) {
                continue;
            }

            const originalCount = user.joinedParties.length;
            const orphanedParties = [];

            // Filter out invalid party references
            user.joinedParties = user.joinedParties.filter(joinedParty => {
                const partyIdStr = joinedParty.partyId.toString();
                if (!allPartiesForLookup.has(partyIdStr)) {
                    orphanedParties.push(partyIdStr);
                    return false;
                }
                return true;
            });

            const newCount = user.joinedParties.length;
            const removed = originalCount - newCount;

            if (removed > 0) {
                totalOrphanedJoinedParties += removed;
                console.log(`   🗑️  User "${user.username}" (${user._id}):`);
                console.log(`      Removed ${removed} orphaned party reference(s) (${originalCount} → ${newCount})`);
                
                if (removed <= 3) {
                    console.log(`      Orphaned Party IDs: ${orphanedParties.join(', ')}`);
                } else {
                    console.log(`      Orphaned Party IDs: ${orphanedParties.slice(0, 3).join(', ')}... (${removed} total)`);
                }

                if (!isDryRun) {
                    await user.save();
                    usersUpdated++;
                }
            }
        }

        console.log(`\n✅ User cleanup complete:`);
        console.log(`   - ${usersUpdated} users updated${isDryRun ? ' (would be)' : ''}`);
        console.log(`   - ${totalOrphanedJoinedParties} orphaned party references removed${isDryRun ? ' (would be)' : ''}\n`);

        // Summary
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 CLEANUP SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Parties cleaned: ${partiesUpdated}${isDryRun ? ' (would be)' : ''}`);
        console.log(`Orphaned partiers removed: ${totalOrphanedRemoved}${isDryRun ? ' (would be)' : ''}`);
        console.log(`Users cleaned: ${usersUpdated}${isDryRun ? ' (would be)' : ''}`);
        console.log(`Orphaned joinedParties removed: ${totalOrphanedJoinedParties}${isDryRun ? ' (would be)' : ''}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (isDryRun) {
            console.log('💡 This was a dry run. Run without --dry-run to apply changes.');
        } else {
            console.log('✅ Cleanup completed successfully!');
        }

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        throw error;
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Disconnected from MongoDB');
    }
}

// Run the cleanup
cleanupOrphanedPartiers()
    .then(() => {
        console.log('✨ Script finished');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });

