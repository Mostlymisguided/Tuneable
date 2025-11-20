/**
 * Bid Metrics Computation Engine
 * 
 * This service provides dynamic computation of bid metrics based on the
 * bid metrics schema. It handles both stored and computed metrics,
 * providing a unified interface for all bid-related calculations.
 * 
 * IMPORTANT: All monetary amounts (amounts, aggregates, tops) are stored
 * and computed in PENCE (integer), not pounds. This includes:
 * - Bid amounts from the Bid collection (already in pence)
 * - Computed aggregates (sums of bid amounts in pence)
 * - Stored metric values (stored as pence integers)
 * 
 * Conversion to pounds for display should happen in the frontend using
 * the currency utility functions (penceToPounds, penceToPoundsNumber).
 */

const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Media = require('../models/Media');
const Party = require('../models/Party');
const User = require('../models/User');
const { BidMetricsSchema } = require('../utils/bidMetricsSchema');
const { validatePenceAmount } = require('../utils/penceValidation');

class BidMetricsEngine {
  constructor() {
    this.cache = new Map(); // Simple in-memory cache for computed metrics
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Compute a specific metric with given parameters
   * @param {string} metricName - Name of the metric to compute
   * @param {Object} params - Parameters for the computation
   * @param {string} params.userId - User ID (if required by metric)
   * @param {string} params.mediaId - Media ID (if required by metric)
   * @param {string} params.partyId - Party ID (if required by metric)
   * @returns {Promise<Object>} Computed metric result with full context.
   *                            All monetary amounts in result.amount are in PENCE (integer).
   *                            Example: { amount: 150, currency: 'GBP', ... } represents £1.50
   */
  async computeMetric(metricName, params = {}) {
    const config = BidMetricsSchema.getMetricConfig(metricName);
    if (!config) {
      throw new Error(`Unknown metric: ${metricName}`);
    }

    // Validate required entities
    this._validateRequiredEntities(config, params);

    // Check cache first
    const cacheKey = this._generateCacheKey(metricName, params);
    const cached = this._getFromCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Compute the metric with full context
    let result;
    switch (config.type) {
      case 'aggregate':
        result = await this._computeAggregateMetric(metricName, params, config);
        break;
      case 'top':
        result = await this._computeTopMetric(metricName, params, config);
        break;
      case 'average':
        result = await this._computeAverageMetric(metricName, params, config);
        break;
      case 'rank':
        result = await this._computeRankMetric(metricName, params, config);
        break;
      default:
        throw new Error(`Unknown metric type: ${config.type}`);
    }

    // Cache the result
    this._setCache(cacheKey, result);
    return result;
  }

  /**
   * Update all relevant metrics when a bid is created/updated/deleted
   * All stored metric values are in PENCE (integers)
   * @param {Object} bidData - The bid data that changed (bidData.amount should be in pence)
   * @param {string} operation - 'create', 'update', or 'delete'
   */
  async updateMetricsForBidChange(bidData, operation = 'create') {
    console.log(`🔄 Updating metrics for bid ${operation}:`, bidData);

    // Clear relevant cache entries
    this._clearCacheForBid(bidData);

    // Update stored metrics that are affected
    const storedMetrics = BidMetricsSchema.getStoredMetrics();
    
    for (const [metricName, config] of Object.entries(storedMetrics)) {
      try {
        await this._updateStoredMetric(metricName, bidData, operation);
      } catch (error) {
        console.error(`Error updating stored metric ${metricName}:`, error);
      }
    }

    console.log('✅ Metrics update complete');
  }

  /**
   * Recompute all stored metrics for a specific media item
   * All metric values are stored in PENCE (integers)
   * @param {string} mediaId - Media ID to recompute metrics for
   */
  async recomputeMediaMetrics(mediaId) {
    console.log(`🔄 Recomputing all metrics for media: ${mediaId}`);

    const storedMetrics = BidMetricsSchema.getStoredMetrics();
    const mediaMetrics = Object.entries(storedMetrics)
      .filter(([_, config]) => config.entities.includes('media') || config.entities.length === 0);

    for (const [metricName, config] of mediaMetrics) {
      try {
        const result = await this.computeMetric(metricName, { mediaId });
        await this._storeMetric(metricName, { mediaId }, result);
      } catch (error) {
        console.error(`Error recomputing metric ${metricName} for media ${mediaId}:`, error);
      }
    }

    console.log(`✅ Media metrics recomputation complete for: ${mediaId}`);
  }

  /**
   * Recompute all stored metrics for a specific party
   * All metric values are stored in PENCE (integers)
   * @param {string} partyId - Party ID to recompute metrics for
   */
  async recomputePartyMetrics(partyId) {
    console.log(`🔄 Recomputing all metrics for party: ${partyId}`);

    const storedMetrics = BidMetricsSchema.getStoredMetrics();
    const partyMetrics = Object.entries(storedMetrics)
      .filter(([_, config]) => config.scope === 'party');

    for (const [metricName, config] of partyMetrics) {
      try {
        const result = await this.computeMetric(metricName, { partyId });
        await this._storeMetric(metricName, { partyId }, result);
      } catch (error) {
        console.error(`Error recomputing metric ${metricName} for party ${partyId}:`, error);
      }
    }

    console.log(`✅ Party metrics recomputation complete for: ${partyId}`);
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  /**
   * Validate that required entity IDs are provided
   * @param {Object} config - Metric configuration
   * @param {Object} params - Parameters for computation
   */
  _validateRequiredEntities(config, params) {
    for (const entity of config.entities) {
      if (!params[`${entity}Id`]) {
        throw new Error(`Metric ${config.name} requires ${entity}Id parameter`);
      }
    }
  }

  /**
   * Validate that an amount is a valid integer in pence
   * Delegates to the shared validation utility
   * @param {number} amount - Amount to validate (should be in pence)
   * @param {string} context - Context for error messages
   * @returns {number} Validated amount as integer
   */
  _validatePenceAmount(amount, context = 'amount') {
    return validatePenceAmount(amount, context, true); // allowZero = true
  }

  _generateCacheKey(metricName, params) {
    return `${metricName}:${JSON.stringify(params)}`;
  }

  _getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value;
    }
    return null;
  }

