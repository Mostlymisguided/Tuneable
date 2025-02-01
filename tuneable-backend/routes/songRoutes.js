const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Song = require('../models/Song');
const Party = require('../models/Party');
const { isValidObjectId } = require('../utils/validators');

// Fetch all songs for TuneFeed with filtering & sorting
router.get('/', authMiddleware, async (req, res) => {
    console.log('Route Hit:', req.originalUrl);
    
    try {
        const { sortBy, filterBy, limit = 50 } = req.query;

        let query = {};

        // Apply filters (e.g., genre, BPM range, etc.)
        if (filterBy) {
            try {
                const filters = JSON.parse(filterBy); // Expecting JSON in query
                if (filters.genre) query.genre = filters.genre;
                if (filters.bpmMin && filters.bpmMax) {
                    query.bpm = { $gte: filters.bpmMin, $lte: filters.bpmMax };
                }
            } catch (error) {
                return res.status(400).json({ error: 'Invalid filter format' });
            }
        }

        let sortCriteria = {};
        switch (sortBy) {
            case 'highestPaid':
                sortCriteria = { globalBidValue: -1 }; // Correct field from schema
                break;
            case 'newest':
                sortCriteria = { uploadedAt: -1 };
                break;
            case 'mostPlayed':
                sortCriteria = { popularity: -1 }; // Assuming 'popularity' tracks plays
                break;
            default:
                sortCriteria = { uploadedAt: -1 }; // Default to newest
        }

        // Fetch songs with sorting and filtering applied
        const songs = await Song.find(query)
            .populate({
                path: 'bids', // First, populate the bids array
                populate: { 
                    path: 'userId', 
                    model: 'User', 
                    select: 'username' 
                }
            })
            .populate({
                path: 'addedBy',
                model: 'User',
                select: 'username',
            })
            .sort(sortCriteria)
            .limit(Number(limit));

        console.log('Fetched songs for TuneFeed:', JSON.stringify(songs, null, 2));

        res.status(200).json({
            message: 'Songs fetched successfully!',
            songs,
        });
    } catch (err) {
        console.error('Error fetching TuneFeed songs:', err.message);
        res.status(500).json({ error: 'Error fetching TuneFeed songs', details: err.message });
    }
});

// Fetch details of a specific song in a party
router.get('/:partyId/songs/:songId', authMiddleware, async (req, res) => {
    console.log('Route Hit:', req.originalUrl);
    console.log('Party ID:', req.params.partyId);
    console.log('Song ID:', req.params.songId);

    try {   
        const { partyId, songId } = req.params;

        if (!isValidObjectId(partyId) || !isValidObjectId(songId)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        // Validate that the party exists
        const party = await Party.findById(partyId);
        if (!party) return res.status(404).json({ error: 'Party not found' });

        // Fetch the song details with populated bid info
        const song = await Song.findById(songId)
            .populate({
                path: 'bids',
                populate: { 
                    path: 'userId', 
                    model: 'User', 
                    select: 'username' 
                }
            })
            .populate({
                path: 'addedBy',
                model: 'User',
                select: 'username',
            });

        console.log('Populated song:', JSON.stringify(song, null, 2));

        if (!song) return res.status(404).json({ error: 'Song not found' });

        res.status(200).json({ message: 'Song details fetched successfully!', song });
    } catch (err) {
        console.error('Error fetching song details:', err.message);
        res.status(500).json({ error: 'Error fetching song details', details: err.message });
    }
});

module.exports = router;