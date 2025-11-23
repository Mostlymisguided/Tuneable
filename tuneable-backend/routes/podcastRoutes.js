const express = require('express');
const mongoose = require('mongoose');
const { check, validationResult } = require('express-validator');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { isValidObjectId } = require('../utils/validators');

// Import services
const podcastIndexService = require('../services/podcastIndexService');
const applePodcastsService = require('../services/applePodcastsService');
const taddyService = require('../services/taddyService');
const podcastAdapter = require('../services/podcastAdapter');
const { parsePodcastUrl, isValidPodcastUrl } = require('../utils/podcastUrlParser');

const router = express.Router();

// ============================================================================
// CORE PODCAST FUNCTIONALITY
// ============================================================================

// Boost a podcast episode (global bid)
router.post('/:episodeId/boost', authMiddleware, async (req, res) => {
  try {
    const { episodeId } = req.params;
    const { amount } = req.body;
    const userId = req.user._id;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Boost amount must be greater than 0' });
    }
    
    const episode = await Media.findOne({
      _id: episodeId,
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] }
    });
    
    if (!episode) {
      return res.status(404).json({ error: 'Episode not found' });
    }
    
    // Get Global Party for global bids
    const Party = require('../models/Party');
    const globalParty = await Party.findOne({ type: 'global' });
    
    if (!globalParty) {
      return res.status(500).json({ error: 'Global party not found' });
    }
    
    // Create bid (using mediaId, not episodeId)
    const bid = new Bid({
      userId,
      partyId: globalParty._id,
      mediaId: episode._id,
      amount: Math.round(amount * 100), // Convert to pence
      bidScope: 'global',
      partyType: 'global',
      username: req.user.username,
      partyName: globalParty.name,
      mediaTitle: episode.title,
      mediaArtist: episode.host && episode.host.length > 0 ? episode.host[0].name : '',
      mediaCoverArt: episode.coverArt || ''
    });
    
    await bid.save();
    
    // Calculate and award TuneBytes for this bid (async, don't block response)
    try {
      const tuneBytesService = require('../services/tuneBytesService');
      tuneBytesService.awardTuneBytesForBid(bid._id).catch(error => {
        console.error('Failed to calculate TuneBytes for bid:', bid._id, error);
      });
    } catch (error) {
      console.error('Error setting up TuneBytes calculation:', error);
    }
    
    // Update episode global aggregate
    episode.globalMediaAggregate = (episode.globalMediaAggregate || 0) + Math.round(amount * 100);
    await episode.save();
    
    res.json({ message: 'Episode boosted successfully!', episode });
  } catch (error) {
    console.error('Error boosting episode:', error);
    res.status(500).json({ error: 'Failed to boost episode' });
  }
});

// Add episode to party
router.post('/:episodeId/party/:partyId/bid', authMiddleware, async (req, res) => {
  try {
    const { episodeId, partyId } = req.params;
    const { amount } = req.body;
    const userId = req.user._id;
    
    console.log('🎧 Podcast bidding request:', { episodeId, partyId, amount, userId });
    
    if (!mongoose.isValidObjectId(episodeId) || !mongoose.isValidObjectId(partyId)) {
      console.log('❌ Invalid IDs:', { episodeId, partyId });
      return res.status(400).json({ error: 'Invalid episode or party ID' });
    }
    
    if (!amount || amount <= 0) {
      console.log('❌ Invalid amount:', amount);
      return res.status(400).json({ error: 'Bid amount must be greater than 0' });
    }
    
    // Find episode using Media model
    const episode = await Media.findOne({
      _id: episodeId,
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] }
    });
    
    if (!episode) {
      console.log('❌ Episode not found:', episodeId);
      return res.status(404).json({ error: 'Episode not found' });
    }
    console.log('✅ Episode found:', episode.title);
    
    // Import Party model here to avoid circular dependency
    const Party = require('../models/Party');
    const party = await Party.findById(partyId);
    if (!party) {
      console.log('❌ Party not found:', partyId);
      return res.status(404).json({ error: 'Party not found' });
    }
    console.log('✅ Party found:', party.name);
    
    // Check if user is in the party
    if (!party.partiers.includes(userId)) {
      console.log('❌ User not in party:', { userId, partiers: party.partiers });
      return res.status(403).json({ error: 'You must be a party member to bid' });
    }
    console.log('✅ User is in party');
    
    // Check if episode is already in party
    let partyMediaEntry = party.media.find(entry => 
      entry.mediaId && entry.mediaId.toString() === episodeId
    );
    
    if (!partyMediaEntry) {
      // Add episode to party media
      partyMediaEntry = {
        mediaId: episode._id,
        addedBy: userId,
        partyMediaAggregate: 0,
        partyBids: [],
        status: 'active',
        queuedAt: new Date()
      };
      party.media.push(partyMediaEntry);
    }
    
    // Convert amount to pence
    const amountInPence = Math.round(amount * 100);
    
    // Create bid (using mediaId, not episodeId)
    const bid = new Bid({
      userId,
      partyId,
      mediaId: episode._id,
      amount: amountInPence,
      bidScope: 'party',
      partyType: party.type,
      username: req.user.username,
      partyName: party.name,
      mediaTitle: episode.title,
      mediaArtist: episode.host && episode.host.length > 0 ? episode.host[0].name : '',
      mediaCoverArt: episode.coverArt || ''
    });
    
    await bid.save();
    
    // Calculate and award TuneBytes for this bid (async, don't block response)
    try {
      const tuneBytesService = require('../services/tuneBytesService');
      tuneBytesService.awardTuneBytesForBid(bid._id).catch(error => {
        console.error('Failed to calculate TuneBytes for bid:', bid._id, error);
      });
    } catch (error) {
      console.error('Error setting up TuneBytes calculation:', error);
    }
    
    // Update party media entry
    partyMediaEntry.partyMediaAggregate = (partyMediaEntry.partyMediaAggregate || 0) + amountInPence;
    partyMediaEntry.partyBids.push(bid._id);
    await party.save();
    
    // Update global episode aggregate
    episode.globalMediaAggregate = (episode.globalMediaAggregate || 0) + amountInPence;
    await episode.save();
    
    res.json({ message: 'Episode added to party and bid placed!', episode });
  } catch (error) {
    console.error('Error adding episode to party:', error);
    res.status(500).json({ error: 'Failed to add episode to party' });
  }
});

