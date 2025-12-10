# Role Consolidation Summary

## Changes Implemented

### 1. Removed 'artist' from User.role enum
**File**: `tuneable-backend/models/User.js`
- **Before**: `enum: ['user', 'admin', 'creator', 'artist', 'host', 'moderator', 'partier', 'dj']`
- **After**: `enum: ['user', 'admin', 'creator', 'host', 'moderator', 'partier', 'dj']`
- **Rationale**: `artist` was redundant with `creator` and not actively used

### 2. Created Permission Helper Functions
**Backend**: `tuneable-backend/utils/permissionHelpers.js`
- `isAdmin(user)` - Check if user is admin
- `isCreator(user)` - Check if user is creator
- `isAdminOrCreator(user)` - Check if user is admin or creator
- `canUploadMedia(user)` - Check if user can upload media
- `isMediaOwner(user, media)` - Check if user owns media
- `isVerifiedCreatorOnMedia(user, media)` - Check if user is verified creator on media
- `canEditMedia(user, media)` - Check if user can edit media

**Frontend**: `tuneable-frontend-v2/src/utils/permissionHelpers.ts`
- Same functions as backend, adapted for TypeScript
- `showCreatorDashboard(user)` - Check if creator dashboard should show

### 3. Standardized Permission Checks

#### Media Upload Route
**File**: `tuneable-backend/routes/mediaRoutes.js`
- **Before**: Checked `creatorProfile.verificationStatus === 'verified'`
- **After**: Uses `canUploadMedia(user)` helper (checks `role.includes('creator')`)

#### Media Edit Route
**File**: `tuneable-backend/routes/mediaRoutes.js`
- **Before**: Inline permission checks
- **After**: Uses `canEditMedia(user, media)` helper

#### Frontend Permission Checks
**Files Updated**:
- `tuneable-frontend-v2/src/pages/TuneProfile.tsx` - Uses `canEditMedia()` helper
- `tuneable-frontend-v2/src/components/Navbar.tsx` - Uses `role.includes('creator')` instead of `verificationStatus`
- `tuneable-frontend-v2/src/pages/CreatorUpload.tsx` - Uses `role.includes('creator')` instead of `verificationStatus`

### 4. Kept Display-Only Checks
**Not Changed** (these are for display, not permissions):
- `creatorProfile.verificationStatus === 'verified'` in creator application route (checks if already verified before allowing new application)
- Label verification status checks (display only)
- Creator profile verification status in Admin panel (display only)

## Role System Clarification

### Platform Roles (User.role)
- `admin` - Platform administrator
- `creator` - Verified creator (can upload/manage media)
- `user` - Regular user (default)
- `host`, `dj`, `partier` - Party-specific roles
- `moderator` - Platform moderator

### Context-Specific Roles (Separate Systems)
- `creatorProfile.roles` - Creative roles (display only): ['artist', 'producer', 'songwriter', etc.]
- `labelAffiliations.role` - Label role: ['artist', 'producer', 'manager', 'staff']
- `mediaOwners.role` - Ownership type: ['primary', 'secondary', 'label', 'distributor']
- `Label.admins.role` - Label admin: ['owner', 'admin', 'moderator']

## Standard Permission Check Patterns

### Backend
```javascript
const { isAdmin, isCreator, canUploadMedia, canEditMedia } = require('../utils/permissionHelpers');

// Admin check
if (!isAdmin(user)) return res.status(403).json({ error: 'Admin required' });

// Creator check
if (!isCreator(user)) return res.status(403).json({ error: 'Creator required' });

// Upload permission
if (!canUploadMedia(user)) return res.status(403).json({ error: 'Permission denied' });

// Edit permission
if (!canEditMedia(user, media)) return res.status(403).json({ error: 'Permission denied' });
```

### Frontend
```typescript
import { isAdmin, isCreator, isAdminOrCreator, showCreatorDashboard, canEditMedia } from '../utils/permissionHelpers';

// Admin check
if (isAdmin(user)) { /* admin UI */ }

// Creator check
if (isCreator(user)) { /* creator UI */ }

// Creator dashboard
if (showCreatorDashboard(user)) { /* show creator dashboard */ }

// Edit permission
if (canEditMedia(user, media)) { /* show edit button */ }
```

## Benefits

1. **Consistency**: All permission checks use the same pattern
2. **Clarity**: Clear separation between platform roles and context-specific roles
3. **Maintainability**: Centralized permission logic in helper functions
4. **Type Safety**: TypeScript helpers for frontend
5. **Reduced Confusion**: Removed redundant `artist` platform role

## Next Steps

1. ✅ Audit complete
2. ✅ Consolidation complete
3. ✅ Helper functions created
4. ✅ Permission checks standardized
5. ⏳ Test role checks still work correctly
6. ⏳ Create Creator Dashboard (Phase 2)

