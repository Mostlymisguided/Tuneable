#!/usr/bin/env node

/**
 * Backfill Party Media Bid Metrics
 * 
 * This script recalculates all party-media bid metrics from existing Bid data.
 * It processes each media entry in each party's media[] array.
 * 
 * Metrics calculated per party-media entry:
 * - partyMediaAggregate: Sum of all bids for this media in this party
 * - partyMediaBidTop: Highest individual bid amount
 * - partyMediaBidTopUser: User who made the highest bid
 * - partyMediaAggregateTop: Highest user aggregate for this media in party
 * - partyMediaAggregateTopUser: User with highest aggregate
 * 
 * Party-level metrics calculated:
 * - partyBidTop: Highest bid across all media in party
 * - partyBidTopUser: User who made highest bid
 * - partyUserAggregateTop: Highest user aggregate in party
 * - partyUserAggregateTopUser: User with highest aggregate
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Party = require('../models/Party');
const Bid = require('../models/Bid');
const User = require('../models/User');

async function backfillPartyMediaMetrics() {
  try {
    console.log('🚀 Starting Party media metrics backfill...\n');
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/Tuneable';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Get all parties
    const parties = await Party.find({});
    console.log(`📊 Found ${parties.length} parties\n`);

    let partiesUpdated = 0;
    let mediaEntriesUpdated = 0;
    let errors = 0;

    for (const party of parties) {
      try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎉 Processing Party: ${party.name} (${party._id})`);
        console.log(`${'='.repeat(60)}`);

        let partyChanged = false;
        let partyLevelMetrics = {
          partyBidTop: 0,
          partyBidTopUser: null,
          partyUserAggregateTop: 0,
          partyUserAggregateTopUser: null,
          partyUserBidTop: 0,
          partyUserBidTopUser: null
        };

        // Process each media entry
        if (party.media && party.media.length > 0) {
          console.log(`📀 Processing ${party.media.length} media entries...\n`);

          for (let i = 0; i < party.media.length; i++) {
            const mediaEntry = party.media[i];
            const mediaId = mediaEntry.mediaId;

            // Get all active/played bids for this party + media combination
            const bids = await Bid.find({
              partyId: party._id,
              mediaId: mediaId,
              status: { $in: ['active', 'played'] }
            }).populate('userId', 'username');

            if (bids.length === 0) {
              console.log(`  ⏭️  Media ${i + 1}: No bids, skipping`);
              continue;
            }

            // Calculate partyMediaAggregate (sum of all bids for this media in party)
            const partyMediaAggregate = bids.reduce((sum, bid) => sum + bid.amount, 0);

            // Find partyMediaBidTop (highest individual bid)
            const topBid = bids.reduce((max, bid) => bid.amount > max.amount ? bid : max, bids[0]);
            const partyMediaBidTop = topBid.amount;
            const partyMediaBidTopUser = topBid.userId?._id || topBid.userId;

            // Calculate user aggregates for this media in this party
            const userAggregates = {};
            bids.forEach(bid => {
              const userId = bid.userId?._id?.toString() || bid.userId?.toString();
              if (!userAggregates[userId]) {
                userAggregates[userId] = {
                  userId: bid.userId?._id || bid.userId,
                  total: 0
                };
              }
              userAggregates[userId].total += bid.amount;
            });

            // Find user with highest aggregate for this media in party
            const topAggregate = Object.values(userAggregates).reduce(
              (max, user) => user.total > max.total ? user : max,
              { total: 0, userId: null }
            );
            const partyMediaAggregateTop = topAggregate.total;
            const partyMediaAggregateTopUser = topAggregate.userId;

            // Update the media entry
            party.media[i].partyMediaAggregate = partyMediaAggregate;
            party.media[i].partyMediaBidTop = partyMediaBidTop;
            party.media[i].partyMediaBidTopUser = partyMediaBidTopUser;
            party.media[i].partyMediaAggregateTop = partyMediaAggregateTop;
            party.media[i].partyMediaAggregateTopUser = partyMediaAggregateTopUser;

            partyChanged = true;
            mediaEntriesUpdated++;

            console.log(`  ✅ Media ${i + 1}:`);
            console.log(`     - Aggregate: £${partyMediaAggregate.toFixed(2)}`);
            console.log(`     - Top Bid: £${partyMediaBidTop.toFixed(2)} (by ${topBid.userId?.username || 'unknown'})`);
            console.log(`     - Top User Aggregate: £${partyMediaAggregateTop.toFixed(2)}`);

            // Update party-level metrics
            if (partyMediaBidTop > partyLevelMetrics.partyBidTop) {
              partyLevelMetrics.partyBidTop = partyMediaBidTop;
              partyLevelMetrics.partyBidTopUser = partyMediaBidTopUser;
            }

            // Track highest individual bid by any user
            Object.values(userAggregates).forEach(userAgg => {
              if (userAgg.total > partyLevelMetrics.partyUserAggregateTop) {
                partyLevelMetrics.partyUserAggregateTop = userAgg.total;
                partyLevelMetrics.partyUserAggregateTopUser = userAgg.userId;
              }
            });
          }
        }

        // Process legacy songs array if it exists
        if (party.songs && party.songs.length > 0) {
          console.log(`\n🎵 Processing ${party.songs.length} legacy songs entries...\n`);

          for (let i = 0; i < party.songs.length; i++) {
            const songEntry = party.songs[i];
            const songId = songEntry.songId || songEntry.episodeId;

            if (!songId) {
              console.log(`  ⏭️  Song ${i + 1}: No ID, skipping`);
              continue;
            }

            // Get all active/played bids for this party + song combination
            const bids = await Bid.find({
              partyId: party._id,
              mediaId: songId,
              status: { $in: ['active', 'played'] }
            }).populate('userId', 'username');

            if (bids.length === 0) {
              console.log(`  ⏭️  Song ${i + 1}: No bids, skipping`);
              continue;
            }

            // Calculate the same metrics for songs array
            const partyMediaAggregate = bids.reduce((sum, bid) => sum + bid.amount, 0);
            const topBid = bids.reduce((max, bid) => bid.amount > max.amount ? bid : max, bids[0]);
            const partyMediaBidTop = topBid.amount;
            const partyMediaBidTopUser = topBid.userId?._id || topBid.userId;

            const userAggregates = {};
            bids.forEach(bid => {
              const userId = bid.userId?._id?.toString() || bid.userId?.toString();
              if (!userAggregates[userId]) {
                userAggregates[userId] = {
                  userId: bid.userId?._id || bid.userId,
                  total: 0
                };
              }
              userAggregates[userId].total += bid.amount;
            });

            const topAggregate = Object.values(userAggregates).reduce(
              (max, user) => user.total > max.total ? user : max,
              { total: 0, userId: null }
            );
            const partyMediaAggregateTop = topAggregate.total;
            const partyMediaAggregateTopUser = topAggregate.userId;

            // Update the song entry
            party.songs[i].partyMediaAggregate = partyMediaAggregate;
            party.songs[i].partyMediaBidTop = partyMediaBidTop;
            party.songs[i].partyMediaBidTopUser = partyMediaBidTopUser;
            party.songs[i].partyMediaAggregateTop = partyMediaAggregateTop;
            party.songs[i].partyMediaAggregateTopUser = partyMediaAggregateTopUser;

            partyChanged = true;
            mediaEntriesUpdated++;

            console.log(`  ✅ Song ${i + 1}:`);
            console.log(`     - Aggregate: £${partyMediaAggregate.toFixed(2)}`);
            console.log(`     - Top Bid: £${partyMediaBidTop.toFixed(2)}`);
          }
        }

        // Update party-level metrics
        if (partyChanged) {
          party.partyBidTop = partyLevelMetrics.partyBidTop;
          party.partyBidTopUser = partyLevelMetrics.partyBidTopUser;
          party.partyUserAggregateTop = partyLevelMetrics.partyUserAggregateTop;
          party.partyUserAggregateTopUser = partyLevelMetrics.partyUserAggregateTopUser;

          await party.save();
          partiesUpdated++;

          console.log(`\n🎯 Party-level metrics updated:`);
          console.log(`   - partyBidTop: £${partyLevelMetrics.partyBidTop.toFixed(2)}`);
          console.log(`   - partyUserAggregateTop: £${partyLevelMetrics.partyUserAggregateTop.toFixed(2)}`);
          console.log(`✅ Party saved successfully`);
        } else {
          console.log(`⏭️  No changes needed for this party`);
        }

      } catch (error) {
        console.error(`❌ Error processing party ${party.name}:`, error.message);
        errors++;
      }
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Backfill Summary:`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Parties updated: ${partiesUpdated}`);
    console.log(`📀 Media entries updated: ${mediaEntriesUpdated}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📝 Total parties processed: ${parties.length}`);
    console.log(`${'='.repeat(60)}\n`);

    // Verification - show sample party
    console.log('🔍 Verification - Sample party media metrics:\n');
    const sampleParty = await Party.findOne({ 
      'media.partyMediaAggregate': { $gt: 0 } 
    });

    if (sampleParty && sampleParty.media && sampleParty.media.length > 0) {
      console.log(`📀 Party: ${sampleParty.name}`);
      console.log(`   Party-level metrics:`);
      console.log(`   - partyBidTop: £${sampleParty.partyBidTop?.toFixed(2) || '0.00'}`);
      console.log(`   - partyUserAggregateTop: £${sampleParty.partyUserAggregateTop?.toFixed(2) || '0.00'}\n`);
      
      const sampleMedia = sampleParty.media.find(m => m.partyMediaAggregate > 0);
      if (sampleMedia) {
        console.log(`   First media entry metrics:`);
        console.log(`   - partyMediaAggregate: £${sampleMedia.partyMediaAggregate?.toFixed(2) || '0.00'}`);
        console.log(`   - partyMediaBidTop: £${sampleMedia.partyMediaBidTop?.toFixed(2) || '0.00'}`);
        console.log(`   - partyMediaAggregateTop: £${sampleMedia.partyMediaAggregateTop?.toFixed(2) || '0.00'}\n`);
      }
    } else {
      console.log('⚠️  No parties with metrics found (this may be expected)\n');
    }

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run backfill if called directly
if (require.main === module) {
  backfillPartyMediaMetrics()
    .then(() => {
      console.log('🎉 Party media metrics backfill completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Party media metrics backfill failed:', error);
      process.exit(1);
    });
}

module.exports = backfillPartyMediaMetrics;

