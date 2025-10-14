/**
 * Bid Metrics Schema Registry
 * 
 * This file defines the complete grammar for bid-related metrics in Tuneable,
 * based on the systematic taxonomy of scope (Global/Party), entities (User/Media),
 * and metric types (Aggregate/Top/Average/Rank).
 * 
 * Each metric definition includes:
 * - scope: 'global' | 'party' 
 * - type: 'aggregate' | 'top' | 'average' | 'rank'
 * - entities: array of required entities ['user', 'media']
 * - outputType: primary data type returned
 * - returns: detailed structure of what the metric returns
 * - associatedEntities: entities that are returned with the primary value
 * - description: human-readable explanation
 * - storage: whether to store computed values or compute on-demand
 */

// ========================================
// SCHEMA CONSTANTS & TYPE DEFINITIONS
// ========================================

/**
 * @typedef {'global' | 'party'} MetricScope
 * @typedef {'aggregate' | 'top' | 'average' | 'rank'} MetricType
 * @typedef {'amount' | 'order'} OutputType
 * @typedef {'stored' | 'computed'} StorageType
 * @typedef {'user' | 'media' | 'party'} EntityType
 */

/**
 * @typedef {Object} MetricReturns
 * @property {string} [amount] - Amount value
 * @property {string} [currency] - Currency code
 * @property {string} [userId] - User ObjectId
 * @property {string} [userUuid] - User UUID
 * @property {string} [username] - Username
 * @property {string} [mediaId] - Media ObjectId
 * @property {string} [mediaUuid] - Media UUID
 * @property {string} [title] - Media title
 * @property {string} [artist] - Media artist
 * @property {string} [partyId] - Party ObjectId
 * @property {string} [partyUuid] - Party UUID
 * @property {string} [partyName] - Party name
 * @property {string} [rank] - Rank number
 * @property {string} [totalCount] - Total count for ranking
 * @property {string} [percentile] - Percentile (0-100)
 */

/**
 * @typedef {Object} MetricConfig
 * @property {MetricScope} scope - The scope of the metric (global/party)
 * @property {MetricType} type - The type of metric (aggregate/top/average/rank)
 * @property {EntityType[]} entities - Required entities for this metric
 * @property {OutputType} outputType - Primary data type returned
 * @property {MetricReturns} returns - Detailed structure of returned data
 * @property {EntityType[]} associatedEntities - Entities returned with primary value
 * @property {string} description - Human-readable explanation
 * @property {StorageType} storage - Storage strategy (stored/computed)
 * @property {string} formula - Mathematical formula for computation
 */

/**
 * Valid metric types in the system
 * @type {MetricType[]}
 */
const METRIC_TYPES = ['aggregate', 'top', 'average', 'rank'];

/**
 * Valid scopes for metrics
 * @type {MetricScope[]}
 */
const SCOPES = ['global', 'party'];

/**
 * Valid output types for metrics
 * @type {OutputType[]}
 */
const OUTPUT_TYPES = ['amount', 'order'];

/**
 * Valid storage strategies for metrics
 * @type {StorageType[]}
 */
const STORAGE_TYPES = ['stored', 'computed'];

/**
 * Valid entity types that can be referenced in metrics
 * @type {EntityType[]}
 */
const ENTITY_TYPES = ['user', 'media', 'party'];

/**
 * Complete registry of all bid metrics in the Tuneable system
 * @type {Object<string, MetricConfig>}
 */
