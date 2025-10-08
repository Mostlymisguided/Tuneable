# Media Migration Guide

## 🎯 Overview

This guide documents the migration from the legacy Song/PodcastEpisode models to a unified Media model that supports multiple content types.

## 📋 Changes Summary

### **New Media Model**
Location: `/tuneable-backend/models/Media.js`

The new Media model is a flexible, future-proof schema that supports:
- **Music** (songs, albums, mixes, remixes, performances)
- **Spoken content** (podcasts, episodes, audiobooks, interviews)
- **Video** (music videos, performances, memes)
- **Images** (album art, promotional materials)
- **Written content** (lyrics, liner notes, articles)
- **Interactive content** (future-proofing)

#### Key Features:
1. **Flexible Classification System:**
   - `contentType`: ['music', 'spoken', 'video', 'image', 'written', 'interactive']
   - `contentForm`: ['song', 'album', 'podcast', 'episode', 'audiobook', 'interview', 'performance', 'mix', 'remix', 'meme', 'article', 'book', 'video']
   - `mediaType`: ['mp3', 'wav', 'flac', 'mp4', 'mov', 'avi', 'jpeg', 'png', 'gif', 'pdf', 'epub', 'html', 'json']

2. **Multiple Creators:**
   - `creators`: Array of strings (supports collaborations)

3. **Music-Specific Metadata:**
   - `producer`: Array of producers
   - `featuring`: Array of featured artists
   - `rightsHolder`: Reference to User
   - `explicit`: Boolean flag for explicit content
   - `isrc`: International Standard Recording Code
   - `upc`: Universal Product Code
   - `bpm`, `key`, `pitch`, `timeSignature`, `bitrate`, `sampleRate`, `elements`

4. **Video/Image Metadata:**
   - `resolution`, `aspectRatio`, `colorSpace`

5. **Written Content Metadata:**
   - `pages`, `wordCount`, `language`

6. **Universal Fields:**
   - `title`, `coverArt`, `description`, `tags`, `genre`
   - `sources`: Platform-agnostic Map (YouTube, Spotify, Apple Music, etc.)
   - `duration`, `fileSize`
   - `globalBidValue`, `globalBids`, `bids`
   - `addedBy`, `uploadedAt`, `playCount`, `popularity`

### **Updated Models**

#### **Bid Model** (`/tuneable-backend/models/Bid.js`)
- Added `mediaId` reference to Media model
- Added `media_uuid` for UUID reference
- Kept legacy `songId` and `episodeId` for backward compatibility
- Updated validation to support `mediaId`, `songId`, or `episodeId`
- **Note:** Auto-populate disabled to prevent circular dependencies

#### **Party Model** (`/tuneable-backend/models/Party.js`)
- Added `media` array with new structure
- Kept legacy `songs` array for backward compatibility
- New media structure:
  ```javascript
  {
    mediaId: ObjectId ref to Media
    media_uuid: String (UUID)
    addedBy: ObjectId ref to User
    addedBy_uuid: String (UUID)
    partyBidValue: Number
    partyBids: [ObjectId refs to Bid]
    status: 'queued' | 'playing' | 'played' | 'vetoed'
    queuedAt, playedAt, completedAt, vetoedAt, vetoedBy
  }
  ```

### **Migration Scripts**

#### **1. Media Migration** (`/tuneable-backend/scripts/migrateToMedia.js`)
**Purpose:** Migrate Songs and Podcast Episodes to the unified Media collection

**What it does:**
1. Migrates all Songs to Media with `contentType: ['music']`, `contentForm: ['song']`
2. Migrates all Podcast Episodes to Media with `contentType: ['spoken']`, `contentForm: ['episode']`
3. Updates Party references with UUIDs
4. Creates mapping from old IDs to new Media IDs

**Usage:**
```bash
cd tuneable-backend
node scripts/migrateToMedia.js
```

**Results:**
- ✅ 45 songs migrated
- ✅ 5 episodes migrated
- ✅ 13 parties updated
- ✅ 50 total media items created

#### **2. Bid Migration** (`/tuneable-backend/scripts/migrateBidsToMedia.js`)
**Purpose:** Update Bids to reference Media instead of Song/Episode

**What it does:**
1. Finds all Bids referencing Songs or Episodes
2. Matches them to corresponding Media items
3. Updates Bids with `mediaId` and `media_uuid`
4. Updates Media items with bid references and `globalBidValue`

**Usage:**
```bash
cd tuneable-backend
node scripts/migrateBidsToMedia.js
```

**Results:**
- ✅ 111 bids updated
- ✅ 44 media items updated with bid references

### **API Routes Updated**

