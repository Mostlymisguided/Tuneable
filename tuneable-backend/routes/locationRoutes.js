const express = require('express');
const mapboxGeocoding = require('../services/mapboxGeocodingService');
const { applyResolvedLocation } = require('../utils/locationUtils');
const { getLocationProfile } = require('../services/locationProfileService');

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
 * GET /api/locations/:placeId/profile
 * Place profile — media originating from this Mapbox place (or descendants).
 */
router.get('/:placeId/profile', async (req, res) => {
  try {
    const { placeId } = req.params;
    const { page = 1, limit = 50, timePeriod = 'all-time' } = req.query;

    if (!placeId || !String(placeId).trim()) {
      return res.status(400).json({ error: 'Place id is required' });
    }

    const profile = await getLocationProfile(placeId, { page, limit, timePeriod });
    res.json(profile);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: error.message || 'Place not found' });
    }
    console.error('Error fetching location profile:', error);
    res.status(500).json({ error: 'Failed to fetch location profile' });
  }
});

/**
 * GET /api/locations/:placeId/champions
 * Tip-aggregate champions for media originating from this place
 * (optionally further filtered by tipper Mapbox place via locationPlaceId).
 */
router.get('/:placeId/champions', async (req, res) => {
  try {
    const { placeId } = req.params;
    const { locationPlaceId, limit } = req.query;

    if (!placeId || !String(placeId).trim()) {
      return res.status(400).json({ error: 'Place id is required' });
    }

    const { getLocationChampions } = require('../services/mediaChampionsService');
    const result = await getLocationChampions(placeId, { locationPlaceId, limit });

    if (!result) {
      return res.status(404).json({ error: 'Place not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error fetching location champions:', error);
    res.status(500).json({ error: 'Failed to fetch location champions' });
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
