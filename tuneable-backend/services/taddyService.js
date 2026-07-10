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

  // Search for podcast episodes using Taddy's search API (supports pagination)
  async searchEpisodes(query, maxResults = 25, page = 1) {
    try {
      await this.enforceRateLimit();

      const limitPerPage = Math.min(Math.max(1, maxResults), 25);
      const pageNum = Math.min(Math.max(1, page), 20);

      const graphqlQuery = {
        query: `
          query SearchEpisodes($term: String!, $page: Int!, $limitPerPage: Int!) {
            search(
              term: $term
              filterForTypes: [PODCASTEPISODE]
              page: $page
              limitPerPage: $limitPerPage
            ) {
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
                  genres
                  authorName
                }
              }
              responseDetails {
                id
                type
                totalCount
                pagesCount
              }
            }
          }
        `,
        variables: {
          term: query,
          page: pageNum,
          limitPerPage
        }
      };

      const response = await axios.post(`${this.baseUrl}/graphql`, graphqlQuery, {
        headers: {
          'X-API-KEY': this.apiKey,
          'X-USER-ID': this.userId,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.errors?.length) {
        throw new Error(response.data.errors.map((e) => e.message).join('; '));
      }

      const searchData = response.data.data?.search;
      const episodes = searchData?.podcastEpisodes || [];
      const episodeDetails = (searchData?.responseDetails || []).find(
        (d) => d.type === 'PODCASTEPISODE'
      );
      const totalCount = episodeDetails?.totalCount ?? episodes.length;
      const pagesCount = episodeDetails?.pagesCount ?? 1;

      console.log(`✅ Found ${episodes.length} episodes from Taddy (page ${pageNum}/${pagesCount}, total ${totalCount})`);

      return {
        success: true,
        episodes: episodes.map((episode) => this.convertEpisodeToOurFormat(episode)),
        count: episodes.length,
        totalCount,
        page: pageNum,
        pagesCount,
        hasMore: pageNum < pagesCount
      };
    } catch (error) {
      const graphqlErrors = error.response?.data?.errors;
      const message = graphqlErrors?.length
        ? graphqlErrors.map((e) => e.message).join('; ')
        : (error.response?.data?.message || error.message || 'Failed to search episodes');
      console.error('Taddy episode search error:', graphqlErrors || error.response?.data || error.message);
      return {
        success: false,
        error: message
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
          query GetPodcastEpisodes($uuid: ID!) {
            getPodcastSeries(uuid: $uuid) {
              uuid
              name
              genres
              authorName
              episodes {
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
                  genres
                  authorName
                }
              }
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

      const seriesData = response.data.data?.getPodcastSeries || null;
      const episodes = seriesData?.episodes || [];
      const seriesGenres = seriesData?.genres || [];
      const seriesAuthor = seriesData?.authorName || '';
      // Note: episodeCount is not available in the GraphQL schema, so we use episodes.length
      // Taddy API appears to have a default limit (often 10 episodes)
      const totalEpisodeCount = episodes.length;
      
      // Debug: log episode count info
      console.log(`📊 Taddy returned ${episodes.length} episodes`);
      // Note: We can't know the true total count from Taddy API, so we'll rely on RSS feed if available
      
      // Debug: log first episode to see structure
      if (episodes.length > 0) {
        console.log('🔍 Sample Taddy episode structure:', {
          uuid: episodes[0].uuid,
          name: episodes[0].name,
          datePublished: episodes[0].datePublished,
          datePublishedType: typeof episodes[0].datePublished,
          keys: Object.keys(episodes[0])
        });
      }
      
      // Sort episodes by datePublished (newest first) before limiting
      const sortedEpisodes = [...episodes].sort((a, b) => {
        const dateA = a.datePublished || 0;
        const dateB = b.datePublished || 0;
        return dateB - dateA; // Newest first
      });
      
      // Limit results in code since GraphQL doesn't support limit argument
      // Note: Taddy GraphQL returns all episodes, we just limit here for performance
      const limitedEpisodes = sortedEpisodes.slice(0, Math.min(maxResults, 500)).map((episode) => ({
        ...episode,
        podcastSeries: {
          ...(episode.podcastSeries || {}),
          genres: episode.podcastSeries?.genres?.length ? episode.podcastSeries.genres : seriesGenres,
          authorName: episode.podcastSeries?.authorName || seriesAuthor
        }
      }));
      
      // Return raw episodes - let the adapter handle conversion
      return {
        success: true,
        episodes: limitedEpisodes,
        count: limitedEpisodes.length
      };
    } catch (error) {
      console.error('Taddy episode lookup error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to get podcast episodes'
      };
    }
  }

  // Convert Taddy Genre enum values to human-readable tag labels
  formatTaddyGenre(genre) {
    if (!genre) return null;

    let raw = String(genre).replace(/^PODCASTSERIES_/, '');
    if (!raw) return null;

    const topLevelGenres = [
      'RELIGION_AND_SPIRITUALITY',
      'HEALTH_AND_FITNESS',
      'KIDS_AND_FAMILY',
      'SOCIETY_AND_CULTURE',
      'TV_AND_FILM',
      'TRUE_CRIME',
      'TECHNOLOGY',
      'GOVERNMENT',
      'EDUCATION',
      'BUSINESS',
      'COMEDY',
      'FICTION',
      'HISTORY',
      'LEISURE',
      'SCIENCE',
      'SPORTS',
      'ARTS',
      'MUSIC',
      'NEWS'
    ].sort((a, b) => b.length - a.length);

    for (const parent of topLevelGenres) {
      if (raw.startsWith(`${parent}_`)) {
        raw = raw.slice(parent.length + 1);
        break;
      }
    }

    return raw
      .split('_')
      .map((word) => {
        if (word === 'AND') return '&';
        return word.charAt(0) + word.slice(1).toLowerCase();
      })
      .join(' ')
      .replace(/\s&\s/g, ' & ');
  }

  formatTaddyGenres(genres = []) {
    if (!Array.isArray(genres)) return [];

    const seen = new Set();
    const tags = [];

    for (const genre of genres) {
      const label = this.formatTaddyGenre(genre);
      if (!label) continue;

      const key = label.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      tags.push(label);
    }

    return tags;
  }

  extractTaddyTags(taddyEpisode) {
    const series = taddyEpisode?.podcastSeries || {};
    const genres = series.genres?.length ? series.genres : (series.categories || []);
    return this.formatTaddyGenres(genres);
  }

  // Convert Taddy podcast to our format
  convertPodcastToOurFormat(taddyPodcast) {
    const tags = this.formatTaddyGenres(taddyPodcast.genres?.length ? taddyPodcast.genres : (taddyPodcast.categories || []));

    return {
      title: taddyPodcast.name || 'Unknown Podcast',
      description: taddyPodcast.description || '',
      author: taddyPodcast.author || taddyPodcast.authorName || '',
      image: taddyPodcast.imageUrl || null,
      categories: tags,
      language: taddyPodcast.language || 'en',
      rssUrl: taddyPodcast.rssUrl || '',
      taddyUuid: taddyPodcast.uuid,
      genre: tags[0] || '',
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
        // Taddy always returns Unix timestamps in SECONDS
        // Check if it's a reasonable timestamp (not in milliseconds)
        // Timestamps in seconds for dates after 2001 would be > 1000000000
        // Timestamps in milliseconds for dates after 2001 would be > 1000000000000
        // So if it's less than 1000000000000, it's likely in seconds
        if (taddyEpisode.datePublished < 1000000000000) {
          // It's in seconds, convert to milliseconds
          datePublished = new Date(taddyEpisode.datePublished * 1000);
        } else {
          // It's already in milliseconds (unlikely from Taddy, but handle it)
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
    
    const tags = this.extractTaddyTags(taddyEpisode);

    return {
      title: taddyEpisode.name || 'Untitled Episode',
      description: taddyEpisode.description || '',
      summary: taddyEpisode.description || '',
      podcastTitle: taddyEpisode.podcastSeries?.name || 'Unknown Podcast',
      podcastId: taddyEpisode.podcastSeries?.uuid || '',
      podcastImage: taddyEpisode.podcastSeries?.imageUrl || null,
      podcastAuthor: taddyEpisode.podcastSeries?.authorName || '',
      podcastCategory: tags[0] || '',
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
      tags,
      genres: tags,
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
