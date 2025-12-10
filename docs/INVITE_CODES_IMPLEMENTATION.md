# Multiple Invite Codes Implementation

## Overview
Successfully implemented support for multiple personal invite codes per user, allowing users to create, label, and track invite codes from different sources (Reddit, Twitter, etc.).

## Implementation Summary

### Backend Changes

#### 1. User Model (`tuneable-backend/models/User.js`)
- **Added**: `personalInviteCodes` array with metadata:
  - `code`: The invite code string
  - `isActive`: Boolean to enable/disable codes
  - `label`: Optional label (e.g., "Reddit", "Twitter")
  - `createdAt`: When the code was created
  - `usageCount`: Number of users who signed up with this code
- **Added**: `parentInviteCodeId` field to track which specific code object was used
- **Kept**: `personalInviteCode` field for backward compatibility
- **Added Helper Methods**:
  - `User.findByInviteCode(code)` - Static method to find user by code (checks both old and new structure)
  - `user.getActiveInviteCodes()` - Returns array of active invite codes
  - `user.getPrimaryInviteCode()` - Returns primary code (first active or legacy)
  - `user.findInviteCodeObject(code)` - Finds specific invite code object by code string

#### 2. Migration Script (`tuneable-backend/scripts/migrate-invite-codes.js`)
- Converts existing `personalInviteCode` values to new `personalInviteCodes` array format
- **Status**: ✅ Successfully migrated 27 users
- **Run**: `node scripts/migrate-invite-codes.js`

#### 3. API Endpoints (`tuneable-backend/routes/userRoutes.js`)
- **Updated**:
  - `GET /api/users/validate-invite/:code` - Now checks both old and new structures
  - `POST /api/users/register` - Finds inviter by code in array, tracks usage, validates active status
  - `GET /api/users/referrals` - Returns all invite codes with stats, supports filtering by code
- **Added**:
  - `POST /api/users/invite-codes` - Create new invite code
  - `PATCH /api/users/invite-codes/:codeId` - Update code (activate/deactivate, change label)
  - `DELETE /api/users/invite-codes/:codeId` - Deactivate code (soft delete)

#### 4. OAuth Flows (`tuneable-backend/config/passport.js`)
- Updated all OAuth strategies (Facebook, Google, SoundCloud, Instagram) to:
  - Use `User.findByInviteCode()` for validation
  - Check if code is active before allowing registration
  - Create new users with codes in new format
  - Track usage count for the code used

### Frontend Changes

#### 1. Types (`tuneable-frontend-v2/src/types.ts`)
- Added `InviteCode` interface
- Added `ReferralsResponse` interface
- Updated `User` interface to include `personalInviteCodes` and `primaryInviteCode`

#### 2. API Client (`tuneable-frontend-v2/src/lib/api.ts`)
- Added `createInviteCode(label?)` method
- Added `updateInviteCode(codeId, updates)` method
- Added `deleteInviteCode(codeId)` method
- Updated `getReferrals(code?)` to accept optional code filter

#### 3. Components
- **InviteReferrals** (`tuneable-frontend-v2/src/components/InviteReferrals.tsx`): Complete rewrite
  - Display all invite codes with labels and usage counts
  - Create new codes with labels
  - Edit code labels inline
  - Activate/deactivate codes
  - Filter referrals by specific code
  - Show which code each referral used
  - Copy code or full invite link

#### 4. Pages Updated
- **Dashboard**: Uses `primaryInviteCode` with fallback to `personalInviteCode`
- **UserProfile**: Updated to use new structure
- **Party**: Updated to use new structure

## Features

✅ **Multiple Invite Codes**: Users can create unlimited invite codes  
✅ **Labeling**: Each code can have a label (e.g., "Reddit", "Twitter", "Discord")  
✅ **Usage Tracking**: See how many signups each code generated  
✅ **Activate/Deactivate**: Enable or disable codes without deleting them  
✅ **Filter Referrals**: View referrals filtered by specific code  
✅ **Code Attribution**: See which code each referral used  
✅ **Backward Compatible**: Existing `personalInviteCode` still works  
✅ **Migration Complete**: All existing users migrated successfully  

## Testing Checklist

### Backend
- [x] Migration script runs successfully
- [ ] Test creating new invite code via API
- [ ] Test updating invite code (activate/deactivate, change label)
- [ ] Test deleting/deactivating invite code
- [ ] Test registration with new invite code
- [ ] Test registration with deactivated code (should fail)
- [ ] Test OAuth flows with new codes
- [ ] Test referrals endpoint with code filter
- [ ] Test validation endpoint with new codes

### Frontend
- [ ] Test creating new invite code in UI
- [ ] Test editing code label
- [ ] Test deactivating code
- [ ] Test reactivating code
- [ ] Test filtering referrals by code
- [ ] Test copying invite code/link
- [ ] Test registration flow still works
- [ ] Test OAuth registration flows

## API Examples

### Create Invite Code
```bash
POST /api/users/invite-codes
{
  "label": "Reddit"
}
```

### Update Invite Code
```bash
PATCH /api/users/invite-codes/:codeId
{
  "isActive": false,
  "label": "Twitter - Old"
}
```

### Get Referrals (Filtered)
```bash
GET /api/users/referrals?code=ABC12
```

### Delete/Deactivate Code
```bash
DELETE /api/users/invite-codes/:codeId
```

## Migration Status

✅ **Completed**: 27 users migrated successfully  
✅ **Errors**: 0  
✅ **Users with new format**: 27  

## Notes

- The `personalInviteCode` field is kept for backward compatibility
- New users automatically get a code in the new format
- The migration script can be run multiple times safely (idempotent)
- Users must have at least one active code (can't delete the last one)
- Usage counts are automatically incremented when someone signs up with a code

## Next Steps

1. Test the implementation thoroughly
2. Monitor usage and performance
3. Consider adding analytics/insights for invite code performance
4. Consider adding code expiration dates (future enhancement)

