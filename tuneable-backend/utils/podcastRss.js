const axios = require('axios');
const xml2js = require('xml2js');
const { extractRssItemImage } = require('./podcastCoverArt');

function parseDuration(durationStr) {
  if (!durationStr) return 0;
  if (typeof durationStr === 'number') return durationStr;

  const parts = String(durationStr).split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  const seconds = parseInt(durationStr, 10);
  return Number.isNaN(seconds) ? 0 : seconds;
}

async function parseRSSFeed(rssUrl, maxEpisodes = 50) {
  try {
    console.log(`📡 Fetching RSS feed: ${rssUrl}`);
    const response = await axios.get(rssUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Tuneable Podcast Importer',
      },
    });

    const parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      explicitRoot: false,
    });

    const result = await parser.parseStringPromise(response.data);
    const channel = result.channel || result;
    const items = Array.isArray(channel.item)
      ? channel.item
      : (channel.item ? [channel.item] : []);

    let keywords = [];
    if (channel['itunes:keywords']) {
      if (typeof channel['itunes:keywords'] === 'string') {
        keywords = channel['itunes:keywords'].split(',').map((k) => k.trim()).filter(Boolean);
      } else if (Array.isArray(channel['itunes:keywords'])) {
        keywords = channel['itunes:keywords']
          .map((k) => (typeof k === 'string' ? k.trim() : String(k).trim()))
          .filter(Boolean);
      }
    }

    const explicitValue = channel['itunes:explicit'];
    let isExplicit = false;
    if (explicitValue !== undefined && explicitValue !== null) {
      if (typeof explicitValue === 'boolean') {
        isExplicit = explicitValue;
      } else if (typeof explicitValue === 'string') {
        const lowerVal = explicitValue.toLowerCase();
        isExplicit = lowerVal === 'yes' || lowerVal === 'true' || lowerVal === 'explicit';
      }
    }

    const channelMetadata = {
      title: channel.title || '',
      description: channel.description || channel['itunes:summary'] || channel['itunes:description'] || '',
      summary: channel['itunes:summary'] || channel.description || '',
      author: channel['itunes:author'] || channel.managingEditor || channel.author || '',
      language: channel.language || channel['itunes:language'] || 'en',
      link: channel.link || '',
      image: channel['itunes:image']?.href || channel['itunes:image'] || (channel.image?.url || channel.image || null),
      categories: channel['itunes:category']
        ? (Array.isArray(channel['itunes:category'])
          ? channel['itunes:category'].map((cat) => (typeof cat === 'object' ? (cat._ || cat.text || cat) : cat))
          : [typeof channel['itunes:category'] === 'object'
            ? (channel['itunes:category']._ || channel['itunes:category'].text || channel['itunes:category'])
            : channel['itunes:category']])
        : [],
      keywords,
      explicit: isExplicit,
      copyright: channel.copyright || '',
      pubDate: channel.pubDate || null,
    };

    const episodes = items.slice(0, maxEpisodes).map((item) => {
      const enclosure = item.enclosure || {};
      const episodeImage = extractRssItemImage(item);
      const itunes = {
        episode: item['itunes:episode'],
        season: item['itunes:season'],
        duration: item['itunes:duration'],
        image: episodeImage,
        explicit: item['itunes:explicit'],
      };

      let pubDate = null;
      if (item.pubDate) {
        pubDate = new Date(item.pubDate);
        if (Number.isNaN(pubDate.getTime())) {
          pubDate = null;
        }
      }

      return {
        title: item.title || 'Untitled Episode',
        description: item.description || item['content:encoded'] || '',
        content: item['content:encoded'] || item.description || '',
        contentSnippet: item.description || '',
        author: item['itunes:author'] || item.author || channel['itunes:author'] || channel.managingEditor || '',
        pubDate,
        guid: item.guid?._ || item.guid || item.link || '',
        link: item.link || '',
        enclosure: {
          url: enclosure.url || enclosure.$?.url || '',
          type: enclosure.type || enclosure.$?.type || 'audio/mpeg',
          length: enclosure.length || enclosure.$?.length || null,
        },
        image: episodeImage ? { url: episodeImage } : null,
        itunes,
        categories: item.category ? (Array.isArray(item.category) ? item.category : [item.category]) : [],
        episodeNumber: itunes.episode ? parseInt(itunes.episode, 10) : null,
        seasonNumber: itunes.season ? parseInt(itunes.season, 10) : null,
        duration: parseDuration(itunes.duration) || 0,
        explicit: itunes.explicit === 'yes' || itunes.explicit === true,
        feedUrl: rssUrl,
      };
    });

    console.log(`📡 Parsed ${episodes.length} episodes from RSS feed`);
    return {
      episodes,
      channel: channelMetadata,
    };
  } catch (error) {
    console.error(`❌ Error parsing RSS feed ${rssUrl}:`, error.message);
    throw error;
  }
}

function getAllRSSFeeds(series) {
  const feeds = [];
  if (!series?.sources) return feeds;

  const sources = series.sources instanceof Map
    ? Array.from(series.sources.entries())
    : Object.entries(series.sources);
  const seen = new Set();

  sources.forEach(([key, url]) => {
    if ((key.startsWith('rss_') || key === 'rss') && url) {
      const normalized = String(url).trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      feeds.push({
        source: key.replace('rss_', '') || 'primary',
        url: normalized,
      });
    }
  });

  return feeds;
}

async function fetchFromAllRSSFeeds(rssFeeds, maxEpisodes = 100) {
  const results = [];

  for (const feed of rssFeeds) {
    try {
      console.log(`📡 Trying RSS feed from ${feed.source}: ${feed.url}`);
      const rssResult = await parseRSSFeed(feed.url, maxEpisodes);
      const episodes = rssResult.episodes || [];
      results.push({
        source: feed.source,
        url: feed.url,
        episodes,
        channel: rssResult.channel || null,
        count: episodes.length,
      });
      console.log(`✅ ${feed.source} RSS feed returned ${episodes.length} episodes`);
    } catch (error) {
      console.error(`❌ Failed to fetch from ${feed.source} RSS feed:`, error.message);
    }
  }

  results.sort((a, b) => b.count - a.count);
  return results;
}

module.exports = {
  parseDuration,
  parseRSSFeed,
  getAllRSSFeeds,
  fetchFromAllRSSFeeds,
};
