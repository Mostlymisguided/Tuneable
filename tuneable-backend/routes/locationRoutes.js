const express = require('express');
const mapboxGeocoding = require('../services/mapboxGeocodingService');
const { applyResolvedLocation } = require('../utils/locationUtils');

const router = express.Router();

/**
 * GET /api/locations/suggest?q=arambol&country=in&worldview=in
 * Autocomplete — temporary Mapbox results (not stored).
 */
router.get('/suggest', async (req, res) => {
  try {
    const { q, country, worldview, language, limit, proximity } = req.query;

    if (!q || typeof q !== 'string' || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const suggestions = await mapboxGeocoding.suggest(q, {
      country: typeof country === 'string' ? country : undefined,
      worldview: typeof worldview === 'string' ? worldview : undefined,
      language: typeof language === 'string' ? language : 'en',
      limit: limit ? parseInt(limit, 10) : 8,
      proximity: typeof proximity === 'string' ? proximity : undefined,
    });

    res.json({ suggestions });
  } catch (error) {
    console.error('Location suggest error:', error.message);
    const status = error.message.includes('MAPBOX_ACCESS_TOKEN') ? 503 : 500;
    res.status(status).json({
      error: status === 503 ? 'Location search is not configured' : 'Failed to fetch location suggestions',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/locations/resolve
 * Body: { mapboxId: string }
 * Permanent geocode — safe to store on User / Bid.
 */
router.post('/resolve', async (req, res) => {
  try {
    const { mapboxId } = req.body || {};

    if (!mapboxId || typeof mapboxId !== 'string' || !mapboxId.trim()) {
      return res.status(400).json({ error: 'mapboxId is required' });
    }

    const resolved = await mapboxGeocoding.resolveByMapboxId(mapboxId.trim());
    if (!resolved) {
      return res.status(404).json({ error: 'Place not found' });
    }

    res.json({ location: applyResolvedLocation(resolved) });
  } catch (error) {
    console.error('Location resolve error:', error.message);
    const status = error.message.includes('MAPBOX_ACCESS_TOKEN') ? 503 : 500;
    res.status(status).json({
      error: status === 503 ? 'Location search is not configured' : 'Failed to resolve location',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * POST /api/locations/reverse
 * Body: { longitude: number, latitude: number }
 * Permanent reverse geocode — used for tip-time current location stamps.
 */
router.post('/reverse', async (req, res) => {
  try {
    const { longitude, latitude, lng, lat } = req.body || {};
    const lon = longitude ?? lng;
    const la = latitude ?? lat;

    if (lon == null || la == null) {
      return res.status(400).json({ error: 'longitude and latitude are required' });
    }

    const resolved = await mapboxGeocoding.reverseGeocode(lon, la, { permanent: true });
    if (!resolved) {
      return res.status(404).json({ error: 'No place found for those coordinates' });
    }

    res.json({ location: applyResolvedLocation(resolved) });
  } catch (error) {
    console.error('Location reverse error:', error.message);
    if (error.message.includes('Valid longitude') || error.message.includes('out of range')) {
      return res.status(400).json({ error: error.message });
    }
    const status = error.message.includes('MAPBOX_ACCESS_TOKEN') ? 503 : 500;
    res.status(status).json({
      error: status === 503 ? 'Location search is not configured' : 'Failed to reverse geocode location',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

module.exports = router;
