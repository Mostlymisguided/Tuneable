const express = require('express');
const spotifyService = require('../services/spotifyService');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Exchange authorization code for access token
router.post('/token', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code || !redirectUri) {
      return res.status(400).json({ 
        error: 'Authorization code and redirect URI are required' 
      });
    }

    const tokenData = await spotifyService.getAccessToken(code, redirectUri);
    
    res.json({
      success: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type
    });
  } catch (error) {
    console.error('Error exchanging Spotify token:', error);
    res.status(500).json({ 
      error: 'Failed to exchange authorization code for access token',
      details: error.message 
    });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ 
        error: 'Refresh token is required' 
      });
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const tokenData = await response.json();
    
    res.json({
      success: true,
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type
    });
  } catch (error) {
    console.error('Error refreshing Spotify token:', error);
    res.status(500).json({ 
      error: 'Failed to refresh access token',
      details: error.message 
    });
  }
});

// Get user's Spotify profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const { accessToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({ 
        error: 'Access token is required' 
      });
    }

    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to get user profile');
    }

    const profile = await response.json();
    
    res.json({
      success: true,
      profile: {
        id: profile.id,
        display_name: profile.display_name,
        email: profile.email,
        country: profile.country,
        product: profile.product, // free, premium, etc.
        images: profile.images
      }
    });
  } catch (error) {
    console.error('Error getting Spotify profile:', error);
    res.status(500).json({ 
      error: 'Failed to get user profile',
      details: error.message 
    });
  }
});

module.exports = router;