const BID_METRICS_SCHEMA = {
  // ========================================
  // AGGREGATE METRICS (Sum of bids)
  // ========================================
  
  GlobalAggregate: {
    scope: 'global',
    type: 'aggregate',
    entities: [],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String' // 'GBP', 'USD', etc.
    },
    associatedEntities: [],
    description: 'Sum of Bids across Parties, Users and Media',
    storage: 'computed', // Too expensive to store globally
    formula: 'SUM(all bids)'
  },
  
  GlobalUserAggregate: {
    scope: 'global',
    type: 'aggregate',
    entities: ['user'],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String'
    },
    associatedEntities: ['user'],
    description: 'Sum of Bids across Parties and Media for given User',
    storage: 'computed',
    formula: 'SUM(bids WHERE userId = X)'
  },
  
  GlobalMediaAggregate: {
    scope: 'global',
    type: 'aggregate',
    entities: ['media'],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String'
    },
    associatedEntities: ['media'],
    description: 'Sum of Bids across Parties and Users for given Media',
    storage: 'stored', // Stored in Media model
    formula: 'SUM(bids WHERE mediaId = X)'
  },
  
  GlobalUserMediaAggregate: {
    scope: 'global',
    type: 'aggregate',
    entities: ['user', 'media'],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String'
    },
    associatedEntities: ['user', 'media'],
    description: 'Sum of Bids across Parties for given User and Media',
    storage: 'stored', // Stored in Bid model
    formula: 'SUM(bids WHERE userId = X AND mediaId = Y)'
  },
  
  PartyAggregate: {
    scope: 'party',
    type: 'aggregate',
    entities: [],
    outputType: 'amount',
    description: 'Sum of Bids across Users and Media for given Party',
    storage: 'computed',
    formula: 'SUM(bids WHERE partyId = X)'
  },
  
  PartyUserAggregate: {
    scope: 'party',
    type: 'aggregate',
    entities: ['user'],
    outputType: 'amount',
    description: 'Sum of Bids for given Party and User',
    storage: 'computed',
    formula: 'SUM(bids WHERE partyId = X AND userId = Y)'
  },
  
  PartyMediaAggregate: {
    scope: 'party',
    type: 'aggregate',
    entities: ['media'],
    outputType: 'amount',
    description: 'Sum of Bids for given Party and Media',
    storage: 'stored', // Stored in Party.media array
    formula: 'SUM(bids WHERE partyId = X AND mediaId = Y)'
  },
  
  PartyUserMediaAggregate: {
    scope: 'party',
    type: 'aggregate',
    entities: ['user', 'media'],
    outputType: 'amount',
    description: 'Sum of Bids for given Party, User and Media',
    storage: 'stored', // Stored in Bid model
    formula: 'SUM(bids WHERE partyId = X AND userId = Y AND mediaId = Z)'
  },

  // ========================================
  // TOP METRICS (Highest bid amounts)
  // ========================================
  
  GlobalBidTop: {
    scope: 'global',
    type: 'top',
    entities: [],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    },
    associatedEntities: ['user', 'media', 'party'],
    description: 'Highest Bid amount across Parties, Users and Media',
    storage: 'stored', // Stored in Media model
    formula: 'MAX(bid amounts)'
  },
  
  GlobalMediaBidTop: {
    scope: 'global',
    type: 'top',
    entities: ['media'],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String',
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    },
    associatedEntities: ['user', 'media', 'party'],
    description: 'Highest Bid amount across Parties and Users for given Media',
    storage: 'stored', // Stored in Media model
    formula: 'MAX(bids WHERE mediaId = X)'
  },
  
  GlobalMediaAggregateTop: {
    scope: 'global',
    type: 'top',
    entities: ['media'],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String'
    },
    associatedEntities: ['user', 'media'],
    description: 'Highest Aggregate amount across Parties and Users for given Media',
    storage: 'stored', // Stored in Media model
    formula: 'MAX(user aggregate totals WHERE mediaId = X)'
  },
  
  GlobalUserAggregateTop: {
    scope: 'global',
    type: 'top',
    entities: ['user'],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String'
    },
    associatedEntities: ['user'],
    description: 'Highest Aggregate amount across Parties and Media for given User',
    storage: 'computed',
    formula: 'MAX(user aggregate totals WHERE userId = X)'
  },
  
  GlobalPartyAggregateTop: {
    scope: 'global',
    type: 'top',
    entities: [],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    },
    associatedEntities: ['party'],
    description: 'Highest Aggregate amount across all Parties (which party has most total bids)',
    storage: 'computed',
    formula: 'MAX(party aggregate totals)'
  },
  
  GlobalUserBidTop: {
    scope: 'global',
    type: 'top',
    entities: ['user'],
    outputType: 'amount',
    returns: {
        amount: 'Number',
        currency: 'String',
        mediaId: 'ObjectId',
        mediaUuid: 'String',
        title: 'String',
        partyId: 'ObjectId',
        partyUuid: 'String',
        partyName: 'String'
      },
    description: 'Highest Bid amount across Parties and Media for given User',
    storage: 'computed',
    formula: 'MAX(bids WHERE userId = X)'
  },
  
  
  GlobalUserMediaBidTop: {
    scope: 'global',
    type: 'top',
    entities: ['user', 'media'],
    outputType: 'amount',
    returns: {
        amount: 'Number',
        currency: 'String',
        partyId: 'ObjectId',
        partyUuid: 'String',
        partyName: 'String'
      },
    description: 'Highest Bid amount across Parties for given User and Media',
    storage: 'computed',
    formula: 'MAX(bids WHERE userId = X AND mediaId = Y)'
  },
  
  GlobalUserMediaAggregateTop: {
    scope: 'global',
    type: 'top',
    entities: ['user', 'media'],
    outputType: 'amount',
    description: 'Highest Aggregate amount across Parties for given User and Media',
    storage: 'computed',
    formula: 'User aggregate total for user X and media Y'
  },
  
  PartyBidTop: {
    scope: 'party',
    type: 'top',
    entities: [],
    outputType: 'amount',
    description: 'Highest Bid amount across Users and Media for given Party',
    storage: 'stored', // Stored in Party.media array
    formula: 'MAX(bids WHERE partyId = X)'
  },
  
  PartyUserAggregateTop: {
    scope: 'party',
    type: 'top',
    entities: ['user'],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    },
    associatedEntities: ['user', 'party'],
    description: 'Highest Aggregate amount for given User within Party',
    storage: 'computed',
    formula: 'MAX(user aggregate totals WHERE partyId = X AND userId = Y)'
  },
  
  PartyMediaAggregateTop: {
    scope: 'party',
    type: 'top',
    entities: ['media'],
    outputType: 'amount',
    returns: {
      amount: 'Number',
      currency: 'String',
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String',
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    },
    associatedEntities: ['media', 'party'],
    description: 'Highest Aggregate amount for given Media within Party',
    storage: 'stored', // Stored in Party.media array
    formula: 'MAX(user aggregate totals WHERE partyId = X AND mediaId = Y)'
  },
  
  PartyUserBidTop: {
    scope: 'party',
    type: 'top',
    entities: ['user'],
    outputType: 'amount',
    description: 'Highest Bid amount across media for given Party and User',
    storage: 'computed',
    formula: 'MAX(bids WHERE partyId = X AND userId = Y)'
  },
  
  PartyUserAggregateTop: {
    scope: 'party',
    type: 'top',
    entities: ['user'],
    outputType: 'amount',
    description: 'Highest Aggregate amount across media for given Party and User',
    storage: 'computed',
    formula: 'MAX(user aggregate totals for party X and user Y)'
  },
  
  PartyMediaBidTop: {
    scope: 'party',
    type: 'top',
    entities: ['media'],
    outputType: 'amount',
    description: 'Highest Bid amount across Users for given Party and Media',
    storage: 'stored', // Stored in Party.media array
    formula: 'MAX(bids WHERE partyId = X AND mediaId = Y)'
  },
  
  PartyMediaAggregateTop: {
    scope: 'party',
    type: 'top',
    entities: ['media'],
    outputType: 'amount',
    description: 'Highest Aggregate amount across Users for given Party and Media',
    storage: 'stored', // Stored in Party.media array
    formula: 'MAX(user aggregate totals for party X and media Y)'
  },
  
  PartyUserMediaBidTop: {
    scope: 'party',
    type: 'top',
    entities: ['user', 'media'],
    outputType: 'amount',
    description: 'Highest Bid amount for given Party, User and Media',
    storage: 'computed',
    formula: 'MAX(bids WHERE partyId = X AND userId = Y AND mediaId = Z)'
  },

  // ========================================
  // AVERAGE METRICS (Mean bid amounts)
  // ========================================
  
  GlobalBidAvg: {
    scope: 'global',
    type: 'average',
    entities: [],
    outputType: 'amount',
    description: 'Average Bid across Parties, Users and Media',
    storage: 'computed',
    formula: 'AVG(all bid amounts)'
  },
  
  GlobalAggregateAvg: {
    scope: 'global',
    type: 'average',
    entities: [],
    outputType: 'amount',
    description: 'Average Aggregate across Parties, Users and Media',
    storage: 'computed',
    formula: 'AVG(all user aggregate totals)'
  },
  
  GlobalUserBidAvg: {
    scope: 'global',
    type: 'average',
    entities: ['user'],
    outputType: 'amount',
    description: 'Average Bid across Parties and Media for given User',
    storage: 'computed',
    formula: 'AVG(bids WHERE userId = X)'
  },
  
  GlobalUserAggregateAvg: {
    scope: 'global',
    type: 'average',
    entities: ['user'],
    outputType: 'amount',
    description: 'Average Aggregate across Parties and Media for given User',
    storage: 'computed',
    formula: 'AVG(user aggregate totals for user X)'
  },
  
  GlobalUserMediaBidAvg: {
    scope: 'global',
    type: 'average',
    entities: ['user', 'media'],
    outputType: 'amount',
    description: 'Average Bid across Parties for given User and Media',
    storage: 'computed',
    formula: 'AVG(bids WHERE userId = X AND mediaId = Y)'
  },
  
  GlobalUserMediaAggregateAvg: {
    scope: 'global',
    type: 'average',
    entities: ['user', 'media'],
    outputType: 'amount',
    description: 'Average Aggregate across Parties for given User and Media',
    storage: 'computed',
    formula: 'User aggregate total for user X and media Y (single value)'
  },
  
  GlobalMediaBidAvg: {
    scope: 'global',
    type: 'average',
    entities: ['media'],
    outputType: 'amount',
    description: 'Average Bid across Parties and Users for given Media',
    storage: 'computed',
    formula: 'AVG(bids WHERE mediaId = X)'
  },
  
  GlobalMediaAggregateAvg: {
    scope: 'global',
    type: 'average',
    entities: ['media'],
    outputType: 'amount',
    description: 'Average Aggregate across Parties and Users for given Media',
    storage: 'computed',
    formula: 'AVG(user aggregate totals for media X)'
  },
  
  PartyBidAvg: {
    scope: 'party',
    type: 'average',
    entities: [],
    outputType: 'amount',
    description: 'Average Bid across Users and Media for given Party',
    storage: 'computed',
    formula: 'AVG(bids WHERE partyId = X)'
  },
  
  PartyAggregateAvg: {
    scope: 'party',
    type: 'average',
    entities: [],
    outputType: 'amount',
    description: 'Average Aggregate across Users and Media for given Party',
    storage: 'computed',
    formula: 'AVG(user aggregate totals in party X)'
  },
  
  PartyUserBidAvg: {
    scope: 'party',
    type: 'average',
    entities: ['user'],
    outputType: 'amount',
    description: 'Average Bid across Media for given Party and User',
    storage: 'computed',
    formula: 'AVG(bids WHERE partyId = X AND userId = Y)'
  },
  
  PartyUserAggregateAvg: {
    scope: 'party',
    type: 'average',
    entities: ['user'],
    outputType: 'amount',
    description: 'Average Aggregate across Media for given Party and User',
    storage: 'computed',
    formula: 'AVG(user aggregate totals for party X and user Y)'
  },
  
  PartyUserMediaBidAvg: {
    scope: 'party',
    type: 'average',
    entities: ['user', 'media'],
    outputType: 'amount',
    description: 'Average Bid for given Party, User and Media',
    storage: 'computed',
    formula: 'AVG(bids WHERE partyId = X AND userId = Y AND mediaId = Z)'
  },
  
  PartyMediaBidAvg: {
    scope: 'party',
    type: 'average',
    entities: ['media'],
    outputType: 'amount',
    description: 'Average bid across Users for given Party and Media',
    storage: 'computed',
    formula: 'AVG(bids WHERE partyId = X AND mediaId = Y)'
  },
  
  PartyMediaAggregateAvg: {
    scope: 'party',
    type: 'average',
    entities: ['media'],
    outputType: 'amount',
    description: 'Average Aggregate across Users for given Party and Media',
    storage: 'computed',
    formula: 'AVG(user aggregate totals for party X and media Y)'
  },

  // ========================================
  // RANK METRICS (Position in ordered lists)
  // ========================================
  
  GlobalPartyAggregateRank: {
    scope: 'global',
    type: 'rank',
    entities: [],
    outputType: 'order',
    returns: {
      rank: 'Number',
      totalCount: 'Number',
      percentile: 'Number', // 0-100
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String',
      amount: 'Number'
    },
    associatedEntities: ['party'],
    description: 'Ranking of parties by their total aggregate amounts',
    storage: 'computed',
    formula: 'RANK(parties by total aggregate amounts)'
  },
  
  GlobalMediaBidTopRank: {
    scope: 'global',
    type: 'rank',
    entities: ['media'],
    outputType: 'order',
    returns: {
      rank: 'Number',
      totalCount: 'Number',
      percentile: 'Number', // 0-100
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String',
      amount: 'Number',
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String'
    },
    associatedEntities: ['media', 'user', 'party'],
    description: 'Ranking of media by their top bid amounts',
    storage: 'computed',
    formula: 'RANK(media by top bid amounts)'
  },
  
  GlobalMediaAggregateTopRank: {
    scope: 'global',
    type: 'rank',
    entities: ['media'],
    outputType: 'order',
    returns: {
      rank: 'Number',
      totalCount: 'Number',
      percentile: 'Number', // 0-100
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String',
      amount: 'Number'
    },
    associatedEntities: ['media'],
    description: 'Ranking of media by their top aggregate amounts',
    storage: 'computed',
    formula: 'RANK(media by top aggregate amounts)'
  },
  
  GlobalUserAggregateTopRank: {
    scope: 'global',
    type: 'rank',
    entities: ['user'],
    outputType: 'order',
    returns: {
      rank: 'Number',
      totalCount: 'Number',
      percentile: 'Number', // 0-100
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      amount: 'Number'
    },
    associatedEntities: ['user'],
    description: 'Ranking of users by their top aggregate amounts',
    storage: 'computed',
    formula: 'RANK(users by top aggregate amounts)'
  },
  
  GlobalUserMediaAggregateRank: {
    scope: 'global',
    type: 'rank',
    entities: ['user', 'media'],
    outputType: 'order',
    description: 'Ranking of given user-media pair globally',
    storage: 'computed',
    formula: 'RANK(user X aggregate for media Y among all user-media pairs)'
  },
  
  PartyUserAggregateRank: {
    scope: 'party',
    type: 'rank',
    entities: ['user'],
    outputType: 'order',
    description: 'Ranking of given user within party',
    storage: 'computed',
    formula: 'RANK(user X among party users by aggregate total)'
  },
  
  PartyUserMediaAggregateRank: {
    scope: 'party',
    type: 'rank',
    entities: ['user', 'media'],
    outputType: 'order',
    description: 'Ranking of given user-media pair within party',
    storage: 'computed',
    formula: 'RANK(user X aggregate for media Y among party user-media pairs)'
  },
  
  GlobalUserBidTopRank: {
    scope: 'global',
    type: 'rank',
    entities: ['user'],
    outputType: 'order',
    returns: {
      rank: 'Number',
      totalCount: 'Number',
      percentile: 'Number', // 0-100
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      amount: 'Number'
    },
    associatedEntities: ['user'],
    description: 'Ranking of users by their top bid amounts',
    storage: 'computed',
    formula: 'RANK(users by top bid amounts)'
  },
  
  GlobalUserMediaBidTopRank: {
    scope: 'global',
    type: 'rank',
    entities: ['user', 'media'],
    outputType: 'order',
    returns: {
      rank: 'Number',
      totalCount: 'Number',
      percentile: 'Number', // 0-100
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String',
      amount: 'Number'
    },
    associatedEntities: ['user', 'media'],
    description: 'Ranking of user-media pairs by their top bid amounts',
    storage: 'computed',
    formula: 'RANK(user-media pairs by top bid amounts)'
  },
  
  PartyUserBidTopRank: {
    scope: 'party',
    type: 'rank',
    entities: ['user'],
    outputType: 'order',
    returns: {
      rank: 'Number',
      totalCount: 'Number',
      percentile: 'Number', // 0-100
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String',
      amount: 'Number'
    },
    associatedEntities: ['user', 'party'],
    description: 'Ranking of users within party by their top bid amounts',
    storage: 'computed',
    formula: 'RANK(users within party by top bid amounts)'
  },
  
  PartyUserMediaBidTopRank: {
    scope: 'party',
    type: 'rank',
    entities: ['user', 'media'],
    outputType: 'order',
    returns: {
      rank: 'Number',
      totalCount: 'Number',
      percentile: 'Number', // 0-100
      userId: 'ObjectId',
      userUuid: 'String',
      username: 'String',
      mediaId: 'ObjectId',
      mediaUuid: 'String',
      title: 'String',
      artist: 'String',
      partyId: 'ObjectId',
      partyUuid: 'String',
      partyName: 'String',
      amount: 'Number'
    },
    associatedEntities: ['user', 'media', 'party'],
    description: 'Ranking of user-media pairs within party by their top bid amounts',
    storage: 'computed',
    formula: 'RANK(user-media pairs within party by top bid amounts)'
  },
  
  GlobalUserBidAvgRank: {
    scope: 'global',
    type: 'rank',
    entities: ['user'],
    outputType: 'order',
    description: 'Ranking of given user by average bid amounts',
    storage: 'computed',
    formula: 'RANK(user X among all users by average bid amount)'
  },
  
  GlobalUserAggregateAvgRank: {
    scope: 'global',
    type: 'rank',
    entities: ['user'],
    outputType: 'order',
    description: 'Ranking of given user by average aggregate amounts',
    storage: 'computed',
    formula: 'RANK(user X among all users by average aggregate total)'
  },
  
  GlobalUserMediaBidAvgRank: {
    scope: 'global',
    type: 'rank',
    entities: ['user', 'media'],
    outputType: 'order',
    description: 'Ranking of given user-media pair by average bid amounts',
    storage: 'computed',
    formula: 'RANK(user X average bids for media Y among all user-media averages)'
  },
  
  GlobalUserMediaAggregateAvgRank: {
    scope: 'global',
    type: 'rank',
    entities: ['user', 'media'],
    outputType: 'order',
    description: 'Ranking of given user-media pair by average aggregate amounts',
    storage: 'computed',
    formula: 'RANK(user X average aggregate for media Y among all user-media averages)'
  },
  
  PartyUserBidAvgRank: {
    scope: 'party',
    type: 'rank',
    entities: ['user'],
    outputType: 'order',
    description: 'Ranking of given user within party by average bid amounts',
    storage: 'computed',
    formula: 'RANK(user X among party users by average bid amount)'
  },
  
  PartyUserAggregateAvgRank: {
    scope: 'party',
    type: 'rank',
    entities: ['user'],
    outputType: 'order',
    description: 'Ranking of given user within party by average aggregate amounts',
    storage: 'computed',
    formula: 'RANK(user X among party users by average aggregate total)'
  },
  
  PartyUserMediaBidAvgRank: {
    scope: 'party',
    type: 'rank',
    entities: ['user', 'media'],
    outputType: 'order',
    description: 'Ranking of given user-media pair within party by average bid amounts',
    storage: 'computed',
    formula: 'RANK(user X average bids for media Y among party user-media averages)'
  }
};

