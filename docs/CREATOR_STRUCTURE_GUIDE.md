# Creator Structure Guide

## 🎯 Overview

The Media model uses a **hybrid subdocument approach** for all creators, allowing both string names (for credits) and User references (for verified creators).

## 📊 **Creator Subdocument Structure**

```javascript
{
  name: String,      // Required - Display name
  userId: ObjectId,  // Optional - Reference to User model (null if not a user)
  _id: false        // No MongoDB _id for subdocuments
}
```

## 🎵 **Music Roles**

### Primary Artists
```javascript
artist: [{
  name: "Taylor Swift",
  userId: ObjectId("...") || null
}]
```

### Producers
```javascript
producer: [{
  name: "Jack Antonoff",
  userId: null
}]
```

### Featuring
```javascript
featuring: [{
  name: "Ed Sheeran",
  userId: ObjectId("...")
}]
```

### Other Music Roles
- `songwriter: []`
- `composer: []`

## 🎙️ **Spoken Content Roles**

- `host: []` - Podcast hosts
- `guest: []` - Guests on episodes
- `narrator: []` - Audiobook narrators

## 🎬 **Video Roles**

- `director: []`
- `cinematographer: []`
- `editor: []`

## ✍️ **Written Content Roles**

- `author: []`

## 🔍 **Auto-Generated Fields**

### `creatorNames` Array
Automatically populated from all role fields via pre-save hook:
```javascript
creatorNames: ["Taylor Swift", "Jack Antonoff", "Ed Sheeran"]
```

**Use for:**
- Full-text search across all creators
- "Find all content this person worked on"
- Discovery features

## 📝 **Creating Media with Creators**

### Example: Music Track
```javascript
const song = new Media({
  title: "Anti-Hero",
  
  artist: [
    { name: "Taylor Swift", userId: null }
  ],
  
  producer: [
    { name: "Jack Antonoff", userId: null }
  ],
  
  featuring: [],
  
  contentType: ['music'],
  contentForm: ['song'],
  // ... other fields
});

await song.save(); // creatorNames auto-populated as ["Taylor Swift", "Jack Antonoff"]
```

### Example: Podcast Episode
```javascript
const episode = new Media({
  title: "The Future of AI",
  
  host: [
    { name: "Joe Rogan", userId: ObjectId("...") } // Verified user
  ],
  
  guest: [
    { name: "Elon Musk", userId: null },
    { name: "Sam Altman", userId: ObjectId("...") }
  ],
  
  contentType: ['spoken'],
  contentForm: ['episode'],
  // ... other fields
});
```

### Example: Collaboration
```javascript
const collab = new Media({
  title: "Monsters",
  
  artist: [
    { name: "Eminem", userId: null },
    { name: "Rihanna", userId: ObjectId("...") }
  ],
  
  producer: [
    { name: "Dr. Dre", userId: ObjectId("...") },
    { name: "Rick Rubin", userId: null }
  ],
  
  // ... other fields
});
```

## 🔗 **Linking Creators to Users**

### When an artist becomes a user:

```javascript
const Media = require('./models/Media');
const creatorHelpers = require('./utils/creatorHelpers');

// Artist signs up
const artistUser = new User({ 
  username: "taylorswift",
  email: "taylor@example.com"
});
await artistUser.save();

// Link all their media
await Media.updateMany(
  { "artist.name": "Taylor Swift" },
  { $set: { "artist.$[elem].userId": artistUser._id } },
  { arrayFilters: [{ "elem.name": "Taylor Swift" }] }
);

// Or use helper function
const song = await Media.findOne({ title: "Anti-Hero" });
const linksCreated = await creatorHelpers.linkCreatorToUser(
  song,
  "Taylor Swift",
  artistUser._id
);
```

## 🔎 **Querying by Creators**

### Find by Artist Name
```javascript
// All songs by Taylor Swift (regardless of user status)
const songs = await Media.find({ "artist.name": "Taylor Swift" });
```

### Find by Verified User
```javascript
// All content by verified user
const content = await Media.find({ "artist.userId": userId });
```

### Find by Any Creator Name
```javascript
// All content Jack Antonoff worked on (any role)
const content = await Media.find({ creatorNames: "Jack Antonoff" });
```

### Find by Producer
```javascript
const produced = await Media.find({ "producer.name": "Rick Rubin" });
```

### Using Helper Functions
```javascript
const creatorHelpers = require('./utils/creatorHelpers');

// Get all media by a user (any role)
const userContent = await creatorHelpers.getMediaByUser(userId, Media);

// Get all media by a creator name
const creatorContent = await creatorHelpers.getMediaByCreatorName(
  "Jack Antonoff",
  Media
);
```

