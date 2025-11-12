const express = require('express');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || 'JWT Secret failed to fly';

// Facebook OAuth routes - only available if configured
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  router.get('/facebook', (req, res, next) => {
    // Store invite code in session if provided
    if (req.query.invite) {
      req.session = req.session || {};
      req.session.pendingInviteCode = req.query.invite;
    }
    // Store redirect URL and link_account flag in session for account linking
    if (req.query.redirect) {
      req.session = req.session || {};
      req.session.oauthRedirect = req.query.redirect;
    }
    if (req.query.link_account === 'true') {
      req.session = req.session || {};
      req.session.linkAccount = true;
    }
    passport.authenticate('facebook', { 
      scope: ['email'] 
    })(req, res, next);
  });

  router.get('/facebook/callback', 
    passport.authenticate('facebook', { failureRedirect: '/login?error=facebook_auth_failed' }),
    async (req, res) => {
      try {
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
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        if (req.session?.oauthRedirect) {
          const redirectUrl = decodeURIComponent(req.session.oauthRedirect);
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
          // Redirect to custom URL with token
          res.redirect(`${redirectUrl}&token=${token}`);
        } else {
          // Default redirect to auth callback
          res.redirect(`${frontendUrl}/auth/callback?token=${token}&oauth_success=true`);
        }
        
      } catch (error) {
        console.error('Facebook callback error:', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=facebook_auth_failed`);
      }
    }
  );
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
  router.get('/google', (req, res, next) => {
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
      // Validate state parameter for CSRF protection
      const state = req.query.state;
      const sessionState = req.session?.oauthState;
      
      // Enhanced debugging
      console.log('🔍 OAuth callback received:');
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
      
      // Continue with passport authentication
      passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' })(req, res, next);
    },
    async (req, res) => {
      try {
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
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        if (req.session?.oauthRedirect) {
          const redirectUrl = decodeURIComponent(req.session.oauthRedirect);
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
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
  router.get('/soundcloud', (req, res, next) => {
    // Store redirect URL and link_account flag in session for account linking
    if (req.query.redirect) {
      req.session = req.session || {};
      req.session.oauthRedirect = req.query.redirect;
    }
    if (req.query.link_account === 'true') {
      req.session = req.session || {};
      req.session.linkAccount = true;
    }
    // Ensure session exists
    if (!req.session) {
      req.session = {};
    }
    
    // Store invite code in session if provided
    if (req.query.invite) {
      req.session.pendingInviteCode = req.query.invite;
    }
    
    // Generate random state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    req.session.oauthState = state;
    
    // Debug logging
    console.log('🎵 Generated SoundCloud OAuth state:', state);
    console.log('📦 Session ID:', req.sessionID);
    
    // Save session explicitly before redirect
    req.session.save((err) => {
      if (err) {
        console.error('❌ Error saving session:', err);
        return next(err);
      }
      
      console.log('✅ Session saved with SoundCloud OAuth state');
      
      // Note: SoundCloud OAuth may not support state parameter natively
      // We're storing it in session for validation, but SoundCloud may not return it
      passport.authenticate('soundcloud', {
        // If SoundCloud strategy supports state, pass it here
      })(req, res, next);
    });
  });

  router.get('/soundcloud/callback', 
    (req, res, next) => {
      // Validate state parameter for CSRF protection (if SoundCloud returns it)
      // Note: SoundCloud may not support state parameter, so we'll check if it exists
      const state = req.query.state;
      const sessionState = req.session?.oauthState;
      
      // Enhanced debugging
      console.log('🎵 SoundCloud OAuth callback received:');
      console.log('📦 Session ID:', req.sessionID);
      console.log('🔐 Query state:', state || 'not provided by SoundCloud');
      console.log('💾 Session state:', sessionState || 'undefined');
      console.log('📝 Session exists:', !!req.session);
      console.log('🔑 Session keys:', req.session ? Object.keys(req.session) : 'no session');
      
      // If state is provided by SoundCloud, validate it
      // Otherwise, just check that session exists (SoundCloud may not support state)
      if (state && sessionState && state !== sessionState) {
        console.error('❌ Invalid SoundCloud OAuth state parameter - possible CSRF attack');
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
      
      // If state was set, validate session exists
      if (sessionState && !req.session) {
        console.error('❌ SoundCloud OAuth callback - no session found');
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/login?error=oauth_session_missing`);
      }
      
      if (state && sessionState && state === sessionState) {
        console.log('✅ SoundCloud OAuth state validated successfully');
      } else if (!state) {
        console.log('⚠️  SoundCloud OAuth - state not provided by SoundCloud (may not be supported)');
      }
      
      // Clear state from session after validation
      if (req.session && req.session.oauthState) {
        delete req.session.oauthState;
      }
      
      // Continue with passport authentication
      // Add error handler to catch and log detailed errors
      passport.authenticate('soundcloud', { 
        failureRedirect: '/login?error=soundcloud_auth_failed',
        session: false 
      }, (err, user, info) => {
        // Custom callback for error handling
        if (err) {
          console.error('❌ SoundCloud OAuth authentication error:', err);
          console.error('Error type:', err.constructor.name);
          console.error('Error message:', err.message);
          console.error('Error stack:', err.stack);
          
          // Check if it's an OAuth error
          if (err.oauthError) {
            console.error('OAuth error details:', err.oauthError);
            console.error('OAuth error status:', err.oauthError.statusCode);
            console.error('OAuth error data:', err.oauthError.data);
          }
          
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          return res.redirect(`${frontendUrl}/login?error=soundcloud_auth_failed&details=${encodeURIComponent(err.message)}`);
        }
        
        if (!user) {
          console.error('❌ SoundCloud OAuth - no user returned');
          console.error('Info:', info);
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          return res.redirect(`${frontendUrl}/login?error=soundcloud_auth_failed&reason=no_user`);
        }
        
        // Success - user authenticated
        req.user = user;
        next();
      })(req, res, next);
    },
    async (req, res) => {
      try {
        console.log('🎵 SoundCloud OAuth callback - user:', req.user?.username);
        
        if (!req.user) {
          console.error('❌ No user in SoundCloud callback');
          return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=no_user`);
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
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        if (req.session?.oauthRedirect) {
          const redirectUrl = decodeURIComponent(req.session.oauthRedirect);
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
          // Redirect to custom URL with token
          res.redirect(`${redirectUrl}&token=${token}`);
        } else {
          // Default redirect to auth callback
          console.log('✅ Redirecting to:', `${frontendUrl}/auth/callback?token=${token.substring(0, 20)}...`);
          res.redirect(`${frontendUrl}/auth/callback?token=${token}&oauth_success=true`);
        }
        
      } catch (error) {
        console.error('❌ SoundCloud callback error:', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=soundcloud_auth_failed`);
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
  router.get('/instagram', (req, res, next) => {
    // Store invite code in session if provided
    if (req.query.invite) {
      req.session = req.session || {};
      req.session.pendingInviteCode = req.query.invite;
    }
    // Store redirect URL and link_account flag in session for account linking
    if (req.query.redirect) {
      req.session = req.session || {};
      req.session.oauthRedirect = req.query.redirect;
    }
    if (req.query.link_account === 'true') {
      req.session = req.session || {};
      req.session.linkAccount = true;
    }
    passport.authenticate('instagram', { 
      scope: ['user_profile', 'user_media'] 
    })(req, res, next);
  });

  router.get('/instagram/callback', 
    passport.authenticate('instagram', { failureRedirect: '/login?error=instagram_auth_failed' }),
    async (req, res) => {
      try {
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
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        if (req.session?.oauthRedirect) {
          const redirectUrl = decodeURIComponent(req.session.oauthRedirect);
          delete req.session.oauthRedirect;
          delete req.session.linkAccount;
          // Redirect to custom URL with token
          res.redirect(`${redirectUrl}&token=${token}`);
        } else {
          // Default redirect to auth callback
          res.redirect(`${frontendUrl}/auth/callback?token=${token}&oauth_success=true`);
        }
        
      } catch (error) {
        console.error('Instagram callback error:', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=instagram_auth_failed`);
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

module.exports = router;
