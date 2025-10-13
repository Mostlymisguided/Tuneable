const express = require('express');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || 'JWT Secret failed to fly';

// Facebook OAuth routes - only available if configured
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  router.get('/facebook', passport.authenticate('facebook', { 
    scope: ['email', 'user_location'] 
  }));

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
        res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
        
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
  router.get('/google', passport.authenticate('google', { 
    scope: [
      'profile', 
      'email',
      'https://www.googleapis.com/auth/youtube.readonly'  // For YouTube import feature
    ] 
  }));

  router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' }),
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
        res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
        
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
