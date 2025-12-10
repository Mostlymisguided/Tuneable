# Podcast Discovery Integration Setup

This guide explains how to set up podcast discovery using external APIs to automatically find and import podcast episodes into Tuneable.

## 🎧 **Recommended API: PodcastIndex.org**

**Why PodcastIndex.org?**
- ✅ **Completely FREE** with generous rate limits
- ✅ **Allows data caching/storage** - we can store episodes in our database
- ✅ **Rich metadata** for episodes and podcasts
- ✅ **No usage restrictions** on stored data
- ✅ **Open source** and community-driven

## 🔧 **Setup Instructions**

### 1. Get PodcastIndex API Credentials

1. Visit [PodcastIndex.org](https://podcastindex.org/)
2. Create a free account
3. Go to your account settings
4. Generate API credentials:
   - **API Key**: Your public API key
   - **API Secret**: Your private API secret

### 2. Add Environment Variables

Add these to your `.env` file in the backend:

```bash
# PodcastIndex.org API Credentials
PODCAST_INDEX_API_KEY=your_api_key_here
PODCAST_INDEX_API_SECRET=your_api_secret_here
```

### 3. Restart Backend Server

```bash
cd tuneable-backend
npm start
```

## 🚀 **Available Endpoints**

### Search Podcasts
```http
GET /api/podcast-discovery/search-podcasts?q=comedy&max=20
```

### Search Episodes
```http
GET /api/podcast-discovery/search-episodes?q=owen+benjamin&max=20
```

### Get Trending Podcasts
```http
GET /api/podcast-discovery/trending-podcasts?max=20
```

### Get Podcast Episodes
```http
GET /api/podcast-discovery/podcast/{podcastId}/episodes?max=50
```

### Import Episodes to Database
```http
POST /api/podcast-discovery/import-episodes
Authorization: Bearer {token}
Content-Type: application/json

{
  "podcastId": "123456",
  "maxEpisodes": 10
}
```

### Get Podcast Details
```http
GET /api/podcast-discovery/podcast/{podcastId}
```

## 📊 **API Rate Limits**

- **PodcastIndex.org**: No strict limits (generous free tier)
- **Recommended**: 1-2 requests per second to be respectful
- **Caching**: Episodes are stored in our database to reduce API calls

## 🔄 **Integration Workflow**

### 1. **Discovery Phase**
- Users search for podcasts using our discovery endpoints
- Results come from PodcastIndex.org in real-time
- No data is stored during discovery

### 2. **Import Phase**
- Users can import specific episodes to our database
- Episodes are converted to our format and stored locally
- Once imported, episodes work with all Tuneable features (bidding, parties, etc.)

### 3. **Caching Strategy**
- Imported episodes are stored permanently in our database
- No need to re-fetch from PodcastIndex for imported content
- Users can boost, add to parties, and interact with imported episodes

## 🎯 **Frontend Integration**

### Search Interface
```javascript
// Search for podcasts
const searchPodcasts = async (query) => {
  const response = await fetch(`/api/podcast-discovery/search-podcasts?q=${query}`);
  return response.json();
};

// Search for episodes
const searchEpisodes = async (query) => {
  const response = await fetch(`/api/podcast-discovery/search-episodes?q=${query}`);
  return response.json();
};
```

### Import Episodes
```javascript
// Import episodes to database
const importEpisodes = async (podcastId, maxEpisodes = 10) => {
  const response = await fetch('/api/podcast-discovery/import-episodes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ podcastId, maxEpisodes })
  });
  return response.json();
};
```

## 🔍 **Example Usage**

### 1. Search for "Joe Rogan" podcasts
```bash
curl "http://localhost:8000/api/podcast-discovery/search-podcasts?q=Joe+Rogan&max=5"
```

### 2. Search for "comedy" episodes
```bash
curl "http://localhost:8000/api/podcast-discovery/search-episodes?q=comedy&max=10"
```

### 3. Get trending podcasts
```bash
curl "http://localhost:8000/api/podcast-discovery/trending-podcasts?max=10"
```

### 4. Import episodes from a specific podcast
```bash
curl -X POST "http://localhost:8000/api/podcast-discovery/import-episodes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"podcastId": "123456", "maxEpisodes": 5}'
```

## 🛡️ **Error Handling**

The service includes comprehensive error handling:

- **API Errors**: Graceful fallback when PodcastIndex is unavailable
- **Rate Limiting**: Automatic retry with exponential backoff
- **Data Validation**: Ensures imported episodes have required fields
- **Duplicate Prevention**: Checks for existing episodes before importing

## 📈 **Scaling Considerations**

### For High Traffic:
1. **Implement caching** for popular search queries
2. **Batch import** multiple episodes at once
3. **Background jobs** for importing large podcast catalogs
4. **Rate limiting** on our side to respect API limits

### For Production:
1. **Monitor API usage** and set up alerts
2. **Implement retry logic** for failed requests
3. **Cache popular podcasts** to reduce API calls
4. **Consider upgrading** to paid tiers if needed

## 🔄 **Alternative APIs**

If PodcastIndex doesn't meet your needs:

### Taddy Podcast API
- **Cost**: $75/month for 100,000 requests
- **Features**: Transcripts, webhooks, rich metadata
- **Pros**: More features, better documentation
- **Cons**: Paid service

### Listen Notes API
- **Cost**: $200/month for 5,000 requests
- **Features**: Excellent search, good documentation
- **Cons**: No data caching allowed, expensive

### iTunes/Apple Podcasts API
- **Cost**: Free
- **Features**: Basic search, RSS feed URLs
- **Cons**: Limited metadata, 20 requests/minute

## 🎉 **Ready to Use!**

Once you've added the API credentials and restarted the server, you can:

1. **Search for podcasts** using the discovery endpoints
2. **Import episodes** to your database
3. **Integrate with frontend** for seamless user experience
4. **Scale up** as your user base grows

The podcast discovery system is now ready to help users find and import amazing podcast content into Tuneable! 🎧✨
