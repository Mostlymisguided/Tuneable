# Song to Media Model Migration Summary

## ✅ Completed Changes

### Backend Changes

1. **Model Migration**
   - Replaced `Song` model imports with `Media` model
   - Old `/songcardbid` route commented out (preserved for reference)
   - Two new clean Media-based routes implemented:
     - `POST /:partyId/media/add` - Add new media to party with initial bid
     - `POST /:partyId/media/:mediaId/bid` - Place bid on existing media in party

2. **Party Model Updates**
   - Updated party details route to use `party.media` instead of `party.songs`
   - Updated party population calls to use `media.mediaId` instead of `songs.songId`
   - Flattened response structure for cleaner frontend consumption

3. **Route Improvements**
   - Clear separation of concerns: Adding media vs bidding on media
   - Support for both ObjectId and UUID for media identification
   - Proper balance checking and bid validation
   - YouTube video details fetching (tags, category, duration)

### Frontend Changes

1. **TypeScript Interfaces**
   - Added `PartyMedia` interface with all party-specific media fields
   - Updated `Party` interface to use `media` array
   - Maintained legacy `songs` support for backward compatibility

2. **API Layer**
   - Renamed `addSongToParty()` to `addMediaToParty()`
   - Simplified `placeBid()` to accept `mediaId` and `bidAmount` only
   - Updated endpoints to use `/media` routes

3. **Component Updates (Party.tsx)**
   - Added `getPartyMedia()` helper function for backward compatibility
   - Updated all `party.songs` references to use `getPartyMedia()`
   - Support for both `mediaId` and `songId` accessors
   - Updated all filters, maps, and calculations to use media structure

## 🔄 Migration Strategy

The migration uses a **backward-compatible approach**:
- Backend supports both old `songs` and new `media` arrays in Party model
- Frontend `getPartyMedia()` falls back to `songs` if `media` is not available
- This allows gradual migration without breaking existing functionality

## 🧪 Testing Checklist

### Backend Testing
- [ ] Test adding new media to party via `POST /:partyId/media/add`
- [ ] Test placing bid on existing media via `POST /:partyId/media/:mediaId/bid`
- [ ] Verify media creation with YouTube video details (tags, category)
- [ ] Test balance checking and deduction
- [ ] Verify bid tracking (party-specific and global)
- [ ] Test with both ObjectId and UUID for mediaId

### Frontend Testing
- [ ] Test party page loads correctly with media data
- [ ] Verify queue display shows correct media items
- [ ] Test bid placement on media items
- [ ] Verify top bidders display works
- [ ] Test time period sorting (all-time, this-week, etc.)
- [ ] Verify veto functionality works with media
- [ ] Test backward compatibility with old parties using songs

### Integration Testing
- [ ] Create new party and add media
- [ ] Place bids on media items
- [ ] Verify WebPlayer queue updates correctly
- [ ] Test party details API response structure
- [ ] Verify UUID transformation works correctly

## 📝 Next Steps

1. **Data Migration Script** (if needed)
   - Create script to migrate existing `party.songs` to `party.media`
   - Update existing Song documents to Media format

2. **Remove Legacy Code** (after testing)
   - Remove old `/songcardbid` route
   - Remove `songs` array from Party model
   - Remove legacy support from frontend

3. **Documentation Updates**
   - Update API documentation
   - Document new Media model structure
   - Create migration guide for developers

## 🎯 Benefits of New Structure

1. **Unified Content Model**: One Media model for all content types (music, podcasts, video, etc.)
2. **Cleaner API**: Separate routes for adding vs bidding
3. **Better Type Safety**: Proper TypeScript interfaces
4. **Flexible Creator Management**: Hybrid subdocument approach with verification
5. **Future-Ready**: Supports relationships, external IDs, podcasts, etc.

## ⚠️ Important Notes

- Old `/songcardbid` route is commented out but preserved for reference
- Frontend maintains backward compatibility via `getPartyMedia()` helper
- Both ObjectId and UUID are supported for media identification
- All UUID transformations preserve user data (username, profilePic)