// Get categories list
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await Media.distinct('category', {
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] },
      category: { $ne: null }
    });
    res.json({ categories: categories.filter(Boolean).sort() });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

// ============================================================================
// PODCAST DISCOVERY - PODCASTINDEX.ORG
// ============================================================================

// Search podcasts from PodcastIndex
router.get('/discovery/podcastindex/search-podcasts', async (req, res) => {
  try {
    const { q, max = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await podcastIndexService.searchPodcasts(q, parseInt(max));
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Convert to our format
    const podcasts = result.podcasts.map(podcast => 
      podcastIndexService.convertPodcastToOurFormat(podcast)
    );

    res.json({ 
      podcasts, 
      count: result.count,
      source: 'podcastindex'
    });
  } catch (error) {
    console.error('Error searching podcasts:', error);
    res.status(500).json({ error: 'Failed to search podcasts' });
  }
});

// Search episodes from PodcastIndex
router.get('/discovery/podcastindex/search-episodes', async (req, res) => {
  try {
    const { q, max = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await podcastIndexService.searchEpisodes(q, parseInt(max));
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Convert to our format
    const episodes = result.episodes.map(episode => 
      podcastIndexService.convertEpisodeToOurFormat(episode)
    );

    res.json({ 
      episodes, 
      count: result.count,
      source: 'podcastindex'
    });
  } catch (error) {
    console.error('Error searching episodes:', error);
    res.status(500).json({ error: 'Failed to search episodes' });
  }
});

// Import episodes from PodcastIndex
router.post('/discovery/podcastindex/import-episodes', authMiddleware, async (req, res) => {
  try {
    const { podcastId, maxEpisodes = 10 } = req.body;
    const userId = req.user._id;

    if (!podcastId) {
      return res.status(400).json({ error: 'Podcast ID is required' });
    }

    // Get episodes from PodcastIndex
    const result = await podcastIndexService.getPodcastEpisodes(podcastId, parseInt(maxEpisodes));
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Get podcast details
    const podcastResult = await podcastIndexService.getPodcastById(podcastId);
    const podcastData = podcastResult.success ? podcastResult.podcast : null;

    const importedEpisodes = [];
    const skippedEpisodes = [];

    // Prepare series data if available
    let seriesData = null;
    if (podcastData) {
      seriesData = {
        title: podcastData.title || 'Unknown Podcast',
        description: podcastData.description || '',
        author: podcastData.author || '',
        image: podcastData.image || null,
        categories: podcastData.categories || [],
        language: podcastData.language || 'en',
        rssUrl: podcastData.url || '',
        podcastIndexId: podcastId
      };
    }

    for (const piEpisode of result.episodes) {
      try {
        // Use podcastAdapter to import (handles deduplication and Media model)
        const episodeData = podcastIndexService.convertEpisodeToOurFormat(piEpisode, podcastData);
        
        let importedEpisode;
        if (seriesData) {
          // Import with series linkage
          const result = await podcastAdapter.importEpisodeWithSeries(
            'podcastIndex',
            episodeData,
            seriesData,
            userId
          );
          importedEpisode = result.episode;
        } else {
          // Import without series
          importedEpisode = await podcastAdapter.importEpisode(
            'podcastIndex',
            episodeData,
            userId
          );
        }

        importedEpisodes.push({
          id: importedEpisode._id,
          title: importedEpisode.title,
          podcastSeries: importedEpisode.podcastSeries ? {
            id: importedEpisode.podcastSeries._id,
            title: importedEpisode.podcastSeries.title
          } : null
        });

      } catch (episodeError) {
        console.error('Error importing episode:', episodeError);
        skippedEpisodes.push({
          title: piEpisode.title || 'Unknown',
          reason: 'Import failed: ' + episodeError.message
        });
      }
    }

    res.json({
      success: true,
      imported: importedEpisodes.length,
      skipped: skippedEpisodes.length,
      importedEpisodes,
      skippedEpisodes,
      podcast: podcastData
    });

  } catch (error) {
    console.error('Error importing episodes:', error);
    res.status(500).json({ error: 'Failed to import episodes' });
  }
});

// ============================================================================
// PODCAST DISCOVERY - APPLE PODCASTS
// ============================================================================

// Get Apple Podcasts genres
router.get('/discovery/apple/genres', async (req, res) => {
  try {
    const result = await applePodcastsService.getGenres();
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({ genres: result.genres });
  } catch (error) {
    console.error('Error getting Apple genres:', error);
    res.status(500).json({ error: 'Failed to get Apple genres' });
  }
});

// Search podcasts from Apple
router.get('/discovery/apple/search-podcasts', async (req, res) => {
  try {
    const { q, max = 20, country = 'US' } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await applePodcastsService.searchPodcasts(q, parseInt(max), country);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Convert to our format
    const podcasts = result.podcasts.map(podcast => 
      applePodcastsService.convertPodcastToOurFormat(podcast)
    );

    res.json({ 
      podcasts, 
      count: result.count,
      source: 'apple'
    });
  } catch (error) {
    console.error('Error searching Apple podcasts:', error);
    res.status(500).json({ error: 'Failed to search Apple podcasts' });
  }
});

// Search episodes from Apple
router.get('/discovery/apple/search-episodes', async (req, res) => {
  try {
    const { q, max = 20, country = 'US' } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await applePodcastsService.searchEpisodes(q, parseInt(max), country);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Convert to our format
    const episodes = result.episodes.map(episode => 
      applePodcastsService.convertEpisodeToOurFormat(episode)
    );

    res.json({ 
      episodes, 
      count: result.count,
      source: 'apple'
    });
  } catch (error) {
    console.error('Error searching Apple episodes:', error);
    res.status(500).json({ error: 'Failed to search Apple episodes' });
  }
});

// Get Apple podcast episodes
router.get('/discovery/apple/podcast/:appleId/episodes', async (req, res) => {
  try {
    const { appleId } = req.params;
    const { max = 50 } = req.query;

    const result = await applePodcastsService.getPodcastEpisodes(appleId, parseInt(max));
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Get podcast details
    const podcastResult = await applePodcastsService.getPodcastById(appleId);
    const podcastData = podcastResult.success ? podcastResult.podcast : null;

    // Convert episodes to our format
    const episodes = result.episodes.map(episode => 
      applePodcastsService.convertEpisodeToOurFormat(episode, podcastData)
    );

    res.json({
      episodes,
      count: result.count,
      podcast: podcastData ? applePodcastsService.convertPodcastToOurFormat(podcastData) : null,
      source: 'apple'
    });
  } catch (error) {
    console.error('Error getting Apple podcast episodes:', error);
    res.status(500).json({ error: 'Failed to get podcast episodes' });
  }
});

// Test import episodes from Apple (no auth - for testing)
router.post('/discovery/apple/test-import', async (req, res) => {
  try {
    const { appleId, maxEpisodes = 10 } = req.body;
    const userId = new mongoose.Types.ObjectId(); // Create a dummy user ID for testing

    if (!appleId) {
      return res.status(400).json({ error: 'Apple podcast ID is required' });
    }

    // Get episodes from Apple
    const result = await applePodcastsService.getPodcastEpisodes(appleId, parseInt(maxEpisodes));
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Get podcast details
    const podcastResult = await applePodcastsService.getPodcastById(appleId);
    const podcastData = podcastResult.success ? podcastResult.podcast : null;

    const importedEpisodes = [];
    const skippedEpisodes = [];

    // Prepare series data if available
    let seriesData = null;
    if (podcastData) {
      seriesData = applePodcastsService.convertPodcastToOurFormat(podcastData);
    }

    for (const appleEpisode of result.episodes) {
      try {
        console.log('Processing Apple episode:', {
          trackId: appleEpisode.trackId,
          appleId: appleEpisode.appleId,
          title: appleEpisode.trackName
        });
        
        // Convert to our format
        const episodeData = applePodcastsService.convertEpisodeToOurFormat(appleEpisode, podcastData);
        
        console.log('Converted episode data:', {
          appleId: episodeData.appleId,
          guid: episodeData.guid,
          title: episodeData.title
        });
        
        // Use podcastAdapter to import (handles deduplication and Media model)
        let importedEpisode;
        if (seriesData) {
          const result = await podcastAdapter.importEpisodeWithSeries(
            'apple',
            episodeData,
            seriesData,
            userId
          );
          importedEpisode = result.episode;
        } else {
          importedEpisode = await podcastAdapter.importEpisode(
            'apple',
            episodeData,
            userId
          );
        }

        importedEpisodes.push({
          id: importedEpisode._id,
          title: importedEpisode.title,
          podcastSeries: importedEpisode.podcastSeries ? {
            id: importedEpisode.podcastSeries._id,
            title: importedEpisode.podcastSeries.title
          } : null
        });

      } catch (episodeError) {
        console.error('Error importing episode:', episodeError);
        skippedEpisodes.push({
          title: appleEpisode.trackName || 'Unknown',
          reason: 'Import failed: ' + episodeError.message
        });
      }
    }

    res.json({
      success: true,
      imported: importedEpisodes.length,
      skipped: skippedEpisodes.length,
      importedEpisodes,
      skippedEpisodes,
      podcast: podcastData
    });

  } catch (error) {
    console.error('Error importing Apple episodes:', error);
    res.status(500).json({ error: 'Failed to import episodes from Apple' });
  }
});

// Import episodes from Apple (with auth)
router.post('/discovery/apple/import-episodes', authMiddleware, async (req, res) => {
  try {
    const { appleId, maxEpisodes = 10, specificEpisode } = req.body;
    const userId = req.user._id;

    if (!appleId && !specificEpisode) {
      return res.status(400).json({ error: 'Apple podcast ID or specific episode is required' });
    }

    let episodesToProcess = [];
    let podcastData = null;

    if (specificEpisode) {
      // Import a specific episode
      episodesToProcess = [specificEpisode];
      // Get podcast details from the episode data
      const podcastResult = await applePodcastsService.getPodcastById(specificEpisode.collectionId || specificEpisode.appleId);
      podcastData = podcastResult.success ? podcastResult.podcast : null;
    } else {
      // Get episodes from Apple
      const result = await applePodcastsService.getPodcastEpisodes(appleId, parseInt(maxEpisodes));
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      episodesToProcess = result.episodes;

      // Get podcast details
      const podcastResult = await applePodcastsService.getPodcastById(appleId);
      podcastData = podcastResult.success ? podcastResult.podcast : null;
    }

    const importedEpisodes = [];
    const skippedEpisodes = [];

    for (const appleEpisode of episodesToProcess) {
      try {
        console.log('Processing Apple episode:', {
          trackId: appleEpisode.trackId,
          appleId: appleEpisode.appleId,
          title: appleEpisode.trackName
        });
        
        // Convert to our format
        const episodeData = applePodcastsService.convertEpisodeToOurFormat(appleEpisode, podcastData);
        
        console.log('Converted episode data:', {
          appleId: episodeData.appleId,
          guid: episodeData.guid,
          title: episodeData.title
        });
        
        // Prepare series data if available
        let seriesData = null;
        if (podcastData) {
          seriesData = applePodcastsService.convertPodcastToOurFormat(podcastData);
        }
        
        // Use podcastAdapter to import (handles deduplication and Media model)
        let importedEpisode;
        if (seriesData) {
          const result = await podcastAdapter.importEpisodeWithSeries(
            'apple',
            episodeData,
            seriesData,
            userId
          );
          importedEpisode = result.episode;
        } else {
          importedEpisode = await podcastAdapter.importEpisode(
            'apple',
            episodeData,
            userId
          );
        }

        importedEpisodes.push({
          id: importedEpisode._id,
          title: importedEpisode.title,
          podcastSeries: importedEpisode.podcastSeries ? {
            id: importedEpisode.podcastSeries._id,
            title: importedEpisode.podcastSeries.title
          } : null
        });

      } catch (episodeError) {
        console.error('Error importing episode:', episodeError);
        skippedEpisodes.push({
          title: appleEpisode.trackName || 'Unknown',
          reason: 'Import failed: ' + episodeError.message
        });
      }
    }

    res.json({
      success: true,
      imported: importedEpisodes.length,
      skipped: skippedEpisodes.length,
      importedEpisodes,
      skippedEpisodes,
      podcast: podcastData
    });

  } catch (error) {
    console.error('Error importing Apple episodes:', error);
    res.status(500).json({ error: 'Failed to import episodes from Apple' });
  }
});

// Get top Apple podcasts
router.get('/discovery/apple/top-podcasts', async (req, res) => {
  try {
    const { genre = 'all', max = 20, country = 'US' } = req.query;

    const result = await applePodcastsService.getTopPodcasts(genre, parseInt(max), country);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Convert to our format
    const podcasts = result.podcasts.map(podcast => 
      applePodcastsService.convertPodcastToOurFormat(podcast)
    );

    res.json({ 
      podcasts, 
      count: result.count,
      genre,
      source: 'apple'
    });
  } catch (error) {
    console.error('Error getting top Apple podcasts:', error);
    res.status(500).json({ error: 'Failed to get top Apple podcasts' });
  }
});

// PODCAST DISCOVERY - TADDY
// ============================================================================

// Get Taddy categories
router.get('/discovery/taddy/categories', async (req, res) => {
  try {
    if (!process.env.TADDY_API_KEY || !process.env.TADDY_USER_ID) {
      return res.status(503).json({ error: 'Taddy API not configured' });
    }
    
    const result = taddyService.getCategories();
    res.json(result);
  } catch (error) {
    console.error('Error getting Taddy categories:', error);
    res.status(500).json({ error: 'Failed to get Taddy categories' });
  }
});

// Search podcasts from Taddy
router.get('/discovery/taddy/search-podcasts', async (req, res) => {
  try {
    if (!process.env.TADDY_API_KEY || !process.env.TADDY_USER_ID) {
      return res.status(503).json({ error: 'Taddy API not configured' });
    }
    
    const { q, max = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await taddyService.searchPodcasts(q, parseInt(max));
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      podcasts: result.podcasts,
      count: result.count,
      source: 'taddy'
    });
  } catch (error) {
    console.error('Error searching Taddy podcasts:', error);
    res.status(500).json({ error: 'Failed to search Taddy podcasts' });
  }
});

// Search episodes from Taddy
router.get('/discovery/taddy/search-episodes', async (req, res) => {
  try {
    if (!process.env.TADDY_API_KEY || !process.env.TADDY_USER_ID) {
      return res.status(503).json({ error: 'Taddy API not configured' });
    }
    
    const { q, max = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const result = await taddyService.searchEpisodes(q, parseInt(max));
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      episodes: result.episodes,
      count: result.count,
      source: 'taddy'
    });
  } catch (error) {
    console.error('Error searching Taddy episodes:', error);
    res.status(500).json({ error: 'Failed to search Taddy episodes' });
  }
});

