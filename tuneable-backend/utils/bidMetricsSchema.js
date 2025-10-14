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
 * Helper functions for working with the schema
 */
const BidMetricsSchema = {
  // Get all metrics for a given scope
  getMetricsByScope(scope) {
    return Object.entries(BID_METRICS_SCHEMA)
      .filter(([_, config]) => config.scope === scope)
      .reduce((acc, [name, config]) => ({ ...acc, [name]: config }), {});
  },

  // Get all metrics for a given type
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
  }
};

module.exports = {
  BID_METRICS_SCHEMA,
  BidMetricsSchema
};
