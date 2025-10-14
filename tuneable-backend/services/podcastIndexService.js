const axios = require('axios');
const crypto = require('crypto');

class PodcastIndexService {
  constructor() {
    this.baseUrl = 'https://api.podcastindex.org/api/1.0';
    this.apiKey = process.env.PODCAST_INDEX_API_KEY;
    this.apiSecret = process.env.PODCAST_INDEX_API_SECRET;
    this.userAgent = 'Tuneable/1.0';
  }

  // Generate authentication headers for PodcastIndex API
  generateAuthHeaders(endpoint) {
    const timestamp = Math.floor(Date.now() / 1000);
    const hash = crypto
      .createHash('sha1')
      .update(this.apiKey + this.apiSecret + timestamp)
      .digest('hex');

    return {
      'User-Agent': this.userAgent,
      'X-Auth-Key': this.apiKey,
      'X-Auth-Date': timestamp.toString(),
      'Authorization': hash
    };
  }

  // Search for podcasts
  async searchPodcasts(query, maxResults = 20) {
    try {
      const endpoint = `/search/byterm?q=${encodeURIComponent(query)}&max=${maxResults}`;
      const headers = this.generateAuthHeaders(endpoint);
      
      const response = await axios.get(`${this.baseUrl}${endpoint}`, { headers });
      
      return {
        success: true,
        podcasts: response.data.feeds || [],
        count: response.data.count || 0
      };
    } catch (error) {
      console.error('PodcastIndex search error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.description || 'Failed to search podcasts'
      };
    }
  }

  // Get podcast details by ID
  async getPodcastById(podcastId) {
    try {
      const endpoint = `/podcasts/byfeedid?id=${podcastId}`;
      const headers = this.generateAuthHeaders(endpoint);
      
      const response = await axios.get(`${this.baseUrl}${endpoint}`, { headers });
      
      return {
        success: true,
        podcast: response.data.feed
      };
    } catch (error) {
      console.error('PodcastIndex get podcast error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.description || 'Failed to get podcast'
      };
    }
  }

  // Get episodes for a podcast
  async getPodcastEpisodes(podcastId, maxResults = 50) {
    try {
      const endpoint = `/episodes/byfeedid?id=${podcastId}&max=${maxResults}`;
      const headers = this.generateAuthHeaders(endpoint);
      
      const response = await axios.get(`${this.baseUrl}${endpoint}`, { headers });
      
      return {
        success: true,
        episodes: response.data.items || [],
        count: response.data.count || 0
      };
    } catch (error) {
      console.error('PodcastIndex get episodes error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.description || 'Failed to get episodes'
      };
    }
  }

  // Search for episodes across all podcasts
  async searchEpisodes(query, maxResults = 20) {
    try {
      const endpoint = `/search/byterm?q=${encodeURIComponent(query)}&max=${maxResults}`;
      const headers = this.generateAuthHeaders(endpoint);
      
      const response = await axios.get(`${this.baseUrl}${endpoint}`, { headers });
      
      console.log('PodcastIndex search response:', {
        totalItems: response.data.items?.length || 0,
        firstItem: response.data.items?.[0] || null
      });
      
      // Filter for episodes only (items with feedId and episodeId)
      const episodes = (response.data.items || []).filter(item => 
        item.feedId && item.id
      );
      
      console.log('Filtered episodes:', episodes.length);
      
      return {
        success: true,
        episodes: episodes,
        count: episodes.length
      };
    } catch (error) {
      console.error('PodcastIndex search episodes error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.description || 'Failed to search episodes'
      };
    }
  }

  // Get trending podcasts
  async getTrendingPodcasts(maxResults = 20) {
    try {
      const endpoint = `/podcasts/trending?max=${maxResults}`;
      const headers = this.generateAuthHeaders(endpoint);
      
      const response = await axios.get(`${this.baseUrl}${endpoint}`, { headers });
      
      return {
        success: true,
        podcasts: response.data.feeds || [],
        count: response.data.count || 0
      };
    } catch (error) {
      console.error('PodcastIndex trending error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.description || 'Failed to get trending podcasts'
      };
    }
  }

  // Convert PodcastIndex episode to our format
  convertEpisodeToOurFormat(piEpisode, podcastData = null) {
    return {
      title: piEpisode.title || 'Untitled Episode',
      description: piEpisode.description || '',
      summary: piEpisode.description || '',
      podcastTitle: podcastData?.title || piEpisode.feedTitle || 'Unknown Podcast',
      podcastId: piEpisode.feedId?.toString() || '',
      podcastImage: podcastData?.image || piEpisode.feedImage || null,
      podcastAuthor: podcastData?.author || piEpisode.feedAuthor || '',
      podcastCategory: Array.isArray(podcastData?.categories) ? podcastData.categories.join(', ') : podcastData?.categories || '',
      episodeNumber: piEpisode.episodeNumber || null,
      seasonNumber: piEpisode.seasonNumber || null,
      duration: piEpisode.duration || 0,
      explicit: piEpisode.explicit === 1,
      audioUrl: piEpisode.enclosureUrl || '',
      audioType: piEpisode.enclosureType || 'audio/mpeg',
      audioSize: piEpisode.enclosureLength || null,
      publishedAt: new Date(piEpisode.datePublished * 1000),
      guid: piEpisode.guid || piEpisode.id?.toString() || '',
      rssUrl: podcastData?.url || '',
      source: 'podcastindex',
      tags: piEpisode.categories ? Object.values(piEpisode.categories) : [],
      language: piEpisode.feedLanguage || 'en',
      playCount: 0,
      popularity: 0,
      globalMediaAggregate: 0, // Updated to schema grammar
      // External IDs
      podcastIndexId: piEpisode.id,
      feedId: piEpisode.feedId
    };
  }

  // Convert PodcastIndex podcast to our format
  convertPodcastToOurFormat(piPodcast) {
    return {
      title: piPodcast.title || 'Unknown Podcast',
      description: piPodcast.description || '',
      author: piPodcast.author || '',
      image: piPodcast.image || null,
      categories: piPodcast.categories ? Object.values(piPodcast.categories) : [],
      language: piPodcast.language || 'en',
      rssUrl: piPodcast.url || '',
      podcastIndexId: piPodcast.id,
      lastUpdate: piPodcast.lastUpdateTime ? new Date(piPodcast.lastUpdateTime * 1000) : null
    };
  }
}

module.exports = new PodcastIndexService();