// Get podcast details from Taddy
router.get('/discovery/taddy/podcast/:podcastUuid', async (req, res) => {
  try {
    if (!process.env.TADDY_API_KEY || !process.env.TADDY_USER_ID) {
      return res.status(503).json({ error: 'Taddy API not configured' });
    }
    
    const { podcastUuid } = req.params;
    
    const result = await taddyService.getPodcastById(podcastUuid);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      podcast: result.podcast,
      source: 'taddy'
    });
  } catch (error) {
    console.error('Error getting Taddy podcast details:', error);
    res.status(500).json({ error: 'Failed to get Taddy podcast details' });
  }
});

// Get episodes for a specific podcast from Taddy
router.get('/discovery/taddy/podcast/:podcastUuid/episodes', async (req, res) => {
  try {
    if (!process.env.TADDY_API_KEY || !process.env.TADDY_USER_ID) {
      return res.status(503).json({ error: 'Taddy API not configured' });
    }
    
    const { podcastUuid } = req.params;
    const { max = 50 } = req.query;
    
    const result = await taddyService.getPodcastEpisodes(podcastUuid, parseInt(max));
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      episodes: result.episodes,
      count: result.count,
      source: 'taddy'
    });
  } catch (error) {
    console.error('Error getting Taddy podcast episodes:', error);
    res.status(500).json({ error: 'Failed to get Taddy podcast episodes' });
  }
});

