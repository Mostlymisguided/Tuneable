# Verified Creators Guide

## 🎯 Overview

The Media model includes a **verified creator system** that automatically marks creators as verified when they upload their own content. This provides credibility, trust, and helps distinguish creator-uploaded content from user-submitted content.

## ✅ How It Works

### **Automatic Verification**

When media is saved, the pre-save hook automatically verifies any creator whose `userId` matches the `addedBy` field:

```javascript
// Pre-save hook logic
if (creator.userId && this.addedBy && creator.userId.toString() === this.addedBy.toString()) {
  creator.verified = true;
}
```

### **Creator Subdocument Structure**

Every creator role now includes a `verified` field:

```javascript
{
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verified: { type: Boolean, default: false },  // ✨ NEW!
  _id: false
}
```

## 🎵 **Example Use Cases**

### **Scenario 1: Artist Uploads Their Own Song**

```javascript
const artistUser = await User.findOne({ username: "taylorswift" });

const song = new Media({
  title: "Anti-Hero",
  artist: [
    { name: "Taylor Swift", userId: artistUser._id, verified: false }
  ],
  producer: [
    { name: "Jack Antonoff", userId: null, verified: false }
  ],
  addedBy: artistUser._id,  // Same as artist userId
  // ... other fields
});

await song.save();
// After save: artist[0].verified = true (auto-verified!)
// producer[0].verified = false (different user)
```

