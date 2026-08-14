const express = require('express');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || 'JWT Secret failed to fly';

/** Append query params to a URL that may already include a query string. */
function appendQueryParams(url, params) {
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      parsed.searchParams.set(key, String(value));
    }
    return parsed.toString();
  } catch {
    const join = url.includes('?') ? '&' : '?';
    const qs = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    return qs ? `${url}${join}${qs}` : url;
  }
}

/**
 * passport-spotify wraps Spotify /v1/me failures as "failed to fetch user profile".
 * Map those (and raw oauthError payloads) to actionable user-facing copy.
 */
function formatSpotifyOAuthError(err) {
  const rawMessage = String(err?.message || '').trim();
  const oauthStatus = err?.oauthError?.statusCode;
  const oauthRaw = err?.oauthError?.data;
  let oauthBody = '';
  if (oauthRaw == null) {
    oauthBody = '';
  } else if (typeof oauthRaw === 'string') {
    oauthBody = oauthRaw;
  } else if (Buffer.isBuffer(oauthRaw)) {
    oauthBody = oauthRaw.toString('utf8');
  } else {
    try {
      oauthBody = JSON.stringify(oauthRaw);
    } catch {
      oauthBody = String(oauthRaw);
    }
  }

  // Prefer nested Spotify JSON message when present
  let spotifyApiMessage = '';
  try {
    const parsed = JSON.parse(oauthBody);
    spotifyApiMessage = parsed?.error?.message || parsed?.message || '';
  } catch {
    spotifyApiMessage = '';
  }
  const haystack = `${oauthBody} ${spotifyApiMessage} ${rawMessage}`;

  if (/not be registered|not registered|User not registered/i.test(haystack)) {
    return 'Spotify blocked this account: it is not on Tuneable’s developer allowlist. Add the exact Spotify account email from spotify.com/account/overview under Developer Dashboard → Users Management, then try again.';
  }
  if (/premium subscription required/i.test(haystack)) {
    return 'Spotify blocked this connection: the Tuneable Spotify app owner needs an active Premium subscription (required for Development Mode).';
  }
  if (oauthStatus === 403 || /403/.test(String(oauthStatus))) {
    return spotifyApiMessage
      ? `Spotify rejected the connection (403): ${spotifyApiMessage}`
      : 'Spotify rejected the connection (403). In Development Mode the app owner needs Premium and each tester must be allowlisted with their Spotify account email.';
  }
  if (/failed to fetch user profile/i.test(rawMessage)) {
    return spotifyApiMessage
      ? `Couldn’t finish connecting Spotify: ${spotifyApiMessage}`
      : 'Couldn’t finish connecting Spotify — Spotify rejected the account lookup after you authorized. If you’re testing, confirm the app owner has Premium and your Spotify account email is on the developer allowlist.';
  }
  if (/Please log in first/i.test(rawMessage)) {
    return rawMessage;
  }
  if (/already linked/i.test(rawMessage)) {
    return rawMessage;
  }
  if (/User not found/i.test(rawMessage)) {
    return 'Couldn’t connect Spotify — your Tuneable session was lost. Log in again, then retry Connect Spotify.';
  }

  return rawMessage || 'Spotify connection failed. Please try again.';
}

/**
 * Dedupe Facebook authorization-code exchanges.
 * Browsers/proxies sometimes hit the callback twice; the second exchange fails with
 * "This authorization code has been used" and surfaces as an interrupted sign-in.
 */
const facebookAuthCodeCache = new Map(); // code -> { promise, redirectUrl?, expires }
const FACEBOOK_AUTH_CODE_TTL_MS = 2 * 60 * 1000;

function getFacebookAuthCodeEntry(code) {
  const entry = facebookAuthCodeCache.get(code);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    facebookAuthCodeCache.delete(code);
    return null;
  }
  return entry;
}

function rememberFacebookAuthRedirect(code, redirectUrl) {
  if (!code) return;
  const existing = facebookAuthCodeCache.get(code) || {};
  existing.redirectUrl = redirectUrl;
  existing.expires = Date.now() + FACEBOOK_AUTH_CODE_TTL_MS;
  facebookAuthCodeCache.set(code, existing);
}

// Helper function to optionally extract user from JWT token (for account linking)
// Can extract from Authorization header or query parameter (for OAuth redirects)
async function extractUserFromToken(req) {
  try {
    let token = null;
    
    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.split(' ')[1];
    }
    
    // Fallback to query parameter (for OAuth redirects)
    if (!token && req.query.token) {
      token = req.query.token;
    }
    
    if (!token) return null;
    
    const decoded = jwt.verify(token, SECRET_KEY);
    if (!decoded.userId) return null;
    
    // Fetch user by UUID or _id
    const mongoose = require('mongoose');
    let user;
    if (decoded.userId.includes('-')) {
      user = await User.findOne({ uuid: decoded.userId }).select('_id uuid');
    } else if (mongoose.Types.ObjectId.isValid(decoded.userId)) {
      user = await User.findById(decoded.userId).select('_id uuid');
    }
    
    return user ? { _id: user._id.toString(), uuid: user.uuid } : null;
  } catch (err) {
    // Token invalid or expired - that's okay for optional extraction
    console.warn('Token extraction failed:', err.message);
    return null;
  }
}

