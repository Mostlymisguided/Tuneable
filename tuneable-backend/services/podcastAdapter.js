/**
 * Unified Podcast Adapter
 * Converts podcast data from various sources (Taddy, Podcast Index, RSS) to Media model format
 */

const Media = require('../models/Media');

class PodcastAdapter {
  /**
   * Import episode from any source into Media model
   * @param {string} source - 'taddy', 'podcastIndex', 'rss', or 'apple'
   * @param {Object} episodeData - Episode data from the source
   * @param {ObjectId} addedBy - User who is adding the episode
   * @param {Object} seriesData - Optional series data for better tag population
   * @returns {Promise<Media>} Created or existing Media document
   */
  async importEpisode(source, episodeData, addedBy, seriesData = null) {
    let mediaData;
    
    switch(source.toLowerCase()) {
      case 'taddy':
        mediaData = this.fromTaddy(episodeData, seriesData);
        break;
      case 'podcastindex':
      case 'podcast_index':
        mediaData = this.fromPodcastIndex(episodeData, seriesData);
        break;
      case 'rss':
        mediaData = this.fromRSS(episodeData, seriesData);
        break;
      case 'apple':
        mediaData = this.fromApple(episodeData, seriesData);
        break;
      default:
        throw new Error(`Unknown podcast source: ${source}`);
    }
    
    // Check for existing episode by external ID
    // Log what we're searching for
    const searchIds = mediaData.externalIds instanceof Map ? 
      Array.from(mediaData.externalIds.entries()) : 
      Object.entries(mediaData.externalIds || {});
    console.log(`🔍 Searching for existing episode with externalIds:`, searchIds);
    
    const existingMedia = await this.findExistingEpisode(mediaData.externalIds);
    
    if (existingMedia) {
      console.log(`✅ Episode already exists: ${existingMedia.title} (searching for: ${mediaData.title})`);
      
      // Update releaseDate if it's missing and we have a new one
      if (!existingMedia.releaseDate && mediaData.releaseDate) {
        existingMedia.releaseDate = mediaData.releaseDate;
        await existingMedia.save();
        console.log(`📅 Updated releaseDate for existing episode: ${existingMedia.title}`);
      }
      
      return existingMedia;
    }
    
    // Debug: log releaseDate before creating
    if (mediaData.releaseDate) {
      console.log(`📅 Creating episode with releaseDate: ${mediaData.releaseDate instanceof Date ? mediaData.releaseDate.toISOString() : mediaData.releaseDate} for: ${mediaData.title}`);
    } else {
      console.log(`⚠️ Creating episode WITHOUT releaseDate for: ${mediaData.title}`);
      console.log(`⚠️ mediaData keys:`, Object.keys(mediaData));
    }
    
    // Create new Media - ensure releaseDate is a Date object if provided
    const mediaDataToSave = { ...mediaData };
    if (mediaDataToSave.releaseDate && !(mediaDataToSave.releaseDate instanceof Date)) {
      // Convert to Date if it's not already
      mediaDataToSave.releaseDate = new Date(mediaDataToSave.releaseDate);
    }
    
    const media = new Media({
      ...mediaDataToSave,
      addedBy: addedBy
    });
    
    await media.save();
    console.log(`✨ Created new Media episode: ${media.title}, releaseDate: ${media.releaseDate ? (media.releaseDate instanceof Date ? media.releaseDate.toISOString() : media.releaseDate) : 'null'}`);
    return media;
  }
  
  /**
   * Find existing episode by any external ID
   * @param {Map} externalIds - Map of external IDs
   * @returns {Promise<Media|null>} Existing Media or null
   */
  async findExistingEpisode(externalIds) {
    if (!externalIds) return null;
    
    const queries = [];
    
    // Handle both Map and plain object formats
    // IMPORTANT: Only search by episode-specific IDs, not series IDs
    // Series IDs (like podcastSeries_taddy) are the same for all episodes and will cause false matches
    if (externalIds instanceof Map) {
      for (const [platform, id] of externalIds) {
        if (id && !platform.includes('Series') && !platform.includes('series')) {
          // Only use episode-specific IDs (taddy, podcastIndex, iTunes, etc.)
          // Skip series IDs (podcastSeries_taddy, etc.)
          queries.push({
            [`externalIds.${platform}`]: id
          });
        }
      }
    } else if (typeof externalIds === 'object') {
      for (const [platform, id] of Object.entries(externalIds)) {
        if (id && !platform.includes('Series') && !platform.includes('series')) {
          // Only use episode-specific IDs
          queries.push({
            [`externalIds.${platform}`]: id
          });
        }
      }
    }
    
    if (queries.length === 0) return null;
    
    const existing = await Media.findOne({ $or: queries });
    if (existing) {
      console.log(`🔍 Found existing episode by external ID: ${existing.title} (UUID: ${existing.uuid})`);
      console.log(`🔍 Query was:`, JSON.stringify(queries, null, 2));
      console.log(`🔍 Existing episode externalIds:`, existing.externalIds instanceof Map ? 
        Array.from(existing.externalIds.entries()) : existing.externalIds);
    }
    return existing;
  }
  
