const Bid = require('../models/Bid');
const Media = require('../models/Media');
const Party = require('../models/Party');

/**
 * Calculate user's aggregate bid value for a specific media in a specific party
 * @param {string} userId - User ID
 * @param {string} mediaId - Media ID
 * @param {string} partyId - Party ID
 * @returns {Promise<number>} Total amount user has bid on this media in this party
 */
async function calculatePartyAggregateBidValue(userId, mediaId, partyId) {
    const result = await Bid.aggregate([
        {
            $match: {
                userId: userId,
                mediaId: mediaId,
                partyId: partyId,
                status: { $in: ['active', 'played'] } // Only count active/played bids
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' }
            }
        }
    ]);
    
    return result.length > 0 ? result[0].total : 0;
}

/**
 * Calculate user's aggregate bid value for a specific media across all parties
 * @param {string} userId - User ID
 * @param {string} mediaId - Media ID
 * @returns {Promise<number>} Total amount user has bid on this media globally
 */
async function calculateGlobalAggregateBidValue(userId, mediaId) {
    const result = await Bid.aggregate([
        {
            $match: {
                userId: userId,
                mediaId: mediaId,
                status: { $in: ['active', 'played'] } // Only count active/played bids
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' }
            }
        }
    ]);
    
    return result.length > 0 ? result[0].total : 0;
}

/**
 * Find the user with the highest aggregate bid value for a media in a party
 * @param {string} mediaId - Media ID
 * @param {string} partyId - Party ID
 * @returns {Promise<{userId: string, aggregateValue: number}>}
 */
async function findTopPartyAggregateBidUser(mediaId, partyId) {
    const result = await Bid.aggregate([
        {
            $match: {
                mediaId: mediaId,
                partyId: partyId,
                status: { $in: ['active', 'played'] }
            }
        },
        {
            $group: {
                _id: '$userId',
                aggregateValue: { $sum: '$amount' }
            }
        },
        {
            $sort: { aggregateValue: -1 }
        },
        {
            $limit: 1
        }
    ]);
    
    return result.length > 0 ? {
        userId: result[0]._id,
        aggregateValue: result[0].aggregateValue
    } : { userId: null, aggregateValue: 0 };
}

/**
 * Find the user with the highest aggregate bid value for a media globally
 * @param {string} mediaId - Media ID
 * @returns {Promise<{userId: string, aggregateValue: number}>}
 */
async function findTopGlobalAggregateBidUser(mediaId) {
    const result = await Bid.aggregate([
        {
            $match: {
                mediaId: mediaId,
                status: { $in: ['active', 'played'] }
            }
        },
        {
            $group: {
                _id: '$userId',
                aggregateValue: { $sum: '$amount' }
            }
        },
        {
            $sort: { aggregateValue: -1 }
        },
        {
            $limit: 1
        }
    ]);
    
    return result.length > 0 ? {
        userId: result[0]._id,
        aggregateValue: result[0].aggregateValue
    } : { userId: null, aggregateValue: 0 };
}

/**
 * Find the user with the highest individual bid for a media in a party
 * @param {string} mediaId - Media ID
 * @param {string} partyId - Party ID
 * @returns {Promise<{userId: string, bidValue: number}>}
 */
async function findTopPartyBidUser(mediaId, partyId) {
    const result = await Bid.findOne({
        mediaId: mediaId,
        partyId: partyId,
        status: { $in: ['active', 'played'] }
    }).sort({ amount: -1 }).select('userId amount');
    
    return result ? {
        userId: result.userId,
        bidValue: result.amount
    } : { userId: null, bidValue: 0 };
}

/**
 * Find the user with the highest individual bid for a media globally
 * @param {string} mediaId - Media ID
 * @returns {Promise<{userId: string, bidValue: number}>}
 */
async function findTopGlobalBidUser(mediaId) {
    const result = await Bid.findOne({
        mediaId: mediaId,
        status: { $in: ['active', 'played'] }
    }).sort({ amount: -1 }).select('userId amount');
    
    return result ? {
        userId: result.userId,
        bidValue: result.amount
    } : { userId: null, bidValue: 0 };
}

/**
 * Update all bid tracking fields for a media in a party
 * @param {string} mediaId - Media ID
 * @param {string} partyId - Party ID
 */
async function updatePartyBidTracking(mediaId, partyId) {
    try {
        // Find top party aggregate bid user
        const topPartyAggregate = await findTopPartyAggregateBidUser(mediaId, partyId);
        
        // Find top party individual bid user
        const topPartyBid = await findTopPartyBidUser(mediaId, partyId);
        
        // Update party media entry
        await Party.findOneAndUpdate(
            { 
                _id: partyId, 
                'media.mediaId': mediaId 
            },
            {
                $set: {
                    'media.$.topPartyAggregateBidValue': topPartyAggregate.aggregateValue,
                    'media.$.topPartyAggregateUser': topPartyAggregate.userId,
                    'media.$.topPartyBidValue': topPartyBid.bidValue,
                    'media.$.topPartyBidUser': topPartyBid.userId
                }
            }
        );
        
        // Also update legacy songs if they exist
        await Party.findOneAndUpdate(
            { 
                _id: partyId, 
                $or: [
                    { 'songs.songId': mediaId },
                    { 'songs.episodeId': mediaId }
                ]
            },
            {
                $set: {
                    'songs.$.topPartyAggregateBidValue': topPartyAggregate.aggregateValue,
                    'songs.$.topPartyAggregateUser': topPartyAggregate.userId,
                    'songs.$.topPartyBidValue': topPartyBid.bidValue,
                    'songs.$.topPartyBidUser': topPartyBid.userId
                }
            }
        );
        
    } catch (error) {
        console.error('Error updating party bid tracking:', error);
        throw error;
    }
}

/**
 * Update all bid tracking fields for a media globally
 * @param {string} mediaId - Media ID
 */
async function updateGlobalBidTracking(mediaId) {
    try {
        // Find top global aggregate bid user
        const topGlobalAggregate = await findTopGlobalAggregateBidUser(mediaId);
        
        // Find top global individual bid user
        const topGlobalBid = await findTopGlobalBidUser(mediaId);
        
        // Update media document
        await Media.findByIdAndUpdate(mediaId, {
            topGlobalAggregateBidValue: topGlobalAggregate.aggregateValue,
            topGlobalAggregateUser: topGlobalAggregate.userId,
            topGlobalBidValue: topGlobalBid.bidValue,
            topGlobalBidUser: topGlobalBid.userId
        });
        
    } catch (error) {
        console.error('Error updating global bid tracking:', error);
        throw error;
    }
}

module.exports = {
    calculatePartyAggregateBidValue,
    calculateGlobalAggregateBidValue,
    findTopPartyAggregateBidUser,
    findTopGlobalAggregateBidUser,
    findTopPartyBidUser,
    findTopGlobalBidUser,
    updatePartyBidTracking,
    updateGlobalBidTracking
};
