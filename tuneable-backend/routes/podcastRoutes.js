const express = require('express');
const mongoose = require('mongoose');
const { check, validationResult } = require('express-validator');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');
const { isValidObjectId } = require('../utils/validators');
const axios = require('axios');
const xml2js = require('xml2js');

// Import services
const podcastIndexService = require('../services/podcastIndexService');
const applePodcastsService = require('../services/applePodcastsService');
const taddyService = require('../services/taddyService');
const podcastAdapter = require('../services/podcastAdapter');
const { parsePodcastUrl, isValidPodcastUrl } = require('../utils/podcastUrlParser');

const router = express.Router();

// In-memory store for import progress tracking
// Format: { seriesId: { current: 0, total: 10, status: 'importing' | 'complete' | 'error', startedAt: Date } }
const importProgress = new Map();

// Clean up old progress entries (older than 5 minutes)
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [seriesId, progress] of importProgress.entries()) {
    if (progress.startedAt && progress.startedAt < fiveMinutesAgo) {
      importProgress.delete(seriesId);
    }
  }
}, 60000); // Run cleanup every minute

// RSS Feed Parser
async function parseRSSFeed(rssUrl, maxEpisodes = 50) {
  try {
    console.log(`📡 Fetching RSS feed: ${rssUrl}`);
    const response = await axios.get(rssUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Tuneable Podcast Importer'
      }
    });
    
    const parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      explicitRoot: false
    });
    
    const result = await parser.parseStringPromise(response.data);
    const channel = result.channel || result;
    const items = Array.isArray(channel.item) ? channel.item : (channel.item ? [channel.item] : []);
    
    const episodes = items.slice(0, maxEpisodes).map(item => {
      const enclosure = item.enclosure || {};
      const itunes = item['itunes:episode'] ? {
        episode: item['itunes:episode'],
        season: item['itunes:season'],
        duration: item['itunes:duration'],
        image: item['itunes:image']?.href || item['itunes:image'],
        explicit: item['itunes:explicit']
      } : {};
      
      // Parse pubDate
      let pubDate = null;
      if (item.pubDate) {
        pubDate = new Date(item.pubDate);
        if (isNaN(pubDate.getTime())) {
          pubDate = null;
        }
      }
      
      return {
        title: item.title || 'Untitled Episode',
        description: item.description || item['content:encoded'] || '',
        content: item['content:encoded'] || item.description || '',
        contentSnippet: item.description || '',
        author: item['itunes:author'] || item.author || channel['itunes:author'] || channel.managingEditor || '',
        pubDate: pubDate,
        guid: item.guid?._ || item.guid || item.link || '',
        link: item.link || '',
        enclosure: {
          url: enclosure.url || enclosure.$.url || '',
          type: enclosure.type || enclosure.$.type || 'audio/mpeg',
          length: enclosure.length || enclosure.$.length || null
        },
        image: item.image || (itunes.image ? { url: itunes.image } : null),
        itunes: itunes,
        categories: item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : [],
        episodeNumber: itunes.episode ? parseInt(itunes.episode) : null,
        seasonNumber: itunes.season ? parseInt(itunes.season) : null,
        duration: parseDuration(itunes.duration) || 0,
        explicit: itunes.explicit === 'yes' || itunes.explicit === true,
        feedUrl: rssUrl
      };
    });
    
    console.log(`📡 Parsed ${episodes.length} episodes from RSS feed`);
    return episodes;
  } catch (error) {
    console.error(`❌ Error parsing RSS feed ${rssUrl}:`, error.message);
    throw error;
  }
}

// Get all RSS feeds from series sources
function getAllRSSFeeds(series) {
  const feeds = [];
  if (!series.sources) return feeds;
  
  const sources = series.sources instanceof Map ? 
    Array.from(series.sources.entries()) : 
    Object.entries(series.sources);
  
  sources.forEach(([key, url]) => {
    if ((key.startsWith('rss_') || key === 'rss') && url) {
      feeds.push({
        source: key.replace('rss_', '') || 'primary',
        url: url
      });
    }
  });
  
  return feeds;
}

// Try all RSS feeds and return results sorted by episode count
async function fetchFromAllRSSFeeds(rssFeeds, maxEpisodes = 100) {
  const results = [];
  
  for (const feed of rssFeeds) {
    try {
      console.log(`📡 Trying RSS feed from ${feed.source}: ${feed.url}`);
      const episodes = await parseRSSFeed(feed.url, maxEpisodes);
      results.push({
        source: feed.source,
        url: feed.url,
        episodes: episodes,
        count: episodes.length
      });
      console.log(`✅ ${feed.source} RSS feed returned ${episodes.length} episodes`);
    } catch (error) {
      console.error(`❌ Failed to fetch from ${feed.source} RSS feed:`, error.message);
    }
  }
  
  // Sort by episode count (most episodes first)
  results.sort((a, b) => b.count - a.count);
  
  return results;
}

// Helper to parse duration string (e.g., "01:23:45" or "1234")
function parseDuration(durationStr) {
  if (!durationStr) return 0;
  if (typeof durationStr === 'number') return durationStr;
  
  // Try parsing as "HH:MM:SS" or "MM:SS"
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  
  // Try parsing as seconds
  const seconds = parseInt(durationStr);
  return isNaN(seconds) ? 0 : seconds;
}

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

        // Pass raw Taddy episode - importEpisode will handle conversion
        let importedEpisode;
        if (seriesData) {
          const result = await podcastAdapter.importEpisodeWithSeries(
            'taddy',
            taddyEpisode, // Pass raw episode, not converted
            seriesData,
            userId
          );
          importedEpisode = result.episode;
        } else {
          importedEpisode = await podcastAdapter.importEpisode(
            'taddy',
            taddyEpisode, // Pass raw episode, not converted
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
      .populate({
        path: 'bids',
        model: 'Bid',
        match: { status: 'active' }, // Only populate active bids
        populate: {
          path: 'userId',
          select: 'username profilePic uuid'
        }
      })
      .lean();
    
    // Ensure releaseDate is set - use createdAt as fallback if releaseDate is null
    episodes.forEach(episode => {
      if (!episode.releaseDate && episode.createdAt) {
        episode.releaseDate = episode.createdAt;
      }
    });

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

// Get top podcast episodes by globalMediaAggregate
router.get('/top-episodes', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = Math.min(parseInt(limit), 50);

    const topEpisodes = await Media.find({
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] },
      globalMediaAggregate: { $gt: 0 }
    })
      .sort({ globalMediaAggregate: -1 })
      .limit(limitNum)
      .populate('podcastSeries', 'title coverArt')
      .select('_id title coverArt description genres globalMediaAggregate podcastSeries')
      .lean();

    res.json({
      episodes: topEpisodes,
      count: topEpisodes.length
    });
  } catch (error) {
    console.error('Error getting top podcast episodes:', error);
    res.status(500).json({ error: 'Failed to get top podcast episodes', details: error.message });
  }
});