  /**
   * Build tags array from primaryGenreName, genres, and categories
   */
  buildTags(primaryGenreName, genres, categories) {
    const tags = new Set();
    
    // Add primaryGenreName if available
    if (primaryGenreName && typeof primaryGenreName === 'string') {
      tags.add(primaryGenreName);
    }
    
    // Add genres
    if (Array.isArray(genres)) {
      genres.forEach(genre => {
        if (genre && typeof genre === 'string') {
          tags.add(genre);
        }
      });
    } else if (genres && typeof genres === 'string') {
      tags.add(genres);
    }
    
    // Add categories
    if (Array.isArray(categories)) {
      categories.forEach(category => {
        if (category && typeof category === 'string') {
          tags.add(category);
        }
      });
    } else if (categories && typeof categories === 'string') {
      tags.add(categories);
    }
    
    return Array.from(tags);
  }

  /**
   * Convert Taddy episode to Media format
   */
  fromTaddy(taddyEpisode, seriesData = null) {
    // Debug: log the episode data to see what we're receiving
    if (!taddyEpisode.name && !taddyEpisode.title) {
      console.log('⚠️ Taddy episode missing name/title:', {
        uuid: taddyEpisode.uuid,
        keys: Object.keys(taddyEpisode),
        datePublished: taddyEpisode.datePublished,
        datePublishedType: typeof taddyEpisode.datePublished
      });
    }
    
    // Debug: log datePublished for all episodes to diagnose the issue
    console.log('🔍 Taddy episode datePublished:', {
      title: taddyEpisode.name || taddyEpisode.title,
      datePublished: taddyEpisode.datePublished,
      datePublishedType: typeof taddyEpisode.datePublished,
      datePublishedValue: taddyEpisode.datePublished
    });
    
    // Get genres and categories from episode series or seriesData
    const genres = taddyEpisode.podcastSeries?.categories || seriesData?.categories || [];
    const categories = taddyEpisode.podcastSeries?.categories || seriesData?.categories || [];
    const primaryGenreName = seriesData?.primaryGenreName || null;
    
    return {
      title: taddyEpisode.name || taddyEpisode.title || 'Untitled Episode',
      contentType: ['spoken'],
      contentForm: ['podcastepisode'],
      mediaType: ['mp3'],
      
      // Creators
      host: taddyEpisode.podcastSeries?.author ? 
        [{ name: taddyEpisode.podcastSeries.author, userId: null, verified: false }] : [],
      
      // Episode metadata
      episodeNumber: taddyEpisode.episodeNumber || null,
      seasonNumber: taddyEpisode.seasonNumber || null,
      duration: taddyEpisode.duration || 0,
      explicit: taddyEpisode.isExplicit || false,
      description: taddyEpisode.description || '',
      
      // Visual
      coverArt: taddyEpisode.podcastSeries?.imageUrl || null,
      
      // Categorization
      genres: genres,
      tags: this.buildTags(primaryGenreName, genres, categories),
      language: taddyEpisode.podcastSeries?.language || 'en',
      
      // Sources
      sources: new Map(
        [
          ['audio_direct', taddyEpisode.audioUrl],
          ['rss', taddyEpisode.podcastSeries?.rssUrl],
          ['taddy', `https://taddy.org/e/${taddyEpisode.uuid}`]
        ].filter(([_, url]) => url)
      ),
      
      // External IDs
      externalIds: new Map(
        [
          ['taddy', taddyEpisode.uuid],
          ['podcastSeries_taddy', taddyEpisode.podcastSeries?.uuid]
        ].filter(([_, id]) => id)
      ),
      
      // System
      // Taddy returns datePublished as Unix timestamp in SECONDS (not milliseconds)
      releaseDate: (() => {
        if (!taddyEpisode.datePublished) {
          console.log('⚠️ No datePublished for episode:', taddyEpisode.name || taddyEpisode.uuid);
          return null;
        }
        
        let date;
        if (typeof taddyEpisode.datePublished === 'number') {
          // Taddy always returns Unix timestamps in seconds
          // Check if it's a reasonable timestamp (not in milliseconds)
          // Timestamps in seconds for dates after 2001 would be > 1000000000
          // Timestamps in milliseconds for dates after 2001 would be > 1000000000000
          // So if it's less than 1000000000000, it's likely in seconds
          if (taddyEpisode.datePublished < 1000000000000) {
            // It's in seconds, convert to milliseconds
            date = new Date(taddyEpisode.datePublished * 1000);
          } else {
            // It's already in milliseconds (unlikely from Taddy, but handle it)
            date = new Date(taddyEpisode.datePublished);
          }
        } else if (typeof taddyEpisode.datePublished === 'string') {
          // ISO string or other date string
          date = new Date(taddyEpisode.datePublished);
        } else {
          console.log('⚠️ Unexpected datePublished type:', typeof taddyEpisode.datePublished, taddyEpisode.datePublished);
          return null;
        }
        
        // Validate the date - only return if it's valid
        if (date && !isNaN(date.getTime())) {
          // Additional validation: check if date is reasonable (not before 1970 or too far in future)
          const year = date.getFullYear();
          if (year >= 1970 && year <= 2100) {
            return date;
          } else {
            console.log('⚠️ Invalid date year:', year, 'for episode:', taddyEpisode.name || taddyEpisode.uuid);
            return null;
          }
        }
        console.log('⚠️ Invalid date for episode:', taddyEpisode.name || taddyEpisode.uuid, 'datePublished:', taddyEpisode.datePublished);
        return null;
      })(),
      fileSize: taddyEpisode.fileLength || null
    };
  }
  