  _setCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  _clearCacheForBid(bidData) {
    // Clear cache entries that might be affected by this bid change
    const keysToDelete = [];
    for (const [key] of this.cache) {
      if (key.includes(bidData.userId) || 
          key.includes(bidData.mediaId) || 
          key.includes(bidData.partyId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Compute an aggregate metric (sum of bid amounts)
   * @param {string} metricName - Name of the metric
   * @param {Object} params - Parameters (userId, mediaId, partyId)
   * @param {Object} config - Metric configuration
   * @returns {Promise<Object>} Result with amount in PENCE (integer) and context
   */
  async _computeAggregateMetric(metricName, params, config) {
    // Build aggregation pipeline based on metric requirements
    const matchStage = { status: 'active' };
    
    if (params.userId) matchStage.userId = new mongoose.Types.ObjectId(params.userId);
    if (params.mediaId) matchStage.mediaId = new mongoose.Types.ObjectId(params.mediaId);
    if (params.partyId) matchStage.partyId = new mongoose.Types.ObjectId(params.partyId);

    const pipeline = [
      { $match: matchStage },
      { $group: { _id: null, total: { $sum: "$amount" } } } // Sum of amounts (already in pence)
    ];

    const result = await Bid.aggregate(pipeline);
    const amount = this._validatePenceAmount(
      result.length > 0 ? result[0].total : 0,
      `${metricName} aggregate`
    );
    
    // Debug logging for PartyMediaAggregate to help diagnose tip total issues
    if (metricName === 'PartyMediaAggregate' && params.partyId && params.mediaId) {
      console.log(`🔍 Computing ${metricName} for party ${params.partyId}, media ${params.mediaId}:`, {
        matchStage,
        resultCount: result.length,
        amount,
        result
      });
    }
    
    // Build full context based on config.returns
    const context = {
      amount,
      currency: 'GBP' // Default currency
    };
    
    // Add entity information based on associatedEntities
    if (config.associatedEntities) {
      for (const entity of config.associatedEntities) {
        if (entity === 'user' && params.userId) {
          const user = await User.findById(params.userId).select('username uuid');
          if (user) {
            context.userId = user._id;
            context.userUuid = user.uuid;
            context.username = user.username;
          }
        }
        
        if (entity === 'media' && params.mediaId) {
          const media = await Media.findById(params.mediaId).select('title artist uuid');
          if (media) {
            context.mediaId = media._id;
            context.mediaUuid = media.uuid;
            context.title = media.title;
            context.artist = Array.isArray(media.artist) ? media.artist[0]?.name : media.artist;
          }
        }
        
        if (entity === 'party' && params.partyId) {
          const party = await Party.findById(params.partyId).select('name uuid');
          if (party) {
            context.partyId = party._id;
            context.partyUuid = party.uuid;
            context.partyName = party.name;
          }
        }
      }
    }
    
    return context;
  }

  /**
   * Compute a top metric (highest bid amount or highest aggregate)
   * @param {string} metricName - Name of the metric
   * @param {Object} params - Parameters (userId, mediaId, partyId)
   * @param {Object} config - Metric configuration
   * @returns {Promise<Object>} Result with amount in PENCE (integer) and context
   */
  async _computeTopMetric(metricName, params, config) {
    // Build query based on metric requirements
    const query = { status: 'active' };
    
    if (params.userId) query.userId = new mongoose.Types.ObjectId(params.userId);
    if (params.mediaId) query.mediaId = new mongoose.Types.ObjectId(params.mediaId);
    if (params.partyId) query.partyId = new mongoose.Types.ObjectId(params.partyId);

    if (config.description.includes('Aggregate')) {
      // For aggregate top metrics, we need to compute aggregates first
      // Determine grouping: if entities includes 'user' but params.userId is not provided,
      // we're finding the top user across all users (group by userId)
      // If params.userId is provided, we're filtering to that user (group by null to get their total)
      // If entities doesn't include 'user', we're finding top across other dimensions
      let groupById = null;
      if (config.entities.includes('user') && !params.userId) {
        // Finding top user aggregate - group by userId to get each user's total
        groupById = '$userId';
      } else if (params.userId) {
        // Filtering to specific user - group by null to get their total
        groupById = null;
      } else {
        // Other aggregate top metrics - group by the relevant entity
        // For media aggregate top, we want to group by userId to find top user
        if (config.entities.includes('media') && !config.entities.includes('user')) {
          groupById = '$userId';
        } else {
          groupById = null;
        }
      }
      
      const aggregationPipeline = [
        { $match: query },
        { $group: { 
            _id: groupById, 
            total: { $sum: "$amount" } 
        }},
        { $sort: { total: -1 } },
        { $limit: 1 }
      ];
      
      const result = await Bid.aggregate(aggregationPipeline);
      const amount = this._validatePenceAmount(
        result.length > 0 ? result[0].total : 0,
        `${metricName} top aggregate`
      );
      
      // Build full context (amount is in pence)
      const context = { amount, currency: 'GBP' };
      
      // Add user information if available
      if (result.length > 0 && result[0]._id) {
        const user = await User.findById(result[0]._id).select('username uuid');
        if (user) {
          context.userId = user._id;
          context.userUuid = user.uuid;
          context.username = user.username;
        }
      }
      
      return context;
    } else {
      // For individual bid top metrics
      const result = await Bid.findOne(query).sort({ amount: -1 });
      const amount = this._validatePenceAmount(
        result ? result.amount : 0,
        `${metricName} top bid`
      );
      
      // Build full context (amount is in pence)
      const context = { amount, currency: 'GBP' };
      
      // Add user information if available
      if (result && result.userId) {
        const user = await User.findById(result.userId).select('username uuid');
        if (user) {
          context.userId = user._id;
          context.userUuid = user.uuid;
          context.username = user.username;
        }
      }
      
      // Add party information if available
      if (result && result.partyId) {
        const party = await Party.findById(result.partyId).select('name uuid');
        if (party) {
          context.partyId = party._id;
          context.partyUuid = party.uuid;
          context.partyName = party.name;
        }
      }
      
      return context;
    }
  }

  /**
   * Compute an average metric (average of bid amounts)
   * @param {string} metricName - Name of the metric
   * @param {Object} params - Parameters (userId, mediaId, partyId)
   * @returns {Promise<number>} Average amount in PENCE (may be decimal, should be rounded when stored)
   */
  async _computeAverageMetric(metricName, params) {
    const config = BidMetricsSchema.getMetricConfig(metricName);
    
    // Build aggregation pipeline
    const matchStage = { status: 'active' };
    
    if (params.userId) matchStage.userId = new mongoose.Types.ObjectId(params.userId);
    if (params.mediaId) matchStage.mediaId = new mongoose.Types.ObjectId(params.mediaId);
    if (params.partyId) matchStage.partyId = new mongoose.Types.ObjectId(params.partyId);

    const pipeline = [
      { $match: matchStage },
      { $group: { _id: null, average: { $avg: "$amount" } } } // Average of amounts (in pence)
    ];

    const result = await Bid.aggregate(pipeline);
    const average = result.length > 0 ? result[0].average : 0;
    // Note: Average may be decimal (e.g., 1.5 pence), but this is acceptable for averages
    // When storing as an aggregate, use Math.round() to convert to integer
    return average;
  }

  async _computeRankMetric(metricName, params) {
    // Ranking is complex and depends on the specific metric
    // For now, return a placeholder implementation
    console.log(`Ranking computation not yet implemented for ${metricName}`);
    return 0;
  }

  /**
   * Update a stored metric after a bid change
   * All metric values are stored in PENCE (integers)
   * @param {string} metricName - Name of the metric to update
   * @param {Object} bidData - The bid data that changed
   * @param {string} operation - 'create', 'update', or 'delete'
   */
  async _updateStoredMetric(metricName, bidData, operation) {
    const config = BidMetricsSchema.getMetricConfig(metricName);
    
    // Determine where to store this metric based on its scope and entities
    if (config.scope === 'global' && config.entities.includes('media')) {
      // Global media metrics (stored in Media model)
      await this._updateGlobalMediaMetric(metricName, bidData, operation);
    } else if (config.scope === 'party' && config.entities.includes('media')) {
      // Party-media metrics (stored in Party.media array)
      await this._updatePartyMediaMetric(metricName, bidData, operation);
    } else if (config.scope === 'party' && config.entities.length === 0) {
      // Party-level metrics (stored at Party root)
      // These are updated by _updatePartyLevelMetrics() which is called by _updatePartyMediaMetric
      // No need to update separately to avoid duplicate calls
    } else if (config.scope === 'party' && config.entities.includes('user') && !config.entities.includes('media')) {
      // Party-user metrics (stored at Party root)
      // These are updated by _updatePartyLevelMetrics()
    } else if (config.entities.includes('user') && config.entities.includes('media')) {
      // User-media metrics (stored in Bid model)
      await this._updateBidMetric(metricName, bidData, operation);
    }
  }

  /**
   * Update a global media metric (stored in Media model)
   * Stores metric value in PENCE (integer)
   * @param {string} metricName - Name of the metric
   * @param {Object} bidData - Bid data that triggered the update
   * @param {string} operation - Operation type
   */
  async _updateGlobalMediaMetric(metricName, bidData, operation) {
    const mediaId = bidData.mediaId;
    const result = await this.computeMetric(metricName, { mediaId });
    
    // Update Media model with the new metric value and user references
    const updateFields = {};
    const fieldName = this._getMetricFieldName(metricName);
    
    // Store the main metric value (validate and ensure it's an integer in pence)
    updateFields[fieldName] = this._validatePenceAmount(result.amount, `${metricName} for media ${mediaId}`);
    
    // Store user references for gamification (if applicable)
    if (metricName === 'GlobalMediaBidTop' && result.userId) {
      updateFields.globalMediaBidTopUser = result.userId;
    } else if (metricName === 'GlobalMediaAggregateTop' && result.userId) {
      updateFields.globalMediaAggregateTopUser = result.userId;
    }
    
    await Media.findByIdAndUpdate(mediaId, updateFields);
    
    console.log(`📊 Updated ${metricName} for media ${mediaId}: ${result.amount}`);
  }

  /**
   * Update a party-media metric (stored in Party.media array)
   * Stores metric value in PENCE (integer)
   * @param {string} metricName - Name of the metric
   * @param {Object} bidData - Bid data that triggered the update
   * @param {string} operation - Operation type
   */
  async _updatePartyMediaMetric(metricName, bidData, operation) {
    const partyId = bidData.partyId;
    const mediaId = bidData.mediaId;
    const result = await this.computeMetric(metricName, { partyId, mediaId });
    
    // Update Party.media array with the new metric value and user references
    const updateFields = {};
    const fieldName = this._getMetricFieldName(metricName);
    
    // Store the main metric value (validate and ensure it's an integer in pence)
    // Note: 0 is a valid value for pence, so we handle it explicitly
    const metricValue = (result.amount !== undefined && result.amount !== null)
      ? this._validatePenceAmount(result.amount, `${metricName} for party ${partyId}, media ${mediaId}`)
      : 0;
    updateFields[`media.$.${fieldName}`] = metricValue;
    
    // Store user references for gamification (if applicable)
    if (metricName === 'PartyMediaBidTop' && result.userId) {
      updateFields['media.$.partyMediaBidTopUser'] = result.userId;
    } else if (metricName === 'PartyMediaAggregateTop' && result.userId) {
      updateFields['media.$.partyMediaAggregateTopUser'] = result.userId;
    }
    
    // FIX: Handle mediaId that might already be ObjectId or string, and ensure proper matching
    const mediaIdObj = mongoose.Types.ObjectId.isValid(mediaId) 
      ? (mediaId instanceof mongoose.Types.ObjectId ? mediaId : new mongoose.Types.ObjectId(mediaId))
      : mediaId;
    
    const updateResult = await Party.findOneAndUpdate(
      { 
        _id: partyId, 
        'media.mediaId': mediaIdObj
      },
      { 
        $set: updateFields
      }
    );
    
    if (!updateResult) {
      console.warn(`⚠️ Failed to update ${metricName} for party ${partyId}, media ${mediaId} - party or media entry not found. Query: { _id: ${partyId}, 'media.mediaId': ${mediaIdObj} }`);
    } else {
      console.log(`📊 Updated ${metricName} for party ${partyId}, media ${mediaId}: ${metricValue} (was ${result.amount}, result object:`, result, ')');
    }
    
    // Also update party-level metrics if this affects them
    await this._updatePartyLevelMetrics(partyId, bidData, operation);
  }

  /**
   * Update party-level metrics (stored at Party root)
   * All metric values are stored in PENCE (integers)
   * @param {string} partyId - Party ID
   * @param {Object} bidData - Bid data that triggered the update
   * @param {string} operation - Operation type
   */
  async _updatePartyLevelMetrics(partyId, bidData, operation) {
    // Update party-level metrics based on the bid change
    try {
      const updateFields = {};
      
      // Compute PartyBidTop (highest bid across all media) - stored in pence
      const partyBidTopResult = await this.computeMetric('PartyBidTop', { partyId });
      updateFields.partyBidTop = this._validatePenceAmount(
        partyBidTopResult.amount || 0,
        'PartyBidTop'
      );
      if (partyBidTopResult.userId) {
        updateFields.partyBidTopUser = partyBidTopResult.userId;
      }
      
      // Compute PartyUserAggregateTop (highest user aggregate in party) - stored in pence
      const partyUserAggregateTopResult = await this.computeMetric('PartyUserAggregateTop', { partyId });
      updateFields.partyUserAggregateTop = this._validatePenceAmount(
        partyUserAggregateTopResult.amount || 0,
        'PartyUserAggregateTop'
      );
      if (partyUserAggregateTopResult.userId) {
        updateFields.partyUserAggregateTopUser = partyUserAggregateTopResult.userId;
      }
      
      // Compute PartyUserBidTop (highest user bid in party) - stored in pence
      // This is computed by finding the highest bid amount any single user has made
      const partyUserBidTopResult = await this.computeMetric('PartyUserBidTop', { partyId });
      updateFields.partyUserBidTop = this._validatePenceAmount(
        partyUserBidTopResult.amount || 0,
        'PartyUserBidTop'
      );
      if (partyUserBidTopResult.userId) {
        updateFields.partyUserBidTopUser = partyUserBidTopResult.userId;
      }
      
      await Party.findByIdAndUpdate(partyId, updateFields);
      
      console.log(`📊 Updated party-level metrics for party ${partyId}`);
    } catch (error) {
      console.error(`Error updating party-level metrics for party ${partyId}:`, error);
    }
  }

  /**
   * Update a bid-level metric (stored in Bid model)
   * Stores metric value in PENCE (integer)
   * @param {string} metricName - Name of the metric
   * @param {Object} bidData - Bid data that triggered the update
   * @param {string} operation - Operation type
   */
  async _updateBidMetric(metricName, bidData, operation) {
    const bidId = bidData._id || bidData.id;
    const result = await this.computeMetric(metricName, bidData);
    
    // Update Bid model with the new metric value (validate it's in pence)
    const updateField = this._getMetricFieldName(metricName);
    const metricValue = this._validatePenceAmount(
      result.amount || result, // Some metrics return number directly
      `${metricName} for bid ${bidId}`
    );
    await Bid.findByIdAndUpdate(bidId, { [updateField]: metricValue });
    
    console.log(`📊 Updated ${metricName} for bid ${bidId}: ${metricValue} pence`);
  }

  _getMetricFieldName(metricName) {
    // Convert metric name to field name (e.g., GlobalMediaAggregate -> globalMediaAggregate)
    return metricName.charAt(0).toLowerCase() + metricName.slice(1);
  }

  async _storeMetric(metricName, params, value) {
    // This method would store computed values in the appropriate model
    // Implementation depends on where each metric should be stored
    console.log(`Storing metric ${metricName}:`, value);
  }
}

// Export singleton instance
module.exports = new BidMetricsEngine();
