const axios = require('axios');

class ApplePodcastsService {
  constructor() {
    this.baseUrl = 'https://itunes.apple.com';
    this.rateLimitDelay = 3000; // 3 seconds between requests (20 requests per minute)
    this.lastRequestTime = 0;
    this.recentCalls = []; // Track recent calls for better rate limiting
  }

  // Rate limiting helper - Apple allows ~20 calls per minute
  async enforceRateLimit() {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    
    // Remove calls older than 1 minute
    this.recentCalls = this.recentCalls.filter(callTime => now - callTime < oneMinute);
    
    // If we have 18 or more calls in the last minute, wait (leave some buffer)
    if (this.recentCalls.length >= 18) {
      const oldestCall = Math.min(...this.recentCalls);
      const waitTime = oneMinute - (now - oldestCall) + 2000; // Add 2 second buffer
      console.log(`⏳ Rate limit approaching (${this.recentCalls.length}/20), waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      // Clean up the array after waiting
      this.recentCalls = this.recentCalls.filter(callTime => Date.now() - callTime < oneMinute);
    }
    
    this.recentCalls.push(now);
    console.log(`📊 Apple API calls in last minute: ${this.recentCalls.length}/20`);
  }

  // Search for podcasts
  async searchPodcasts(query, maxResults = 20, country = 'US') {
    try {
      await this.enforceRateLimit();
      
      const params = new URLSearchParams({
        term: query,
        media: 'podcast',
        entity: 'podcast',
        limit: Math.min(maxResults, 200), // iTunes max is 200
        country: country
      });

      const response = await axios.get(`${this.baseUrl}/search?${params}`);
      
      return {
        success: true,
        podcasts: response.data.results || [],
        count: response.data.resultCount || 0
      };
    } catch (error) {
      console.error('Apple Podcasts search error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Failed to search podcasts'
      };
    }
  }

  // Search for episodes across all podcasts
  async searchEpisodes(query, maxResults = 20, country = 'US') {
    try {
      await this.enforceRateLimit();
      
      // Use the proper Apple Search API parameters for podcast episodes
      const params = new URLSearchParams({
        term: query,
        media: 'podcast',
        entity: 'podcastEpisode', // Direct episode search as per Apple docs
        limit: Math.min(maxResults, 50), // Apple's default limit is 50
        country: country
      });

      console.log(`🔍 Searching Apple Podcasts for episodes: ${query}`);
      const response = await axios.get(`${this.baseUrl}/search?${params}`);
      
      const episodes = response.data.results || [];
      console.log(`✅ Found ${episodes.length} episodes from Apple Podcasts`);

      // Convert Apple episodes to our format
      const convertedEpisodes = episodes.map(episode => this.convertEpisodeToOurFormat(episode));

      return {
        success: true,
        episodes: convertedEpisodes,
        count: episodes.length
      };
    } catch (error) {
      console.error('Apple Podcasts episode search error:', error.response?.data || error.message);
      
      // Fallback to podcast search + episode lookup if direct episode search fails
      console.log('🔄 Falling back to podcast search + episode lookup');
      return await this.searchEpisodesFallback(query, maxResults, country);
    }
  }

  // Fallback method: search podcasts first, then get episodes
  async searchEpisodesFallback(query, maxResults = 20, country = 'US') {
    try {
      await this.enforceRateLimit();
      
      // First, search for podcasts that match the query
      const podcastParams = new URLSearchParams({
        term: query,
        media: 'podcast',
        entity: 'podcast',
        limit: 3, // Limit to 3 podcasts to avoid rate limits
        country: country
      });

      const podcastResponse = await axios.get(`${this.baseUrl}/search?${podcastParams}`);
      const podcasts = podcastResponse.data.results || [];
      
      if (podcasts.length === 0) {
        return {
          success: true,
          episodes: [],
          count: 0
        };
      }

      // Get episodes from the most relevant podcast only (to keep it fast)
      const allEpisodes = [];
      const topPodcast = podcasts[0]; // Just use the top result
      
      try {
        const episodesResult = await this.getPodcastEpisodes(topPodcast.collectionId, maxResults);
        if (episodesResult.success) {
          allEpisodes.push(...episodesResult.episodes);
        }
      } catch (error) {
        console.error(`Error getting episodes for podcast ${topPodcast.collectionId}:`, error);
      }

      // Filter episodes that match the search query (case-insensitive)
      const filteredEpisodes = allEpisodes.filter(episode => 
        episode.title.toLowerCase().includes(query.toLowerCase()) ||
        episode.podcastTitle.toLowerCase().includes(query.toLowerCase()) ||
        (episode.description && episode.description.toLowerCase().includes(query.toLowerCase()))
      );

      return {
        success: true,
        episodes: filteredEpisodes.slice(0, maxResults),
        count: filteredEpisodes.length
      };
    } catch (error) {
      console.error('Apple Podcasts fallback search error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Failed to search episodes'
      };
    }
  }

  // Get podcast details by ID
  async getPodcastById(podcastId, country = 'US') {
    try {
      await this.enforceRateLimit();
      
      const params = new URLSearchParams({
        id: podcastId,
        media: 'podcast',
        entity: 'podcast',
        country: country
      });

      const response = await axios.get(`${this.baseUrl}/lookup?${params}`);
      
      return {
        success: true,
        podcast: response.data.results?.[0] || null
      };
    } catch (error) {
      console.error('Apple Podcasts get podcast error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Failed to get podcast'
      };
    }
  }

  // Get episodes for a specific podcast
  async getPodcastEpisodes(podcastId, maxResults = 50, country = 'US') {
    try {
      await this.enforceRateLimit();
      
      const params = new URLSearchParams({
        id: podcastId,
        media: 'podcast',
        entity: 'podcastEpisode',
        limit: Math.min(maxResults, 200),
        country: country
      });

      const response = await axios.get(`${this.baseUrl}/lookup?${params}`);
      
      return {
        success: true,
        episodes: response.data.results || [],
        count: response.data.resultCount || 0
      };
    } catch (error) {
      console.error('Apple Podcasts get episodes error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Failed to get episodes'
      };
    }
  }

  // Get top podcasts by genre
  async getTopPodcasts(genre = 'all', maxResults = 20, country = 'US') {
    try {
      await this.enforceRateLimit();
      
      const params = new URLSearchParams({
        media: 'podcast',
        entity: 'podcast',
        limit: Math.min(maxResults, 200),
        country: country
      });

      // Add genre filter if not 'all'
      if (genre !== 'all') {
        params.append('genre', genre);
      }

      const response = await axios.get(`${this.baseUrl}/search?${params}`);
      
      return {
        success: true,
        podcasts: response.data.results || [],
        count: response.data.resultCount || 0
      };
    } catch (error) {
      console.error('Apple Podcasts top podcasts error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Failed to get top podcasts'
      };
    }
  }

  // Convert Apple podcast to our format
  convertPodcastToOurFormat(applePodcast) {
    return {
      title: applePodcast.collectionName || 'Unknown Podcast',
      description: applePodcast.collectionCensoredName || '',
      author: applePodcast.artistName || '',
      image: applePodcast.artworkUrl600 || applePodcast.artworkUrl100 || null,
      categories: applePodcast.genres || [],
      language: applePodcast.country || 'en',
      rssUrl: applePodcast.feedUrl || '',
      appleId: applePodcast.collectionId,
      genre: applePodcast.primaryGenreName || '',
      releaseDate: applePodcast.releaseDate ? new Date(applePodcast.releaseDate) : null,
      trackCount: applePodcast.trackCount || 0,
      lastUpdate: applePodcast.lastUpdateTime ? new Date(applePodcast.lastUpdateTime) : null
    };
  }

  // Convert Apple episode to our format
  convertEpisodeToOurFormat(appleEpisode, podcastData = null) {
    return {
      title: appleEpisode.trackName || 'Untitled Episode',
      description: appleEpisode.description || '',
      summary: appleEpisode.description || '',
      podcastTitle: podcastData?.collectionName || appleEpisode.collectionName || 'Unknown Podcast',
      podcastId: appleEpisode.collectionId?.toString() || '',
      podcastImage: podcastData?.artworkUrl600 || appleEpisode.artworkUrl600 || null,
      podcastAuthor: podcastData?.artistName || appleEpisode.artistName || '',
      podcastCategory: podcastData?.primaryGenreName || appleEpisode.primaryGenreName || '',
      episodeNumber: appleEpisode.trackNumber || null,
      seasonNumber: appleEpisode.seasonNumber || null,
      duration: Math.floor(appleEpisode.trackTimeMillis / 1000) || 0, // Convert to seconds
      explicit: appleEpisode.trackExplicitness === 'explicit',
      audioUrl: appleEpisode.previewUrl || appleEpisode.episodeUrl || appleEpisode.trackViewUrl || '',
      audioType: 'audio/mpeg', // iTunes doesn't provide MIME type
      audioSize: null,
      publishedAt: appleEpisode.releaseDate ? new Date(appleEpisode.releaseDate) : new Date(),
      guid: appleEpisode.trackId?.toString() || appleEpisode.episodeGuid || '',
      rssUrl: podcastData?.feedUrl || appleEpisode.feedUrl || '',
      source: 'apple',
      tags: this.processTags(appleEpisode.genres),
      language: 'en', // Default to English since Apple provides country codes, not language codes
      playCount: 0,
      popularity: 0,
      globalMediaAggregate: 0, // Updated to schema grammar
      // External IDs
      appleId: appleEpisode.trackId?.toString(),
      collectionId: appleEpisode.collectionId?.toString(),
      // Additional Apple-specific fields
      trackViewUrl: appleEpisode.trackViewUrl,
      collectionViewUrl: appleEpisode.collectionViewUrl,
      artistViewUrl: appleEpisode.artistViewUrl
    };
  }

  // Get available genres
  getAvailableGenres() {
    return [
      { id: 'all', name: 'All Genres' },
      { id: '1301', name: 'Arts' },
      { id: '1303', name: 'Comedy' },
      { id: '1304', name: 'Education' },
      { id: '1305', name: 'Kids & Family' },
      { id: '1306', name: 'Health' },
      { id: '1307', name: 'TV & Film' },
      { id: '1308', name: 'Music' },
      { id: '1309', name: 'News' },
      { id: '1310', name: 'Religion & Spirituality' },
      { id: '1311', name: 'Science & Medicine' },
      { id: '1312', name: 'Sports' },
      { id: '1313', name: 'Technology' },
      { id: '1314', name: 'Business' },
      { id: '1315', name: 'Society & Culture' },
      { id: '1316', name: 'Government' },
      { id: '1317', name: 'History' },
      { id: '1318', name: 'True Crime' }
    ];
  }

  // Get genres (wrapper for getAvailableGenres with success response)
  getGenres() {
    return {
      success: true,
      genres: this.getAvailableGenres()
    };
  }

  // Process tags to ensure they're always an array of strings
  processTags(tags) {
    if (!Array.isArray(tags)) {
      return [];
    }
    
    return tags.map(tag => {
      if (typeof tag === 'string') {
        return tag;
      } else if (typeof tag === 'object' && tag.name) {
        return tag.name;
      } else {
        return String(tag);
      }
    });
  }
}

module.exports = new ApplePodcastsService();
