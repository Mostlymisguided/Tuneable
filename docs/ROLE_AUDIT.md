# Role and Designation System Audit

## Executive Summary

This document audits all role and designation systems in the Tuneable codebase to identify overlaps, confusion, and recommend consolidation.

## Current Role Systems

### 1. User.role (Platform-Level Roles)
**Location**: `tuneable-backend/models/User.js`
**Type**: Array of strings
**Enum Values**: `['user', 'admin', 'creator', 'artist', 'host', 'moderator', 'partier', 'dj']`
**Default**: `['user']`

**Purpose**: 
- Platform-wide access control
- Feature permissions
- UI visibility

**Current Usage**:
- `admin`: Platform administrator access (Admin Panel, all features)
- `creator`: Verified creator status (can upload media, access creator features)
- `artist`: Platform role (may be redundant with `creator`)
- `host`: Party host permissions
- `moderator`: Platform moderator (can moderate content)
- `partier`: Party participant
- `dj`: Party DJ permissions

**Key Findings**:
- `creator` role is added when `creatorProfile.verificationStatus === 'verified'`
- `artist` role exists but usage is unclear - may be redundant with `creator`
- Party-specific roles (`host`, `dj`, `partier`) are separate from creator roles

---

### 2. User.creatorProfile.roles (Creative Roles)
**Location**: `tuneable-backend/models/User.js`
**Type**: Array of strings
**Values**: `['artist', 'producer', 'songwriter', 'composer', etc.]` (free-form, no enum)

**Purpose**:
- Display creative credits
- Search/filtering by creative role
- Profile display

**Current Usage**:
- Used for display on creator profiles
- Not used for permissions
- Separate from platform roles

**Key Findings**:
- This is purely informational/display
- No permission checks use this field
- Should remain separate from platform roles

---

### 3. User.labelAffiliations.role (Label-Specific Role)
**Location**: `tuneable-backend/models/User.js`
**Type**: String (within labelAffiliations array)
**Enum Values**: `['artist', 'producer', 'manager', 'staff']`

**Purpose**:
- User's role within a specific label
- Label roster display
- Label-specific permissions (future)

**Current Usage**:
- Displayed on user profile (label affiliations)
- Used to query label's artist roster
- Status: `pending`, `active`, `inactive`

**Key Findings**:
- Context-specific (only applies within a label)
- Separate from platform roles
- Should remain separate

---

### 4. Media.mediaOwners.role (Ownership Type)
**Location**: `tuneable-backend/models/Media.js`
**Type**: String (within mediaOwners array)
**Enum Values**: `['primary', 'secondary', 'label', 'distributor']`

**Purpose**:
- Ownership category for revenue distribution
- Media ownership permissions
- Display ownership type

**Current Usage**:
- Used in permission checks: `isMediaOwner`
- Revenue distribution logic (future)
- Edit permissions for media

**Key Findings**:
- Context-specific (only applies to specific media)
- Separate from user roles
- Should remain separate

---

### 5. Label.admins.role (Label Administration)
**Location**: `tuneable-backend/models/Label.js`
**Type**: String (within admins array)
**Enum Values**: `['owner', 'admin', 'moderator']`

**Purpose**:
- Administrative permissions within a label
- Label management access
- Invite/remove artists

**Current Usage**:
- Label management permissions
- Check: `label.isOwner(userId)`, `label.isAdmin(userId)`

**Key Findings**:
- Context-specific (only applies within a label)
- Separate from platform roles
- Should remain separate

---

### 6. Media Creator Fields (Creative Credits)
**Location**: `tuneable-backend/models/Media.js`
**Type**: Array of subdocuments with `{ name, userId, verified }`
**Fields**: `artist`, `producer`, `songwriter`, `composer`, `featuring`, etc.

**Purpose**:
- Creative credits on media
- Display on media profile
- Verification linking

**Current Usage**:
- Display on TuneProfile
- Verification: `media.verifiedCreators` (array of user IDs)
- Permission checks: `isVerifiedCreator` (user is in verifiedCreators array)

**Key Findings**:
- This is media-specific creative credits
- Separate from user roles
- Should remain separate

---

## Permission Check Patterns

