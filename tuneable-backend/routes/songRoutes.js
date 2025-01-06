const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Song = require('../models/Song');
const Party = require('../models/Party');
const { isValidObjectId } = require('../utils/validators');

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

        // Fetch the song details with populated bidder info
        const song = await Song.findById(songId).populate({
            path: 'bidders.userId',
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
