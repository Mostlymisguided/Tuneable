const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const User = require('../models/User');
const { bulkImportLikedVideos, estimateQuotaUsage } = require('../services/youtubeLikedImport');

// ========== Client-facing routes (auth required, creator required for import) ==========

/**
 * Check if user has YouTube connected (auth required)
 */
router.get('/client/status', authMiddleware, (req, res) => {
    try {
        const connected = !!req.user.googleAccessToken;
        res.json({ success: true, connected });
    } catch (error) {
        console.error('Error checking YouTube status:', error);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

/**
 * Get YouTube OAuth URL for client (auth required)
 * Saves userId + state in session for callback
 */
router.get('/client/oauth-url', authMiddleware, (req, res) => {
    try {
        const clientId = process.env.YOUTUBE_CLIENT_ID;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const redirectUri = process.env.YOUTUBE_REDIRECT_URI || `${frontendUrl}/api/youtube-import/oauth/callback`;

        if (!clientId) {
            return res.status(503).json({
                error: 'YouTube OAuth not configured. Missing YOUTUBE_CLIENT_ID environment variable.'
            });
        }

        const state = crypto.randomBytes(24).toString('hex');
        req.session.youtubeImportState = state;
        req.session.youtubeImportUserId = req.user._id.toString();
        req.session.youtubeImportRedirect = process.env.FRONTEND_URL || 'http://localhost:5173';

        const scope = 'https://www.googleapis.com/auth/youtube.readonly';
        const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${clientId}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `scope=${encodeURIComponent(scope)}&` +
            `response_type=code&` +
            `access_type=offline&` +
            `prompt=consent&` +
            `state=${state}`;

        res.json({
            success: true,
            oauthUrl,
            scope: 'Read access to YouTube liked videos'
        });
    } catch (error) {
        console.error('Error generating OAuth URL:', error);
        res.status(500).json({ error: 'Failed to generate OAuth URL' });
    }
});

/**
 * OAuth callback - receives redirect from Google (NO auth middleware)
 * Exchanges code for tokens, saves to user, redirects to frontend
 */
router.get('/oauth/callback', async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const successRedirect = `${frontendUrl}/creator/import-youtube?youtube=connected`;
    const errorRedirect = `${frontendUrl}/creator/import-youtube?youtube=error`;

    try {
        const { code, state } = req.query;
        if (!code || !state) {
            return res.redirect(`${errorRedirect}&message=missing_params`);
        }
        if (!req.session || state !== req.session.youtubeImportState) {
            return res.redirect(`${errorRedirect}&message=invalid_state`);
        }

        const userId = req.session.youtubeImportUserId;
        if (!userId) {
            return res.redirect(`${errorRedirect}&message=session_expired`);
        }

        const clientId = process.env.YOUTUBE_CLIENT_ID;
        const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const redirectUri = process.env.YOUTUBE_REDIRECT_URI || `${frontendUrl}/api/youtube-import/oauth/callback`;

        if (!clientId || !clientSecret) {
            return res.redirect(`${errorRedirect}&message=config_error`);
        }

        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code'
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

        const { access_token, refresh_token } = tokenResponse.data;
        const user = await User.findById(userId);
        if (!user) {
            return res.redirect(`${errorRedirect}&message=user_not_found`);
        }

        user.googleAccessToken = access_token;
        if (refresh_token) user.googleRefreshToken = refresh_token;
        await user.save();

        delete req.session.youtubeImportState;
        delete req.session.youtubeImportUserId;
        delete req.session.youtubeImportRedirect;

        return res.redirect(successRedirect);
    } catch (error) {
        console.error('YouTube OAuth callback error:', error);
        return res.redirect(`${errorRedirect}&message=exchange_failed`);
    }
});

/**
 * Client: Estimate quota usage
 */
router.get('/client/liked-videos/estimate', authMiddleware, async (req, res) => {
    try {
        const { maxVideos = 100 } = req.query;
        const estimate = estimateQuotaUsage(parseInt(maxVideos));
        res.json({
            success: true,
            estimate,
            recommendations: {
                maxSafeImport: estimate.total < 8000 ? 'You can safely import this amount' : 'Consider reducing the number of videos',
                quotaReset: 'Quota resets 24 hours after your first API call today',
                musicOnly: 'Only music category videos will be imported'
            }
        });
    } catch (error) {
        console.error('Error estimating quota:', error);
        res.status(500).json({ error: 'Failed to estimate quota usage' });
    }
});

/**
 * Client: Bulk import liked music videos (auth + creator required)
 */
router.post('/client/liked-videos/import', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.role && req.user.role.includes('admin');
        const isCreator = req.user.role && req.user.role.includes('creator');
        if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: 'Only creators can import media. Apply to become a creator first.' });
        }

        const { accessToken, maxVideos = 100, maxDurationMinutes = 15 } = req.body;
        const userId = req.user._id;

        let finalAccessToken = accessToken && accessToken.trim() ? accessToken.trim() : req.user.googleAccessToken;
        if (!finalAccessToken) {
            return res.status(400).json({
                error: 'YouTube access token is required. Connect YouTube first or sign in with Google.'
            });
        }

        const videoCount = Math.min(parseInt(maxVideos) || 100, 500);
        const estimate = estimateQuotaUsage(videoCount);
        if (estimate.total > 9500) {
            return res.status(400).json({
                error: `Import would use ${estimate.total} quota units. Please reduce maxVideos to stay under 9500.`,
                estimate
            });
        }

        const results = await bulkImportLikedVideos(finalAccessToken, userId, videoCount, maxDurationMinutes || 15);
        res.json({ success: true, ...results, quotaEstimate: estimate });
    } catch (error) {
        console.error('Error importing liked videos:', error);
        res.status(500).json({ error: 'Failed to import liked videos', details: error.message });
    }
});

