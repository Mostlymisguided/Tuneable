# Media Relationships Guide

## 🎯 Overview

The Media model now supports **relationships between media items**, enabling you to build a rich content graph. This allows you to connect remixes, covers, samples, series, and other related content.

## 🔗 Relationship Structure

```javascript
relationships: [{
  type: String,        // Type of relationship
  target_uuid: String, // UUID of related Media item
  description: String, // Optional notes
  _id: false
}]
```

## 📊 Relationship Types

| Type | Description | Example |
|------|-------------|---------|
| `remix_of` | This is a remix of another track | "Clarity (Zedd Remix)" → "Clarity" |
| `cover_of` | This is a cover version | "All Along the Watchtower" by Hendrix → Bob Dylan original |
| `sampled_in` | This track is sampled in another | "When the Levee Breaks" → sampled in many hip-hop tracks |
| `uses_sample` | This track uses a sample from another | "Can't Touch This" → uses "Super Freak" |
| `same_series` | Part of the same series/album/podcast | Episode 1 → Episode 2 |
| `inspired_by` | Creatively inspired by another work | |
| `references` | References another work | |
| `other` | Other types of relationships | |

## 💡 Usage Examples

### **Example 1: Remix**

```javascript
const original = new Media({
  title: "Clarity",
  artist: [{ name: "Zedd", userId: null, verified: false }],
  // ... other fields
});
await original.save();

const remix = new Media({
  title: "Clarity (Tiesto Remix)",
  artist: [{ name: "Zedd", userId: null, verified: false }],
  producer: [{ name: "Tiesto", userId: null, verified: false }],
  relationships: [{
    type: 'remix_of',
    target_uuid: original.uuid,
    description: 'Tiesto remix of the original'
  }],
  // ... other fields
});
await remix.save();
```

### **Example 2: Cover Version**

```javascript
const coverSong = new Media({
  title: "Hurt",
  artist: [{ name: "Johnny Cash", userId: null, verified: false }],
  relationships: [{
    type: 'cover_of',
    target_uuid: nineInchNailsOriginalUuid,
    description: 'Johnny Cash cover of Nine Inch Nails original'
  }],
  // ... other fields
});
```

### **Example 3: Sample Usage**

```javascript
const hipHopTrack = new Media({
  title: "Can't Touch This",
  artist: [{ name: "MC Hammer", userId: null, verified: false }],
  relationships: [{
    type: 'uses_sample',
    target_uuid: superFreakUuid,
    description: 'Uses the bass line from "Super Freak"'
  }],
  // ... other fields
});
```

### **Example 4: Podcast Series**

```javascript
const episode2 = new Media({
  title: "Episode 2: The Journey Continues",
  host: [{ name: "Joe Rogan", userId: null, verified: false }],
  episodeNumber: 2,
  relationships: [{
    type: 'same_series',
    target_uuid: episode1Uuid,
    description: 'Previous episode'
  }],
  // ... other fields
});
```

### **Example 5: Multiple Relationships**

```javascript
const complexTrack = new Media({
  title: "Remix with Samples",
  artist: [{ name: "Artist", userId: null, verified: false }],
  relationships: [
    {
      type: 'remix_of',
      target_uuid: originalTrackUuid,
      description: 'Remix of the original'
    },
    {
      type: 'uses_sample',
      target_uuid: sampleSourceUuid,
      description: 'Uses vocal sample'
    },
    {
      type: 'inspired_by',
      target_uuid: inspirationUuid,
      description: 'Musically inspired by'
    }
  ],
  // ... other fields
});
```

## 🔍 Querying Relationships

### **Find All Remixes of a Track**

```javascript
const originalUuid = '068e145c-7618-7c96-8b00-71cdc2f5995a';

const remixes = await Media.find({
  'relationships.type': 'remix_of',
  'relationships.target_uuid': originalUuid
});
```

### **Find All Covers**

```javascript
const covers = await Media.find({
  'relationships.type': 'cover_of'
});
```

### **Find All Related Content for a Media Item**

```javascript
const mediaUuid = '068e145c-7618-7c96-8b00-71cdc2f5995a';

// Find all media that references this one
const referencingMedia = await Media.find({
  'relationships.target_uuid': mediaUuid
});
```

### **Get Specific Relationship**

```javascript
const media = await Media.findOne({ uuid: mediaUuid });
const remixRelationship = media.relationships.find(r => r.type === 'remix_of');

if (remixRelationship) {
  // Fetch the original track
  const original = await Media.findOne({ uuid: remixRelationship.target_uuid });
  console.log(`This is a remix of: ${original.title}`);
}
```

## 🎨 Frontend Display

### **Display Relationship Info**

```tsx
const RelationshipInfo: React.FC<{ media: Media }> = ({ media }) => {
  if (!media.relationships || media.relationships.length === 0) {
    return null;
  }

  return (
    <div className="relationships">
      <h3>Related Content</h3>
      {media.relationships.map((rel, idx) => (
        <div key={idx} className="relationship">
          <span className="type">{rel.type.replace('_', ' ')}</span>
          <Link to={`/tune/${rel.target_uuid}`}>
            View Related
          </Link>
          {rel.description && (
            <p className="description">{rel.description}</p>
          )}
        </div>
      ))}
    </div>
  );
};
```