// Import episodes from Taddy (with auth)
router.post('/discovery/taddy/import-episodes', authMiddleware, async (req, res) => {
  try {
    if (!process.env.TADDY_API_KEY || !process.env.TADDY_USER_ID) {
      return res.status(503).json({ error: 'Taddy API not configured' });
    }
    
    const { podcastUuid, maxEpisodes = 10, specificEpisode } = req.body;
    const userId = req.user._id;

    if (!podcastUuid && !specificEpisode) {
      return res.status(400).json({ error: 'Taddy podcast UUID or specific episode is required' });
    }

    let episodesToProcess = [];
    let podcastData = null;

    if (specificEpisode) {
      // Import a specific episode
      episodesToProcess = [specificEpisode];
      // Get podcast details from the episode data
      const podcastResult = await taddyService.getPodcastById(specificEpisode.podcastSeriesUuid);
      podcastData = podcastResult.success ? podcastResult.podcast : null;
    } else {
      // Get episodes from Taddy
      const result = await taddyService.getPodcastEpisodes(podcastUuid, parseInt(maxEpisodes));
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      episodesToProcess = result.episodes;

      // Get podcast details
      const podcastResult = await taddyService.getPodcastById(podcastUuid);
      podcastData = podcastResult.success ? podcastResult.podcast : null;
    }

    const importedEpisodes = [];
    const skippedEpisodes = [];

    // Prepare series data if available
    let seriesData = null;
    if (podcastData) {
      seriesData = {
        title: podcastData.name || 'Unknown Podcast',
        description: podcastData.description || '',
        author: '', // Taddy doesn't provide author in this format
        image: podcastData.imageUrl || null,
        categories: podcastData.categories || [],
        language: podcastData.language || 'en',
        rssUrl: podcastData.rssUrl || '',
        taddyUuid: podcastUuid || specificEpisode?.podcastSeriesUuid
      };
    }

    for (const taddyEpisode of episodesToProcess) {
      try {
        console.log('Processing Taddy episode:', {
          uuid: taddyEpisode.uuid || taddyEpisode.taddyUuid,
          title: taddyEpisode.name || taddyEpisode.title
        });

        // Convert to Media format using adapter
        const episodeData = podcastAdapter.fromTaddy(taddyEpisode);
        
        // Use podcastAdapter to import (handles deduplication and Media model)
        let importedEpisode;
        if (seriesData) {
          const result = await podcastAdapter.importEpisodeWithSeries(
            'taddy',
            episodeData,
            seriesData,
            userId
          );
          importedEpisode = result.episode;
        } else {
          importedEpisode = await podcastAdapter.importEpisode(
            'taddy',
            episodeData,
            userId
          );
        }

        importedEpisodes.push({
          id: importedEpisode._id,
          title: importedEpisode.title,
          podcastSeries: importedEpisode.podcastSeries ? {
            id: importedEpisode.podcastSeries._id,
            title: importedEpisode.podcastSeries.title
          } : null
        });

      } catch (episodeError) {
        console.error('Error importing Taddy episode:', episodeError);
        skippedEpisodes.push({
          title: taddyEpisode.title || 'Unknown',
          reason: 'Import failed: ' + episodeError.message
        });
      }
    }

    res.json({
      success: true,
      imported: importedEpisodes.length,
      skipped: skippedEpisodes.length,
      importedEpisodes,
      skippedEpisodes,
      podcast: podcastData
    });

  } catch (error) {
    console.error('Error importing Taddy episodes:', error);
    res.status(500).json({ error: 'Failed to import episodes from Taddy' });
  }
});

