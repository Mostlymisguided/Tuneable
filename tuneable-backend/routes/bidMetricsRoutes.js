/**
 * Bid Metrics API Routes
 * 
 * Provides endpoints for querying bid metrics using the new
 * BidMetricsEngine and bid metrics schema.
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const bidMetricsEngine = require('../services/bidMetricsEngine');
const { BidMetricsSchema } = require('../utils/bidMetricsSchema');

/**
 * Get available metrics schema
 */
router.get('/schema', authMiddleware, (req, res) => {
  try {
    const schema = BidMetricsSchema.getAllMetricNames().reduce((acc, metricName) => {
      const config = BidMetricsSchema.getMetricConfig(metricName);
      acc[metricName] = {
        scope: config.scope,
        type: config.type,
        entities: config.entities,
        outputType: config.outputType,
        description: config.description,
        storage: config.storage
      };
      return acc;
    }, {});

    res.json({
      success: true,
      schema,
      totalMetrics: Object.keys(schema).length
    });
  } catch (error) {
    console.error('Error getting metrics schema:', error);
    res.status(500).json({ error: 'Failed to get metrics schema' });
  }
});

/**
 * Compute a specific metric
 */
router.post('/compute', authMiddleware, async (req, res) => {
  try {
    const { metricName, userId, mediaId, partyId } = req.body;

    if (!metricName) {
      return res.status(400).json({ error: 'metricName is required' });
    }

    if (!BidMetricsSchema.isValidMetric(metricName)) {
      return res.status(400).json({ 
        error: 'Invalid metric name',
        availableMetrics: BidMetricsSchema.getAllMetricNames()
      });
    }

    const params = {};
    if (userId) params.userId = userId;
    if (mediaId) params.mediaId = mediaId;
    if (partyId) params.partyId = partyId;

    const result = await bidMetricsEngine.computeMetric(metricName, params);
    const config = BidMetricsSchema.getMetricConfig(metricName);

    res.json({
      success: true,
      metric: metricName,
      value: result,
      config: {
        scope: config.scope,
        type: config.type,
        entities: config.entities,
        description: config.description
      },
      params
    });

  } catch (error) {
    console.error('Error computing metric:', error);
    res.status(500).json({ 
      error: 'Failed to compute metric',
      details: error.message 
    });
  }
});

/**
 * Get metrics by scope (global/party)
 */
router.get('/scope/:scope', authMiddleware, (req, res) => {
  try {
    const { scope } = req.params;
    
    if (!['global', 'party'].includes(scope)) {
      return res.status(400).json({ 
        error: 'Invalid scope. Must be "global" or "party"' 
      });
    }

    const metrics = BidMetricsSchema.getMetricsByScope(scope);
    
    res.json({
      success: true,
      scope,
      metrics,
      count: Object.keys(metrics).length
    });

  } catch (error) {
    console.error('Error getting metrics by scope:', error);
    res.status(500).json({ error: 'Failed to get metrics by scope' });
  }
});

/**
 * Get metrics by type (aggregate/top/average/rank)
 */
router.get('/type/:type', authMiddleware, (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['aggregate', 'top', 'average', 'rank'].includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid type. Must be "aggregate", "top", "average", or "rank"' 
      });
    }

    const metrics = BidMetricsSchema.getMetricsByType(type);
    
    res.json({
      success: true,
      type,
      metrics,
      count: Object.keys(metrics).length
    });

  } catch (error) {
    console.error('Error getting metrics by type:', error);
    res.status(500).json({ error: 'Failed to get metrics by type' });
  }
});

/**
 * Get stored vs computed metrics breakdown
 */
router.get('/storage', authMiddleware, (req, res) => {
  try {
    const stored = BidMetricsSchema.getStoredMetrics();
    const computed = BidMetricsSchema.getComputedMetrics();

    res.json({
      success: true,
      stored: {
        metrics: stored,
        count: Object.keys(stored).length
      },
      computed: {
        metrics: computed,
        count: Object.keys(computed).length
      },
      total: Object.keys(stored).length + Object.keys(computed).length
    });

  } catch (error) {
    console.error('Error getting storage breakdown:', error);
    res.status(500).json({ error: 'Failed to get storage breakdown' });
  }
});

/**
 * Recompute metrics for a specific media item
 */
router.post('/recompute/media/:mediaId', authMiddleware, async (req, res) => {
  try {
    const { mediaId } = req.params;
    
    await bidMetricsEngine.recomputeMediaMetrics(mediaId);
    
    res.json({
      success: true,
      message: `Metrics recomputed for media ${mediaId}`,
      mediaId
    });

  } catch (error) {
    console.error('Error recomputing media metrics:', error);
    res.status(500).json({ 
      error: 'Failed to recompute media metrics',
      details: error.message 
    });
  }
});

/**
 * Recompute metrics for a specific party
 */
router.post('/recompute/party/:partyId', authMiddleware, async (req, res) => {
  try {
    const { partyId } = req.params;
    
    await bidMetricsEngine.recomputePartyMetrics(partyId);
    
    res.json({
      success: true,
      message: `Metrics recomputed for party ${partyId}`,
      partyId
    });

  } catch (error) {
    console.error('Error recomputing party metrics:', error);
    res.status(500).json({ 
      error: 'Failed to recompute party metrics',
      details: error.message 
    });
  }
});

module.exports = router;