// Facebook OAuth routes - only available if configured
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  router.get('/facebook', async (req, res, next) => {
    req.session = req.session || {};

    // Store invite code in session if provided
    if (req.query.invite) {
      req.session.pendingInviteCode = req.query.invite;
    }
    // Store redirect URL and link_account flag in session for account linking
    if (req.query.redirect) {
      // Express already decodes query params once — do not decodeURIComponent again
      req.session.oauthRedirect = req.query.redirect;
    }
    if (req.query.link_account === 'true') {
      req.session.linkAccount = true;

      // Extract current user from JWT token (if present) and store in session
      const currentUser = await extractUserFromToken(req);
      if (currentUser) {
        req.session.linkingUserId = currentUser._id;
        req.session.linkingUserUuid = currentUser.uuid;
        console.log('🔗 Account linking initiated for user:', currentUser.uuid);
      } else {
        console.warn('⚠️ Account linking requested but no valid user token found');
      }
    }

    // Persist session before redirecting to Facebook (invite + oauthRedirect)
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Facebook OAuth session save failed:', saveErr);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(appendQueryParams(
          typeof req.query.redirect === 'string'
            ? req.query.redirect
            : `${frontendUrl}/auth/callback`,
          { error: 'facebook_auth_failed', message: 'Session could not be started' }
        ));
      }
      passport.authenticate('facebook', {
        scope: ['email']
      })(req, res, next);
    });
  });

  router.get('/facebook/callback', async (req, res, next) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const authCode = typeof req.query.code === 'string' ? req.query.code : null;

    // Duplicate callback hits: reuse the first exchange's redirect instead of
    // asking Facebook to redeem the one-time code again.
    if (authCode) {
      const cached = getFacebookAuthCodeEntry(authCode);
      if (cached?.redirectUrl) {
        console.warn('Facebook OAuth: reusing cached redirect for duplicate auth code');
        return res.redirect(cached.redirectUrl);
      }
      if (cached?.promise) {
        const redirectUrl = await cached.promise;
        return res.redirect(redirectUrl);
      }
    }

    let resolveCodeRedirect;
    if (authCode) {
      const promise = new Promise((resolve) => {
        resolveCodeRedirect = resolve;
      });
      facebookAuthCodeCache.set(authCode, {
        promise,
        expires: Date.now() + FACEBOOK_AUTH_CODE_TTL_MS
      });
    }

    const finishRedirect = (url) => {
      if (authCode) {
        rememberFacebookAuthRedirect(authCode, url);
        if (resolveCodeRedirect) resolveCodeRedirect(url);
      }
      return res.redirect(url);
    };

    passport.authenticate('facebook', {
      session: false // We're using JWT, not sessions for auth
    }, async (err, user) => {
      // oauthRedirect already includes ?oauth_success=true — always use appendQueryParams
      const baseRedirect = req.session?.oauthRedirect || `${frontendUrl}/auth/callback`;
      const clearFacebookSession = () => {
        if (!req.session) return;
        delete req.session.oauthRedirect;
        delete req.session.linkAccount;
        delete req.session.linkingUserId;
        delete req.session.linkingUserUuid;
      };

      if (err) {
        console.error('Facebook OAuth strategy error:', err.message);
        clearFacebookSession();
        const raw = err.message || 'Facebook authentication failed';
        const isCodeReuse =
          /authorization code has been used/i.test(raw) ||
          /code been used/i.test(raw);

        // Late duplicate: another request may have already finished successfully
        if (isCodeReuse && authCode) {
          const cached = getFacebookAuthCodeEntry(authCode);
          if (cached?.redirectUrl && !/[?&]error=/.test(cached.redirectUrl)) {
            console.warn('Facebook OAuth: code reuse after successful sibling request — using cached redirect');
            return res.redirect(cached.redirectUrl);
          }
        }

        return finishRedirect(appendQueryParams(baseRedirect, {
          error: isCodeReuse ? 'facebook_auth_failed' : 'account_linking_failed',
          message: isCodeReuse
            ? 'Facebook sign-in was interrupted. Please try again.'
            : raw
        }));
      }

      if (!user) {
        console.error('Facebook OAuth authentication failed - no user returned');
        clearFacebookSession();
        return finishRedirect(appendQueryParams(baseRedirect, {
          error: 'facebook_auth_failed',
          message: 'Facebook authentication failed'
        }));
      }

      try {
        const isLinkingAccount = req.session?.linkAccount === true;
        const linkingUserId = req.session?.linkingUserId;

        // If this is an account linking request, verify the user matches
        if (isLinkingAccount && linkingUserId) {
          const authenticatedUserId = user._id.toString();

          if (authenticatedUserId !== linkingUserId) {
            clearFacebookSession();
            return finishRedirect(appendQueryParams(baseRedirect, {
              error: 'account_already_linked',
              message: 'This Facebook account is already linked to another user account. Please use a different account.'
            }));
          }

          console.log('✅ Account linking successful for user:', user.uuid);
        }

        const token = jwt.sign(
          {
            userId: user.uuid,
            email: user.email,
            username: user.username
          },
          SECRET_KEY,
          { expiresIn: '24h' }
        );

        clearFacebookSession();

        return finishRedirect(appendQueryParams(baseRedirect, {
          token,
          oauth_success: 'true'
        }));
      } catch (error) {
        console.error('Facebook callback error:', error);
        clearFacebookSession();
        return finishRedirect(appendQueryParams(baseRedirect, {
          error: 'facebook_auth_failed',
          message: error.message || 'Facebook authentication failed'
        }));
      }
    })(req, res, next);
  });
} else {
  // Facebook OAuth not configured - return 503 Service Unavailable
  router.get('/facebook', (req, res) => {
    res.status(503).json({ error: 'Facebook OAuth not configured' });
  });
  
  router.get('/facebook/callback', (req, res) => {
    res.status(503).json({ error: 'Facebook OAuth not configured' });
  });
}

