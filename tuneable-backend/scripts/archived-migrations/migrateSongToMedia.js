/**
 * Migration Script: Migrate Song/Episode References to Media Model
 * 
 * This script migrates all bids from using songId/episodeId to using mediaId,
 * making the Media model the single source of truth.
 * 
 * Usage: node scripts/migrateSongToMedia.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be updated without making changes
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const Song = require('../models/Song');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable';
const DRY_RUN = process.argv.includes('--dry-run');

async function migrateSongToMedia() {
    try {
        console.log('🚀 Starting Song → Media Migration...\n');
        console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✍️  LIVE (will update database)'}\n`);
        
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find all bids with songId but no mediaId
        const bidsWithSongId = await Bid.find({ 
            songId: { $exists: true, $ne: null },
            mediaId: { $exists: false }
        });

        // Find all bids with episodeId but no mediaId
        const bidsWithEpisodeId = await Bid.find({ 
            episodeId: { $exists: true, $ne: null },
            mediaId: { $exists: false }
        });

        const totalBids = bidsWithSongId.length + bidsWithEpisodeId.length;

        console.log(`📊 Found ${bidsWithSongId.length} bids with songId`);
        console.log(`📊 Found ${bidsWithEpisodeId.length} bids with episodeId`);
        console.log(`📊 Total bids to migrate: ${totalBids}\n`);

        if (totalBids === 0) {
            console.log('✅ All bids are already using mediaId!');
            console.log('🎉 Migration to Media model is complete.');
            return;
        }

        let migratedCount = 0;
        let createdMediaCount = 0;
        let errorCount = 0;
        const errors = [];

        // Process bids with songId
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Processing bids with songId...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        for (let i = 0; i < bidsWithSongId.length; i++) {
            const bid = bidsWithSongId[i];
            
            try {
                if (i > 0 && i % 10 === 0) {
                    console.log(`Progress: ${i}/${bidsWithSongId.length} song bids processed...`);
                }

                // Find the song
                const song = await Song.findById(bid.songId);
                if (!song) {
                    throw new Error(`Song not found: ${bid.songId}`);
                }

                // Check if Media already exists for this song (by sources or title+artist)
                let media = null;
                
                // Try to find by YouTube source (most common)
                if (song.sources && song.sources.youtube) {
                    media = await Media.findOne({ 'sources.youtube': song.sources.youtube });
                }
                
                // If not found, try to find by Spotify source
                if (!media && song.sources && song.sources.spotify) {
                    media = await Media.findOne({ 'sources.spotify': song.sources.spotify });
                }

                // If still not found, create new Media from Song
                if (!media) {
                    if (DRY_RUN && i < 3) {
                        console.log(`Would create new Media for Song: "${song.title}" by ${song.artist}`);
                    }
                    
                    if (!DRY_RUN) {
                        media = new Media({
                            title: song.title,
                            artist: typeof song.artist === 'string' 
                                ? [{ name: song.artist, userId: null, verified: false }]
                                : song.artist,
                            coverArt: song.coverArt,
                            duration: song.duration,
                            sources: song.sources || {},
                            tags: song.tags || [],
                            category: song.category,
                            addedBy: song.addedBy,
                            globalBidValue: song.globalBidValue || 0,
                            bids: song.bids || [],
                            contentType: ['music'],
                            contentForm: ['song'],
                            mediaType: ['mp3'] // Default assumption
                        });
                        await media.save();
                        createdMediaCount++;
                    }
                }

                // Update the bid to use mediaId
                if (!DRY_RUN && media) {
                    bid.mediaId = media._id;
                    bid.media_uuid = media.uuid;
                    // Keep songId for now as backup, will remove in next phase
                    await bid.save();
                    migratedCount++;
                } else if (DRY_RUN && i < 3) {
                    console.log(`Would update bid ${bid._id} to use Media ${media?._id || 'NEW'}`);
                }

            } catch (error) {
                errorCount++;
                errors.push({
                    bidId: bid._id,
                    type: 'song',
                    error: error.message
                });
                console.log(`❌ Error migrating bid ${bid._id}: ${error.message}`);
            }
        }

        // Process bids with episodeId (similar process)
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Processing bids with episodeId...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        for (let i = 0; i < bidsWithEpisodeId.length; i++) {
            const bid = bidsWithEpisodeId[i];
            
            try {
                if (i > 0 && i % 10 === 0) {
                    console.log(`Progress: ${i}/${bidsWithEpisodeId.length} episode bids processed...`);
                }

                // Find the episode
                const PodcastEpisode = require('../models/PodcastEpisode');
                const episode = await PodcastEpisode.findById(bid.episodeId);
                if (!episode) {
                    throw new Error(`Episode not found: ${bid.episodeId}`);
                }

                // Check if Media already exists for this episode
                let media = await Media.findOne({ 
                    'externalIds.podcastIndex': episode.podcastIndexId 
                });

                // If not found, create new Media from Episode
                if (!media) {
                    if (DRY_RUN && i < 3) {
                        console.log(`Would create new Media for Episode: "${episode.title}"`);
                    }
                    
                    if (!DRY_RUN) {
                        media = new Media({
                            title: episode.title,
                            artist: [{ name: episode.podcastName || 'Unknown Podcast', userId: null, verified: false }],
                            coverArt: episode.image,
                            duration: episode.duration,
                            description: episode.description,
                            sources: { podcast: episode.enclosureUrl },
                            addedBy: episode.addedBy,
                            globalBidValue: episode.globalBidValue || 0,
                            bids: episode.bids || [],
                            contentType: ['spoken'],
                            contentForm: ['episode'],
                            mediaType: ['mp3'],
                            episodeNumber: episode.episodeNumber,
                            externalIds: {
                                podcastIndex: episode.podcastIndexId,
                                taddy: episode.taddyUuid,
                                iTunes: episode.itunesId,
                                rssGuid: episode.guid
                            }
                        });
                        await media.save();
                        createdMediaCount++;
                    }
                }

                // Update the bid to use mediaId
                if (!DRY_RUN && media) {
                    bid.mediaId = media._id;
                    bid.media_uuid = media.uuid;
                    // Keep episodeId for now as backup
                    await bid.save();
                    migratedCount++;
                } else if (DRY_RUN && i < 3) {
                    console.log(`Would update bid ${bid._id} to use Media ${media?._id || 'NEW'}`);
                }

            } catch (error) {
                errorCount++;
                errors.push({
                    bidId: bid._id,
                    type: 'episode',
                    error: error.message
                });
                console.log(`❌ Error migrating bid ${bid._id}: ${error.message}`);
            }
        }

        // Summary
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 MIGRATION SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        if (DRY_RUN) {
            console.log(`Would migrate: ${bidsWithSongId.length + bidsWithEpisodeId.length} bids`);
            console.log(`Would create: ${totalBids} new Media items (estimated)`);
            console.log('\n💡 Run without --dry-run to actually update the database');
        } else {
            console.log(`✅ Successfully migrated: ${migratedCount} bids`);
            console.log(`✅ Created: ${createdMediaCount} new Media items`);
            console.log(`❌ Failed: ${errorCount} bids`);
            
            if (errorCount > 0) {
                console.log('\nFailed bids:');
                errors.forEach(err => {
                    console.log(`  - ${err.bidId} (${err.type}): ${err.error}`);
                });
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (!DRY_RUN && migratedCount > 0) {
            console.log('\n🎉 Migration complete! All bids now use the Media model.');
            console.log('📝 Note: songId/episodeId fields are kept for backup but no longer used.');
            console.log('🚀 Next step: Run backfillBidFields.js if you haven\'t already.');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

// Run the migration
migrateSongToMedia();