  /**
   * Convert Podcast Index episode to Media format
   */
  fromPodcastIndex(piEpisode, seriesData = null) {
    const categories = piEpisode.categories ? Object.values(piEpisode.categories) : [];
    const genres = categories; // PodcastIndex uses categories as genres
    const primaryGenreName = categories.length > 0 ? categories[0] : null;
    
    return {
      title: piEpisode.title || 'Untitled Episode',
      contentType: ['spoken'],
      contentForm: ['podcastepisode'],
      mediaType: ['mp3'],
      
      // Creators
      host: piEpisode.feedAuthor ? 
        [{ name: piEpisode.feedAuthor, userId: null, verified: false }] : [],
      
      // Episode metadata
      episodeNumber: piEpisode.episode || null,
      seasonNumber: piEpisode.season || null,
      duration: piEpisode.duration || 0,
      explicit: piEpisode.explicit === 1,
      description: piEpisode.description || '',
      
      // Visual
      coverArt: piEpisode.feedImage || piEpisode.image || null,
      
      // Categorization
      genres: genres,
      tags: this.buildTags(primaryGenreName, genres, categories),
      language: piEpisode.feedLanguage || 'en',
      
      // Sources
      sources: new Map(
        [
          ['audio_direct', piEpisode.enclosureUrl],
          ['rss', piEpisode.feedUrl],
          ['podcast_index', `https://podcastindex.org/episode/${piEpisode.id}`]
        ].filter(([_, url]) => url)
      ),
      
      // External IDs
      externalIds: new Map(
        [
          ['podcastIndex', piEpisode.id?.toString()],
          ['feedId', piEpisode.feedId?.toString()],
          ['rssGuid', piEpisode.guid]
        ].filter(([_, id]) => id)
      ),
      
      // System
      releaseDate: piEpisode.datePublished ? new Date(piEpisode.datePublished * 1000) : new Date(),
      fileSize: piEpisode.enclosureLength || null
    };
  }
  