**Result:**
- ✅ Taylor Swift is **verified** (she uploaded it)
- ❌ Jack Antonoff is **not verified** (he didn't upload it)

### **Scenario 2: Fan Uploads a Song**

```javascript
const fanUser = await User.findOne({ username: "swiftie4ever" });

const song = new Media({
  title: "Anti-Hero",
  artist: [
    { name: "Taylor Swift", userId: null, verified: false }
  ],
  addedBy: fanUser._id,  // Fan uploaded it
  // ... other fields
});

await song.save();
// After save: artist[0].verified = false (uploader ≠ artist)
```

**Result:**
- ❌ Taylor Swift is **not verified** (fan uploaded, not the artist)

### **Scenario 3: Producer Uploads Collaboration**

```javascript
const producerUser = await User.findOne({ username: "jackantonoff" });

const song = new Media({
  title: "Anti-Hero",
  artist: [
    { name: "Taylor Swift", userId: null, verified: false }
  ],
  producer: [
    { name: "Jack Antonoff", userId: producerUser._id, verified: false }
  ],
  addedBy: producerUser._id,  // Producer uploaded it
  // ... other fields
});

await song.save();
// After save:
// - artist[0].verified = false
// - producer[0].verified = true (auto-verified!)
```

**Result:**
- ❌ Taylor Swift is **not verified** (she didn't upload it)
- ✅ Jack Antonoff is **verified** (he uploaded it as producer)

## 🔍 **Schema Methods**

### **getVerifiedCreators()**

Returns all verified creators across all roles:

```javascript
const song = await Media.findById(songId);
const verified = song.getVerifiedCreators();

// Returns:
[
  { role: 'artist', name: 'Taylor Swift', userId: ObjectId(...) },
  { role: 'producer', name: 'Jack Antonoff', userId: ObjectId(...) }
]
```

**Usage:**
```javascript
// Display verified badge
verified.forEach(creator => {
  console.log(`✓ ${creator.name} (${creator.role})`);
});
```

### **getPendingCreators()**

Returns all unverified creators:

```javascript
const song = await Media.findById(songId);
const pending = song.getPendingCreators();

// Returns:
[
  { role: 'featuring', name: 'Ed Sheeran', userId: null },
  { role: 'songwriter', name: 'Max Martin', userId: ObjectId(...) }
]
```

**Usage:**
```javascript
// Show pending verification notice
if (pending.length > 0) {
  console.log(`${pending.length} creator(s) pending verification`);
}
```

## 📊 **Querying by Verification Status**

### **Find All Content with Verified Artists**

```javascript
Media.find({ "artist.verified": true })
```

### **Find Content by Verified Producers**

```javascript
Media.find({ "producer.verified": true })
```

### **Find Content with ANY Verified Creator**

```javascript
Media.find({
  $or: [
    { "artist.verified": true },
    { "producer.verified": true },
    { "author.verified": true }
  ]
})
```

### **Find Unverified Content (Needs Review)**

```javascript
Media.find({
  "artist.verified": false,
  "addedBy": { $ne: null }
})
```

## 🎨 **Frontend Display**

### **Display Verified Badge**

```tsx
{media.artists.map((artist, idx) => (
  <div key={idx} className="artist">
    {artist.userId ? (
      <Link to={`/user/${artist.userId}`}>{artist.name}</Link>
    ) : (
      <span>{artist.name}</span>
    )}
    {artist.verified && (
      <span className="verified-badge">✓</span>
    )}
  </div>
))}
```

### **Show Verification Status**

```tsx
const VerificationStatus = ({ media }) => {
  const verified = media.getVerifiedCreators();
  const pending = media.getPendingCreators();
  
  return (
    <div className="verification-status">
      {verified.length > 0 && (
        <div className="verified">
          ✓ Verified by {verified.map(c => c.name).join(', ')}
        </div>
      )}
      {pending.length > 0 && (
        <div className="pending">
          ⏳ {pending.length} creator(s) pending verification
        </div>
      )}
    </div>
  );
};
```

## 🔐 **Trust & Credibility Use Cases**

### **1. Featured Content**
```javascript
// Boost content uploaded by verified creators
Media.find({ "artist.verified": true })
  .sort({ globalBidValue: -1 })
  .limit(10)
```

### **2. Creator Profiles**
```javascript
// Show verified badge on creator profiles
const creatorContent = await Media.find({
  "artist.userId": creatorUserId,
  "artist.verified": true
})
```

### **3. Content Moderation**
```javascript
// Priority review for unverified content
const needsReview = await Media.find({
  "artist.verified": false,
  createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) }
})
```

### **4. Analytics**
```javascript
// Track verification rate
const total = await Media.countDocuments();
const verified = await Media.countDocuments({ "artist.verified": true });
const rate = (verified / total) * 100;
console.log(`Verification rate: ${rate.toFixed(2)}%`);
```

## 📝 **API Response Example**

```javascript
{
  id: "068e145c-7618-7c96-8b00-71cdc2f5995a",
  title: "Anti-Hero",
  
  artists: [
    {
      name: "Taylor Swift",
      userId: "068e145b-b1c4-7e85-a6e1-64da00ac9423",
      verified: true  // ✅ Verified!
    }
  ],
  
  producers: [
    {
      name: "Jack Antonoff",
      userId: null,
      verified: false  // ❌ Not verified
    }
  ],
  
  // Helper methods
  verifiedCreators: [
    { role: "artist", name: "Taylor Swift", userId: "..." }
  ],
  pendingCreators: [
    { role: "producer", name: "Jack Antonoff", userId: null }
  ]
}
```

## 🎯 **Best Practices**

### **1. Always Check Verification on Upload**
```javascript
// When user uploads content, check if they're in the creator list
if (song.artist[0].userId === req.user._id) {
  // Auto-verified! (handled by pre-save hook)
  console.log("✓ Creator-uploaded content");
} else {
  console.log("⏳ User-submitted content (needs verification)");
}
```

### **2. Display Verified Badge Prominently**
- Show ✓ next to verified creators
- Use different styling for verified vs unverified
- Tooltip: "Verified creator" on hover

### **3. Allow Creators to Claim Their Content**
```javascript
// API endpoint for creators to claim their content
POST /api/media/:mediaId/claim-creator
{
  role: "artist",
  name: "Taylor Swift"
}

// Backend logic
const media = await Media.findById(mediaId);
const artist = media.artist.find(a => a.name === name);
if (artist && !artist.userId) {
  artist.userId = req.user._id;
  artist.verified = true;  // Auto-verified on claim
  await media.save();
}
```

### **4. Show Verification Percentage**
```javascript
const verifiedCount = media.artists.filter(a => a.verified).length;
const totalCount = media.artists.length;
const percentage = (verifiedCount / totalCount) * 100;

// Display: "50% verified creators"
```

## 🚀 **Future Enhancements**

1. **Manual Verification**: Admin panel to manually verify creators
2. **Verification Requests**: Creators can request verification
3. **Verified Badges**: Different tiers (silver, gold, etc.)
4. **Verification History**: Track when/how creator was verified
5. **Bulk Verification**: Verify all content by a creator at once

## 📊 **Indexes**

For efficient queries:

```javascript
mediaSchema.index({ "artist.verified": 1 });
mediaSchema.index({ "producer.verified": 1 });
mediaSchema.index({ "author.verified": 1 });
```

These indexes allow fast filtering by verification status.

---

**Status:** ✅ Implemented  
**Date:** October 8, 2025