// ========== Admin routes (admin only) ==========

/**
 * Estimate quota usage for importing liked videos
 */
router.get('/liked-videos/estimate', adminMiddleware, async (req, res) => {
    try {
        const { maxVideos = 100 } = req.query;
        
        const estimate = estimateQuotaUsage(parseInt(maxVideos));
        
        res.json({
            success: true,
            estimate,
            recommendations: {
                maxSafeImport: estimate.total < 8000 ? 'You can safely import this amount' : 'Consider reducing the number of videos',
                quotaReset: 'Quota resets 24 hours after your first API call today',
                musicOnly: 'Only music category videos will be imported'
            }
        });
    } catch (error) {
        console.error('Error estimating quota:', error);
        res.status(500).json({ error: 'Failed to estimate quota usage' });
    }
});

/**
 * Bulk import liked music videos
 */
router.post('/liked-videos/import', adminMiddleware, async (req, res) => {
    try {
        const { accessToken, maxVideos = 100, maxDurationMinutes = 15 } = req.body;
        const userId = req.user._id;

        // Try to use Google OAuth token if no access token provided
        let finalAccessToken = accessToken;
        console.log('🔍 Debug - User object:', {
            userId: req.user._id,
            username: req.user.username,
            hasGoogleToken: !!req.user.googleAccessToken,
            googleTokenLength: req.user.googleAccessToken ? req.user.googleAccessToken.length : 0
        });
        
        if (!finalAccessToken && req.user.googleAccessToken) {
            finalAccessToken = req.user.googleAccessToken;
            console.log('🔄 Using Google OAuth token for YouTube import');
        }

        if (!finalAccessToken) {
            return res.status(400).json({ 
                error: 'YouTube access token is required. Please provide one or sign in with Google first.' 
            });
        }

        // Validate maxVideos
        const videoCount = parseInt(maxVideos);
        if (videoCount > 500) {
            return res.status(400).json({ 
                error: 'Maximum 500 videos per import to avoid quota limits' 
            });
        }

        // Estimate quota usage
        const estimate = estimateQuotaUsage(videoCount);
        if (estimate.total > 9500) {
            return res.status(400).json({ 
                error: `Import would use ${estimate.total} quota units (${estimate.percentage.toFixed(1)}%). Please reduce maxVideos to stay under 9500 units.`,
                estimate
            });
        }

        console.log(`🎵 Starting bulk import for user ${userId}, max videos: ${videoCount}, max duration: ${maxDurationMinutes} minutes`);

        const results = await bulkImportLikedVideos(finalAccessToken, userId, videoCount, maxDurationMinutes);

        res.json({
            success: true,
            ...results,
            quotaEstimate: estimate
        });

    } catch (error) {
        console.error('Error importing liked videos:', error);
        res.status(500).json({ 
            error: 'Failed to import liked videos',
            details: error.message 
        });
    }
});

/**
 * Get YouTube OAuth URL for authorization
 */
router.get('/oauth-url', adminMiddleware, (req, res) => {
    try {
        const clientId = process.env.YOUTUBE_CLIENT_ID;
        const redirectUri = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/auth/youtube/callback';
        
        if (!clientId) {
            return res.status(503).json({ 
                error: 'YouTube OAuth not configured. Missing YOUTUBE_CLIENT_ID environment variable.' 
            });
        }

        const scope = 'https://www.googleapis.com/auth/youtube.readonly';
        const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${clientId}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `scope=${encodeURIComponent(scope)}&` +
            `response_type=code&` +
            `access_type=offline&` +
            `prompt=consent`;

        res.json({
            success: true,
            oauthUrl,
            scope: 'Read access to YouTube liked videos'
        });

    } catch (error) {
        console.error('Error generating OAuth URL:', error);
        res.status(500).json({ error: 'Failed to generate OAuth URL' });
    }
});

module.exports = router;