// ============================================================================
// NEW PODCAST FEATURES (Using Media Model)
// ============================================================================

// Import podcast episode/series from URL (link pasting)
router.post('/import-link', authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;
    const userId = req.user._id;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Parse the URL
    const parsedUrl = parsePodcastUrl(url);
    if (!parsedUrl) {
      return res.status(400).json({ error: 'Invalid podcast URL. Supported: Apple Podcasts, RSS feeds' });
    }

    let result;

    // Handle Apple Podcasts
    if (parsedUrl.type === 'apple') {
      if (parsedUrl.isEpisode && parsedUrl.episodeId && parsedUrl.seriesId) {
        // Import specific episode
        const episodesResult = await applePodcastsService.getPodcastEpisodes(parsedUrl.seriesId, 200);
        if (!episodesResult.success) {
          return res.status(500).json({ error: 'Failed to fetch episode from Apple Podcasts' });
        }

        // Find the specific episode
        const episode = episodesResult.episodes.find(
          ep => ep.trackId?.toString() === parsedUrl.episodeId
        );

        if (!episode) {
          return res.status(404).json({ error: 'Episode not found' });
        }

        // Get podcast data
        const podcastResult = await applePodcastsService.getPodcastById(parsedUrl.seriesId);
        const podcastData = podcastResult.podcast || {};

        // Convert and import
        const episodeData = applePodcastsService.convertEpisodeToOurFormat(episode, podcastData);
        const seriesData = applePodcastsService.convertPodcastToOurFormat(podcastData);

        const { episode: importedEpisode, series: importedSeries } = 
          await podcastAdapter.importEpisodeWithSeries('apple', episodeData, seriesData, userId);

        result = {
          success: true,
          type: 'episode',
          episode: importedEpisode,
          series: importedSeries
        };
      } else if (parsedUrl.isSeries && parsedUrl.seriesId) {
        // Import series (and optionally episodes)
        const podcastResult = await applePodcastsService.getPodcastById(parsedUrl.seriesId);
        if (!podcastResult.success || !podcastResult.podcast) {
          return res.status(404).json({ error: 'Podcast series not found' });
        }

        const seriesData = applePodcastsService.convertPodcastToOurFormat(podcastResult.podcast);
        const series = await podcastAdapter.createOrFindSeries(seriesData, userId);

        result = {
          success: true,
          type: 'series',
          series: series
        };
      }
    } else if (parsedUrl.type === 'rss') {
      // RSS feed - for now, return info that RSS parsing needs to be implemented
      return res.status(501).json({ 
        error: 'RSS feed parsing not yet implemented. Please use Apple Podcasts URLs for now.' 
      });
    } else {
      return res.status(400).json({ error: 'Unsupported URL type. Please use Apple Podcasts URLs.' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error importing from URL:', error);
    res.status(500).json({ error: 'Failed to import podcast from URL: ' + error.message });
  }
});

// Global podcast chart with filtering
router.get('/chart', async (req, res) => {
  try {
    const { 
      limit = 50, 
      category, 
      genre, 
      tag,
      timeRange = 'all',
      sortBy = 'globalMediaAggregate' // 'globalMediaAggregate', 'playCount', 'popularity', 'releaseDate'
    } = req.query;
    
    const limitNum = Math.min(parseInt(limit), 200);
    
    // Build query for podcast episodes
    const query = {
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] }
    };

    // Category filter (if using category field)
    if (category) {
      query.category = new RegExp(category, 'i');
    }

    // Genre filter
    if (genre) {
      query.genres = { $in: [new RegExp(genre, 'i')] };
    }

    // Tag filter
    if (tag) {
      query.tags = { $in: [new RegExp(tag, 'i')] };
    }

    // Time range filter
    if (timeRange !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (timeRange) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        query.releaseDate = { $gte: startDate };
      }
    }

    // Build sort object
    let sortObj = {};
    switch (sortBy) {
      case 'globalMediaAggregate':
        sortObj = { globalMediaAggregate: -1, popularity: -1 };
        break;
      case 'playCount':
        sortObj = { playCount: -1, globalMediaAggregate: -1 };
        break;
      case 'popularity':
        sortObj = { popularity: -1, globalMediaAggregate: -1 };
        break;
      case 'releaseDate':
        sortObj = { releaseDate: -1 };
        break;
      default:
        sortObj = { globalMediaAggregate: -1, popularity: -1 };
    }

    const episodes = await Media.find(query)
      .sort(sortObj)
      .limit(limitNum)
      .populate('addedBy', 'username')
      .populate('podcastSeries', 'title coverArt')
      .lean();

    // Get available categories/genres/tags for filtering
    const [categories, genres, tags] = await Promise.all([
      Media.distinct('category', { 
        contentType: { $in: ['spoken'] },
        contentForm: { $in: ['podcastepisode'] },
        category: { $ne: null }
      }),
      Media.distinct('genres', { 
        contentType: { $in: ['spoken'] },
        contentForm: { $in: ['podcastepisode'] }
      }).then(results => {
        // Flatten nested arrays
        const flat = results.flat();
        return [...new Set(flat)].sort();
      }),
      Media.distinct('tags', { 
        contentType: { $in: ['spoken'] },
        contentForm: { $in: ['podcastepisode'] }
      }).then(results => {
        const flat = results.flat();
        return [...new Set(flat)].sort();
      })
    ]);

    res.json({
      episodes,
      count: episodes.length,
      filters: {
        categories: categories.filter(c => c).sort(),
        genres: genres,
        tags: tags
      },
      appliedFilters: {
        category,
        genre,
        tag,
        timeRange,
        sortBy
      }
    });
  } catch (error) {
    console.error('Error getting podcast chart:', error);
    res.status(500).json({ error: 'Failed to get podcast chart' });
  }
});