#### **Song Routes** (`/tuneable-backend/routes/songRoutes.js`)
- Updated to use Media model with fallback to legacy Song model
- `/api/songs/top-tunes`: Now queries Media collection
- `/api/songs/:songId/profile`: Supports both Media and Song lookups
- Transforms Media responses to match expected frontend format (e.g., maps `creators[0]` to `artist`)

#### **Key Changes:**
```javascript
// Query Media collection
const media = await Media.find({ 
  globalBidValue: { $gt: 0 },
  contentType: { $in: ['music'] }
})

// Transform for frontend compatibility
const transformedSongs = media.map(item => ({
  id: item.uuid,
  uuid: item.uuid,
  title: item.title,
  artist: item.creators[0], // Map first creator to artist
  creators: item.creators,
  // ... other fields
}));
```

## 🚀 How to Use

### **Backend Setup**
1. **Run Migrations** (if not already done):
   ```bash
   cd tuneable-backend
   node scripts/migrateToMedia.js
   node scripts/migrateBidsToMedia.js
   ```

2. **Restart Backend:**
   ```bash
   npm start
   ```

3. **Verify Migration:**
   ```bash
   # Check Media collection
   curl "http://localhost:8000/api/songs/top-tunes?limit=5"
   ```

### **Creating New Media Items**

```javascript
const media = new Media({
  title: "Song Title",
  creators: ["Artist Name", "Featured Artist"],
  contentType: ['music'],
  contentForm: ['song'],
  mediaType: ['mp3'],
  duration: 240,
  coverArt: "https://...",
  producer: ["Producer Name"],
  featuring: ["Feature Name"],
  explicit: false,
  isrc: "USUM71234567",
  sources: new Map([
    ['youtube', 'https://youtube.com/watch?v=...'],
    ['spotify', 'spotify:track:...']
  ]),
  addedBy: userId,
  // ... other fields
});

await media.save();
```

### **Querying Media**

```javascript
// Find all music content
const songs = await Media.find({ 
  contentType: { $in: ['music'] }
});

// Find spoken content (podcasts)
const podcasts = await Media.find({ 
  contentType: { $in: ['spoken'] },
  contentForm: { $in: ['episode', 'podcast'] }
});

// Find by creators
const artistSongs = await Media.find({
  creators: { $in: ['Artist Name'] }
});
```

## 📝 Frontend Integration (To Do)

### **TypeScript Interfaces**
Update `/tuneable-frontend-v2/src/types.ts`:

```typescript
interface MediaItem {
  id: string;
  uuid: string;
  title: string;
  creators: string[];
  contentType: string[];
  contentForm: string[];
  mediaType: string[];
  
  // Music-specific
  producer?: string[];
  featuring?: string[];
  rightsHolder?: string;
  explicit?: boolean;
  isrc?: string;
  upc?: string;
  bpm?: number;
  key?: string;
  
  // Universal
  duration?: number;
  coverArt?: string;
  description?: string;
  tags: string[];
  genre?: string;
  sources: Record<string, string>;
  globalBidValue: number;
  bids?: Bid[];
  
  // Legacy compatibility
  artist?: string; // Maps to creators[0]
}
```

## ⚠️ Important Notes

1. **Backward Compatibility:**
   - Legacy Song and PodcastEpisode models are still in place
   - API routes check Media first, then fall back to Song
   - Do NOT delete Song/PodcastEpisode collections until thorough testing

2. **Bid Model Auto-Populate:**
   - Disabled to prevent circular dependency issues
   - Use explicit `.populate()` calls in routes

3. **Database:**
   - Migrations run against MongoDB Atlas cluster (not local)
   - Ensure `.env` is properly configured

4. **UUID Usage:**
   - All Media items have UUIDs
   - Use UUIDs for external API communication
   - ObjectIds still used internally for relationships

## 🔄 Rollback Plan

If issues arise:

1. **Stop using Media endpoints** - revert to Song endpoints
2. **Keep legacy models** - they're still populated
3. **No data loss** - original Songs/Episodes untouched
4. **Bids still work** - they have both `mediaId` and `songId`/`episodeId`

## 📊 Migration Statistics

**From MongoDB Atlas:**
- **Songs migrated:** 45
- **Podcast episodes migrated:** 5
- **Total media items:** 50
- **Bids updated:** 111
- **Media items with bids:** 44
- **Parties updated:** 13

## 🎉 Benefits

1. **Future-Proof:** Easily add new content types
2. **Flexible:** Multiple creators, producers, featured artists
3. **Standards Compliant:** ISRC, UPC support
4. **Platform Agnostic:** Sources map supports any platform
5. **Better Organization:** Clear separation of content-specific metadata
6. **Scalable:** Can support video, images, written content without model changes

---

**Migration Date:** October 8, 2025  
**Status:** ✅ Complete (Backend) | ⏳ Pending (Frontend)