/**
 * Helper functions for working with the bid metrics schema
 * @namespace BidMetricsSchema
 */
const BidMetricsSchema = {
  /**
   * Get all metrics for a given scope
   * @param {MetricScope} scope - The scope to filter by
   * @returns {Object<string, MetricConfig>} Metrics matching the scope
   */
  getMetricsByScope(scope) {
    return Object.entries(BID_METRICS_SCHEMA)
      .filter(([_, config]) => config.scope === scope)
      .reduce((acc, [name, config]) => ({ ...acc, [name]: config }), {});
  },

  /**
   * Get all metrics for a given type
   * @param {MetricType} type - The metric type to filter by
   * @returns {Object<string, MetricConfig>} Metrics matching the type
   */
  getMetricsByType(type) {
    return Object.entries(BID_METRICS_SCHEMA)
      .filter(([_, config]) => config.type === type)
      .reduce((acc, [name, config]) => ({ ...acc, [name]: config }), {});
  },

  // Get all stored metrics (vs computed)
  getStoredMetrics() {
    return Object.entries(BID_METRICS_SCHEMA)
      .filter(([_, config]) => config.storage === 'stored')
      .reduce((acc, [name, config]) => ({ ...acc, [name]: config }), {});
  },

  // Get all computed metrics
  getComputedMetrics() {
    return Object.entries(BID_METRICS_SCHEMA)
      .filter(([_, config]) => config.storage === 'computed')
      .reduce((acc, [name, config]) => ({ ...acc, [name]: config }), {});
  },

  // Validate metric name exists
  isValidMetric(metricName) {
    return BID_METRICS_SCHEMA.hasOwnProperty(metricName);
  },

  // Get metric configuration
  getMetricConfig(metricName) {
    return BID_METRICS_SCHEMA[metricName];
  },

  // Get all metric names
  getAllMetricNames() {
    return Object.keys(BID_METRICS_SCHEMA);
  },

  // Get metrics that require specific entities
  getMetricsRequiringEntity(entity) {
    return Object.entries(BID_METRICS_SCHEMA)
      .filter(([_, config]) => config.entities.includes(entity))
      .reduce((acc, [name, config]) => ({ ...acc, [name]: config }), {});
  },

  /**
   * Validate a metric configuration object
   * @param {MetricConfig} config - The metric configuration to validate
   * @returns {{isValid: boolean, errors: string[]}} Validation result
   */
  validateMetricConfig(config) {
    const errors = [];
    
    if (!METRIC_TYPES.includes(config.type)) {
      errors.push(`Invalid metric type: ${config.type}. Must be one of: ${METRIC_TYPES.join(', ')}`);
    }
    
    if (!SCOPES.includes(config.scope)) {
      errors.push(`Invalid scope: ${config.scope}. Must be one of: ${SCOPES.join(', ')}`);
    }
    
    if (!OUTPUT_TYPES.includes(config.outputType)) {
      errors.push(`Invalid outputType: ${config.outputType}. Must be one of: ${OUTPUT_TYPES.join(', ')}`);
    }
    
    if (!STORAGE_TYPES.includes(config.storage)) {
      errors.push(`Invalid storage: ${config.storage}. Must be one of: ${STORAGE_TYPES.join(', ')}`);
    }
    
    if (config.entities && Array.isArray(config.entities)) {
      const invalidEntities = config.entities.filter(entity => !ENTITY_TYPES.includes(entity));
      if (invalidEntities.length > 0) {
        errors.push(`Invalid entities: ${invalidEntities.join(', ')}. Must be one of: ${ENTITY_TYPES.join(', ')}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },

  // Get all possible metric combinations (useful for testing/generation)
  getAllPossibleCombinations() {
    const combinations = [];
    
    for (const scope of SCOPES) {
      for (const type of METRIC_TYPES) {
        // Generate combinations for different entity combinations
        const entityCombinations = [
          [], // No entities
          ['user'], // User only
          ['media'], // Media only
          ['user', 'media'], // User + Media
          ['user', 'party'], // User + Party (for party-scoped metrics)
          ['media', 'party'], // Media + Party (for party-scoped metrics)
          ['user', 'media', 'party'] // All entities
        ];
        
        for (const entities of entityCombinations) {
          // Skip invalid combinations (e.g., global scope with party entity)
          if (scope === 'global' && entities.includes('party')) {
            continue;
          }
          
          combinations.push({
            scope,
            type,
            entities,
            name: this.generateMetricName(scope, type, entities)
          });
        }
      }
    }
    
    return combinations;
  },

  // Generate metric name from components
  generateMetricName(scope, type, entities) {
    const scopePrefix = scope.charAt(0).toUpperCase() + scope.slice(1);
    const typeSuffix = type.charAt(0).toUpperCase() + type.slice(1);
    
    if (entities.length === 0) {
      return `${scopePrefix}${typeSuffix}`;
    }
    
    const entityNames = entities.map(entity => 
      entity.charAt(0).toUpperCase() + entity.slice(1)
    ).join('');
    
    return `${scopePrefix}${entityNames}${typeSuffix}`;
  }
};

module.exports = {
  BID_METRICS_SCHEMA,
  BidMetricsSchema,
  METRIC_TYPES,
  SCOPES,
  OUTPUT_TYPES,
  STORAGE_TYPES,
  ENTITY_TYPES
};
