# Authentication UUID Migration

## Overview

Updated authentication flow to use UUIDv7 instead of MongoDB ObjectIds in JWT tokens, aligning with the recent UUID overhaul across the codebase.

---

## Changes Made

### 1. JWT Token Claims
**Changed**: JWT tokens now contain `userId` as UUID (uuidv7) instead of MongoDB ObjectId

**Before**:
```javascript
const token = jwt.sign({ 
  userId: user._id,  // MongoDB ObjectId (e.g., "507f1f77bcf86cd799439011")
  email: user.email, 
  username: user.username 
}, SECRET_KEY, { expiresIn: '24h' });
```

**After**:
```javascript
const token = jwt.sign({ 
  userId: user.uuid,  // UUIDv7 (e.g., "01847d7a-8c3e-7f3c-9c3e-8d7a9b3c4e5f")
  email: user.email, 
  username: user.username 
}, SECRET_KEY, { expiresIn: '24h' });
```

---

### 2. Auth Middleware
**Updated**: `authMiddleware.js` now supports both UUID and ObjectId lookups for backward compatibility

**Features**:
- Detects token format (UUID contains hyphens, ObjectId doesn't)
- UUID tokens → lookup by `User.findOne({ uuid: decoded.userId })`
- ObjectId tokens → lookup by `User.findById(decoded.userId)` (legacy support)
- Returns user with both `_id` and `uuid` fields

**Implementation**:
```javascript
// Check if userId looks like a UUID (contains hyphens) or ObjectId (24 hex chars)
if (decoded.userId && decoded.userId.includes('-')) {
    // UUID format - look up by uuid field
    user = await User.findOne({ uuid: decoded.userId }).select("_id uuid username email");
} else if (mongoose.Types.ObjectId.isValid(decoded.userId)) {
    // Legacy ObjectId format - look up by _id for backward compatibility
    user = await User.findById(decoded.userId).select("_id uuid username email");
}
```

---

### 3. Updated Endpoints

All JWT-generating endpoints now use UUID:

#### Registration (`POST /api/users/register`)
```javascript
const token = jwt.sign({ userId: user.uuid, ... }, SECRET_KEY, { expiresIn: '24h' });
```

#### Login (`POST /api/users/login`)
```javascript
const token = jwt.sign({ userId: user.uuid, ... }, SECRET_KEY, { expiresIn: '24h' });
```

#### Facebook OAuth Callback (`GET /api/auth/facebook/callback`)
```javascript
const token = jwt.sign({ userId: req.user.uuid, ... }, SECRET_KEY, { expiresIn: '24h' });
```

#### Token Refresh (`POST /api/auth/refresh`)
```javascript
const newToken = jwt.sign({ userId: req.user.uuid, ... }, SECRET_KEY, { expiresIn: '24h' });
```

---

## Benefits of UUID in JWT

### 1. **Database Portability**
- UUIDs are database-agnostic (can migrate from MongoDB to PostgreSQL without changing tokens)
- ObjectIds are MongoDB-specific

### 2. **Consistency**
- Aligns with UUID overhaul across User, Song, Party, Bid models
- All entities now identified by UUID in external APIs

### 3. **Better for Distributed Systems**
- UUIDv7 includes timestamp ordering
- Can generate UUIDs client-side if needed
- No database round-trip required for ID generation

### 4. **URL Safety**
- UUIDs use standard format (8-4-4-4-12 hex digits with hyphens)
- ObjectIds are 24 hex characters (no structure)

### 5. **Future-Proof**
- Aligns with modern API design patterns
- Compatible with GraphQL, REST, and other API styles

---

## Backward Compatibility

### Legacy Token Support
✅ **Old tokens with ObjectId still work!**

The authMiddleware intelligently detects the token format:
- **New tokens** (UUID): Contains hyphens → `findOne({ uuid: userId })`
- **Old tokens** (ObjectId): No hyphens → `findById(userId)`

### Migration Path

**Phase 1** (Current):
- All new tokens use UUID
- Old tokens continue working
- No forced logout for existing users

**Phase 2** (Future - Optional):
- Monitor old token usage (add logging)
- Set expiry date for ObjectId token support
- Notify users to re-login before cutoff

**Phase 3** (Future - Optional):
- Remove ObjectId fallback from authMiddleware
- Simplify to UUID-only lookup

---

## Database Indexes

### Recommended Indexes
Ensure UUID field is indexed for fast lookups:

```javascript
// In User model
userSchema.index({ uuid: 1 });  // Already exists (unique: true adds index)
```

### Performance Comparison
- **ObjectId lookup** (`findById`): Very fast (default _id index)
- **UUID lookup** (`findOne({ uuid })`): Very fast (unique uuid index)
- Both are O(log n) with B-tree indexes

---

## Testing

### Test Cases

**1. New User Registration**
```bash
# Register new user
POST /api/users/register
# Verify token contains UUID (not ObjectId)
# Decode JWT and check userId field format
```

**2. Login**
```bash
# Login with existing user
POST /api/users/login
# Verify token contains UUID
```

**3. Facebook OAuth**
```bash
# Complete Facebook OAuth flow
# Verify callback URL contains JWT with UUID
```

**4. Token Refresh**
```bash
# Use existing token to refresh
POST /api/auth/refresh
# Verify new token contains UUID
```

**5. Backward Compatibility**
```bash
# Use old token with ObjectId
# Verify still works and user is authenticated
```

**6. Protected Route Access**
```bash
# Access protected route with UUID token
GET /api/users/profile
# Verify user data is returned correctly
```

---

## Rollback Plan

If UUID migration causes issues:

### Quick Rollback
```bash
# Revert these files:
git checkout HEAD~1 -- tuneable-backend/routes/userRoutes.js
git checkout HEAD~1 -- tuneable-backend/routes/authRoutes.js
git checkout HEAD~1 -- tuneable-backend/middleware/authMiddleware.js
```

### Gradual Rollback
Keep authMiddleware with UUID support, but revert token generation to use ObjectId:
```javascript
// Temporarily revert to ObjectId while keeping UUID support
const token = jwt.sign({ userId: user._id, ... }, SECRET_KEY, { expiresIn: '24h' });
```

---

## Files Modified

1. ✏️ `tuneable-backend/routes/userRoutes.js`
   - Registration endpoint: Use UUID in JWT
   - Login endpoint: Use UUID in JWT

2. ✏️ `tuneable-backend/routes/authRoutes.js`
   - Facebook OAuth callback: Use UUID in JWT
   - Token refresh endpoint: Use UUID in JWT

3. ✏️ `tuneable-backend/middleware/authMiddleware.js`
   - Updated user lookup logic
   - Added UUID vs ObjectId detection
   - Added backward compatibility for ObjectId tokens

---

## Frontend Impact

**No changes required!** 

The frontend doesn't need to know whether the token contains UUID or ObjectId:
- Frontend stores token as opaque string
- Frontend sends token in Authorization header
- Backend handles token validation and user lookup

---

## Monitoring

### Recommended Logging

Add metrics to track token types:

```javascript
// In authMiddleware
if (decoded.userId && decoded.userId.includes('-')) {
    console.log('🆕 UUID token used');
} else {
    console.log('🔄 Legacy ObjectId token used');
}
```

This helps track migration progress and identify when to remove ObjectId support.

---

## Security Considerations

### UUID Predictability
- **UUIDv4**: Random (unpredictable)
- **UUIDv7**: Timestamp-ordered (slightly predictable)
- **Impact**: Minimal - tokens are still secured by JWT signature

### Token Size
- **ObjectId**: 24 characters (`507f1f77bcf86cd799439011`)
- **UUID**: 36 characters (`01847d7a-8c3e-7f3c-9c3e-8d7a9b3c4e5f`)
- **JWT size increase**: ~12 bytes (negligible)

### Brute Force Resistance
Both ObjectId and UUID have similar entropy:
- **ObjectId**: 96 bits (2^96 possibilities)
- **UUIDv7**: 122 bits (2^122 possibilities)
- **Conclusion**: Both are practically impossible to brute force

---

## Next Steps

1. ✅ **Deploy changes** to staging environment
2. ✅ **Test all auth flows** (register, login, OAuth, refresh)
3. ✅ **Monitor logs** for any UUID-related errors
4. ✅ **Update API documentation** to reflect UUID usage
5. ⏳ **Phase out ObjectId support** (optional, future)

---

## Summary

**What Changed**:
- JWT tokens now contain UUID instead of ObjectId
- AuthMiddleware supports both UUID and ObjectId (backward compatible)
- All new authentications use UUID

**What Stayed the Same**:
- Frontend code unchanged
- API endpoints unchanged
- User experience unchanged
- Security level unchanged

**Why**:
- Aligns with UUID overhaul
- Better portability
- Future-proof architecture
- Maintains backward compatibility