// Import single episode from external source (for Import & Tip flow)
router.post('/discovery/import-single-episode', authMiddleware, async (req, res) => {
  try {
    const { source, episodeData, seriesData } = req.body;
    const userId = req.user._id;

    if (!source || !episodeData) {
      return res.status(400).json({ error: 'Source and episode data are required' });
    }

    if (!['taddy', 'podcastindex', 'apple'].includes(source.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid source. Must be taddy, podcastindex, or apple' });
    }

    let importedEpisode;
    
    if (seriesData) {
      // Import with series linkage
      importedEpisode = await podcastAdapter.importEpisodeWithSeries(
        source,
        episodeData,
        seriesData,
        userId
      );
    } else {
      // Import episode only
      importedEpisode = await podcastAdapter.importEpisode(
        source,
        episodeData,
        userId
      );
    }

    res.json({
      success: true,
      episode: importedEpisode,
      message: 'Episode imported successfully'
    });
  } catch (error) {
    console.error('Error importing single episode:', error);
    res.status(500).json({ error: 'Failed to import episode', details: error.message });
  }
});

// Create or find podcast series
router.post('/discovery/create-or-find-series', authMiddleware, async (req, res) => {
  try {
    const { seriesData } = req.body;
    const userId = req.user._id;

    if (!seriesData || !seriesData.title) {
      return res.status(400).json({ error: 'Series data with title is required' });
    }

    const series = await podcastAdapter.createOrFindSeries(seriesData, userId);

    res.json({
      success: true,
      series: {
        _id: series._id,
        title: series.title,
        description: series.description,
        coverArt: series.coverArt,
        host: series.host,
        genres: series.genres,
        externalIds: series.externalIds
      }
    });
  } catch (error) {
    console.error('Error creating/finding series:', error);
    res.status(500).json({ error: 'Failed to create/find series', details: error.message });
  }
});

// Get podcast series with episodes
router.get('/series/:seriesId', async (req, res) => {
  try {
    const { seriesId } = req.params;
    
    if (!isValidObjectId(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }

    // Get series
    const series = await Media.findById(seriesId)
      .populate('host.userId', 'username profilePic uuid')
      .lean();

    if (!series) {
      return res.status(404).json({ error: 'Podcast series not found' });
    }

    // Verify it's a podcast series
    if (!series.contentForm?.includes('podcastseries')) {
      return res.status(400).json({ error: 'Media item is not a podcast series' });
    }

    // Get all episodes from this series
    const episodes = await Media.find({
      podcastSeries: seriesId,
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] }
    })
      .sort({ globalMediaAggregate: -1, releaseDate: -1 })
      .populate('host.userId', 'username profilePic uuid')
      .populate('addedBy', 'username')
      .lean()
      .limit(100); // Limit to top 100 episodes

    // Calculate stats
    const totalEpisodes = episodes.length;
    const totalTips = episodes.reduce((sum, ep) => sum + (ep.globalMediaAggregate || 0), 0);
    const avgTip = totalEpisodes > 0 ? totalTips / totalEpisodes : 0;
    const topEpisode = episodes.length > 0 ? episodes[0] : null;

    res.json({
      series,
      episodes,
      stats: {
        totalEpisodes,
        totalTips,
        avgTip,
        topEpisode: topEpisode ? {
          _id: topEpisode._id,
          title: topEpisode.title,
          globalMediaAggregate: topEpisode.globalMediaAggregate || 0
        } : null
      }
    });
  } catch (error) {
    console.error('Error getting podcast series:', error);
    res.status(500).json({ error: 'Failed to get podcast series', details: error.message });
  }
});

