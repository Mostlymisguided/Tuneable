# Media Schema Updates - October 8, 2025

## 🎯 Summary of Changes

### 1. **Hybrid Creator Subdocuments** ✅
Replaced simple string arrays with hybrid subdocuments for all creator roles.

**Old Structure:**
```javascript
artist: String
creators: [String]
producer: String
featuring: [String]
```

**New Structure:**
```javascript
artist: [{
  name: String,
  userId: ObjectId (ref: User) || null
}]
producer: [{ name, userId }]
featuring: [{ name, userId }]
// + songwriter, composer, host, guest, narrator, director, cinematographer, editor, author, label
```

**Benefits:**
- ✅ Artists can claim their profiles later
- ✅ Link to User accounts when available
- ✅ Search by name or verified user
- ✅ Auto-populates `creatorNames` array for discovery

### 2. **Genre → Genres (Array)** ✅
Changed from singular to plural array to support multi-genre content.

**Old:**
```javascript
genre: { type: String }
```

**New:**
```javascript
genres: { type: [String], default: [] }
```

**Why:**
- ✅ Real-world content spans multiple genres
- ✅ Platform compatible (Spotify, Apple Music use arrays)
- ✅ Better for filtering/discovery
- ✅ Future-proof (can merge with tags later if needed)

**Migration:**
```javascript
genres: song.genre ? [song.genre] : []
```

### 3. **Additional Fields** ✅

#### Release Information:
```javascript
album: { type: String }
EP: { type: String }
releaseDate: { type: Date, default: null }
```

#### Label/Publisher:
```javascript
label: [{
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  _id: false
}]
```

#### Episode/Series Information:
```javascript
episodeNumber: { type: Number, default: null }
seasonNumber: { type: Number, default: null }
```

#### Music-Specific Metadata:
```javascript
explicit: { type: Boolean, default: false }
isrc: { type: String, default: null }  // International Standard Recording Code
upc: { type: String, default: null }   // Universal Product Code
```

## 📊 Complete Media Schema Overview

### **Core Fields:**
- `title` - Required
- `artist` - Primary creators (array of subdocuments)
- `contentType` - ['music', 'spoken', 'video', 'image', 'written', 'interactive']
- `contentForm` - ['song', 'album', 'podcast', 'episode', etc.]
- `mediaType` - ['mp3', 'wav', 'flac', 'mp4', etc.]

### **Creator Roles:**
- `artist`, `producer`, `featuring`, `songwriter`, `composer`
- `host`, `guest`, `narrator`
- `director`, `cinematographer`, `editor`
- `author`, `label`
- `creatorNames` - Auto-populated from all roles

### **Metadata:**
- `coverArt`, `description`, `tags`, `genres`, `category`
- `duration`, `fileSize`
- `album`, `EP`, `releaseDate`
- `episodeNumber`, `seasonNumber`

### **Music-Specific:**
- `explicit`, `isrc`, `upc`
- `bpm`, `key`, `pitch`, `timeSignature`
- `bitrate`, `sampleRate`, `elements`
- `rightsHolder`

### **Platform Sources:**
- `sources` - Map of platform → URL

### **Bidding:**
- `globalBidValue`, `globalBids`, `bids`

### **System:**
- `uuid`, `addedBy`, `uploadedAt`, `updatedAt`, `playCount`, `popularity`

## 🔍 Query Examples

### Find by Genre:
```javascript
// Old
Media.find({ genre: 'Pop' })

// New
Media.find({ genres: 'Pop' })  // Works with multi-key index
Media.find({ genres: { $in: ['Pop', 'Rock'] } })
```

### Find by Artist:
```javascript
// By name (regardless of user status)
Media.find({ "artist.name": "Taylor Swift" })

// By verified user
Media.find({ "artist.userId": userId })

// By any creator name
Media.find({ creatorNames: "Taylor Swift" })
```

### Find by Label:
```javascript
Media.find({ "label.name": "Republic Records" })
```

### Complex Query:
```javascript
// Pop songs released in 2023 by verified artists
Media.find({
  contentType: 'music',
  genres: 'Pop',
  releaseDate: {
    $gte: new Date('2023-01-01'),
    $lt: new Date('2024-01-01')
  },
  "artist.userId": { $ne: null }
})
```

## 📝 API Response Format

Responses transform for frontend compatibility:

```javascript
{
  id: media.uuid,
  title: "Anti-Hero",
  
  // Backward compatible
  artist: "Taylor Swift",  // Primary artist name
  
  // New structure
  artists: [
    { name: "Taylor Swift", userId: null }
  ],
  
  genres: ["Pop", "Synth-pop"],  // Array now
  
  producers: [
    { name: "Jack Antonoff", userId: null }
  ],
  
  creators: ["Taylor Swift", "Jack Antonoff"],  // All names
  
  // ... other fields
}
```

## 🚀 Migration Status

✅ **Completed:**
- Media model created with hybrid creators
- Bid model updated to support mediaId
- Party model updated with media array
- Migration scripts created and tested
- API routes updated
- Utility helpers created
- Documentation complete

⏳ **Pending:**
- Frontend TypeScript interfaces

## 📚 Documentation Files

- `MEDIA_MIGRATION_GUIDE.md` - Comprehensive migration guide
- `CREATOR_STRUCTURE_GUIDE.md` - Creator subdocument usage
- `MIGRATION_COMMIT_MESSAGE.txt` - Commit message template
- `SCHEMA_UPDATES.md` - This file

---

**Last Updated:** October 8, 2025  
**Status:** ✅ Backend Complete | ⏳ Frontend Pending

