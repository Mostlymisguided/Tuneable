# YouTube Data Refresh System

## Overview

This system refreshes YouTube video availability data to comply with YouTube's API terms, which require periodic refresh of cached metadata (thumbnails, titles) to ensure deleted/privated videos are not kept indefinitely.

**Key Feature**: The refresh system **only checks availability** and does **NOT overwrite manually edited titles/artists**. This preserves admin corrections to YouTube's often poorly formatted data.

## How It Works

1. **Availability Check Only**: The system checks if YouTube videos are still available (public, unlisted, private, or deleted)
2. **No Data Overwriting**: Manually edited titles and artists are never overwritten
3. **Status Tracking**: Updates `youtubeMetadata.isAvailable` and `youtubeMetadata.unavailableReason` fields
4. **Original Data Preservation**: Stores original YouTube title/thumbnail when media is first created

## Schema Changes

Added to `Media` model:
```javascript
youtubeMetadata: {
  originalTitle: String,        // Original title from YouTube (before manual edits)
  originalThumbnail: String,    // Original thumbnail URL from YouTube
  lastRefreshedAt: Date,       // Last time we checked video availability
  isAvailable: Boolean,        // Whether video is still available on YouTube
  availabilityCheckedAt: Date, // Last availability check timestamp
  unavailableReason: String   // Why video is unavailable: 'deleted', 'privated', 'unavailable', or null
}
```

## Usage

### Manual Refresh

Run the script manually:
```bash
node scripts/refreshYouTubeData.js
```

### Options

- `--force`: Refresh all items regardless of last refresh time
- `--batch-size <number>`: Number of items to process per batch (default: 50)
- `--delay <ms>`: Delay in ms between batches (default: 1000)

Examples:
```bash
# Refresh all items (force)
node scripts/refreshYouTubeData.js --force

# Custom batch size and delay
node scripts/refreshYouTubeData.js --batch-size 100 --delay 2000
```

### Automated Monthly Refresh

Set up a cron job to run monthly:

```bash
# Edit crontab
crontab -e

# Add this line to run on the 1st of each month at 2 AM
0 2 1 * * cd /path/to/tuneable-backend && node scripts/refreshYouTubeData.js
```

Or use a process manager like PM2:
```bash
pm2 start scripts/refreshYouTubeData.js --cron "0 2 1 * *" --name youtube-refresh
```

## What Gets Updated

✅ **Updated**:
- `youtubeMetadata.isAvailable` - Boolean indicating if video is still available
- `youtubeMetadata.unavailableReason` - Reason if unavailable ('deleted', 'privated', etc.)
- `youtubeMetadata.lastRefreshedAt` - Timestamp of last refresh
- `youtubeMetadata.availabilityCheckedAt` - Timestamp of last availability check

❌ **NOT Updated** (preserves manual edits):
- `title` - Never overwritten
- `artist` - Never overwritten
- `coverArt` - Never overwritten
- Any other manually edited fields

## API Quota Usage

The refresh uses minimal quota:
- **1 unit per video** (using `videos.list` with `id,status` parts)
- For 1000 videos: ~1000 units (10% of daily 10,000 unit limit)
- Batched processing with delays to avoid rate limiting

## Handling Unavailable Videos

When a video is detected as unavailable:
- `isAvailable` is set to `false`
- `unavailableReason` is set to the reason ('deleted', 'privated', etc.)
- The media item remains in the database (not deleted)
- You can query for unavailable videos:
  ```javascript
  Media.find({ 'youtubeMetadata.isAvailable': false })
  ```

## Monitoring

The script outputs progress and summary:
```
🔄 Starting YouTube data refresh...
📅 Refreshing items last checked before: 2025-01-01T00:00:00.000Z
📊 Found 1234 media items to refresh

📦 Processing batch 1/25 (50 items)
✅ Video abc123 (Song Title) is available
❌ Video xyz789 (Another Song) is deleted
...

✅ YouTube refresh complete!
📊 Summary: {
  processed: 1234,
  available: 1200,
  unavailable: 30,
  errors: 4,
  total: 1234
}
```

## Compliance

This implementation satisfies YouTube's API terms:
- ✅ Caches basic metadata (thumbnails, titles)
- ✅ Refreshes approximately every month
- ✅ Respects video deletions and privacy changes
- ✅ Does not store user-identifying data or analytics

## Future Enhancements

Potential improvements:
1. Auto-hide unavailable videos from public listings
2. Notification system for admins when videos become unavailable
3. Automatic thumbnail refresh (if original thumbnail is still valid)
4. Bulk operations for unavailable videos (archive, delete, etc.)