// Separate podcast search (using Media model)
router.get('/search-episodes', async (req, res) => {
  try {
    const { q, limit = 50, category, genre, tag } = req.query;
    const limitNum = Math.min(parseInt(limit), 200);
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    // Build search query
    const searchQuery = {
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] },
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { 'host.name': { $regex: q, $options: 'i' } },
        { creatorNames: { $regex: q, $options: 'i' } }
      ]
    };

    // Add filters
    if (category) {
      searchQuery.category = new RegExp(category, 'i');
    }
    if (genre) {
      searchQuery.genres = { $in: [new RegExp(genre, 'i')] };
    }
    if (tag) {
      searchQuery.tags = { $in: [new RegExp(tag, 'i')] };
    }
    
    const episodes = await Media.find(searchQuery)
      .sort({ globalMediaAggregate: -1, popularity: -1, releaseDate: -1 })
      .limit(limitNum)
      .populate('addedBy', 'username')
      .populate('podcastSeries', 'title coverArt')
      .lean();
    
    res.json({ 
      episodes, 
      count: episodes.length,
      query: q,
      filters: { category, genre, tag }
    });
  } catch (error) {
    console.error('Error searching podcast episodes:', error);
    res.status(500).json({ error: 'Failed to search podcast episodes' });
  }
});

module.exports = router;