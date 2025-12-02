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
 * Resolves a party ID, handling special "global" slug and tag party slugs
 * @param {string} partyId - The party ID (can be "global", tag slug, ObjectId, or UUID)
 * @returns {Promise<string|null>} - The resolved MongoDB ObjectId or null if not found
 */
async function resolvePartyIdValue(partyId) {
    try {
        // Special case: "global" slug for the global party
        if (partyId === 'global') {
            const Party = require('../models/Party');
            const globalParty = await Party.getGlobalParty();
            return globalParty ? globalParty._id.toString() : null;
        }
        
        // Check if it's a valid MongoDB ObjectId first
        if (mongoose.isValidObjectId(partyId)) {
            return partyId;
        }
        
        // Check if it's a tag party slug (lowercase, hyphenated)
        // Tag slugs are lowercase and contain only alphanumeric characters and hyphens
        const slugPattern = /^[a-z0-9-]+$/;
        if (slugPattern.test(partyId)) {
            const Party = require('../models/Party');
            const tagParty = await Party.findOne({ 
                slug: partyId.toLowerCase(),
                type: 'tag' 
            });
            if (tagParty) {
                return tagParty._id.toString();
            }
        }
        
        // Otherwise, try UUID resolution
        const Party = require('../models/Party');
        return await resolveId(partyId, Party, 'uuid');
    } catch (error) {
        console.error('Error resolving party ID:', error);
        return null;
    }
}

/**
 * Middleware to resolve party ID from UUID to ObjectId
 * Also handles special "global" slug for the global party
 */
function resolvePartyId() {
    return async (req, res, next) => {
        try {
            const { id, partyId } = req.params;
            
            // Handle both 'id' and 'partyId' parameter names
            const paramName = id ? 'id' : 'partyId';
            const paramValue = id || partyId;
            
            if (!paramValue) {
                return next(); // No party ID to resolve
            }
            
            const resolvedId = await resolvePartyIdValue(paramValue);
            
            if (!resolvedId) {
                return res.status(404).json({ error: 'Party not found' });
            }
            
            // Replace the UUID/slug with the resolved ObjectId
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
    resolvePartyIdValue,
    resolveUserId
};