### Pattern 1: Admin Access
```javascript
const isAdmin = user.role && user.role.includes('admin');
```
**Used in**:
- Admin middleware
- Admin panel access
- All admin routes
- Media upload/edit permissions

---

### Pattern 2: Creator Access (Upload Media)
```javascript
const isAdmin = user.role && user.role.includes('admin');
const isVerifiedCreator = user.creatorProfile && user.creatorProfile.verificationStatus === 'verified';

if (!isAdmin && !isVerifiedCreator) {
  return res.status(403).json({ error: 'Only verified creators and admins can upload media' });
}
```
**Used in**:
- Media upload route
- Creator upload feature

**Note**: Checks both `admin` role AND `creatorProfile.verificationStatus === 'verified'`

---

### Pattern 3: Media Edit Permissions
```javascript
const isAdmin = req.user.role && req.user.role.includes('admin');
const isMediaOwner = media.mediaOwners && media.mediaOwners.some(
  owner => owner.userId.toString() === userId.toString()
);
const isVerifiedCreator = media.getVerifiedCreators().some(
  creator => creator.userId.toString() === userId.toString()
);

if (!isAdmin && !isMediaOwner && !isVerifiedCreator) {
  return res.status(403).json({ error: 'Not authorized to edit this media' });
}
```
**Used in**:
- Media edit route
- TuneProfile edit button

**Note**: Checks admin OR mediaOwner OR verifiedCreator (from media, not user)

---

### Pattern 4: Creator Application Approval
```javascript
// If approved, add creator role
if (status === 'verified' && !user.role.includes('creator')) {
  user.role.push('creator');
}

// If rejected, remove creator role
if (status === 'rejected' && user.role.includes('creator')) {
  user.role = user.role.filter(r => r !== 'creator');
}
```
**Used in**:
- Creator application review route

**Note**: Automatically adds/removes `creator` role when verification status changes

---

### Pattern 5: Label Admin Access
```javascript
const isPlatformAdmin = req.user.role && req.user.role.includes('admin');
const canEdit = isPlatformAdmin || label.isAdmin(req.user.id);
```
**Used in**:
- Label edit routes
- Label logo upload

**Note**: Platform admin OR label admin can edit

---

## Issues and Overlaps

### Issue 1: "artist" Role Confusion
**Problem**: The word "artist" appears in multiple contexts:
1. `User.role: 'artist'` - Platform role (unclear purpose)
2. `User.creatorProfile.roles: ['artist']` - Creative role (display only)
3. `User.labelAffiliations.role: 'artist'` - Label role (within label)
4. `Media.artist` - Creative credit (media-specific)

**Impact**: 
- Unclear what `User.role: 'artist'` means
- May be redundant with `creator` role
- Confusing for developers

**Recommendation**: 
- **Remove `artist` from User.role enum** - it's redundant with `creator`
- Keep `creatorProfile.roles: ['artist']` for display
- Keep `labelAffiliations.role: 'artist'` for label context
- Keep `Media.artist` for creative credits

---

### Issue 2: Creator Verification vs Creator Role
**Problem**: Two different checks for creator access:
1. `user.role.includes('creator')` - Platform role
2. `user.creatorProfile.verificationStatus === 'verified'` - Verification status

**Current State**:
- When creator application is approved, both happen:
  - `creatorProfile.verificationStatus = 'verified'`
  - `role.push('creator')`

**Impact**:
- Some code checks `role.includes('creator')`
- Some code checks `verificationStatus === 'verified'`
- Inconsistent permission checks

**Recommendation**:
- **Standardize on `role.includes('creator')`** for permissions
- Keep `creatorProfile.verificationStatus` for tracking/display
- Ensure they're always in sync (already done in creator application approval)

---

### Issue 3: Creator vs Artist Platform Role
**Problem**: Both `creator` and `artist` exist in User.role enum, but:
- `creator` is actively used (added on verification)
- `artist` is in enum but not actively set/used

**Impact**:
- Unclear if `artist` should be used
- May cause confusion about which to check

**Recommendation**:
- **Remove `artist` from User.role enum**
- Use only `creator` for verified creator platform role
- Keep `creatorProfile.roles: ['artist']` for creative role display

