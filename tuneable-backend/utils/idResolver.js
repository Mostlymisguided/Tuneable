const mongoose = require('mongoose');

/**
 * Resolves an ID (either MongoDB ObjectId or UUID) to a MongoDB ObjectId
 * @param {string} id - The ID to resolve (can be ObjectId or UUID)
 * @param {mongoose.Model} Model - The Mongoose model to search in
 * @param {string} field - The field to search in (default: 'uuid')
 * @returns {Promise<string|null>} - The resolved MongoDB ObjectId or null if not found
 */
async function resolveId(id, Model, field = 'uuid') {
    try {
        // If it's a valid MongoDB ObjectId, return it directly
        if (mongoose.isValidObjectId(id)) {
            return id;
        }
        
        // If it's not a valid ObjectId, treat it as a UUID and find the document
        const doc = await Model.findOne({ [field]: id });
        return doc ? doc._id.toString() : null;
    } catch (error) {
        console.error('Error resolving ID:', error);
        return null;
    }
}

/**
 * Middleware to resolve party ID from UUID to ObjectId
 */
function resolvePartyId() {
    return async (req, res, next) => {
        try {
            const { id, partyId } = req.params;
            const Party = require('../models/Party');
            
            // Handle both 'id' and 'partyId' parameter names
            const paramName = id ? 'id' : 'partyId';
            const paramValue = id || partyId;
            
            const resolvedId = await resolveId(paramValue, Party, 'uuid');
            
            if (!resolvedId) {
                return res.status(404).json({ error: 'Party not found' });
            }
            
            // Replace the UUID with the resolved ObjectId
            req.params[paramName] = resolvedId;
            next();
        } catch (error) {
            console.error('Error resolving party ID:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

/**
 * Middleware to resolve user ID from UUID to ObjectId
 */
function resolveUserId() {
    return async (req, res, next) => {
        try {
            const { userId } = req.params;
            const User = require('../models/User');
            
            const resolvedId = await resolveId(userId, User, 'uuid');
            
            if (!resolvedId) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            req.params.userId = resolvedId;
            next();
        } catch (error) {
            console.error('Error resolving user ID:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };
}

module.exports = {
    resolveId,
    resolvePartyId,
    resolveUserId
};