  /**
   * Convert RSS feed item to Media format
   */
  fromRSS(rssItem, seriesData = null) {
    const categories = rssItem.categories || [];
    const genres = categories; // RSS uses categories as genres
    const primaryGenreName = seriesData?.primaryGenreName || (categories.length > 0 ? categories[0] : null);
    
    return {
      title: rssItem.title || 'Untitled Episode',
      contentType: ['spoken'],
      contentForm: ['podcastepisode'],
      mediaType: ['mp3'],
      
      // Creators (may need manual parsing from author field)
      host: rssItem.author ? 
        [{ name: rssItem.author, userId: null, verified: false }] : [],
      
      // Episode metadata
      episodeNumber: rssItem.episodeNumber || null,
      seasonNumber: rssItem.seasonNumber || null,
      duration: this.parseDuration(rssItem.duration) || 0,
      explicit: rssItem.explicit === 'yes' || rssItem.explicit === true,
      description: rssItem.contentSnippet || rssItem.content || '',
      
      // Visual
      coverArt: rssItem.image?.url || rssItem.itunes?.image || null,
      
      // Categorization
      genres: genres,
      tags: this.buildTags(primaryGenreName, genres, categories),
      language: rssItem.language || 'en',
      
      // Sources
      sources: new Map(
        [
          ['audio_direct', rssItem.enclosure?.url],
          ['rss', rssItem.feedUrl]
        ].filter(([_, url]) => url)
      ),
      
      // External IDs
      externalIds: new Map(
        [
          ['rssGuid', rssItem.guid]
        ].filter(([_, id]) => id)
      ),
      
      // System
      releaseDate: rssItem.pubDate ? new Date(rssItem.pubDate) : new Date(),
      fileSize: rssItem.enclosure?.length || null,
      
      // Transcript (if available from podcast:transcript tag)
      transcript: rssItem.transcript || null
    };
  }
  
  /**
   * Convert Apple Podcasts episode to Media format
   */
  fromApple(appleEpisode, seriesData = null) {
    const genres = appleEpisode.genres || [];
    const primaryGenreName = appleEpisode.primaryGenreName || seriesData?.primaryGenreName || null;
    const categories = genres; // Apple uses genres as categories
    
    return {
      title: appleEpisode.trackName || 'Untitled Episode',
      contentType: ['spoken'],
      contentForm: ['podcastepisode'],
      mediaType: ['mp3'],
      
      // Creators
      host: appleEpisode.artistName ? 
        [{ name: appleEpisode.artistName, userId: null, verified: false }] : [],
      
      // Episode metadata
      duration: appleEpisode.trackTimeMillis ? Math.floor(appleEpisode.trackTimeMillis / 1000) : 0,
      explicit: appleEpisode.contentAdvisoryRating === 'Explicit',
      description: appleEpisode.description || '',
      
      // Visual
      coverArt: appleEpisode.artworkUrl600 || appleEpisode.artworkUrl100 || null,
      
      // Categorization
      genres: genres,
      tags: this.buildTags(primaryGenreName, genres, categories),
      
      // Sources
      sources: new Map(
        [
          ['audio_direct', appleEpisode.episodeUrl],
          ['rss', appleEpisode.feedUrl],
          ['apple', appleEpisode.trackViewUrl]
        ].filter(([_, url]) => url)
      ),
      
      // External IDs
      externalIds: new Map(
        [
          ['iTunes', appleEpisode.trackId?.toString()],
          ['collectionId', appleEpisode.collectionId?.toString()]
        ].filter(([_, id]) => id)
      ),
      
      // System
      releaseDate: appleEpisode.releaseDate ? new Date(appleEpisode.releaseDate) : new Date()
    };
  }
  
  /**
   * Parse duration from various formats
   */
  parseDuration(duration) {
    if (!duration) return 0;
    if (typeof duration === 'number') return duration;
    
    // Parse HH:MM:SS or MM:SS format
    const parts = duration.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    
    return parseInt(duration) || 0;
  }
  
