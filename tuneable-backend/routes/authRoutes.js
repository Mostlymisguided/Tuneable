const express = require('express');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
        // Generate JWT token for the authenticated user
        const token = jwt.sign(
          { 
            userId: req.user._id, 
            email: req.user.email, 
            username: req.user.username 
          }, 
          SECRET_KEY, 
          { expiresIn: '24h' }
        );

        // Redirect to frontend with token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify({
          _id: req.user._id,
          username: req.user.username,
          email: req.user.email,
          profilePic: req.user.profilePic
        }))}`);
        
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

// Google OAuth routes (for future implementation)
router.get('/google', (req, res) => {
  // For now, redirect to frontend with a message
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/login?message=google_coming_soon`);
});

router.get('/google/callback', (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/login?message=google_coming_soon`);
});

module.exports = router;