// Get top podcast series by globalMediaAggregate
router.get('/top-series', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = Math.min(parseInt(limit), 50);

    // First, check if we have episodes with podcastSeries
    const episodesWithSeries = await Media.countDocuments({
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] },
      podcastSeries: { $ne: null, $exists: true },
      globalMediaAggregate: { $gt: 0 }
    });

    console.log(`📊 Found ${episodesWithSeries} episodes with series and tips`);

    // Aggregate episodes by podcastSeries, summing globalMediaAggregate
    const topSeries = await Media.aggregate([
      {
        $match: {
          contentType: { $in: ['spoken'] },
          contentForm: { $in: ['podcastepisode'] },
          podcastSeries: { $ne: null, $exists: true } // Only episodes with a series
        }
      },
      {
        $group: {
          _id: '$podcastSeries',
          totalGlobalMediaAggregate: { $sum: { $ifNull: ['$globalMediaAggregate', 0] } },
          episodeCount: { $sum: 1 }
        }
      },
      {
        $match: {
          totalGlobalMediaAggregate: { $gt: 0 } // Only series with tips
        }
      },
      {
        $sort: { totalGlobalMediaAggregate: -1 }
      },
      {
        $limit: limitNum
      },
      {
        $lookup: {
          from: 'media',
          localField: '_id',
          foreignField: '_id',
          as: 'series'
        }
      },
      {
        $unwind: {
          path: '$series',
          preserveNullAndEmptyArrays: false // Only keep series that exist
        }
      },
      {
        $match: {
          'series.contentForm': { $in: ['podcastseries'] } // contentForm is an array, $in works for arrays
        }
      },
      {
        $project: {
          _id: '$series._id',
          title: '$series.title',
          coverArt: '$series.coverArt',
          description: '$series.description',
          genres: '$series.genres',
          totalGlobalMediaAggregate: 1,
          episodeCount: 1
        }
      }
    ]);

    console.log(`✅ Returning ${topSeries.length} top podcast series`);

    res.json({
      series: topSeries,
      count: topSeries.length
    });
  } catch (error) {
    console.error('Error getting top podcast series:', error);
    res.status(500).json({ error: 'Failed to get top podcast series', details: error.message });
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

// Get or import episode by ID
// This endpoint checks if an episode exists, and if not, attempts to import it
router.get('/episodes/:episodeId/get-or-import', authMiddleware, async (req, res) => {
  try {
    const { episodeId } = req.params;
    const userId = req.user._id;
    
    if (!isValidObjectId(episodeId)) {
      return res.status(400).json({ error: 'Invalid episode ID' });
    }
    
    // First, try to find the episode in the database
    const existingEpisode = await Media.findById(episodeId)
      .populate('host.userId', 'username profilePic uuid')
      .populate('podcastSeries', 'title coverArt')
      .lean();
    
    if (existingEpisode) {
      // Episode exists, return it
      return res.json({
        success: true,
        episode: existingEpisode,
        wasImported: false
      });
    }
    
    // Episode doesn't exist - we can't import it without external data
    // This endpoint is mainly for checking existence
    // The frontend should handle importing with the import-single-episode endpoint
    return res.status(404).json({ 
      error: 'Episode not found',
      needsImport: true
    });
  } catch (error) {
    console.error('Error getting or importing episode:', error);
    res.status(500).json({ error: 'Failed to get episode', details: error.message });
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

// Get podcast series info only (without episodes - for fast initial load)
router.get('/series/:seriesId/info', async (req, res) => {
  try {
    const { seriesId } = req.params;
    
    if (!isValidObjectId(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }

    // Get series only (no episodes, no import)
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

    // Get basic stats (count only, no full episode list)
    const episodeCount = await Media.countDocuments({
      podcastSeries: seriesId,
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] }
    });

    // Calculate basic stats
    const statsResult = await Media.aggregate([
      {
        $match: {
          podcastSeries: new mongoose.Types.ObjectId(seriesId),
          contentType: { $in: ['spoken'] },
          contentForm: { $in: ['podcastepisode'] }
        }
      },
      {
        $group: {
          _id: null,
          totalTips: { $sum: '$globalMediaAggregate' },
          episodeCount: { $sum: 1 }
        }
      }
    ]);

    const stats = statsResult[0] || { totalTips: 0, episodeCount: 0 };
    const avgTip = stats.episodeCount > 0 ? stats.totalTips / stats.episodeCount : 0;

    // Get top episode for stats
    const topEpisode = await Media.findOne({
      podcastSeries: seriesId,
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] }
    })
      .sort({ globalMediaAggregate: -1 })
      .select('_id title globalMediaAggregate')
      .lean();

    res.json({
      series: {
        _id: series._id,
        title: series.title,
        description: series.description,
        coverArt: series.coverArt,
        host: series.host,
        genres: series.genres,
        tags: series.tags,
        language: series.language,
        externalIds: series.externalIds,
        sources: series.sources,
        addedBy: series.addedBy
      },
      stats: {
        totalEpisodes: stats.episodeCount,
        totalTips: stats.totalTips,
        avgTip: avgTip,
        topEpisode: topEpisode ? {
          _id: topEpisode._id,
          title: topEpisode.title,
          globalMediaAggregate: topEpisode.globalMediaAggregate
        } : undefined
      }
    });
  } catch (error) {
    console.error('Error fetching series info:', error);
    res.status(500).json({ error: 'Failed to fetch series info' });
  }
});

// Get import progress for a series
router.get('/series/:seriesId/import-progress', async (req, res) => {
  try {
    const { seriesId } = req.params;
    
    if (!isValidObjectId(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }
    
    const progress = importProgress.get(seriesId);
    
    if (!progress) {
      return res.json({
        status: 'not_started',
        current: 0,
        total: 0
      });
    }
    
    res.json({
      status: progress.status,
      current: progress.current,
      total: progress.total,
      startedAt: progress.startedAt
    });
  } catch (error) {
    console.error('Error getting import progress:', error);
    res.status(500).json({ error: 'Failed to get import progress' });
  }
});

// Get podcast series with episodes
router.get('/series/:seriesId', async (req, res) => {
  try {
    const { seriesId } = req.params;
    const { autoImport = 'true', refresh = 'false', loadMore = 'false', limit = '20', offset = '0' } = req.query;
    
    if (!isValidObjectId(seriesId)) {
      return res.status(400).json({ error: 'Invalid series ID' });
    }

    // Get series (need non-lean for potential updates)
    let series = await Media.findById(seriesId)
      .populate('host.userId', 'username profilePic uuid');

    if (!series) {
      return res.status(404).json({ error: 'Podcast series not found' });
    }

    // Verify it's a podcast series
    if (!series.contentForm?.includes('podcastseries')) {
      return res.status(400).json({ error: 'Media item is not a podcast series' });
    }

    // Get existing episodes first
    let episodes = await Media.find({
      podcastSeries: seriesId,
      contentType: { $in: ['spoken'] },
      contentForm: { $in: ['podcastepisode'] }
    })
      .sort({ releaseDate: -1 }) // Sort by newest first
      .populate('host.userId', 'username profilePic uuid')
      .populate('addedBy', 'username')
      .lean();

    // Check if we have enough episodes already
    const existingEpisodeCount = episodes.length;
    const requestedLimit = parseInt(limit, 10) || 20;
    const hasEnoughEpisodes = existingEpisodeCount >= requestedLimit;

    // Auto-import episodes from external source if series has external IDs
    let importedCount = 0;
    let importErrors = [];
    const maxEpisodesToImport = parseInt(limit, 10) || 10; // Import episodes (default 10 for initial load)
    const episodeOffset = parseInt(offset, 10) || 0; // Offset for pagination
    const shouldImport = autoImport === 'true' || loadMore === 'true';
    
    // Only import if:
    // 1. User explicitly requested more (loadMore === 'true')
    // 2. OR refresh is requested
    // 3. OR we don't have enough episodes AND autoImport is enabled
    const needsImport = shouldImport && (
      loadMore === 'true' || 
      refresh === 'true' || 
      !hasEnoughEpisodes
    );
    
    let taddyResult = null; // Declare outside if block for use in response
    
    if (needsImport && series.externalIds) {
      // Handle both Map and plain object formats
      let taddyUuid, podcastIndexId, iTunesId;
      
      if (series.externalIds instanceof Map) {
        taddyUuid = series.externalIds.get('taddy');
        podcastIndexId = series.externalIds.get('podcastIndex');
        iTunesId = series.externalIds.get('iTunes');
      } else if (typeof series.externalIds === 'object') {
        taddyUuid = series.externalIds.taddy;
        podcastIndexId = series.externalIds.podcastIndex;
        iTunesId = series.externalIds.iTunes;
      }
      
      // Only proceed if we have at least one external ID
      if (taddyUuid || podcastIndexId || iTunesId) {
      
      // Use the series creator as the user who imports episodes
      const importUserId = series.addedBy || new mongoose.Types.ObjectId();
      
      try {
        if (taddyUuid) {
          const importAction = loadMore === 'true' ? 'Loading more' : 'Auto-importing';
          console.log(`🔄 ${importAction} episodes for series: ${series.title}`);
          
          // Strategy: 
          // - Initial load: Use RSS feeds (fast, recent episodes)
          // - Load More: Prioritize API sources (Apple Podcasts, Podcast Index) for historical episodes
          let rssEpisodes = [];
          let apiEpisodes = []; // Episodes from Apple/Podcast Index APIs
          let episodesToImport = [];
          let bestRssFeed = null;
          
          // Get all RSS feeds from different sources
          const rssFeeds = getAllRSSFeeds(series);
          
          // For initial load, prioritize RSS feeds (fast, recent episodes)
          // For "Load More", we'll fetch from APIs too for historical episodes
          if (rssFeeds.length > 0 && loadMore !== 'true') {
            console.log(`📡 Found ${rssFeeds.length} RSS feed(s), trying all...`);
            const rssFetchLimit = 200;
            const rssResults = await fetchFromAllRSSFeeds(rssFeeds, rssFetchLimit);
            
            if (rssResults.length > 0) {
              // Use the feed with most episodes
              bestRssFeed = rssResults[0];
              console.log(`📡 Using ${bestRssFeed.source} RSS feed (${bestRssFeed.count} episodes)`);
              
              // If we found a better feed than what's stored as primary, update it
              const currentPrimary = series.sources instanceof Map ? 
                series.sources.get('rss') : series.sources.rss;
              
              if (bestRssFeed.count > 30 && bestRssFeed.url !== currentPrimary) {
                console.log(`💾 Updating primary RSS feed to ${bestRssFeed.source} (more comprehensive)`);
                if (series.sources instanceof Map) {
                  series.sources.set('rss', bestRssFeed.url);
                } else {
                  series.sources = series.sources || {};
                  series.sources.rss = bestRssFeed.url;
                }
                await series.save();
              }
              
              // Merge episodes from all feeds (deduplicate by GUID/title)
              const allEpisodes = new Map();
              rssResults.forEach(result => {
                result.episodes.forEach(ep => {
                  const key = ep.guid || ep.title?.toLowerCase().trim();
                  if (key && !allEpisodes.has(key)) {
                    allEpisodes.set(key, ep);
                  }
                });
              });
              
              rssEpisodes = Array.from(allEpisodes.values());
              console.log(`📡 Merged ${rssEpisodes.length} unique episodes from ${rssResults.length} RSS feed(s)`);
            }
          } else if (rssFeeds.length > 0 && loadMore === 'true') {
            // For "Load More", still try RSS but we'll prioritize APIs below
            console.log(`📡 Trying RSS feeds (will also fetch from APIs for historical episodes)...`);
            const rssFetchLimit = episodeOffset + maxEpisodesToImport + 50;
            const rssResults = await fetchFromAllRSSFeeds(rssFeeds, rssFetchLimit);
            
            if (rssResults.length > 0) {
              bestRssFeed = rssResults[0];
              const allEpisodes = new Map();
              rssResults.forEach(result => {
                result.episodes.forEach(ep => {
                  const key = ep.guid || ep.title?.toLowerCase().trim();
                  if (key && !allEpisodes.has(key)) {
                    allEpisodes.set(key, ep);
                  }
                });
              });
              rssEpisodes = Array.from(allEpisodes.values());
              console.log(`📡 Found ${rssEpisodes.length} episodes from RSS feeds`);
            }
          } else {
            console.log(`⚠️ No RSS feed URL in series, will try to discover from external sources...`);
          }
          
          // For "Load More", prioritize fetching directly from APIs (better for historical episodes)
          if (loadMore === 'true') {
            console.log(`📚 Loading more episodes - fetching from APIs for historical episodes...`);
            
            // Fetch from Podcast Index API if we have the ID
            if (podcastIndexId) {
              try {
                console.log(`📚 Fetching episodes from Podcast Index API...`);
                const maxEpisodesToFetch = episodeOffset + maxEpisodesToImport + 50;
                const piEpisodesResult = await podcastIndexService.getPodcastEpisodes(podcastIndexId, maxEpisodesToFetch);
                if (piEpisodesResult.success && piEpisodesResult.episodes && piEpisodesResult.episodes.length > 0) {
                  // Convert to RSS-like format for consistency
                  const piPodcastResult = await podcastIndexService.getPodcastById(podcastIndexId);
                  const podcastData = piPodcastResult.success ? piPodcastResult.podcast : null;
                  
                  const convertedEpisodes = piEpisodesResult.episodes.map(ep => {
                    const episodeData = podcastIndexService.convertEpisodeToOurFormat(ep, podcastData);
                    return {
                      title: episodeData.title,
                      description: episodeData.description,
                      guid: episodeData.guid,
                      pubDate: episodeData.publishedAt,
                      enclosure: {
                        url: episodeData.audioUrl,
                        type: episodeData.audioType,
                        length: episodeData.audioSize
                      },
                      episodeNumber: episodeData.episodeNumber,
                      seasonNumber: episodeData.seasonNumber,
                      duration: episodeData.duration,
                      explicit: episodeData.explicit,
                      source: 'podcastindex_api'
                    };
                  });
                  
                  apiEpisodes.push(...convertedEpisodes);
                  console.log(`✅ Fetched ${convertedEpisodes.length} episodes from Podcast Index API`);
                }
              } catch (error) {
                console.error('Error fetching episodes from Podcast Index API:', error.message);
              }
            }
            
            // Fetch from Apple Podcasts API if we have the ID
            if (iTunesId) {
              try {
                console.log(`📚 Fetching episodes from Apple Podcasts API...`);
                const maxEpisodesToFetch = episodeOffset + maxEpisodesToImport + 50;
                const appleEpisodesResult = await applePodcastsService.getPodcastEpisodes(iTunesId, maxEpisodesToFetch);
                if (appleEpisodesResult.success && appleEpisodesResult.episodes && appleEpisodesResult.episodes.length > 0) {
                  // Convert to RSS-like format for consistency
                  const applePodcastResult = await applePodcastsService.getPodcastById(iTunesId);
                  const podcastData = applePodcastResult.success ? applePodcastResult.podcast : null;
                  
                  const convertedEpisodes = appleEpisodesResult.episodes.map(ep => {
                    const episodeData = applePodcastsService.convertEpisodeToOurFormat(ep, podcastData);
                    return {
                      title: episodeData.title,
                      description: episodeData.description,
                      guid: episodeData.guid,
                      pubDate: episodeData.publishedAt,
                      enclosure: {
                        url: episodeData.audioUrl,
                        type: episodeData.audioType,
                        length: episodeData.audioSize
                      },
                      episodeNumber: episodeData.episodeNumber,
                      seasonNumber: episodeData.seasonNumber,
                      duration: episodeData.duration,
                      explicit: episodeData.explicit,
                      source: 'apple_api'
                    };
                  });
                  
                  apiEpisodes.push(...convertedEpisodes);
                  console.log(`✅ Fetched ${convertedEpisodes.length} episodes from Apple Podcasts API`);
                }
              } catch (error) {
                console.error('Error fetching episodes from Apple Podcasts API:', error.message);
              }
            }
          }
          
          // Merge all episodes (RSS + API) and deduplicate
          const allEpisodesMap = new Map();
          
          // Add RSS episodes
          rssEpisodes.forEach(ep => {
            const key = ep.guid || ep.title?.toLowerCase().trim();
            if (key && !allEpisodesMap.has(key)) {
              allEpisodesMap.set(key, ep);
            }
          });
          
          // Add API episodes (they take precedence for historical episodes)
          apiEpisodes.forEach(ep => {
            const key = ep.guid || ep.title?.toLowerCase().trim();
            if (key) {
              // API episodes override RSS episodes (they're more comprehensive)
              allEpisodesMap.set(key, ep);
            }
          });
          
          const mergedEpisodes = Array.from(allEpisodesMap.values());
          console.log(`📚 Merged ${mergedEpisodes.length} total episodes (${rssEpisodes.length} from RSS, ${apiEpisodes.length} from APIs)`);
          
          // Get existing episodes to check for duplicates
          const existingEpisodes = await Media.find({
            podcastSeries: seriesId,
            contentType: { $in: ['spoken'] },
            contentForm: { $in: ['podcastepisode'] }
          }).select('title externalIds').lean();
          
          // Filter out episodes already imported (check by title and GUID)
          const existingTitles = new Set(existingEpisodes.map(ep => ep.title?.toLowerCase().trim()));
          const existingGuids = new Set();
          existingEpisodes.forEach(ep => {
            if (ep.externalIds && typeof ep.externalIds === 'object') {
              const guid = ep.externalIds.rssGuid;
              if (guid) existingGuids.add(guid);
              // Also check Apple and Podcast Index IDs
              if (ep.externalIds.apple) existingGuids.add(ep.externalIds.apple);
              if (ep.externalIds.podcastIndex) existingGuids.add(ep.externalIds.podcastIndex);
            }
          });
          
          episodesToImport = mergedEpisodes.filter(ep => {
            const titleMatch = ep.title && existingTitles.has(ep.title.toLowerCase().trim());
            const guidMatch = ep.guid && existingGuids.has(ep.guid);
            return !titleMatch && !guidMatch; // Only include if neither title nor GUID matches
          });
          
          console.log(`📚 ${episodesToImport.length} new episodes to import (${mergedEpisodes.length - episodesToImport.length} already exist)`);
          
          // If no RSS feeds found, they returned no episodes, existing feed has very few episodes (< 50),
          // OR user clicked "Load More Episodes" - try to discover additional/better RSS feeds from external sources
          const shouldTryDiscovery = rssFeeds.length === 0 || 
                                     episodesToImport.length === 0 ||
                                     (bestRssFeed && bestRssFeed.count < 50) ||
                                     loadMore === 'true'; // Always try discovery when loading more
          
          if (shouldTryDiscovery) {
            const discoveredFeeds = [];
            let needsSave = false;
            
            // Try Podcast Index (with ID or by searching)
            if (podcastIndexId) {
              try {
                console.log(`🔍 Discovering RSS feed from Podcast Index (using stored ID)...`);
                const piResult = await podcastIndexService.getPodcastById(podcastIndexId);
                if (piResult.success && piResult.podcast?.url) {
                  discoveredFeeds.push({
                    source: 'podcastindex',
                    url: piResult.podcast.url
                  });
                  console.log(`✅ Discovered RSS feed from Podcast Index`);
                }
              } catch (error) {
                console.error('Error discovering RSS from Podcast Index:', error.message);
              }
            } else if (series.title) {
              // Try to find Podcast Index ID by searching by title
              try {
                console.log(`🔍 Searching Podcast Index for: "${series.title}"`);
                const searchResult = await podcastIndexService.searchPodcasts(series.title, 10);
                if (searchResult.success && searchResult.podcasts && searchResult.podcasts.length > 0) {
                  // Try to match by title similarity
                  const match = searchResult.podcasts.find(p => {
                    const pTitle = (p.title || '').toLowerCase();
                    const sTitle = series.title.toLowerCase();
                    // Check if titles are similar (one contains the other or vice versa)
                    return pTitle.includes(sTitle) || sTitle.includes(pTitle) ||
                           // Or if they share significant words
                           pTitle.split(/\s+/).some(word => word.length > 3 && sTitle.includes(word));
                  });
                  
                  if (match) {
                    console.log(`✅ Found potential match in Podcast Index: "${match.title}"`);
                    const piResult = await podcastIndexService.getPodcastById(match.id);
                    if (piResult.success && piResult.podcast?.url) {
                      discoveredFeeds.push({
                        source: 'podcastindex',
                        url: piResult.podcast.url
                      });
                      // Store the ID for future use
                      if (series.externalIds instanceof Map) {
                        series.externalIds.set('podcastIndex', match.id.toString());
                      } else {
                        series.externalIds = series.externalIds || {};
                        series.externalIds.podcastIndex = match.id.toString();
                      }
                      needsSave = true;
                      console.log(`✅ Discovered RSS feed from Podcast Index (searched by title, ID: ${match.id})`);
                    }
                  }
                }
              } catch (error) {
                console.error('Error searching Podcast Index:', error.message);
              }
            }
            
            // Try Apple Podcasts (with ID or by searching)
            if (iTunesId) {
              try {
                console.log(`🔍 Discovering RSS feed from Apple Podcasts (using stored ID)...`);
                const appleResult = await applePodcastsService.getPodcastById(iTunesId);
                if (appleResult.success && appleResult.podcast?.feedUrl) {
                  discoveredFeeds.push({
                    source: 'apple',
                    url: appleResult.podcast.feedUrl
                  });
                  console.log(`✅ Discovered RSS feed from Apple Podcasts`);
                }
              } catch (error) {
                console.error('Error discovering RSS from Apple:', error.message);
              }
            } else if (series.title) {
              // Try to find Apple Podcasts ID by searching by title
              try {
                console.log(`🔍 Searching Apple Podcasts for: "${series.title}"`);
                const searchResult = await applePodcastsService.searchPodcasts(series.title, 10);
                if (searchResult.success && searchResult.podcasts && searchResult.podcasts.length > 0) {
                  // Try to match by title similarity
                  const match = searchResult.podcasts.find(p => {
                    const pTitle = (p.collectionName || '').toLowerCase();
                    const sTitle = series.title.toLowerCase();
                    // Check if titles are similar
                    return pTitle.includes(sTitle) || sTitle.includes(pTitle) ||
                           // Or if they share significant words
                           pTitle.split(/\s+/).some(word => word.length > 3 && sTitle.includes(word));
                  });
                  
                  if (match && match.collectionId) {
                    console.log(`✅ Found potential match in Apple Podcasts: "${match.collectionName}"`);
                    const appleResult = await applePodcastsService.getPodcastById(match.collectionId);
                    if (appleResult.success && appleResult.podcast?.feedUrl) {
                      discoveredFeeds.push({
                        source: 'apple',
                        url: appleResult.podcast.feedUrl
                      });
                      // Store the ID for future use
                      if (series.externalIds instanceof Map) {
                        series.externalIds.set('iTunes', match.collectionId.toString());
                      } else {
                        series.externalIds = series.externalIds || {};
                        series.externalIds.iTunes = match.collectionId.toString();
                      }
                      needsSave = true;
                      console.log(`✅ Discovered RSS feed from Apple Podcasts (searched by title, ID: ${match.collectionId})`);
                    }
                  }
                }
              } catch (error) {
                console.error('Error searching Apple Podcasts:', error.message);
              }
            }
            
            // Try Taddy to get RSS URL
            if (taddyUuid && discoveredFeeds.length === 0) {
              const maxEpisodesToFetch = loadMore === 'true' ? episodeOffset + maxEpisodesToImport + 10 : 200;
              try {
                taddyResult = await taddyService.getPodcastEpisodes(taddyUuid, maxEpisodesToFetch);
              } catch (taddyError) {
                console.error('Error fetching episodes from Taddy:', taddyError.message);
                taddyResult = { success: false, episodes: [], error: taddyError.message };
              }
              
              if (taddyResult.success && taddyResult.episodes && taddyResult.episodes.length > 0) {
                const firstEpisode = taddyResult.episodes[0];
                if (firstEpisode.podcastSeries?.rssUrl) {
                  discoveredFeeds.push({
                    source: 'taddy',
                    url: firstEpisode.podcastSeries.rssUrl
                  });
                  console.log(`✅ Discovered RSS feed from Taddy`);
                }
              }
            }
            
            // Store discovered feeds and try fetching from them
            if (discoveredFeeds.length > 0) {
              if (series.sources instanceof Map) {
                discoveredFeeds.forEach(feed => {
                  series.sources.set(`rss_${feed.source}`, feed.url);
                  // Set as primary if not already set or if this feed has more episodes
                  const currentPrimary = series.sources.get('rss');
                  if (!currentPrimary) {
                    series.sources.set('rss', feed.url);
                  }
                });
              } else {
                series.sources = series.sources || {};
                discoveredFeeds.forEach(feed => {
                  series.sources[`rss_${feed.source}`] = feed.url;
                  if (!series.sources.rss) {
                    series.sources.rss = feed.url;
                  }
                });
              }
              needsSave = true;
            }
            
            // Save series if we discovered new feeds or IDs
            if (needsSave) {
              await series.save();
              if (discoveredFeeds.length > 0) {
                console.log(`💾 Stored ${discoveredFeeds.length} discovered RSS feed(s)`);
              }
            }
            
            // Try fetching from discovered feeds
            if (discoveredFeeds.length > 0) {
              
              // Now try fetching from discovered feeds
              const rssFetchLimit = loadMore === 'true' ? episodeOffset + maxEpisodesToImport + 10 : 200;
              const rssResults = await fetchFromAllRSSFeeds(discoveredFeeds, rssFetchLimit);
              
              if (rssResults.length > 0) {
                bestRssFeed = rssResults[0];
                console.log(`📡 Using discovered ${bestRssFeed.source} RSS feed (${bestRssFeed.count} episodes)`);
                
                // Merge episodes from all discovered feeds
                const allEpisodes = new Map();
                rssResults.forEach(result => {
                  result.episodes.forEach(ep => {
                    const key = ep.guid || ep.title?.toLowerCase().trim();
                    if (key && !allEpisodes.has(key)) {
                      allEpisodes.set(key, ep);
                    }
                  });
                });
                
                rssEpisodes = Array.from(allEpisodes.values());
                
                // Get existing episodes to check for duplicates
                const existingEpisodes = await Media.find({
                  podcastSeries: seriesId,
                  contentType: { $in: ['spoken'] },
                  contentForm: { $in: ['podcastepisode'] }
                }).select('title externalIds').lean();
                
                const existingTitles = new Set(existingEpisodes.map(ep => ep.title?.toLowerCase().trim()));
                const existingGuids = new Set();
                existingEpisodes.forEach(ep => {
                  if (ep.externalIds && typeof ep.externalIds === 'object') {
                    const guid = ep.externalIds.rssGuid;
                    if (guid) existingGuids.add(guid);
                  }
                });
                
                const rssEpisodesToImport = rssEpisodes.filter(rssEp => {
                  const titleMatch = rssEp.title && existingTitles.has(rssEp.title.toLowerCase().trim());
                  const guidMatch = rssEp.guid && existingGuids.has(rssEp.guid);
                  return !titleMatch && !guidMatch;
                });
                
                // Merge with existing episodesToImport instead of replacing
                // Deduplicate by GUID/title
                const existingImportKeys = new Set(episodesToImport.map(ep => 
                  ep.guid || ep.title?.toLowerCase().trim()
                ).filter(Boolean));
                
                const newRssEpisodes = rssEpisodesToImport.filter(ep => {
                  const key = ep.guid || ep.title?.toLowerCase().trim();
                  return key && !existingImportKeys.has(key);
                });
                
                episodesToImport = [...episodesToImport, ...newRssEpisodes];
                console.log(`📡 Added ${newRssEpisodes.length} new episodes from discovered RSS feed(s) (${episodesToImport.length} total episodes to import)`);
                
                // Sort by date (newest first) to ensure consistent ordering
                episodesToImport.sort((a, b) => {
                  const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
                  const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
                  return dateB - dateA;
                });
              }
            }
            
            // If RSS still didn't work, use Taddy episodes as fallback
            if (episodesToImport.length === 0 && taddyResult && taddyResult.success && taddyResult.episodes && taddyResult.episodes.length > 0) {
              console.log(`📊 Using Taddy API as fallback (RSS unavailable or failed)`);
              
              // Get list of already imported episode UUIDs to skip duplicates
              const existingEpisodes = await Media.find({
                podcastSeries: seriesId,
                'externalIds.taddy': { $exists: true, $ne: null }
              }).select('externalIds title').lean();
              
              const existingUuids = new Set();
              existingEpisodes.forEach(ep => {
                if (ep.externalIds && typeof ep.externalIds === 'object') {
                  const uuid = ep.externalIds.taddy;
                  if (uuid) existingUuids.add(uuid);
                }
              });
              
              // Filter out already imported episodes
              const taddyEpisodesToImport = taddyResult.episodes.filter(ep => {
                const isNew = !existingUuids.has(ep.uuid);
                return isNew;
              });
              
              console.log(`📊 ${taddyEpisodesToImport.length} new episodes from Taddy (${taddyResult.episodes.length - taddyEpisodesToImport.length} already exist)`);
              episodesToImport = taddyEpisodesToImport;
            }
          }
          
          // Process episodes if we have any to import
          if (episodesToImport.length > 0) {
            // Apply pagination: if loadMore, start from offset and take limit
            let episodesToProcess;
            if (loadMore === 'true') {
              // For "load more", start from offset and take the next batch
              episodesToProcess = episodesToImport.slice(episodeOffset, episodeOffset + maxEpisodesToImport);
            } else {
              // For initial load, just take the first batch
              episodesToProcess = episodesToImport.slice(0, maxEpisodesToImport);
            }
            
            if (episodesToProcess.length > 0) {
              // Initialize progress tracking
              importProgress.set(seriesId, {
                current: 0,
                total: episodesToProcess.length,
                status: 'importing',
                startedAt: new Date()
              });
              
              // Prepare series data for linking
              const seriesData = {
                title: series.title,
                description: series.description || '',
                author: series.host && series.host.length > 0 ? series.host[0].name : '',
                image: series.coverArt || null,
                categories: series.genres || [],
                language: series.language || 'en',
                rssUrl: series.sources?.get('rss') || '',
                taddyUuid: taddyUuid
              };
              
              // Import episodes (deduplication handled by importEpisode, but we've pre-filtered)
              for (let i = 0; i < episodesToProcess.length; i++) {
                const episode = episodesToProcess[i];
                
                // Update progress
                importProgress.set(seriesId, {
                  current: i + 1,
                  total: episodesToProcess.length,
                  status: 'importing',
                  startedAt: importProgress.get(seriesId)?.startedAt || new Date()
                });
                try {
                  let result;
                  let source = 'rss'; // Default to RSS
                  
                  // Determine source based on episode properties
                  if (episode.uuid) {
                    // Taddy episode
                    source = 'taddy';
                    result = await podcastAdapter.importEpisodeWithSeries(
                      'taddy',
                      episode,
                      seriesData,
                      importUserId
                    );
                  } else if (episode.source === 'podcastindex_api') {
                    // Podcast Index API episode - convert to Podcast Index format
                    source = 'podcastIndex';
                    const piEpisode = {
                      title: episode.title,
                      description: episode.description,
                      guid: episode.guid,
                      datePublished: episode.pubDate ? Math.floor(new Date(episode.pubDate).getTime() / 1000) : null,
                      enclosureUrl: episode.enclosure?.url,
                      enclosureType: episode.enclosure?.type,
                      enclosureLength: episode.enclosure?.length,
                      episodeNumber: episode.episodeNumber,
                      seasonNumber: episode.seasonNumber,
                      duration: episode.duration,
                      explicit: episode.explicit ? 1 : 0,
                      id: null, // Will be set by adapter if needed
                      feedId: podcastIndexId
                    };
                    result = await podcastAdapter.importEpisodeWithSeries(
                      'podcastIndex',
                      piEpisode,
                      seriesData,
                      importUserId
                    );
                  } else if (episode.source === 'apple_api') {
                    // Apple Podcasts API episode - convert to Apple format
                    source = 'apple';
                    const appleEpisode = {
                      trackName: episode.title,
                      description: episode.description,
                      episodeGuid: episode.guid,
                      releaseDate: episode.pubDate ? new Date(episode.pubDate).toISOString() : null,
                      previewUrl: episode.enclosure?.url,
                      episodeUrl: episode.enclosure?.url,
                      trackTimeMillis: episode.duration ? episode.duration * 1000 : null,
                      trackNumber: episode.episodeNumber,
                      seasonNumber: episode.seasonNumber,
                      trackExplicitness: episode.explicit ? 'explicit' : 'clean',
                      collectionId: iTunesId
                    };
                    result = await podcastAdapter.importEpisodeWithSeries(
                      'apple',
                      appleEpisode,
                      seriesData,
                      importUserId
                    );
                  } else {
                    // RSS episode
                    result = await podcastAdapter.importEpisodeWithSeries(
                      'rss',
                      episode,
                      seriesData,
                      importUserId
                    );
                  }
                  
                  if (result && result.episode) {
                    importedCount++;
                  }
                } catch (epError) {
                  const episodeTitle = episode.name || episode.title || episode.uuid || 'Unknown';
                  console.error(`Error importing episode ${episodeTitle}:`, epError.message);
                  importErrors.push({ title: episodeTitle, error: epError.message });
                }
              }
              if (loadMore === 'true') {
                const remainingCount = episodesToImport.length - (episodeOffset + episodesToProcess.length);
                console.log(`✅ Imported ${importedCount} new episodes (${remainingCount} remaining to import)`);
              } else {
                const remainingCount = episodesToImport.length - episodesToProcess.length;
                console.log(`✅ Imported ${importedCount} new episodes (${remainingCount} remaining to import)`);
              }
            } else {
              const returnedCount = taddyResult ? (taddyResult.returnedCount || (taddyResult.episodes ? taddyResult.episodes.length : 0)) : 0;
              
              if (returnedCount > 0) {
                console.log(`ℹ️ All ${returnedCount} episodes returned by Taddy API are already imported`);
                if (returnedCount === 10) {
                  console.log(`ℹ️ Note: Taddy API appears to have a default limit of 10 episodes. RSS feed may provide more episodes.`);
                }
              } else {
                console.log(`ℹ️ All available episodes already imported`);
              }
            }
          } else if (taddyUuid) {
            // Taddy API failed or returned no episodes, but we still have taddyUuid
            // Try RSS feed as fallback
            console.log(`⚠️ Taddy API failed or returned no episodes, trying RSS feed as fallback...`);
            let rssUrl = null;
            if (series.sources) {
              rssUrl = series.sources instanceof Map ? series.sources.get('rss') : series.sources.rss;
            }
            
            if (rssUrl) {
              try {
                const rssEpisodes = await parseRSSFeed(rssUrl, 100);
                console.log(`📡 Retrieved ${rssEpisodes.length} episodes from RSS feed`);
                
                // Get existing episodes to filter duplicates
                const existingEpisodes = await Media.find({
                  podcastSeries: seriesId
                }).select('title').lean();
                const existingTitles = new Set(existingEpisodes.map(ep => ep.title?.toLowerCase().trim()));
                
                const rssEpisodesToImport = rssEpisodes.filter(rssEp => {
                  return !existingTitles.has(rssEp.title?.toLowerCase().trim());
                });
                
                console.log(`📡 ${rssEpisodesToImport.length} new episodes from RSS (${rssEpisodes.length - rssEpisodesToImport.length} already exist)`);
                
                if (rssEpisodesToImport.length > 0) {
                  // Initialize or update progress tracking
                  const existingProgress = importProgress.get(seriesId);
                  const episodesToProcessCount = loadMore === 'true' 
                    ? Math.min(maxEpisodesToImport, rssEpisodesToImport.length - episodeOffset)
                    : Math.min(maxEpisodesToImport, rssEpisodesToImport.length);
                  
                  if (!existingProgress) {
                    importProgress.set(seriesId, {
                      current: 0,
                      total: episodesToProcessCount,
                      status: 'importing',
                      startedAt: new Date()
                    });
                  } else {
                    importProgress.set(seriesId, {
                      current: existingProgress.current,
                      total: existingProgress.total + episodesToProcessCount,
                      status: 'importing',
                      startedAt: existingProgress.startedAt
                    });
                  }
                  
                  const seriesData = {
                    title: series.title,
                    description: series.description || '',
                    author: series.host && series.host.length > 0 ? series.host[0].name : '',
                    image: series.coverArt || null,
                    categories: series.genres || [],
                    language: series.language || 'en',
                    rssUrl: rssUrl,
                    taddyUuid: taddyUuid
                  };
                  
                  // Apply pagination for RSS episodes too
                  let episodesToProcess;
                  if (loadMore === 'true') {
                    episodesToProcess = rssEpisodesToImport.slice(episodeOffset, episodeOffset + maxEpisodesToImport);
                  } else {
                    episodesToProcess = rssEpisodesToImport.slice(0, maxEpisodesToImport);
                  }
                  
                  for (let i = 0; i < episodesToProcess.length; i++) {
                    const episode = episodesToProcess[i];
                    
                    // Update progress
                    const currentProgress = importProgress.get(seriesId);
                    importProgress.set(seriesId, {
                      current: (currentProgress?.current || 0) + 1,
                      total: currentProgress?.total || episodesToProcess.length,
                      status: 'importing',
                      startedAt: currentProgress?.startedAt || new Date()
                    });
                    try {
                      const result = await podcastAdapter.importEpisodeWithSeries(
                        'rss',
                        episode,
                        seriesData,
                        importUserId
                      );
                      if (result && result.episode) {
                        importedCount++;
                      }
                    } catch (epError) {
                      const episodeTitle = episode.title || 'Unknown';
                      console.error(`Error importing RSS episode ${episodeTitle}:`, epError.message);
                      importErrors.push({ title: episodeTitle, error: epError.message });
                    }
                  }
                  
                  // Mark as complete
                  const finalProgress = importProgress.get(seriesId);
                  if (finalProgress) {
                    importProgress.set(seriesId, {
                      current: finalProgress.current,
                      total: finalProgress.total,
                      status: 'complete',
                      startedAt: finalProgress.startedAt
                    });
                  }
                  
                  console.log(`✅ Imported ${importedCount} episodes from RSS feed`);
                }
              } catch (rssError) {
                console.error(`⚠️ Failed to parse RSS feed: ${rssError.message}`);
              }
            }
          }
        } else if (podcastIndexId) {
          console.log(`🔄 Auto-importing episodes from Podcast Index for series: ${series.title}`);
          const piResult = await podcastIndexService.getPodcastEpisodes(podcastIndexId, maxEpisodesToImport);
          
          if (piResult.success && piResult.episodes && piResult.episodes.length > 0) {
            // Initialize progress tracking
            importProgress.set(seriesId, {
              current: 0,
              total: piResult.episodes.length,
              status: 'importing',
              startedAt: new Date()
            });
            
            // Get podcast data for series info
            const podcastResult = await podcastIndexService.getPodcastById(podcastIndexId);
            const podcastData = podcastResult.success ? podcastResult.podcast : null;
            
            const seriesData = {
              title: series.title,
              description: series.description || '',
              author: series.host && series.host.length > 0 ? series.host[0].name : '',
              image: series.coverArt || null,
              categories: series.genres || [],
              language: series.language || 'en',
              rssUrl: series.sources?.get('rss') || '',
              podcastIndexId: podcastIndexId
            };
            
            for (let i = 0; i < piResult.episodes.length; i++) {
              const piEpisode = piResult.episodes[i];
              
              // Update progress
              importProgress.set(seriesId, {
                current: i + 1,
                total: piResult.episodes.length,
                status: 'importing',
                startedAt: importProgress.get(seriesId)?.startedAt || new Date()
              });
              try {
                const episodeData = podcastIndexService.convertEpisodeToOurFormat(piEpisode, podcastData);
                const result = await podcastAdapter.importEpisodeWithSeries(
                  'podcastIndex',
                  episodeData,
                  seriesData,
                  importUserId
                );
                if (result && result.episode) {
                  importedCount++;
                }
              } catch (epError) {
                console.error(`Error importing episode ${piEpisode.title}:`, epError.message);
                importErrors.push({ title: piEpisode.title || 'Unknown', error: epError.message });
              }
            }
            
            // Mark as complete
            importProgress.set(seriesId, {
              current: piResult.episodes.length,
              total: piResult.episodes.length,
              status: 'complete',
              startedAt: importProgress.get(seriesId)?.startedAt || new Date()
            });
            
            console.log(`✅ Imported ${importedCount} episodes from Podcast Index`);
          }
        } else if (iTunesId) {
          console.log(`🔄 Auto-importing episodes from Apple Podcasts for series: ${series.title}`);
          const appleResult = await applePodcastsService.getPodcastEpisodes(iTunesId, maxEpisodesToImport);
          
          if (appleResult.success && appleResult.episodes && appleResult.episodes.length > 0) {
            // Initialize progress tracking
            importProgress.set(seriesId, {
              current: 0,
              total: appleResult.episodes.length,
              status: 'importing',
              startedAt: new Date()
            });
            
            // Get podcast data for series info
            const podcastResult = await applePodcastsService.getPodcastById(iTunesId);
            const podcastData = podcastResult.success ? podcastResult.podcast : null;
            
            const seriesData = {
              title: series.title,
              description: series.description || '',
              author: series.host && series.host.length > 0 ? series.host[0].name : '',
              image: series.coverArt || null,
              categories: series.genres || [],
              language: series.language || 'en',
              rssUrl: series.sources?.get('rss') || '',
              iTunesId: iTunesId
            };
            
            for (let i = 0; i < appleResult.episodes.length; i++) {
              const appleEpisode = appleResult.episodes[i];
              
              // Update progress
              importProgress.set(seriesId, {
                current: i + 1,
                total: appleResult.episodes.length,
                status: 'importing',
                startedAt: importProgress.get(seriesId)?.startedAt || new Date()
              });
              try {
                const episodeData = applePodcastsService.convertEpisodeToOurFormat(appleEpisode, podcastData);
                const result = await podcastAdapter.importEpisodeWithSeries(
                  'apple',
                  episodeData,
                  seriesData,
                  importUserId
                );
                if (result && result.episode) {
                  importedCount++;
                }
              } catch (epError) {
                console.error(`Error importing episode ${appleEpisode.trackName}:`, epError.message);
                importErrors.push({ title: appleEpisode.trackName || 'Unknown', error: epError.message });
              }
            }
            
            // Mark as complete
            importProgress.set(seriesId, {
              current: appleResult.episodes.length,
              total: appleResult.episodes.length,
              status: 'complete',
              startedAt: importProgress.get(seriesId)?.startedAt || new Date()
            });
            
            console.log(`✅ Imported ${importedCount} episodes from Apple Podcasts`);
          }
        }
      } catch (importError) {
        console.error('Error auto-importing episodes:', importError);
        // Mark as error
        const currentProgress = importProgress.get(seriesId);
        if (currentProgress) {
          importProgress.set(seriesId, {
            ...currentProgress,
            status: 'error'
          });
        }
        // Don't fail the request, just log the error
      }
      
      // Re-fetch episodes after import to get newly imported ones
      if (importedCount > 0 || refresh === 'true') {
        episodes = await Media.find({
          podcastSeries: seriesId,
          contentType: { $in: ['spoken'] },
          contentForm: { $in: ['podcastepisode'] }
        })
          .sort({ releaseDate: -1 })
          .populate('host.userId', 'username profilePic uuid')
          .populate('addedBy', 'username')
          .lean();
      }
      } // Close if (taddyUuid || podcastIndexId || iTunesId)
    } else if (existingEpisodeCount > 0) {
      // Episodes exist and we have enough, skip import
      console.log(`✅ Using ${existingEpisodeCount} existing episodes (skipping import)`);
    } // Close if (needsImport && series.externalIds)

    // Convert series to plain object for response
    const seriesObj = series.toObject ? series.toObject() : series;

    // Calculate stats
    const totalEpisodes = episodes.length;
    const totalTips = episodes.reduce((sum, ep) => sum + (ep.globalMediaAggregate || 0), 0);
    const avgTip = totalEpisodes > 0 ? totalTips / totalEpisodes : 0;
    const topEpisode = episodes.length > 0 ? 
      episodes.reduce((top, ep) => 
        (ep.globalMediaAggregate || 0) > (top.globalMediaAggregate || 0) ? ep : top
      ) : null;

    // Ensure releaseDate is properly serialized for frontend
    const serializedEpisodes = episodes.map(ep => {
      const episode = { ...ep };
      // Convert releaseDate to ISO string if it's a Date object
      if (episode.releaseDate && episode.releaseDate instanceof Date) {
        episode.releaseDate = episode.releaseDate.toISOString();
      } else if (episode.releaseDate && typeof episode.releaseDate === 'object' && episode.releaseDate.$date) {
        // Handle MongoDB date format
        episode.releaseDate = new Date(episode.releaseDate.$date).toISOString();
      }
      return episode;
    });

    // Clean up progress after a delay (to allow final poll)
    setTimeout(() => {
      importProgress.delete(seriesId);
    }, 10000); // Clean up after 10 seconds

    res.json({
      series: seriesObj,
      episodes: serializedEpisodes,
      stats: {
        totalEpisodes,
        totalTips,
        avgTip,
        topEpisode: topEpisode ? {
          _id: topEpisode._id,
          title: topEpisode.title,
          globalMediaAggregate: topEpisode.globalMediaAggregate || 0
        } : null
      },
      importInfo: importedCount > 0 ? {
        imported: importedCount,
        errors: importErrors.length,
        errorDetails: importErrors.slice(0, 5) // Limit error details
      } : null,
      taddyLimitation: taddyResult && taddyResult.returnedCount === 10 ? {
        returnedEpisodes: taddyResult.returnedCount,
        note: 'Taddy API appears to have a default limit of 10 episodes. RSS feed may provide more.'
      } : (taddyResult && taddyResult.episodes && taddyResult.episodes.length === 10 ? {
        returnedEpisodes: 10,
        note: 'Taddy API appears to have a default limit of 10 episodes. RSS feed may provide more.'
      } : null)
    });
  } catch (error) {
    console.error('Error getting podcast series:', error);
    res.status(500).json({ error: 'Failed to get podcast series', details: error.message });
  }
});

// Separate podcast search (using Media model)
router.get('/search-episodes', async (req, res) => {
  try {
    const { q, limit = 50, offset = 0, category, genre, tag } = req.query;
    const limitNum = Math.min(parseInt(limit), 200);
    const offsetNum = Math.max(0, parseInt(offset));
    
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
    
    // Get total count for pagination
    const totalCount = await Media.countDocuments(searchQuery);
    
    const episodes = await Media.find(searchQuery)
      .sort({ globalMediaAggregate: -1, popularity: -1, releaseDate: -1 })
      .skip(offsetNum)
      .limit(limitNum)
      .populate('addedBy', 'username')
      .populate('podcastSeries', 'title coverArt')
      .lean();
    
    // Ensure releaseDate is set - use createdAt as fallback if releaseDate is null
    episodes.forEach(episode => {
      if (!episode.releaseDate && episode.createdAt) {
        episode.releaseDate = episode.createdAt;
      }
    });
    
    const hasMore = offsetNum + episodes.length < totalCount;
    
    res.json({ 
      episodes, 
      count: episodes.length,
      total: totalCount,
      offset: offsetNum,
      hasMore,
      query: q,
      filters: { category, genre, tag }
    });
  } catch (error) {
    console.error('Error searching podcast episodes:', error);
    res.status(500).json({ error: 'Failed to search podcast episodes' });
  }
});

module.exports = router;