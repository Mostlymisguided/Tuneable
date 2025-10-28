const express = require('express');
const mongoose = require('mongoose');
const { check, validationResult } = require('express-validator');
const PodcastEpisode = require('../models/PodcastEpisode');
const Bid = require('../models/Bid');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

// Import services
const podcastIndexService = require('../services/podcastIndexService');
const applePodcastsService = require('../services/applePodcastsService');
const taddyService = require('../services/taddyService');

const router = express.Router();

// ============================================================================
// CORE PODCAST FUNCTIONALITY
// ============================================================================

// Get trending podcast episodes
router.get('/trending', async (req, res) => {
  try {
    const { limit = 50, category } = req.query;
    const limitNum = parseInt(limit);
    
    let query = {};
    if (category) {
      query.podcastCategory = new RegExp(category, 'i');
    }
    
    const episodes = await PodcastEpisode.find(query)
      .sort({ globalMediaAggregate: -1, playCount: -1, createdAt: -1 })
      .limit(limitNum)
      .populate('addedBy', 'username')
      .lean();
    
    res.json({ episodes, count: episodes.length });
  } catch (error) {
    console.error('Error getting trending episodes:', error);
    res.status(500).json({ error: 'Failed to get trending episodes' });
  }
});

// Search podcast episodes in our database
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 50, category } = req.query;
    const limitNum = parseInt(limit);
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    let query = {};
    if (category) {
      query.podcastCategory = new RegExp(category, 'i');
    }
    
    // Try text search first
    let episodes = await PodcastEpisode.find(
      { ...query, $text: { $search: q } },
      { score: { $meta: 'textScore' } }
    )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limitNum)
    .populate('addedBy', 'username')
    .lean();
    
    // Fallback to regex search if text search fails or returns no results
    if (episodes.length === 0) {
      const searchRegex = new RegExp(q, 'i');
      episodes = await PodcastEpisode.find({
        ...query,
        $or: [
          { title: searchRegex },
          { description: searchRegex },
          { podcastTitle: searchRegex },
          { podcastAuthor: searchRegex }
        ]
      })
      .sort({ globalMediaAggregate: -1, playCount: -1, createdAt: -1 })
      .limit(limitNum)
      .populate('addedBy', 'username')
      .lean();
    }
    
    res.json({ episodes, count: episodes.length });
  } catch (error) {
    console.error('Error searching episodes:', error);
    res.status(500).json({ error: 'Failed to search episodes' });
  }
});

// Get podcast charts by type
router.get('/charts/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { limit = 50, category, timeRange = 'all' } = req.query;
    const limitNum = parseInt(limit);
    
    let query = {};
    if (category) {
      query.podcastCategory = new RegExp(category, 'i');
    }
    
    // Add time range filter
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
        query.createdAt = { $gte: startDate };
      }
    }
    
    let sortBy = {};
    switch (type) {
      case 'boosted':
        sortBy = { globalMediaAggregate: -1, playCount: -1 };
        break;
      case 'popular':
        sortBy = { playCount: -1, globalMediaAggregate: -1 };
        break;
      case 'recent':
        sortBy = { createdAt: -1 };
        break;
      case 'trending':
        sortBy = { globalMediaAggregate: -1, playCount: -1, createdAt: -1 };
        break;
      default:
        return res.status(400).json({ error: 'Invalid chart type' });
    }
    
    const episodes = await PodcastEpisode.find(query)
      .sort(sortBy)
      .limit(limitNum)
      .populate('addedBy', 'username')
      .lean();
    
    res.json({ episodes, count: episodes.length, type, timeRange });
  } catch (error) {
    console.error('Error getting podcast charts:', error);
    res.status(500).json({ error: 'Failed to get podcast charts' });
  }
});