### **Show "Remixed By" Section**

```tsx
const RemixedBySection: React.FC<{ songUuid: string }> = ({ songUuid }) => {
  const [remixes, setRemixes] = useState([]);

  useEffect(() => {
    // Fetch all remixes of this song
    fetch(`/api/media/${songUuid}/remixes`)
      .then(res => res.json())
      .then(data => setRemixes(data.remixes));
  }, [songUuid]);

  if (remixes.length === 0) return null;

  return (
    <div className="remixes-section">
      <h3>Remixed By</h3>
      {remixes.map(remix => (
        <Link key={remix.uuid} to={`/tune/${remix.uuid}`}>
          {remix.title}
        </Link>
      ))}
    </div>
  );
};
```

## 🛠️ Helper Methods

### **Add Relationship**

```javascript
async function addRelationship(mediaId, type, targetUuid, description = '') {
  const media = await Media.findById(mediaId);
  
  // Check if relationship already exists
  const exists = media.relationships.some(
    r => r.type === type && r.target_uuid === targetUuid
  );
  
  if (!exists) {
    media.relationships.push({ type, target_uuid: targetUuid, description });
    await media.save();
  }
  
  return media;
}
```

### **Remove Relationship**

```javascript
async function removeRelationship(mediaId, targetUuid) {
  const media = await Media.findById(mediaId);
  media.relationships = media.relationships.filter(
    r => r.target_uuid !== targetUuid
  );
  await media.save();
  return media;
}
```

### **Get Relationship Graph**

```javascript
async function getRelationshipGraph(mediaUuid, depth = 1) {
  const visited = new Set();
  const graph = {};
  
  async function traverse(uuid, currentDepth) {
    if (currentDepth > depth || visited.has(uuid)) return;
    visited.add(uuid);
    
    const media = await Media.findOne({ uuid });
    if (!media) return;
    
    graph[uuid] = {
      title: media.title,
      artist: media.primaryArtist,
      relationships: media.relationships
    };
    
    // Traverse related media
    for (const rel of media.relationships) {
      await traverse(rel.target_uuid, currentDepth + 1);
    }
  }
  
  await traverse(mediaUuid, 0);
  return graph;
}
```

## 📊 API Endpoints

### **Get Related Media**

```javascript
// GET /api/media/:uuid/related
router.get('/:uuid/related', async (req, res) => {
  const { uuid } = req.params;
  
  const media = await Media.findOne({ uuid });
  if (!media) return res.status(404).json({ error: 'Media not found' });
  
  // Fetch all related media
  const relatedUuids = media.relationships.map(r => r.target_uuid);
  const relatedMedia = await Media.find({ uuid: { $in: relatedUuids } });
  
  // Build response with relationship context
  const related = media.relationships.map(rel => ({
    type: rel.type,
    description: rel.description,
    media: relatedMedia.find(m => m.uuid === rel.target_uuid)
  }));
  
  res.json({ related });
});
```

### **Get Reverse Relationships**

```javascript
// GET /api/media/:uuid/referenced-by
router.get('/:uuid/referenced-by', async (req, res) => {
  const { uuid } = req.params;
  
  // Find all media that references this one
  const referencingMedia = await Media.find({
    'relationships.target_uuid': uuid
  });
  
  res.json({ referencingMedia });
});
```

## 🎯 Use Cases

### **1. Discovery**
- "Show me all remixes of this track"
- "Find covers of this song"
- "Explore content that samples this track"

### **2. Navigation**
- Next/Previous episode in podcast series
- Browse related content
- Explore creative lineage

### **3. Analytics**
- Most remixed tracks
- Most covered songs
- Sample usage statistics

### **4. Rights Management**
- Track sample usage for royalties
- Identify derivative works
- Manage licensing

### **5. Content Graph**
- Build visual relationship graphs
- Discover hidden connections
- Map creative influence

## ⚡ Performance Tips

1. **Use Indexes**: The indexes on `relationships.type` and `relationships.target_uuid` make queries fast
2. **Limit Depth**: When traversing relationships, limit recursion depth
3. **Cache Results**: Cache relationship graphs for frequently accessed content
4. **Batch Queries**: Use `$in` to fetch multiple related items at once

## 🔐 Validation

```javascript
// Validate that target_uuid exists
mediaSchema.pre('save', async function(next) {
  for (const rel of this.relationships) {
    const exists = await Media.exists({ uuid: rel.target_uuid });
    if (!exists) {
      return next(new Error(`Related media ${rel.target_uuid} not found`));
    }
  }
  next();
});
```

## 📝 Best Practices

1. **Be Specific**: Use the most specific relationship type
2. **Add Context**: Use the description field for clarity
3. **Bidirectional**: Consider adding reverse relationships when appropriate
4. **Avoid Duplicates**: Check if relationship exists before adding
5. **Clean Up**: Remove relationships when media is deleted

---

**Status:** ✅ Implemented  
**Date:** October 8, 2025

