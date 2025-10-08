# Podcast Ecosystem Integration

## 🎯 Overview

Tuneable now integrates the open podcast ecosystem into the unified Media model, supporting multiple podcast sources while preventing duplicates and enabling rich metadata.

## 📡 Supported Podcast Sources

### **1. Taddy (Primary for Rich Metadata)**
- **API:** GraphQL
- **Best For:** Episode search, rich categorization, persistent UUIDs
- **Rate Limit:** 1000 requests/month (free)
- **External ID:** `externalIds.taddy`

### **2. Podcast Index (Open Ecosystem)**
- **API:** REST with SHA-1 auth
- **Best For:** Trending podcasts, open directory, community-driven
- **Rate Limit:** Generous
- **External ID:** `externalIds.podcastIndex`

### **3. RSS Feeds (Direct Access)**
- **API:** XML parsing
- **Best For:** Real-time updates, show notes, direct playback
- **Rate Limit:** None
- **External ID:** `externalIds.rssGuid`

### **4. Apple Podcasts (Discovery)**
- **API:** iTunes Search API
- **Best For:** Popular podcasts, Apple ecosystem
- **Rate Limit:** 20 requests/minute
- **External ID:** `externalIds.iTunes`

---

## 📊 Media Model Podcast Fields

### **New Fields Added:**

```javascript
// External platform IDs (for syncing & deduplication)
externalIds: {
  type: Map,
  of: String,
  default: {}
}

// Podcast series reference (for episodes)
podcastSeries: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Media',
  default: null
}

// Transcript (for podcasts/videos)
transcript: { type: String }
```

### **Existing Fields Used for Podcasts:**

```javascript
// Classification
contentType: ['spoken']
contentForm: ['episode'] or ['podcast']

// Creators
host: [{ name, userId, verified }]
guest: [{ name, userId, verified }]
narrator: [{ name, userId, verified }]

// Episode metadata
episodeNumber: Number
seasonNumber: Number
duration: Number
explicit: Boolean
description: String

// Categorization
genres: [String]  // Podcast Taxonomy categories
tags: [String]
language: String

// Visual
coverArt: String

// Sources
sources: Map {
  'rss' => 'https://feed.url',
  'audio_direct' => 'https://episode.mp3',
  'taddy' => 'https://taddy.org/e/uuid',
  'podcast_index' => 'https://podcastindex.org/episode/123'
}

// System
releaseDate: Date
fileSize: Number
```

---

## 🔧 Podcast Adapter Service

**Location:** `/tuneable-backend/services/podcastAdapter.js`

### **Main Methods:**

#### **1. Import Episode**

```javascript
const podcastAdapter = require('../services/podcastAdapter');

// Import from Taddy
const episode = await podcastAdapter.importEpisode(
  'taddy',
  taddyEpisodeData,
  req.user._id
);

// Import from Podcast Index
const episode = await podcastAdapter.importEpisode(
  'podcastIndex',
  piEpisodeData,
  req.user._id
);

// Import from RSS
const episode = await podcastAdapter.importEpisode(
  'rss',
  rssItemData,
  req.user._id
);
```

#### **2. Import with Series Linkage**

```javascript
const { episode, series } = await podcastAdapter.importEpisodeWithSeries(
  'taddy',
  episodeData,
  seriesData,
  req.user._id
);

// Creates/finds series and links episode to it
```

#### **3. Find Existing Episode**

```javascript
const existing = await podcastAdapter.findExistingEpisode(
  new Map([
    ['taddy', 'taddy-uuid'],
    ['rssGuid', 'guid-from-feed']
  ])
);

// Checks all external IDs to prevent duplicates
```

---

## 🎯 Integration Examples

### **Example 1: Import from Taddy**

```javascript
// In your podcast route
const taddyService = require('../services/taddyService');
const podcastAdapter = require('../services/podcastAdapter');

router.post('/import-taddy-episode', authMiddleware, async (req, res) => {
  const { episodeUuid } = req.body;
  
  // 1. Fetch from Taddy
  const taddyData = await taddyService.getEpisodeByUuid(episodeUuid);
  
  // 2. Convert to Media (with deduplication)
  const media = await podcastAdapter.importEpisode(
    'taddy',
    taddyData,
    req.user._id
  );
  
  res.json({ success: true, media });
});
```

### **Example 2: Import Entire Podcast Series**

```javascript
router.post('/import-podcast-series', authMiddleware, async (req, res) => {
  const { podcastUuid, maxEpisodes = 10 } = req.body;
  
  // 1. Fetch podcast and episodes from Taddy
  const podcastData = await taddyService.getPodcastById(podcastUuid);
  const episodesData = await taddyService.getPodcastEpisodes(podcastUuid, maxEpisodes);
  
  // 2. Create series
  const series = await podcastAdapter.createOrFindSeries(
    {
      title: podcastData.title,
      author: podcastData.author,
      description: podcastData.description,
      image: podcastData.image,
      categories: podcastData.categories,
      rssUrl: podcastData.rssUrl,
      taddyUuid: podcastData.taddyUuid
    },
    req.user._id
  );
  
  // 3. Import episodes
  const imported = [];
  for (const episodeData of episodesData.episodes) {
    const episode = await podcastAdapter.importEpisode(
      'taddy',
      episodeData,
      req.user._id
    );
    
    // Link to series
    if (!episode.podcastSeries) {
      episode.podcastSeries = series._id;
      await episode.save();
    }
    
    imported.push(episode);
  }
  
  res.json({
    success: true,
    series,
    episodes: imported,
    count: imported.length
  });
});
```

### **Example 3: RSS Feed Monitoring**