// Boost a podcast episode
router.post('/:episodeId/boost', authMiddleware, async (req, res) => {
  try {
    const { episodeId } = req.params;
    const { amount } = req.body;
    const userId = req.user._id;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Boost amount must be greater than 0' });
    }
    
    const episode = await PodcastEpisode.findById(episodeId);
    if (!episode) {
      return res.status(404).json({ error: 'Episode not found' });
    }
    
    // Create bid
    const bid = new Bid({
      userId,
      episodeId,
      amount,
      type: 'boost'
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
    
    // Update episode
    episode.globalMediaAggregate += amount;
    episode.bids = episode.bids || [];
    episode.bids.push(bid._id);
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
    
    const episode = await PodcastEpisode.findById(episodeId);
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
    
    // Check if episode is already in party (episodes are now Media)
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
        status: 'queued',
        queuedAt: new Date()
      };
      party.media.push(partyMediaEntry);
    }
    
    // Create bid
    const bid = new Bid({
      userId,
      partyId,
      episodeId,
      amount,
      type: 'party_bid'
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
    
    // Update party episode entry
    partyEpisodeEntry.partyBidValue += amount;
    partyEpisodeEntry.partyBids.push(bid._id);
    await party.save();
    
    // Update global episode
    episode.globalMediaAggregate += amount;
    episode.bids = episode.bids || [];
    episode.bids.push(bid._id);
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
    const categories = await PodcastEpisode.distinct('podcastCategory');
    res.json({ categories: categories.filter(Boolean) });
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

    for (const piEpisode of result.episodes) {
      try {
        // Convert to our format
        const episodeData = podcastIndexService.convertEpisodeToOurFormat(piEpisode, podcastData);
        
        // Check if episode already exists
        const existingEpisode = await PodcastEpisode.findOne({
          $or: [
            { guid: episodeData.guid },
            { podcastIndexId: episodeData.podcastIndexId }
          ]
        });

        if (existingEpisode) {
          skippedEpisodes.push({
            title: episodeData.title,
            reason: 'Already exists'
          });
          continue;
        }

        // Create new episode
        const episode = new PodcastEpisode({
          ...episodeData,
          addedBy: userId
        });

        await episode.save();
        importedEpisodes.push({
          id: episode._id,
          title: episode.title,
          podcastTitle: episode.podcastTitle
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
        
        // Check if episode already exists
        const existingEpisode = await PodcastEpisode.findOne({
          $or: [
            { guid: episodeData.guid },
            { appleId: episodeData.appleId }
          ]
        });

        if (existingEpisode) {
          skippedEpisodes.push({
            title: episodeData.title,
            reason: 'Already exists'
          });
          continue;
        }

        // Create new episode
        const episode = new PodcastEpisode({
          ...episodeData,
          addedBy: userId
        });

        await episode.save();
        importedEpisodes.push({
          id: episode._id,
          title: episode.title,
          podcastTitle: episode.podcastTitle
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
        
        // Check if episode already exists
        const existingEpisode = await PodcastEpisode.findOne({
          $or: [
            { guid: episodeData.guid },
            { appleId: episodeData.appleId }
          ]
        });

        if (existingEpisode) {
          skippedEpisodes.push({
            title: episodeData.title,
            reason: 'Already exists'
          });
          continue;
        }

        // Create new episode
        const episode = new PodcastEpisode({
          ...episodeData,
          addedBy: userId
        });

        await episode.save();
        importedEpisodes.push({
          id: episode._id,
          title: episode.title,
          podcastTitle: episode.podcastTitle
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

    for (const taddyEpisode of episodesToProcess) {
      try {
        console.log('Processing Taddy episode:', {
          uuid: taddyEpisode.taddyUuid,
          title: taddyEpisode.title
        });

        // Check if episode already exists
        const existingEpisode = await PodcastEpisode.findOne({
          $or: [
            { guid: taddyEpisode.guid },
            { taddyUuid: taddyEpisode.taddyUuid }
          ]
        });

        if (existingEpisode) {
          skippedEpisodes.push({
            title: taddyEpisode.title,
            reason: 'Already exists'
          });
          continue;
        }

        // Create new episode
        const episode = new PodcastEpisode({
          ...taddyEpisode,
          addedBy: userId
        });

        await episode.save();
        importedEpisodes.push({
          id: episode._id,
          title: episode.title,
          podcastTitle: episode.podcastTitle
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

module.exports = router;