// Google OAuth routes - only available if configured
// Debug logging for Google OAuth configuration
console.log('🔍 Google OAuth Environment Check:');
console.log('GOOGLE_CLIENT_ID exists:', !!process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_ID length:', process.env.GOOGLE_CLIENT_ID?.length || 0);
console.log('GOOGLE_CLIENT_SECRET exists:', !!process.env.GOOGLE_CLIENT_SECRET);
console.log('GOOGLE_CLIENT_SECRET length:', process.env.GOOGLE_CLIENT_SECRET?.length || 0);
console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || 'not set (using default)');
console.log('NODE_ENV:', process.env.NODE_ENV);

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log('✅ Google OAuth configured successfully');
  router.get('/google', async (req, res, next) => {
    // Ensure session exists
    if (!req.session) {
      req.session = {};
    }
    
    // Store invite code in session if provided
    if (req.query.invite) {
      req.session.pendingInviteCode = req.query.invite;
    }
    // Store redirect URL and link_account flag in session for account linking
    if (req.query.redirect) {
      req.session.oauthRedirect = req.query.redirect;
    }
    if (req.query.link_account === 'true') {
      req.session.linkAccount = true;
      
      // Extract current user from JWT token (if present) and store in session
      const currentUser = await extractUserFromToken(req);
      if (currentUser) {
        req.session.linkingUserId = currentUser._id;
        req.session.linkingUserUuid = currentUser.uuid;
        console.log('🔗 Account linking initiated for user:', currentUser.uuid);
      } else {
        console.warn('⚠️ Account linking requested but no valid user token found');
      }
    }
    
    // Generate random state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    req.session.oauthState = state;
    
    // Debug logging
    console.log('🔐 Generated OAuth state:', state);
    console.log('📦 Session ID:', req.sessionID);
    
    // Save session explicitly before redirect
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session:', err);
        return next(err);
      }
      
      console.log('✅ Session saved with OAuth state');
      
      passport.authenticate('google', { 
        scope: [
          'profile', 
          'email',
          // 'https://www.googleapis.com/auth/youtube.readonly'  // Commented out - requires Google verification. For YouTube import feature (admin only)
        ],
        state: state  // Pass state parameter for security
      })(req, res, next);
    });
  });

  router.get('/google/callback', 
    (req, res, next) => {
      try {
        // Validate state parameter for CSRF protection
        const state = req.query.state;
        const sessionState = req.session?.oauthState;
        
        // Enhanced debugging
        console.log('🔍 Google OAuth callback received:');
        console.log('📦 Session ID:', req.sessionID);
        console.log('🔐 Query state:', state);
        console.log('💾 Session state:', sessionState);
        console.log('📝 Session exists:', !!req.session);
        console.log('🔑 Session keys:', req.session ? Object.keys(req.session) : 'no session');
        
        if (!state || !sessionState || state !== sessionState) {
          console.error('❌ Invalid OAuth state parameter - possible CSRF attack');
          console.error('State mismatch:', {
            queryState: state,
            sessionState: sessionState,
            stateExists: !!state,
            sessionStateExists: !!sessionState,
            statesMatch: state === sessionState
          });
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          return res.redirect(`${frontendUrl}/login?error=oauth_state_mismatch`);
        }
        
        console.log('✅ OAuth state validated successfully');
        
        // Clear state from session after validation
        delete req.session.oauthState;
        
        // Continue with passport authentication using custom callback to handle errors
        passport.authenticate('google', { 
          session: false // We're using JWT, not sessions for auth
        }, (err, user, info) => {
          try {
            // Handle errors from passport strategy
            if (err) {
              console.error('Google OAuth strategy error:', err.message);
              const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
              const redirectUrl = req.session?.oauthRedirect 
                ? decodeURIComponent(req.session.oauthRedirect)
                : `${frontendUrl}/auth/callback`;
              
              // Clean up session
              if (req.session) {
                delete req.session.oauthRedirect;
                delete req.session.linkAccount;
                delete req.session.linkingUserId;
                delete req.session.linkingUserUuid;
              }
              
              // Pass error message in redirect
              const errorMessage = encodeURIComponent(err.message);
              return res.redirect(`${redirectUrl}?error=account_linking_failed&message=${errorMessage}`);
            }
            
            if (!user) {
              const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
              const redirectUrl = req.session?.oauthRedirect 
                ? decodeURIComponent(req.session.oauthRedirect)
                : `${frontendUrl}/auth/callback`;
              
              // Clean up session
              if (req.session) {
                delete req.session.oauthRedirect;
                delete req.session.linkAccount;
                delete req.session.linkingUserId;
                delete req.session.linkingUserUuid;
              }
              
              const errorMessage = encodeURIComponent('Google authentication failed');
              return res.redirect(`${redirectUrl}?error=account_linking_failed&message=${errorMessage}`);
            }
            
            // Attach user to request for next middleware
            req.user = user;
            next();
          } catch (callbackError) {
            console.error('Error in Google OAuth callback handler:', callbackError);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const redirectUrl = req.session?.oauthRedirect 
              ? decodeURIComponent(req.session.oauthRedirect)
              : `${frontendUrl}/auth/callback`;
            
            const errorMessage = encodeURIComponent('Google authentication failed');
            return res.redirect(`${redirectUrl}?error=account_linking_failed&message=${errorMessage}`);
          }
        })(req, res, next);
      } catch (error) {
        console.error('Error in Google OAuth callback:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
      }
    },
    async (req, res) => {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const isLinkingAccount = req.session?.linkAccount === true;
        const linkingUserId = req.session?.linkingUserId;
        
        // If this is an account linking request, verify the user matches
        if (isLinkingAccount && linkingUserId) {
          const authenticatedUserId = req.user._id.toString();
          
          if (authenticatedUserId !== linkingUserId) {
            // Google account is already linked to a different user
            const redirectUrl = req.session?.oauthRedirect 
              ? decodeURIComponent(req.session.oauthRedirect)
              : `${frontendUrl}/auth/callback`;
            
            // Clean up session
            delete req.session.oauthRedirect;
            delete req.session.linkAccount;
            delete req.session.linkingUserId;
            delete req.session.linkingUserUuid;
            
            // Redirect with error message
            const errorMessage = encodeURIComponent('This Google account is already linked to another user account. Please use a different account.');
            res.redirect(`${redirectUrl}?error=account_already_linked&message=${errorMessage}`);
            return;
          }
          
          // User matches - account linking successful
          console.log('✅ Account linking successful for user:', req.user.uuid);
        }
        
        // Generate JWT token for the authenticated user using UUID
        const token = jwt.sign(
          { 
            userId: req.user.uuid,  // Use UUID instead of _id
            email: req.user.email, 
            username: req.user.username 
          }, 
          SECRET_KEY, 
          { expiresIn: '24h' }
        );

        // Check if we have a custom redirect URL (for account linking)
        if (req.session?.oauthRedirect) {
          const redirectUrl = decodeURIComponent(req.session.oauthRedirect);
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
          delete req.session.linkingUserId;
          delete req.session.linkingUserUuid;
          // Redirect to custom URL with token
          res.redirect(`${redirectUrl}&token=${token}`);
        } else {
          // Default redirect to auth callback
          res.redirect(`${frontendUrl}/auth/callback?token=${token}&oauth_success=true`);
        }
        
      } catch (error) {
        console.error('Google callback error:', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_auth_failed`);
      }
    }
  );
} else {
  // Google OAuth not configured - return 503 Service Unavailable
  console.log('⚠️  Google OAuth NOT configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  router.get('/google', (req, res) => {
    res.status(503).json({ error: 'Google OAuth not configured' });
  });
  
  router.get('/google/callback', (req, res) => {
    res.status(503).json({ error: 'Google OAuth not configured' });
  });
}

// SoundCloud OAuth routes - only available if configured
if (process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET) {
  router.get('/soundcloud', async (req, res, next) => {
    // Store redirect URL and link_account flag in session for account linking
    if (req.query.redirect) {
      req.session = req.session || {};
      req.session.oauthRedirect = req.query.redirect;
    }
    if (req.query.link_account === 'true') {
      req.session = req.session || {};
      req.session.linkAccount = true;
      
      // Extract current user from JWT token (if present) and store in session
      const currentUser = await extractUserFromToken(req);
      if (currentUser) {
        req.session.linkingUserId = currentUser._id;
        req.session.linkingUserUuid = currentUser.uuid;
        console.log('🔗 Account linking initiated for user:', currentUser.uuid);
      } else {
        console.warn('⚠️ Account linking requested but no valid user token found');
      }
    }
    // Ensure session exists
    if (!req.session) {
      req.session = {};
    }
    
    // Store invite code in session if provided
    if (req.query.invite) {
      req.session.pendingInviteCode = req.query.invite;
    }
    
    // Passport manages OAuth 2.1 state + PKCE code_verifier in the session
    console.log('🎵 Starting SoundCloud OAuth (OAuth 2.1 + PKCE)');
    console.log('📦 Session ID:', req.sessionID);
    
    // Save linking/invite data before passport writes PKCE state and redirects
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session:', err);
        return next(err);
      }
      
      console.log('✅ Session saved before SoundCloud OAuth redirect');
      passport.authenticate('soundcloud')(req, res, next);
    });
  });

  router.get('/soundcloud/callback', 
    (req, res, next) => {
      console.log('🎵 SoundCloud OAuth callback received:');
      console.log('📦 Session ID:', req.sessionID);
      console.log('🔐 Query state:', req.query.state || 'missing');
      console.log('📝 Session exists:', !!req.session);
      console.log('🔑 Session keys:', req.session ? Object.keys(req.session) : 'no session');

      if (req.query.error) {
        console.error('❌ SoundCloud returned OAuth error:', req.query.error, req.query.error_description);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const redirectUrl = req.session?.oauthRedirect || `${frontendUrl}/auth/callback`;
        const errorMessage = encodeURIComponent(req.query.error_description || req.query.error);
        return res.redirect(`${redirectUrl}?error=soundcloud_auth_failed&message=${errorMessage}`);
      }

      // Passport validates state + exchanges code with PKCE code_verifier
      passport.authenticate('soundcloud', { 
        session: false 
      }, (err, user, info) => {
          try {
            if (err) {
              console.error('❌ SoundCloud OAuth authentication error:', err);
              console.error('Error type:', err.constructor.name);
              console.error('Error message:', err.message);
              if (err.oauthError) {
                console.error('OAuth error details:', err.oauthError);
                console.error('OAuth error status:', err.oauthError.statusCode);
                console.error('OAuth error data:', err.oauthError.data);
              }
              
              const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
              const redirectUrl = req.session?.oauthRedirect || `${frontendUrl}/auth/callback`;
              
              if (req.session) {
                delete req.session.oauthRedirect;
                delete req.session.linkAccount;
                delete req.session.linkingUserId;
                delete req.session.linkingUserUuid;
              }
              
              const errorMessage = encodeURIComponent(
                /failed to fetch user profile/i.test(String(err.message || ''))
                  ? 'Couldn’t finish connecting SoundCloud — SoundCloud rejected the account lookup after you authorized. Please try again.'
                  : (err.message || 'SoundCloud authentication failed')
              );
              return res.redirect(`${redirectUrl}?error=account_linking_failed&message=${errorMessage}`);
            }
            
            if (!user) {
              console.error('❌ SoundCloud OAuth - no user returned');
              console.error('Info:', info);
              const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
              const redirectUrl = req.session?.oauthRedirect || `${frontendUrl}/auth/callback`;
              
              if (req.session) {
                delete req.session.oauthRedirect;
                delete req.session.linkAccount;
                delete req.session.linkingUserId;
                delete req.session.linkingUserUuid;
              }

              const infoMessage = typeof info === 'string'
                ? info
                : (info?.message || 'SoundCloud authentication failed');
              return res.redirect(`${redirectUrl}?error=soundcloud_auth_failed&message=${encodeURIComponent(infoMessage)}`);
            }
            
            req.user = user;
            next();
          } catch (callbackError) {
            console.error('Error in SoundCloud OAuth callback handler:', callbackError);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const redirectUrl = req.session?.oauthRedirect || `${frontendUrl}/auth/callback`;
            
            if (req.session) {
              delete req.session.oauthRedirect;
              delete req.session.linkAccount;
              delete req.session.linkingUserId;
              delete req.session.linkingUserUuid;
            }
            
            return res.redirect(`${redirectUrl}?error=soundcloud_auth_failed`);
          }
        })(req, res, next);
    },
    async (req, res) => {
      try {
        console.log('🎵 SoundCloud OAuth callback - user:', req.user?.username);
        
        if (!req.user) {
          console.error('❌ No user in SoundCloud callback');
          return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=no_user`);
        }
        
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const isLinkingAccount = req.session?.linkAccount === true;
        const linkingUserId = req.session?.linkingUserId;
        
        // If this is an account linking request, verify the user matches
        if (isLinkingAccount && linkingUserId) {
          const authenticatedUserId = req.user._id.toString();
          
          if (authenticatedUserId !== linkingUserId) {
            const redirectUrl = req.session?.oauthRedirect || `${frontendUrl}/auth/callback`;
            
            delete req.session.oauthRedirect;
            delete req.session.linkAccount;
            delete req.session.linkingUserId;
            delete req.session.linkingUserUuid;
            
            const errorMessage = encodeURIComponent('This SoundCloud account is already linked to another user account. Please use a different account.');
            res.redirect(`${redirectUrl}?error=account_already_linked&message=${errorMessage}`);
            return;
          }
          
          console.log('✅ Account linking successful for user:', req.user.uuid);
        }
        
        const token = jwt.sign(
          { 
            userId: req.user.uuid,
            email: req.user.email, 
            username: req.user.username 
          }, 
          SECRET_KEY, 
          { expiresIn: '24h' }
        );

        if (req.session?.oauthRedirect) {
          // Express already decodes query params once — do not decodeURIComponent again
          // or nested returnUrl values (%2Fimport%3F...) get corrupted.
          const redirectUrl = req.session.oauthRedirect;
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
          delete req.session.linkingUserId;
          delete req.session.linkingUserUuid;
          const sep = redirectUrl.includes('?') ? '&' : '?';
          res.redirect(`${redirectUrl}${sep}token=${encodeURIComponent(token)}`);
        } else {
          console.log('✅ Redirecting to:', `${frontendUrl}/auth/callback?token=${token.substring(0, 20)}...`);
          res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}&oauth_success=true`);
        }
        
      } catch (error) {
        console.error('❌ SoundCloud callback error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const redirectUrl = req.session?.oauthRedirect || `${frontendUrl}/auth/callback`;
        
        delete req.session?.oauthRedirect;
        delete req.session?.linkAccount;
        delete req.session?.linkingUserId;
        delete req.session?.linkingUserUuid;
        
        const errorMessage = encodeURIComponent(error.message || 'SoundCloud authentication failed');
        res.redirect(`${redirectUrl}?error=soundcloud_auth_failed&message=${errorMessage}`);
      }
    }
  );
} else {
  // SoundCloud OAuth not configured - return 503 Service Unavailable
  router.get('/soundcloud', (req, res) => {
    res.status(503).json({ error: 'SoundCloud OAuth not configured' });
  });
  
  router.get('/soundcloud/callback', (req, res) => {
    res.status(503).json({ error: 'SoundCloud OAuth not configured' });
  });
}

// Instagram OAuth routes - only available if configured
if (process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET) {
  router.get('/instagram', async (req, res, next) => {
    console.log('📸 Instagram OAuth initiation');
    console.log('📦 Callback URL:', process.env.INSTAGRAM_CALLBACK_URL || "http://localhost:8000/api/auth/instagram/callback");
    
    // Store invite code in session if provided
    if (req.query.invite) {
      req.session = req.session || {};
      req.session.pendingInviteCode = req.query.invite;
    }
    // Store redirect URL and link_account flag in session for account linking
    if (req.query.redirect) {
      req.session = req.session || {};
      req.session.oauthRedirect = req.query.redirect;
      console.log('🔗 Custom redirect URL stored:', req.query.redirect);
    }
    if (req.query.link_account === 'true') {
      req.session = req.session || {};
      req.session.linkAccount = true;
      
      // Extract current user from JWT token (if present) and store in session
      const currentUser = await extractUserFromToken(req);
      if (currentUser) {
        req.session.linkingUserId = currentUser._id;
        req.session.linkingUserUuid = currentUser.uuid;
        console.log('🔗 Account linking initiated for user:', currentUser.uuid);
      } else {
        console.warn('⚠️ Account linking requested but no valid user token found');
      }
    }
    
    // Ensure session is saved before redirect
    if (req.session) {
      req.session.save((err) => {
        if (err) {
          console.error('❌ Error saving session:', err);
          return next(err);
        }
        console.log('✅ Session saved, redirecting to Instagram OAuth');
        passport.authenticate('instagram', { 
          scope: ['user_profile', 'user_media'] 
        })(req, res, next);
      });
    } else {
      passport.authenticate('instagram', { 
        scope: ['user_profile', 'user_media'] 
      })(req, res, next);
    }
  });

  router.get('/instagram/callback', 
    (req, res, next) => {
      console.log('📸 Instagram OAuth callback received');
      console.log('📦 Query params:', req.query);
      console.log('📦 Session ID:', req.sessionID);
      console.log('📦 Session exists:', !!req.session);
      
      try {
        passport.authenticate('instagram', { 
          session: false // We're using JWT, not sessions for auth
        }, (err, user, info) => {
          try {
            // Handle errors from passport strategy
            if (err) {
              console.error('Instagram OAuth strategy error:', err.message);
              const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
              const redirectUrl = req.session?.oauthRedirect 
                ? decodeURIComponent(req.session.oauthRedirect)
                : `${frontendUrl}/auth/callback`;
              
              // Clean up session
              if (req.session) {
                delete req.session.oauthRedirect;
                delete req.session.linkAccount;
                delete req.session.linkingUserId;
                delete req.session.linkingUserUuid;
              }
              
              // Pass error message in redirect
              const errorMessage = encodeURIComponent(err.message);
              return res.redirect(`${redirectUrl}?error=account_linking_failed&message=${errorMessage}`);
            }
            
            // Handle case where no user is returned (authentication failed)
            if (!user) {
              console.error('Instagram OAuth authentication failed - no user returned');
              const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
              const redirectUrl = req.session?.oauthRedirect 
                ? decodeURIComponent(req.session.oauthRedirect)
                : `${frontendUrl}/auth/callback`;
              
              // Clean up session
              if (req.session) {
                delete req.session.oauthRedirect;
                delete req.session.linkAccount;
                delete req.session.linkingUserId;
                delete req.session.linkingUserUuid;
              }
              
              return res.redirect(`${redirectUrl}?error=instagram_auth_failed`);
            }
            
            // Success - attach user to request and continue
            req.user = user;
            next();
          } catch (callbackError) {
            console.error('Error in Instagram OAuth callback handler:', callbackError);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const redirectUrl = req.session?.oauthRedirect 
              ? decodeURIComponent(req.session.oauthRedirect)
              : `${frontendUrl}/auth/callback`;
            
            // Clean up session
            if (req.session) {
              delete req.session.oauthRedirect;
              delete req.session.linkAccount;
              delete req.session.linkingUserId;
              delete req.session.linkingUserUuid;
            }
            
            return res.redirect(`${redirectUrl}?error=instagram_auth_failed`);
          }
        })(req, res, next);
      } catch (authError) {
        console.error('Error in passport.authenticate call:', authError);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const redirectUrl = req.session?.oauthRedirect 
          ? decodeURIComponent(req.session.oauthRedirect)
          : `${frontendUrl}/auth/callback`;
        
        // Clean up session
        if (req.session) {
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
          delete req.session.linkingUserId;
          delete req.session.linkingUserUuid;
        }
        
        const errorMessage = authError.message 
          ? encodeURIComponent(authError.message)
          : 'Instagram authentication failed';
        return res.redirect(`${redirectUrl}?error=account_linking_failed&message=${errorMessage}`);
      }
    },
    async (req, res) => {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const isLinkingAccount = req.session?.linkAccount === true;
        const linkingUserId = req.session?.linkingUserId;
        
        // If this is an account linking request, verify the user matches
        if (isLinkingAccount && linkingUserId) {
          const authenticatedUserId = req.user._id.toString();
          
          if (authenticatedUserId !== linkingUserId) {
            // Instagram account is already linked to a different user
            const redirectUrl = req.session?.oauthRedirect 
              ? decodeURIComponent(req.session.oauthRedirect)
              : `${frontendUrl}/auth/callback`;
            
            // Clean up session
            delete req.session.oauthRedirect;
            delete req.session.linkAccount;
            delete req.session.linkingUserId;
            delete req.session.linkingUserUuid;
            
            // Redirect with error message
            const errorMessage = encodeURIComponent('This Instagram account is already linked to another user account. Please use a different account.');
            res.redirect(`${redirectUrl}?error=account_already_linked&message=${errorMessage}`);
            return;
          }
          
          // User matches - account linking successful
          console.log('✅ Account linking successful for user:', req.user.uuid);
        }
        
        // Generate JWT token for the authenticated user using UUID
        const token = jwt.sign(
          { 
            userId: req.user.uuid,  // Use UUID instead of _id
            email: req.user.email, 
            username: req.user.username 
          }, 
          SECRET_KEY, 
          { expiresIn: '24h' }
        );

        // Check if we have a custom redirect URL (for account linking)
        if (req.session?.oauthRedirect) {
          const redirectUrl = decodeURIComponent(req.session.oauthRedirect);
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
          delete req.session.linkingUserId;
          delete req.session.linkingUserUuid;
          // Redirect to custom URL with token
          res.redirect(`${redirectUrl}&token=${token}`);
        } else {
          // Default redirect to auth callback
          res.redirect(`${frontendUrl}/auth/callback?token=${token}&oauth_success=true`);
        }
        
      } catch (error) {
        console.error('Instagram callback error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const redirectUrl = req.session?.oauthRedirect 
          ? decodeURIComponent(req.session.oauthRedirect)
          : `${frontendUrl}/auth/callback`;
        
        // Clean up session
        delete req.session?.oauthRedirect;
        delete req.session?.linkAccount;
        delete req.session?.linkingUserId;
        delete req.session?.linkingUserUuid;
        
        res.redirect(`${redirectUrl}?error=instagram_auth_failed`);
      }
    }
  );
} else {
  // Instagram OAuth not configured - return 503 Service Unavailable
  router.get('/instagram', (req, res) => {
    res.status(503).json({ error: 'Instagram OAuth not configured' });
  });
  
  router.get('/instagram/callback', (req, res) => {
    res.status(503).json({ error: 'Instagram OAuth not configured' });
  });
}

// Spotify OAuth routes (for podcast import - link_account only)
// Callback host MUST match OAuth start host (tuneable.stream/api → same-site session cookie).
if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
  router.get('/spotify', async (req, res, next) => {
    if (req.query.redirect) {
      req.session = req.session || {};
      req.session.oauthRedirect = req.query.redirect;
    }
    if (req.query.link_account === 'true') {
      req.session = req.session || {};
      req.session.linkAccount = true;
      const currentUser = await extractUserFromToken(req);
      if (currentUser) {
        req.session.linkingUserId = currentUser._id;
        req.session.linkingUserUuid = currentUser.uuid;
      } else {
        console.warn('⚠️ Spotify link requested but no valid user token found');
      }
    }
    // Persist session before redirecting to Spotify (required for account linking)
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Spotify OAuth session save failed:', saveErr);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(appendQueryParams(
          typeof req.query.redirect === 'string'
            ? req.query.redirect
            : `${frontendUrl}/auth/callback`,
          { error: 'spotify_auth_failed', message: 'Session could not be started' }
        ));
      }
      passport.authenticate('spotify', {
        scope: ['user-library-read'],
        showDialog: false
      })(req, res, next);
    });
  });

  router.get('/spotify/callback',
    (req, res, next) => {
      passport.authenticate('spotify', { session: false }, (err, user) => {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        // Express already decodes query params once — do not decodeURIComponent again
        // or nested returnUrl values (%2Fonboarding%3Fstep%3Dimport%26source%3Dspotify) get corrupted.
        const baseRedirect = req.session?.oauthRedirect || `${frontendUrl}/auth/callback`;
        const clearSpotifySession = () => {
          if (!req.session) return;
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
          delete req.session.linkingUserId;
          delete req.session.linkingUserUuid;
        };
        if (err) {
          // err.oauthError carries the raw Spotify API response (e.g. 403
          // "User not registered in the Developer Dashboard" in dev mode)
          console.error('❌ Spotify OAuth callback error:', err.message);
          if (err.oauthError) {
            console.error(
              '   Spotify API response:',
              err.oauthError.statusCode,
              err.oauthError.data
            );
          }
          clearSpotifySession();
          return res.redirect(appendQueryParams(baseRedirect, {
            error: 'spotify_auth_failed',
            message: formatSpotifyOAuthError(err)
          }));
        }
        if (!user) {
          console.error('❌ Spotify OAuth callback returned no user (auth denied or session lost)');
          clearSpotifySession();
          return res.redirect(appendQueryParams(baseRedirect, {
            error: 'spotify_auth_failed',
            message: 'Spotify connection failed — authorization was denied or your session was lost. Please try Connect Spotify again while logged in.'
          }));
        }
        req.user = user;
        next();
      })(req, res, next);
    },
    async (req, res) => {
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const token = jwt.sign(
          { userId: req.user.uuid, email: req.user.email, username: req.user.username },
          SECRET_KEY,
          { expiresIn: '24h' }
        );
        const baseRedirect = req.session?.oauthRedirect || `${frontendUrl}/auth/callback`;
        if (req.session) {
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
          delete req.session.linkingUserId;
          delete req.session.linkingUserUuid;
        }
        res.redirect(appendQueryParams(baseRedirect, {
          token,
          oauth_success: 'true'
        }));
      } catch (error) {
        console.error('Spotify callback error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(appendQueryParams(`${frontendUrl}/auth/callback`, {
          error: 'spotify_auth_failed',
          message: 'Spotify connected, but Tuneable couldn’t finish signing you in. Please try again.'
        }));
      }
    }
  );
} else {
  router.get('/spotify', (req, res) => res.status(503).json({ error: 'Spotify OAuth not configured' }));
  router.get('/spotify/callback', (req, res) => res.status(503).json({ error: 'Spotify OAuth not configured' }));
}

// Token refresh endpoint
router.post('/refresh', authMiddleware, async (req, res) => {
  try {
    // User is already authenticated via authMiddleware
    // Generate a new token with fresh expiry using UUID
    const newToken = jwt.sign(
      { 
        userId: req.user.uuid,  // Use UUID instead of _id
        email: req.user.email, 
        username: req.user.username 
      },
      SECRET_KEY,
      { expiresIn: '24h' }
    );

    res.json({ 
      message: 'Token refreshed successfully',
      token: newToken 
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * Sign in with Apple (native identity token).
 * Body: { identityToken, invite?, fullName?: { givenName, familyName }, email? }
 * Existing Apple users log in. New users may optionally pass an invite for attribution.
 */
router.post('/apple', async (req, res) => {
  try {
    const { verifyAppleIdentityToken } = require('../services/appleSignInService');
    const { generateUniqueOAuthUsername } = require('../utils/oauthUsername');
    const { giveBetaSignupCredit } = require('../utils/betaCreditHelper');
    const { resolveInviteForSignup, applyInviteUsage } = require('../utils/inviteSignup');

    const { identityToken, invite, fullName, email: clientEmail } = req.body || {};
    const verified = await verifyAppleIdentityToken(identityToken);
    const appleId = verified.appleId;
    const email =
      verified.email ||
      (typeof clientEmail === 'string' && clientEmail.trim()
        ? clientEmail.trim()
        : null);

    let user = await User.findOne({ appleId });

    if (!user && email) {
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const byEmail = await User.findOne({
        email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
      });
      if (byEmail) {
        if (byEmail.appleId && byEmail.appleId !== appleId) {
          return res.status(409).json({
            error: 'This email is linked to a different Apple account',
          });
        }
        byEmail.appleId = appleId;
        byEmail.oauthVerified = byEmail.oauthVerified || {};
        byEmail.oauthVerified.apple = true;
        if (verified.emailVerified) byEmail.emailVerified = true;
        byEmail.lastLoginAt = new Date();
        await byEmail.save();
        user = byEmail;
      }
    }

    if (user) {
      if (!user.isActive) {
        return res.status(401).json({
          error: 'Account is inactive. Please contact support.',
        });
      }
      user.appleId = appleId;
      user.oauthVerified = user.oauthVerified || {};
      user.oauthVerified.apple = true;
      if (fullName?.givenName && !user.givenName) {
        user.givenName = fullName.givenName;
      }
      if (fullName?.familyName && !user.familyName) {
        user.familyName = fullName.familyName;
      }
      user.lastLoginAt = new Date();
      await user.save();

      const token = jwt.sign(
        { userId: user.uuid, email: user.email, username: user.username },
        SECRET_KEY,
        { expiresIn: '24h' }
      );
      return res.json({ message: 'Login successful!', token, user });
    }

    // New user — invite optional (attribution when provided)
    const inviteResult = await resolveInviteForSignup(invite);
    if (!inviteResult.ok) {
      return res.status(400).json({ error: inviteResult.error });
    }
    const {
      code: inviteCode,
      inviter,
      inviteCodeObj,
      isInviterAdmin,
    } = inviteResult;

    const givenName = fullName?.givenName || null;
    const familyName = fullName?.familyName || null;
    const username = await generateUniqueOAuthUsername({
      profile: {
        id: appleId,
        name: { givenName, familyName },
        displayName: [givenName, familyName].filter(Boolean).join(' ') || null,
      },
      email,
      provider: 'apple',
    });

    const generateInviteCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = '';
      for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };
    const newInviteCode = generateInviteCode();

    user = new User({
      appleId,
      email: email || undefined,
      username,
      givenName: givenName || '',
      familyName: familyName || '',
      isActive: true,
      role: ['user'],
      balance: 0,
      personalInviteCode: newInviteCode,
      personalInviteCodes: [
        {
          code: newInviteCode,
          isActive: true,
          label: 'Primary',
          createdAt: new Date(),
          usageCount: 0,
        },
      ],
      parentInviteCode: inviteCode || undefined,
      parentInviteCodeId:
        inviteCodeObj && inviteCodeObj._id ? inviteCodeObj._id : undefined,
      oauthVerified: {
        apple: true,
        google: false,
        facebook: false,
        instagram: false,
        soundcloud: false,
        spotify: false,
      },
      emailVerified: Boolean(verified.emailVerified && email),
      lastLoginAt: new Date(),
    });
    await user.save();

    await applyInviteUsage({
      inviter,
      inviteCodeObj,
      code: inviteCode,
      isInviterAdmin,
    });

    try {
      await giveBetaSignupCredit(user);
    } catch (betaCreditError) {
      console.error('Failed to give beta signup credit:', betaCreditError);
    }

    try {
      const Party = require('../models/Party');
      await Party.joinUserToGlobalParty(user);
    } catch (globalPartyError) {
      console.error('Failed to auto-join Apple user to Global Party:', globalPartyError);
    }

    const token = jwt.sign(
      { userId: user.uuid, email: user.email, username: user.username },
      SECRET_KEY,
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      message: 'User registered successfully',
      token,
      user,
    });
  } catch (error) {
    console.error('Apple Sign In error:', error);
    const status = error.status || 500;
    return res.status(status).json({
      error: error.message || 'Apple Sign In failed',
    });
  }
});

module.exports = router;