---

## Recommendations

### 1. Consolidate Platform Roles
**Remove from User.role enum**: `artist`
**Keep in User.role enum**: `['user', 'admin', 'creator', 'host', 'moderator', 'partier', 'dj']`

**Rationale**:
- `artist` is redundant with `creator`
- Creative roles belong in `creatorProfile.roles`
- Label roles belong in `labelAffiliations.role`

---

### 2. Standardize Creator Permission Checks
**Standard Pattern**:
```javascript
const isAdmin = user.role && user.role.includes('admin');
const isCreator = user.role && user.role.includes('creator');
const canAccess = isAdmin || isCreator;
```

**Rationale**:
- `creator` role is set when verified
- No need to check `creatorProfile.verificationStatus` for permissions
- Simpler, more consistent

---

### 3. Keep Context-Specific Roles Separate
**DO NOT change**:
- `creatorProfile.roles` - Creative credits (display only)
- `labelAffiliations.role` - Label-specific role
- `mediaOwners.role` - Ownership type
- `Label.admins.role` - Label administration

**Rationale**:
- These are context-specific
- Different purposes
- Should remain separate

---

### 4. Update Permission Checks
**Standardize all permission checks to use**:
- `user.role.includes('admin')` - Admin access
- `user.role.includes('creator')` - Creator access
- `media.mediaOwners.some(...)` - Media owner access
- `media.getVerifiedCreators().some(...)` - Verified creator on media
- `label.isAdmin(userId)` - Label admin access

**Remove**:
- Checks for `user.role.includes('artist')` (replace with `creator`)
- Checks for `creatorProfile.verificationStatus === 'verified'` in permission logic (use `role.includes('creator')` instead)

---

## Implementation Plan

### Phase 1: Remove 'artist' from User.role enum
1. Remove `'artist'` from enum in User model
2. Find all uses of `role.includes('artist')` and replace with `role.includes('creator')`
3. Update any code that sets `role` to include `'artist'`

### Phase 2: Standardize permission checks
1. Find all checks for `creatorProfile.verificationStatus === 'verified'`
2. Replace with `role.includes('creator')` where appropriate
3. Keep `verificationStatus` checks only for display/UI purposes

### Phase 3: Update documentation
1. Document role system clearly
2. Create helper functions for common permission checks
3. Update API documentation

---

## Helper Functions to Create

### Backend Helpers
```javascript
// utils/permissionHelpers.js
function isAdmin(user) {
  return user?.role?.includes('admin');
}

function isCreator(user) {
  return user?.role?.includes('creator');
}

function isAdminOrCreator(user) {
  return isAdmin(user) || isCreator(user);
}

function canEditMedia(user, media) {
  if (isAdmin(user)) return true;
  if (isMediaOwner(user, media)) return true;
  if (isVerifiedCreatorOnMedia(user, media)) return true;
  return false;
}

function isMediaOwner(user, media) {
  return media?.mediaOwners?.some(
    owner => owner.userId.toString() === user._id.toString()
  );
}

function isVerifiedCreatorOnMedia(user, media) {
  return media?.getVerifiedCreators().some(
    creator => creator.userId.toString() === user._id.toString()
  );
}
```

### Frontend Helpers
```typescript
// utils/permissionHelpers.ts
export function isAdmin(user: User): boolean {
  return user?.role?.includes('admin') ?? false;
}

export function isCreator(user: User): boolean {
  return user?.role?.includes('creator') ?? false;
}

export function isAdminOrCreator(user: User): boolean {
  return isAdmin(user) || isCreator(user);
}

export function showCreatorDashboard(user: User): boolean {
  return isAdminOrCreator(user);
}
```

---

## Summary

**Remove**:
- `artist` from User.role enum (redundant with `creator`)

**Keep**:
- All context-specific roles (labelAffiliations, mediaOwners, Label.admins)
- creatorProfile.roles (creative credits, display only)

**Standardize**:
- Use `role.includes('creator')` for creator permissions
- Use `role.includes('admin')` for admin permissions
- Create helper functions for consistency

**Result**:
- Clear separation of concerns
- Consistent permission checks
- Easier to understand and maintain

