const axios = require('axios');

class TaddyService {
  constructor() {
    this.baseUrl = 'https://api.taddy.org';
    this.apiKey = process.env.TADDY_API_KEY;
    this.userId = process.env.TADDY_USER_ID;
    this.recentCalls = []; // Track recent calls for rate limiting
  }

  // Rate limiting helper - Taddy allows 1000 requests/month on free tier
  async enforceRateLimit() {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    
    // Remove calls older than 1 minute
    this.recentCalls = this.recentCalls.filter(callTime => now - callTime < oneMinute);
    
    // Taddy is more generous, but let's be conservative
    if (this.recentCalls.length >= 10) {
      const oldestCall = Math.min(...this.recentCalls);
      const waitTime = oneMinute - (now - oldestCall) + 1000; // Add 1 second buffer
      console.log(`⏳ Taddy rate limit approaching (${this.recentCalls.length}/10), waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.recentCalls = this.recentCalls.filter(callTime => Date.now() - callTime < oneMinute);
    }
    
    this.recentCalls.push(now);
    console.log(`📊 Taddy API calls in last minute: ${this.recentCalls.length}/10`);
  }

  // Search for podcasts using GraphQL
  async searchPodcasts(query, maxResults = 20) {
    try {
      await this.enforceRateLimit();
      
      const graphqlQuery = {
        query: `
          query SearchPodcasts($term: String!) {
            searchForTerm(term: $term, filterForTypes: [PODCASTSERIES]) {
              searchId
              podcastSeries {
                uuid
                name
                description
                author
                imageUrl
                categories
                language
                rssUrl
                dateCreated
                episodeCount
                lastUpdated
              }
            }
          }
        `,
        variables: {
          term: query
        }
      };

      const response = await axios.post(`${this.baseUrl}/graphql`, graphqlQuery, {
        headers: {
          'X-API-KEY': this.apiKey,
          'X-USER-ID': this.userId,
          'Content-Type': 'application/json'
        }
      });

      const podcasts = response.data.data?.searchForTerm?.podcastSeries || [];
      console.log(`✅ Found ${podcasts.length} podcasts from Taddy`);

      return {
        success: true,
        podcasts: podcasts.map(podcast => this.convertPodcastToOurFormat(podcast)),
        count: podcasts.length
      };
    } catch (error) {
      console.error('Taddy podcast search error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to search podcasts'
      };
    }
  }

  // Search for podcast episodes using GraphQL
  async searchEpisodes(query, maxResults = 20) {
    try {
      await this.enforceRateLimit();
      
      const graphqlQuery = {
        query: `
          query SearchEpisodes($term: String!) {
            searchForTerm(term: $term, filterForTypes: [PODCASTEPISODE]) {
              searchId
              podcastEpisodes {
                uuid
                name
                description
                episodeNumber
                seasonNumber
                duration
                audioUrl
                fileLength
                datePublished
                podcastSeries {
                  uuid
                  name
                  imageUrl
                  language
                  rssUrl
                }
              }
            }
          }
        `,
        variables: {
          term: query
        }
      };

      const response = await axios.post(`${this.baseUrl}/graphql`, graphqlQuery, {
        headers: {
          'X-API-KEY': this.apiKey,
          'X-USER-ID': this.userId,
          'Content-Type': 'application/json'
        }
      });

      console.log('🔍 Taddy API Response:', JSON.stringify(response.data, null, 2));
      const episodes = response.data.data?.searchForTerm?.podcastEpisodes || [];
      console.log(`✅ Found ${episodes.length} episodes from Taddy`);

      return {
        success: true,
        episodes: episodes.map(episode => this.convertEpisodeToOurFormat(episode)),
        count: episodes.length
      };
    } catch (error) {
      console.error('Taddy episode search error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to search episodes'
      };
    }
  }

  // Get podcast details by UUID using GraphQL
  async getPodcastById(podcastUuid) {
    try {
      await this.enforceRateLimit();
      
      const graphqlQuery = {
        query: `
          query GetPodcast($uuid: ID!) {
            getPodcastSeries(uuid: $uuid) {
              uuid
              name
              description
              author
              imageUrl
              categories
              language
              rssUrl
              dateCreated
              episodeCount
              lastUpdated
            }
          }
        `,
        variables: {
          uuid: podcastUuid
        }
      };

      const response = await axios.post(`${this.baseUrl}/graphql`, graphqlQuery, {
        headers: {
          'X-API-KEY': this.apiKey,
          'X-USER-ID': this.userId,
          'Content-Type': 'application/json'
        }
      });

      const podcast = response.data.data?.getPodcastSeries || null;
      
      return {
        success: true,
        podcast: podcast ? this.convertPodcastToOurFormat(podcast) : null
      };
    } catch (error) {
      console.error('Taddy podcast lookup error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get podcast details'
      };
    }
  }

  // Get episodes for a specific podcast using GraphQL
  async getPodcastEpisodes(podcastUuid, maxResults = 50) {
    try {
      await this.enforceRateLimit();
      
      const graphqlQuery = {
        query: `
          query GetPodcastEpisodes($uuid: ID!, $limit: Int!) {
            getPodcastSeries(uuid: $uuid) {
              episodes(limit: $limit) {
                uuid
                name
                description
                episodeNumber
                seasonNumber
                duration
                isExplicit
                audioUrl
                audioLength
                datePublished
                podcastSeries {
                  uuid
                  name
                  author
                  imageUrl
                  categories
                  language
                  rssUrl
                }
              }
            }
          }
        `,
        variables: {
          uuid: podcastUuid,
          limit: Math.min(maxResults, 200)
        }
      };

      const response = await axios.post(`${this.baseUrl}/graphql`, graphqlQuery, {
        headers: {
          'X-API-KEY': this.apiKey,
          'X-USER-ID': this.userId,
          'Content-Type': 'application/json'
        }
      });

      const episodes = response.data.data?.getPodcastSeries?.episodes || [];
      
      return {
        success: true,
        episodes: episodes.map(episode => this.convertEpisodeToOurFormat(episode)),
        count: episodes.length
      };
    } catch (error) {
      console.error('Taddy episode lookup error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get podcast episodes'
      };
    }
  }

  // Convert Taddy podcast to our format
  convertPodcastToOurFormat(taddyPodcast) {
    return {
      title: taddyPodcast.name || 'Unknown Podcast',
      description: taddyPodcast.description || '',
      author: taddyPodcast.author || '',
      image: taddyPodcast.imageUrl || null,
      categories: taddyPodcast.categories || [],
      language: taddyPodcast.language || 'en',
      rssUrl: taddyPodcast.rssUrl || '',
      taddyUuid: taddyPodcast.uuid,
      genre: taddyPodcast.categories?.[0] || '',
      releaseDate: taddyPodcast.dateCreated ? new Date(taddyPodcast.dateCreated) : null,
      trackCount: taddyPodcast.episodeCount || 0,
      lastUpdate: taddyPodcast.lastUpdated ? new Date(taddyPodcast.lastUpdated) : null
    };
  }

  // Convert Taddy episode to our format
  convertEpisodeToOurFormat(taddyEpisode) {
    // Taddy returns datePublished as Unix timestamp (seconds) or ISO string
    let datePublished = null;
    if (taddyEpisode.datePublished) {
      if (typeof taddyEpisode.datePublished === 'number') {
        // If it's a number, check if it's in seconds (less than year 2000 in milliseconds)
        // Unix timestamps before 2000 in seconds would be < 946684800000 in milliseconds
        if (taddyEpisode.datePublished < 946684800) {
          // It's in seconds, convert to milliseconds
          datePublished = new Date(taddyEpisode.datePublished * 1000);
        } else {
          // It's already in milliseconds
          datePublished = new Date(taddyEpisode.datePublished);
        }
      } else if (typeof taddyEpisode.datePublished === 'string') {
        // ISO string or other date string
        datePublished = new Date(taddyEpisode.datePublished);
      }
      
      // Validate the date
      if (datePublished && isNaN(datePublished.getTime())) {
        datePublished = null;
      }
    }
    
    return {
      title: taddyEpisode.name || 'Untitled Episode',
      description: taddyEpisode.description || '',
      summary: taddyEpisode.description || '',
      podcastTitle: taddyEpisode.podcastSeries?.name || 'Unknown Podcast',
      podcastId: taddyEpisode.podcastSeries?.uuid || '',
      podcastImage: taddyEpisode.podcastSeries?.imageUrl || null,
      podcastAuthor: '', // Not available in current schema
      podcastCategory: '', // Not available in current schema
      episodeNumber: taddyEpisode.episodeNumber || null,
      seasonNumber: taddyEpisode.seasonNumber || null,
      duration: taddyEpisode.duration || 0,
      explicit: false, // Not available in current schema
      audioUrl: taddyEpisode.audioUrl || '',
      audioType: 'audio/mpeg', // Default assumption
      audioSize: taddyEpisode.fileLength || null,
      publishedAt: datePublished,
      releaseDate: datePublished ? datePublished.toISOString() : null, // Also include as releaseDate for frontend compatibility
      guid: taddyEpisode.uuid,
      rssUrl: taddyEpisode.podcastSeries?.rssUrl || '',
      source: 'taddy',
      tags: [], // Categories not available in current schema
      language: taddyEpisode.podcastSeries?.language || 'en',
      playCount: 0,
      popularity: 0,
      globalMediaAggregate: 0, // Updated to schema grammar
      // Taddy-specific fields
      taddyUuid: taddyEpisode.uuid,
      podcastSeriesUuid: taddyEpisode.podcastSeries?.uuid
    };
  }

  // Get available categories/genres
  getAvailableCategories() {
    return [
      { id: 'all', name: 'All Categories' },
      { id: 'arts', name: 'Arts' },
      { id: 'business', name: 'Business' },
      { id: 'comedy', name: 'Comedy' },
      { id: 'education', name: 'Education' },
      { id: 'fiction', name: 'Fiction' },
      { id: 'government', name: 'Government' },
      { id: 'history', name: 'History' },
      { id: 'health-fitness', name: 'Health & Fitness' },
      { id: 'kids-family', name: 'Kids & Family' },
      { id: 'leisure', name: 'Leisure' },
      { id: 'music', name: 'Music' },
      { id: 'news', name: 'News' },
      { id: 'religion-spirituality', name: 'Religion & Spirituality' },
      { id: 'science', name: 'Science' },
      { id: 'society-culture', name: 'Society & Culture' },
      { id: 'sports', name: 'Sports' },
      { id: 'technology', name: 'Technology' },
      { id: 'true-crime', name: 'True Crime' },
      { id: 'tv-film', name: 'TV & Film' }
    ];
  }

  // Get categories (wrapper for getAvailableCategories with success response)
  getCategories() {
    return {
      success: true,
      categories: this.getAvailableCategories()
    };
  }
}

module.exports = new TaddyService();
