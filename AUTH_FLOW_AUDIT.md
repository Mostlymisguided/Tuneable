# Authentication Flow Audit & Improvement Plan

## Current Issues Identified

### 🔴 Critical Issues

1. **Register Doesn't Auto-Login**
   - **Problem**: `/api/users/register` creates user but doesn't return a JWT token
   - **Impact**: Users must manually login after registration (poor UX)
   - **Location**: `tuneable-backend/routes/userRoutes.js:126`

2. **Sensitive Data in URL**
   - **Problem**: OAuth callback passes full user object in URL query params
   - **Impact**: Security risk - user data visible in browser history, logs, analytics
   - **Location**: `tuneable-backend/routes/authRoutes.js:32`

3. **No Token Refresh**
   - **Problem**: Tokens expire after 24h with no refresh mechanism
   - **Impact**: Users get logged out and must re-authenticate
   - **Location**: All JWT generation (24h expiry)

### 🟡 Medium Priority Issues

4. **Inconsistent Invite Code Generation**
   - **Problem**: Two different functions generate invite codes differently
   - **Locations**: 
     - `userRoutes.js:37` - MD5 hash based (5 chars)
     - `passport.js:114` - Random chars (5 chars)

5. **Duplicate User Save on Registration**
   - **Problem**: User saved twice - once to get ID, again for profile pic
   - **Impact**: Inefficient, race conditions possible
   - **Location**: `userRoutes.js:115-122`

6. **Complex Location Fallback Logic**
   - **Problem**: Overly complex location detection (homeLocation → geoIP → Antarctica)
   - **Impact**: Hard to maintain, Antarctica default is confusing
   - **Location**: `userRoutes.js:73-90`

7. **OAuth Creates Random Usernames**
   - **Problem**: Facebook OAuth users get names like "JohnDoe1a2b"
   - **Impact**: Poor UX, users may not recognize their account
   - **Location**: `passport.js:63`

8. **User Data Sync Issues**
   - **Problem**: User data stored in both state and localStorage, can get out of sync
   - **Impact**: Stale data shown to users
   - **Location**: `AuthContext.tsx` - multiple setState/localStorage calls

### 🟢 Low Priority Issues

9. **No Email Verification**
   - **Problem**: Anyone can register with any email address
   - **Impact**: Spam accounts, fake users

10. **Weak Password Validation**
    - **Problem**: Only checks length >= 6
    - **Impact**: Users can use weak passwords

11. **No Forgot Password Flow**
    - **Problem**: Link exists in UI but no backend implementation
    - **Location**: `AuthPage.tsx:174`

12. **Generic Error Messages**
    - **Problem**: Errors like "Error registering user" don't help users fix issues
    - **Impact**: Poor UX, users don't know what went wrong

13. **Passport Session Not Used**
    - **Problem**: Passport serialize/deserialize configured but sessions not used (JWT instead)
    - **Impact**: Confusing code, unnecessary middleware
    - **Location**: `passport.js:124-136`

---

## Proposed Solutions

### Phase 1: Critical Fixes (Immediate)

#### 1.1 Auto-Login After Registration
**Change**: Make `/api/users/register` return JWT token like `/api/users/login`

```javascript
// After user.save() in userRoutes.js
const token = jwt.sign(
  { userId: user._id, email: user.email, username: user.username },
  SECRET_KEY,
  { expiresIn: '24h' }
);

res.status(201).json(transformResponse({
  message: 'User registered successfully',
  token,  // Add this
  user: user,
}));
```

#### 1.2 Secure OAuth Callback
**Change**: Don't pass user data in URL, only pass token and fetch user on frontend

```javascript
// authRoutes.js - simplified callback
res.redirect(`${frontendUrl}/auth/callback?token=${token}`);

// AuthCallback.tsx - fetch user data
if (token) {
  handleOAuthCallback(token, null);
  const response = await authAPI.getProfile();
  setUser(response.user);
}
```

#### 1.3 Add Token Refresh
**Change**: Add refresh token endpoint and auto-refresh before expiry

```javascript
// New endpoint: /api/auth/refresh
router.post('/refresh', authMiddleware, (req, res) => {
  const newToken = jwt.sign(
    { userId: req.user._id, email: req.user.email, username: req.user.username },
    SECRET_KEY,
    { expiresIn: '24h' }
  );
  res.json({ token: newToken });
});
```

### Phase 2: Medium Priority (Next Sprint)

#### 2.1 Consolidate Invite Code Generation
**Change**: Create shared utility function

```javascript
// utils/inviteCodeGenerator.js
const generateInviteCode = (userId) => {
  return crypto.createHash('md5')
    .update(userId.toString())
    .digest('hex')
    .substring(0, 5)
    .toUpperCase();
};
```

#### 2.2 Simplify Registration
**Change**: Single save, simpler location handling, remove profile pic from registration

```javascript
// Registration shouldn't handle profile pic upload
// Separate endpoint: POST /api/users/profile-pic (already exists)
// Simpler location: User provides or defaults to empty
```

#### 2.3 Better OAuth Usernames
**Change**: Let user choose username on first OAuth login

```javascript
// Create intermediate page: /complete-profile
// Show after OAuth if username is auto-generated
// Let user customize username, profile, etc.
```

#### 2.4 Centralized User Data Management
**Change**: Single source of truth, sync automatically

```javascript
// Use zustand or similar for better state management
// Or ensure AuthContext is the only source
```

### Phase 3: Nice-to-Have (Future)

- Email verification with tokens
- Password reset flow
- Stronger password requirements
- Rate limiting on auth endpoints
- 2FA support
- Remember me / persistent sessions
- Social login with Google, Apple

---

## Recommended Refactoring

### New File Structure

```
tuneable-backend/
  routes/
    authRoutes.js         → OAuth only (Facebook, Google)
    userRoutes.js         → Email/password + profile management
  services/
    authService.js        → NEW: Token generation, validation
    userService.js        → NEW: User creation, updates
  utils/
    inviteCodeGenerator.js → NEW: Shared invite code logic
  middleware/
    authMiddleware.js     → Token verification (existing)
    rateLimiter.js        → NEW: Rate limiting for auth routes
```

### Simplified Flow

**Registration (Email/Password)**:
1. POST `/api/users/register` → Create user + return token
2. User automatically logged in
3. Redirect to dashboard

**OAuth (Facebook)**:
1. GET `/api/auth/facebook` → Redirect to Facebook
2. Facebook callback → Create/find user + generate token
3. Redirect to `/auth/callback?token=xxx`
4. Frontend: Store token + fetch user profile
5. Redirect to dashboard

**Login (Email/Password)**:
1. POST `/api/users/login` → Verify + return token
2. User logged in
3. Redirect to dashboard

---

## Testing Checklist

- [ ] Register new user → Auto-logged in
- [ ] Register with existing email → Error shown
- [ ] Login with correct credentials → Success
- [ ] Login with wrong credentials → Error shown
- [ ] Facebook OAuth first time → Account created
- [ ] Facebook OAuth returning user → Logged in
- [ ] Token expiry → Auto-refresh or redirect to login
- [ ] Logout → Cleared from localStorage and state
- [ ] Profile update → Synced everywhere

---

## Migration Notes

If implementing these changes, consider:
1. **Backward compatibility**: Existing tokens should still work
2. **Database migration**: No schema changes needed for Phase 1
3. **Frontend updates**: Update AuthContext to handle new response format
4. **Testing**: Test all flows before deploying

