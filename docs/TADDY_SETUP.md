# Taddy Podcast API Integration Setup

This guide explains how to set up Taddy podcast search integration for Tuneable.

## What is Taddy?

Taddy is a podcast discovery API that provides:
- **Dedicated podcast search**: Built specifically for podcasts, not general content
- **Better episode search**: Direct episode search with proper podcast metadata
- **Rich metadata**: Better episode descriptions, categories, and search capabilities
- **Generous limits**: 1000 requests/month on free tier (vs Apple's 20/minute)
- **No rate limiting issues**: More reliable than Apple's Search API

## Setup Steps

### 1. Get Taddy API Key

1. Visit [Taddy.org](https://taddy.org/)
2. Sign up for a free account
3. Navigate to your dashboard
4. Generate an API key
5. Copy the API key

### 2. Add API Key and User ID to Environment

Taddy requires BOTH an API key and User ID for authentication. Add both to your backend environment:

```bash
# In your .env file
TADDY_API_KEY=your_taddy_api_key_here
TADDY_USER_ID=your_taddy_user_id_here
```

**Note**: You'll need to get both the API key and User ID from your Taddy dashboard.

### 3. Restart Backend Server

After adding the API key, restart your backend server:

```bash
cd tuneable-backend
npm start
```

## API Endpoints

The following Taddy endpoints are now available:

### Search Episodes
```
GET /api/podcasts/discovery/taddy/search-episodes?q=comedy&max=20
```

### Search Podcasts
```
GET /api/podcasts/discovery/taddy/search-podcasts?q=comedy&max=20
```

### Get Podcast Details
```
GET /api/podcasts/discovery/taddy/podcast/{podcastUuid}
```

### Get Podcast Episodes
```
GET /api/podcasts/discovery/taddy/podcast/{podcastUuid}/episodes?max=50
```

### Import Episodes (with auth)
```
POST /api/podcasts/discovery/taddy/import-episodes
{
  "podcastUuid": "podcast-uuid-here",
  "maxEpisodes": 10,
  "specificEpisode": { ... }
}
```

## Frontend Integration

Taddy is now integrated into the Search component:

1. **Podcast Source Selector**: Choose "🎧 Taddy" from the podcast source options
2. **Episode Search**: Search for specific podcast episodes
3. **Bidding**: Bid on episodes to add them to parties
4. **Import**: Episodes are automatically imported when you bid on them

## Benefits Over Apple Podcasts

| Feature | Taddy | Apple Podcasts |
|---------|-------|----------------|
| **Rate Limits** | 1000/month (free) | 20/minute |
| **Episode Search** | Direct episode search | Limited episode search |
| **Metadata Quality** | Rich podcast metadata | Basic metadata |
| **API Reliability** | Stable, dedicated podcast API | General search API |
| **Search Accuracy** | Better podcast-specific results | Mixed results |

## Usage Examples

### Search for Comedy Episodes
```bash
curl "http://localhost:8000/api/podcasts/discovery/taddy/search-episodes?q=comedy&max=10"
```

### Search for Specific Podcast
```bash
curl "http://localhost:8000/api/podcasts/discovery/taddy/search-podcasts?q=radiolab&max=5"
```

## Error Handling

The Taddy service includes:
- **Rate limiting**: Prevents hitting API limits
- **Error fallbacks**: Graceful handling of API errors
- **Logging**: Detailed logs for debugging
- **Validation**: Input validation for all endpoints

## Troubleshooting

### Common Issues

1. **"Failed to search Taddy"**
   - Check if both `TADDY_API_KEY` and `TADDY_USER_ID` are set in environment
   - Verify both API key and User ID are valid
   - Check backend logs for detailed error messages

2. **"Rate limit approaching"**
   - Taddy has generous limits, but we still implement rate limiting
   - Wait a moment and try again
   - Check if you're making too many requests

3. **"No episodes found"**
   - Try different search terms
   - Check if the podcast exists on Taddy
   - Verify search query is at least 2 characters

### Debug Mode

Enable debug logging by checking the backend console for:
- `🔍 Searching Taddy for episodes: {query}`
- `✅ Found {count} episodes from Taddy`
- `📊 Taddy API calls in last minute: {count}/10`

## Next Steps

1. **Test the integration**: Try searching for episodes using the Taddy source
2. **Compare results**: Test both Taddy and Apple Podcasts to see the difference
3. **Monitor usage**: Check your Taddy dashboard for API usage
4. **Upgrade if needed**: Consider upgrading to a paid plan if you need more requests

## Support

- **Taddy Documentation**: [docs.taddy.org](https://docs.taddy.org/)
- **Taddy Support**: Contact through their website
- **Tuneable Issues**: Check backend logs for detailed error messages
