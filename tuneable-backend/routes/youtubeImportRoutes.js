const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { bulkImportLikedVideos, estimateQuotaUsage } = require('../services/youtubeLikedImport');

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
