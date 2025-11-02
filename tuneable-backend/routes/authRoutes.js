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

        // Redirect to frontend with ONLY the token (security improvement)
        // Frontend will fetch user data using the token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/auth/callback?token=${token}&oauth_success=true`);
        
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
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  router.get('/google', (req, res, next) => {
    // Store invite code in session if provided
    if (req.query.invite) {
      req.session = req.session || {};
      req.session.pendingInviteCode = req.query.invite;
    }
    
    // Generate random state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    req.session = req.session || {};
    req.session.oauthState = state;
    
    passport.authenticate('google', { 
      scope: [
        'profile', 
        'email',
        'https://www.googleapis.com/auth/youtube.readonly'  // For YouTube import feature
      ],
      state: state  // Pass state parameter for security
    })(req, res, next);
  });

  router.get('/google/callback', 
    (req, res, next) => {
      // Validate state parameter for CSRF protection
      const state = req.query.state;
      const sessionState = req.session?.oauthState;
      
      if (!state || !sessionState || state !== sessionState) {
        console.error('Invalid OAuth state parameter - possible CSRF attack');
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/login?error=oauth_state_mismatch`);
      }
      
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

        // Redirect to frontend with ONLY the token (security improvement)
        // Frontend will fetch user data using the token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/auth/callback?token=${token}&oauth_success=true`);
        
      } catch (error) {
        console.error('Google callback error:', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=google_auth_failed`);
      }
    }
  );
} else {
  // Google OAuth not configured - return 503 Service Unavailable
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
    // Store invite code in session if provided
    if (req.query.invite) {
      req.session = req.session || {};
      req.session.pendingInviteCode = req.query.invite;
    }
    passport.authenticate('soundcloud')(req, res, next);
  });

  router.get('/soundcloud/callback', 
    passport.authenticate('soundcloud', { failureRedirect: '/login?error=soundcloud_auth_failed' }),
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

        // Redirect to frontend with ONLY the token (security improvement)
        // Frontend will fetch user data using the token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        console.log('✅ Redirecting to:', `${frontendUrl}/auth/callback?token=${token.substring(0, 20)}...`);
        res.redirect(`${frontendUrl}/auth/callback?token=${token}&oauth_success=true`);
        
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

        // Redirect to frontend with ONLY the token (security improvement)
        // Frontend will fetch user data using the token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/auth/callback?token=${token}&oauth_success=true`);
        
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