```javascript
const Parser = require('rss-parser');
const parser = new Parser();

// Scheduled job (e.g., every hour)
async function syncRSSFeeds() {
  // Get all podcast series with RSS feeds
  const podcasts = await Media.find({
    contentForm: 'podcast',
    'sources.rss': { $exists: true }
  });
  
  for (const podcast of podcasts) {
    const rssUrl = podcast.sources.get('rss');
    
    try {
      const feed = await parser.parseURL(rssUrl);
      
      for (const item of feed.items) {
        // Check if episode already exists
        const existing = await Media.findOne({
          'externalIds.rssGuid': item.guid
        });
        
        if (!existing) {
          console.log(`✨ New episode found: ${item.title}`);
          
          // Import new episode
          await podcastAdapter.importEpisodeWithSeries(
            'rss',
            item,
            {
              title: feed.title,
              author: feed.itunes?.author,
              description: feed.description,
              image: feed.itunes?.image,
              rssUrl: rssUrl
            },
            podcast.addedBy
          );
        }
      }
    } catch (error) {
      console.error(`Failed to sync ${podcast.title}:`, error.message);
    }
  }
}
```

---

## 🔍 Querying Podcasts

### **Find Episode by External ID**

```javascript
// By Taddy UUID
const episode = await Media.findOne({ 'externalIds.taddy': 'taddy-uuid' });

// By RSS GUID
const episode = await Media.findOne({ 'externalIds.rssGuid': 'guid-123' });

// By any ID
const episode = await Media.findOne({
  $or: [
    { 'externalIds.taddy': id },
    { 'externalIds.podcastIndex': id },
    { 'externalIds.rssGuid': id }
  ]
});
```

### **Get All Episodes for a Series**

```javascript
const episodes = await Media.find({
  podcastSeries: seriesId,
  contentForm: 'episode'
}).sort({ episodeNumber: -1 });
```

### **Find Podcast Series**

```javascript
const series = await Media.find({
  contentType: 'spoken',
  contentForm: 'podcast'
});
```

### **Get Series with Episode Count**

```javascript
const seriesWithCounts = await Media.aggregate([
  {
    $match: {
      contentType: 'spoken',
      contentForm: 'podcast'
    }
  },
  {
    $lookup: {
      from: 'media',
      localField: '_id',
      foreignField: 'podcastSeries',
      as: 'episodes'
    }
  },
  {
    $project: {
      title: 1,
      coverArt: 1,
      genres: 1,
      episodeCount: { $size: '$episodes' }
    }
  }
]);
```

---

## 🎨 Frontend Display

### **Episode with Series Link**

```tsx
interface PodcastEpisode {
  title: string;
  host: Creator[];
  episodeNumber?: number;
  seasonNumber?: number;
  podcastSeries?: string; // UUID of series
  externalIds?: Record<string, string>;
}

const EpisodeCard = ({ episode }: { episode: Media }) => {
  const [series, setSeries] = useState(null);
  
  useEffect(() => {
    if (episode.podcastSeries) {
      fetch(`/api/media/${episode.podcastSeries}`)
        .then(res => res.json())
        .then(data => setSeries(data.media));
    }
  }, [episode.podcastSeries]);
  
  return (
    <div>
      <h3>{episode.title}</h3>
      {series && (
        <Link to={`/podcast/${series.uuid}`}>
          {series.title}
        </Link>
      )}
      {episode.episodeNumber && (
        <span>Episode {episode.episodeNumber}</span>
      )}
    </div>
  );
};
```

---

## 🚀 Usage Workflow

### **User Searches for Podcast:**

```
1. User searches "Joe Rogan" → Frontend
2. Frontend calls Taddy API → Gets results
3. User selects episode → Frontend
4. Frontend POST /api/podcasts/import
   {
     source: 'taddy',
     episodeData: {...},
     seriesData: {...}
   }
5. Backend:
   - Checks externalIds for duplicates
   - Creates/finds podcast series
   - Creates episode Media
   - Links episode to series
   - Returns Media document
6. User bids on episode → Standard bidding flow
7. Episode plays → Uses audioUrl from sources
```

---

## 📋 Migration Script Update

Add to existing migration to preserve external IDs:

```javascript
// In migrateToMedia.js, for podcast episodes:
const media = new Media({
  // ... existing fields ...
  
  externalIds: new Map([
    ['rssGuid', episode.guid],
    ['podcastIndex', episode.podcastIndexId?.toString()],
    ['taddy', episode.taddyUuid]
  ].filter(([_, id]) => id))
});
```

---

## 🎯 Benefits

✅ **Deduplication** - externalIds prevent importing same episode twice  
✅ **Multi-Source** - Import from Taddy, Podcast Index, RSS, or Apple  
✅ **Series Navigation** - Link episodes to their podcast  
✅ **Auto-Sync** - RSS feeds can be monitored for new episodes  
✅ **Platform Links** - sources Map tracks where content is available  
✅ **Unified Model** - Podcasts use same bidding/comment system as music  
✅ **Creator Linking** - Podcast hosts can claim their shows  
✅ **Relationships** - Use for "More from this podcast"  

---

## 📚 Next Steps

1. ✅ **Model Updated** - externalIds, podcastSeries, transcript added
2. ✅ **Indexes Added** - Fast lookups by external IDs
3. ✅ **Adapter Created** - Unified podcast import service
4. ✅ **TypeScript Updated** - Frontend interfaces ready
5. ⏳ **Routes** - Update podcast routes to use adapter
6. ⏳ **Testing** - Test imports from each source
7. ⏳ **RSS Sync** - Implement scheduled RSS feed monitoring

---

**Status:** ✅ Core Integration Complete  
**Date:** October 8, 2025