  /**
   * Create or find podcast series as Media
   */
  async createOrFindSeries(seriesData, addedBy, source = null) {
    // Check if series already exists
    const existing = await Media.findOne({
      $or: [
        { 'externalIds.taddy': seriesData.taddyUuid },
        { 'externalIds.podcastIndex': seriesData.podcastIndexId },
        { 'externalIds.iTunes': seriesData.iTunesId }
      ].filter(q => Object.values(q)[0])
    });
    
    if (existing) {
      // Update RSS feed if we have a new one from a different source
      if (seriesData.rssUrl && existing.sources) {
        const rssKey = source ? `rss_${source}` : 'rss';
        const sources = existing.sources instanceof Map ? existing.sources : new Map(Object.entries(existing.sources || {}));
        
        // Check if this RSS feed is already stored
        const existingRss = sources.get(rssKey) || sources.get('rss');
        if (existingRss !== seriesData.rssUrl) {
          // Store with source-specific key
          sources.set(rssKey, seriesData.rssUrl);
          // Update primary RSS if not set or if this is a better source
          if (!sources.get('rss') || (source && source !== 'primary')) {
            sources.set('rss', seriesData.rssUrl);
          }
          
          existing.sources = sources;
          await existing.save();
          console.log(`💾 Updated RSS feed for series: ${existing.title} (source: ${source || 'primary'})`);
        }
      }
      return existing;
    }
    
    // Create new podcast series Media
    const series = new Media({
      title: seriesData.title,
      contentType: ['spoken'],
      contentForm: ['podcastseries'],
      mediaType: ['collection'], // Series is a collection/container, not a direct media file
      
      host: seriesData.author ? 
        [{ name: seriesData.author, userId: null, verified: false }] : [],
      
      description: seriesData.description,
      coverArt: seriesData.image,
      genres: seriesData.categories || [],
      language: seriesData.language || 'en',
      
      sources: (() => {
        const sourceMap = new Map();
        
        // Store RSS feed
        if (seriesData.rssUrl) {
          // Store with source-specific key if source is provided
          if (source) {
            sourceMap.set(`rss_${source}`, seriesData.rssUrl);
          }
          // Always store as 'rss' for backwards compatibility
          sourceMap.set('rss', seriesData.rssUrl);
        }
        
        // Store other sources
        if (seriesData.taddyUuid) {
          sourceMap.set('taddy', `https://taddy.org/p/${seriesData.taddyUuid}`);
        }
        if (seriesData.podcastIndexId) {
          sourceMap.set('podcast_index', `https://podcastindex.org/podcast/${seriesData.podcastIndexId}`);
        }
        if (seriesData.iTunesId) {
          sourceMap.set('apple', `https://podcasts.apple.com/podcast/id${seriesData.iTunesId}`);
        }
        
        return sourceMap;
      })(),
      
      externalIds: new Map(
        [
          ['taddy', seriesData.taddyUuid],
          ['podcastIndex', seriesData.podcastIndexId?.toString()],
          ['iTunes', seriesData.iTunesId?.toString()]
        ].filter(([_, id]) => id)
      ),
      
      addedBy: addedBy
    });
    
    await series.save();
    console.log(`✨ Created podcast series: ${series.title}`);
    return series;
  }
  
  /**
   * Import episode with series linkage
   */
  async importEpisodeWithSeries(source, episodeData, seriesData, addedBy) {
    // Create or find the podcast series (pass source to store RSS feed with source-specific key)
    const series = await this.createOrFindSeries(seriesData, addedBy, source);
    
    // Import the episode (pass seriesData for better tag population)
    const episode = await this.importEpisode(source, episodeData, addedBy, seriesData);
    
    // Link episode to series
    if (!episode.podcastSeries) {
      episode.podcastSeries = series._id;
      
      // Also add relationship
      if (!episode.relationships) {
        episode.relationships = [];
      }
      
      const hasRelationship = episode.relationships.some(
        r => r.type === 'same_series' && r.targetId && r.targetId.toString() === series._id.toString()
      );
      
      if (!hasRelationship) {
        episode.relationships.push({
          type: 'same_series',
          targetId: series._id,
          description: `Part of ${series.title}`
        });
      }
      
      await episode.save();
      console.log(`🔗 Linked episode to series: ${series.title}`);
    }
    
    return { episode, series };
  }
  
  /**
   * Get all episodes for a podcast series
   */
  async getSeriesEpisodes(seriesId) {
    return await Media.find({
      podcastSeries: seriesId,
      contentForm: 'podcastepisode'
    }).sort({ episodeNumber: -1, releaseDate: -1 });
  }
  
  /**
   * Update episode from external source (re-sync)
   */
  async updateFromExternalSource(mediaId, source) {
    const media = await Media.findById(mediaId);
    if (!media) throw new Error('Media not found');
    
    const externalId = media.externalIds?.get(source);
    if (!externalId) {
      throw new Error(`No ${source} ID found for this media`);
    }
    
    // Fetch fresh data from source
    let freshData;
    switch(source) {
      case 'taddy':
        // Would call Taddy API with externalId
        throw new Error('Taddy update not implemented yet');
      case 'podcastIndex':
        // Would call Podcast Index API
        throw new Error('Podcast Index update not implemented yet');
      default:
        throw new Error(`Update not supported for source: ${source}`);
    }
    
    // Update media with fresh data
    // Object.assign(media, freshData);
    // await media.save();
    
    return media;
  }
}

module.exports = new PodcastAdapter();