## 📤 **API Response Format**

### For Frontend Compatibility
```javascript
// Transform Media document for API response
const response = {
  id: media.uuid,
  title: media.title,
  
  // Primary artist (backward compatible)
  artist: media.artist[0]?.name || 'Unknown Artist',
  
  // Full artist subdocuments (with user links)
  artists: media.artist, // [{ name, userId }]
  
  // All creator names (for search/tags)
  creators: media.creatorNames, // ["Taylor Swift", "Jack Antonoff"]
  
  // Other roles
  producer: media.producer,
  featuring: media.featuring,
  
  // Formatted displays
  formattedArtists: media.formattedArtists, // "Taylor Swift & Ed Sheeran"
  
  // ... other fields
};
```

## 🎨 **Frontend Display Logic**

### Display Primary Artist
```typescript
// Simple display
<div>{song.artist}</div>

// With user link
{song.artists[0].userId ? (
  <Link to={`/user/${song.artists[0].userId}`}>
    {song.artists[0].name}
  </Link>
) : (
  <span>{song.artists[0].name}</span>
)}
```

### Display All Artists with Links
```typescript
{song.artists.map((artist, idx) => (
  <span key={idx}>
    {artist.userId ? (
      <Link to={`/user/${artist.userId}`}>{artist.name}</Link>
    ) : (
      <span>{artist.name}</span>
    )}
    {idx < song.artists.length - 1 && " & "}
  </span>
))}
```

### Display Full Credits
```typescript
<div className="credits">
  <div>Artists: {formatArtists(song.artists)}</div>
  {song.producer.length > 0 && (
    <div>Producers: {song.producer.map(p => p.name).join(', ')}</div>
  )}
  {song.featuring.length > 0 && (
    <div>Featuring: {song.featuring.map(f => f.name).join(', ')}</div>
  )}
</div>
```

## 🛠️ **Utility Functions**

Located in `/tuneable-backend/utils/creatorHelpers.js`:

- `toCreatorSubdocs(input)` - Convert strings to subdocuments
- `extractCreatorNames(creators)` - Get array of names
- `getPrimaryArtist(artists)` - Get first artist name
- `formatArtists(artists, featuring)` - Format for display
- `findUserCredits(media, userId)` - Find all roles for a user
- `linkCreatorToUser(media, name, userId)` - Link creator to user
- `getMediaByUser(userId, Media)` - Get all content by user
- `getMediaByCreatorName(name, Media)` - Get all content by name

## 🔍 **Virtual Fields**

### `formattedArtists`
```javascript
media.formattedArtists 
// "Taylor Swift" or
// "Taylor Swift & Ed Sheeran" or
// "Taylor Swift feat. Post Malone, Selena Gomez"
```

### `primaryArtist`
```javascript
media.primaryArtist // "Taylor Swift"
```

## 📊 **Indexes**

Optimized for common queries:
```javascript
{ "artist.name": 1 }      // Find by artist name
{ "artist.userId": 1 }     // Find by verified artist
{ "producer.name": 1 }     // Find by producer
{ "producer.userId": 1 }   // Find by verified producer
{ creatorNames: 1 }        // Find by any creator
```

## ✅ **Best Practices**

1. **Always use subdocuments** - Never mix strings with subdocuments
2. **Start with userId: null** - Link users later when they sign up
3. **Use helper functions** - Don't manually construct subdocuments
4. **Populate when needed** - Use `.populate('artist.userId')` for user data
5. **Index appropriately** - Add indexes for roles you'll query frequently
6. **Auto-populate creatorNames** - Let the pre-save hook handle it

## 🚨 **Common Pitfalls**

❌ **Don't do this:**
```javascript
artist: ["Taylor Swift"] // String array - WRONG
```

✅ **Do this:**
```javascript
artist: [{ name: "Taylor Swift", userId: null }] // Subdocument array - CORRECT
```

❌ **Don't do this:**
```javascript
artist: [{ name: "Taylor Swift" }] // Missing userId field
```

✅ **Do this:**
```javascript
artist: [{ name: "Taylor Swift", userId: null }] // Explicit null
```

## 📚 **Migration Notes**

- Old `Song.artist` (String) → `Media.artist[0].name`
- Old `Song.producer` (String) → `Media.producer[].name`
- Old `Song.featuring` (Array) → `Media.featuring[].name`
- Old `Song.creators` (Array) → Removed, use `creatorNames` instead

---

**Last Updated:** October 8, 2025  
**Status:** ✅ Implemented

