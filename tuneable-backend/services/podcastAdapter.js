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
   * @returns {Promise<Media>} Created or existing Media document
   */
  async importEpisode(source, episodeData, addedBy) {
    let mediaData;
    
    switch(source.toLowerCase()) {
      case 'taddy':
        mediaData = this.fromTaddy(episodeData);
        break;
      case 'podcastindex':
      case 'podcast_index':
        mediaData = this.fromPodcastIndex(episodeData);
        break;
      case 'rss':
        mediaData = this.fromRSS(episodeData);
        break;
      case 'apple':
        mediaData = this.fromApple(episodeData);
        break;
      default:
        throw new Error(`Unknown podcast source: ${source}`);
    }
    
    // Check for existing episode by external ID
    const existingMedia = await this.findExistingEpisode(mediaData.externalIds);
    
    if (existingMedia) {
      console.log(`✅ Episode already exists: ${existingMedia.title}`);
      // Optionally update with new data
      return existingMedia;
    }
    
    // Create new Media
    const media = new Media({
      ...mediaData,
      addedBy: addedBy
    });
    
    await media.save();
    console.log(`✨ Created new Media episode: ${media.title}`);
    return media;
  }
  
  /**
   * Find existing episode by any external ID
   * @param {Map} externalIds - Map of external IDs
   * @returns {Promise<Media|null>} Existing Media or null
   */
  async findExistingEpisode(externalIds) {
    if (!externalIds || externalIds.size === 0) return null;
    
    const queries = [];
    
    for (const [platform, id] of externalIds) {
      queries.push({
        [`externalIds.${platform}`]: id
      });
    }
    
    if (queries.length === 0) return null;
    
    return await Media.findOne({ $or: queries });
  }
  
  /**
   * Convert Taddy episode to Media format
   */
  fromTaddy(taddyEpisode) {
    return {
      title: taddyEpisode.name || 'Untitled Episode',
      contentType: ['spoken'],
      contentForm: ['episode'],
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
      genres: taddyEpisode.podcastSeries?.categories || [],
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
      releaseDate: taddyEpisode.datePublished ? new Date(taddyEpisode.datePublished) : new Date(),
      fileSize: taddyEpisode.audioLength || null
    };
  }
  
  /**
   * Convert Podcast Index episode to Media format
   */
  fromPodcastIndex(piEpisode) {
    return {
      title: piEpisode.title || 'Untitled Episode',
      contentType: ['spoken'],
      contentForm: ['episode'],
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
      genres: piEpisode.categories ? Object.values(piEpisode.categories) : [],
      tags: piEpisode.categories ? Object.values(piEpisode.categories) : [],
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
  fromRSS(rssItem) {
    return {
      title: rssItem.title || 'Untitled Episode',
      contentType: ['spoken'],
      contentForm: ['episode'],
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
      genres: rssItem.categories || [],
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
  fromApple(appleEpisode) {
    return {
      title: appleEpisode.trackName || 'Untitled Episode',
      contentType: ['spoken'],
      contentForm: ['episode'],
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
      genres: appleEpisode.genres || [],
      
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
  async createOrFindSeries(seriesData, addedBy) {
    // Check if series already exists
    const existing = await Media.findOne({
      $or: [
        { 'externalIds.taddy': seriesData.taddyUuid },
        { 'externalIds.podcastIndex': seriesData.podcastIndexId },
        { 'externalIds.iTunes': seriesData.iTunesId }
      ].filter(q => Object.values(q)[0])
    });
    
    if (existing) {
      return existing;
    }
    
    // Create new podcast series Media
    const series = new Media({
      title: seriesData.title,
      contentType: ['spoken'],
      contentForm: ['podcast'],
      mediaType: [], // Series doesn't have direct media
      
      host: seriesData.author ? 
        [{ name: seriesData.author, userId: null, verified: false }] : [],
      
      description: seriesData.description,
      coverArt: seriesData.image,
      genres: seriesData.categories || [],
      language: seriesData.language || 'en',
      
      sources: new Map(
        [
          ['rss', seriesData.rssUrl],
          ['taddy', seriesData.taddyUuid ? `https://taddy.org/p/${seriesData.taddyUuid}` : null],
          ['podcast_index', seriesData.podcastIndexId ? `https://podcastindex.org/podcast/${seriesData.podcastIndexId}` : null],
          ['apple', seriesData.iTunesId ? `https://podcasts.apple.com/podcast/id${seriesData.iTunesId}` : null]
        ].filter(([_, url]) => url)
      ),
      
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
    // Create or find the podcast series
    const series = await this.createOrFindSeries(seriesData, addedBy);
    
    // Import the episode
    const episode = await this.importEpisode(source, episodeData, addedBy);
    
    // Link episode to series
    if (!episode.podcastSeries) {
      episode.podcastSeries = series._id;
      
      // Also add relationship
      if (!episode.relationships) {
        episode.relationships = [];
      }
      
      const hasRelationship = episode.relationships.some(
        r => r.type === 'same_series' && r.target_uuid === series.uuid
      );
      
      if (!hasRelationship) {
        episode.relationships.push({
          type: 'same_series',
          target_uuid: series.uuid,
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
      contentForm: 'episode'
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

