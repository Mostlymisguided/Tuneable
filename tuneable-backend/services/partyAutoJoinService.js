const Party = require('../models/Party');
const User = require('../models/User');
const Media = require('../models/Media');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { getCanonicalTag } = require('../utils/tagNormalizer');
const { getExistingTagParty, shouldCreateTagParty, capitalizeTag, generateSlug, TAG_PARTY_THRESHOLD } = require('../services/tagPartyService');

// Generate unique party code
const deriveCodeFromPartyId = (objectId) => {
    return crypto.createHash('md5').update(objectId.toString()).digest('hex').substring(0, 6).toUpperCase();
};

/**
 * Check if a location party should be created based on threshold
 * @param {Object} locationFilter - Location filter object
 * @returns {Promise<boolean>} - True if threshold is met
 */
async function shouldCreateLocationParty(locationFilter) {
    if (!locationFilter || !locationFilter.countryCode) {
        return false;
    }

    // Get thresholds from environment (with defaults)
    const cityThreshold = parseInt(process.env.LOCATION_PARTY_CITY_THRESHOLD || '3', 10);
    const regionThreshold = parseInt(process.env.LOCATION_PARTY_REGION_THRESHOLD || '5', 10);
    const countryThreshold = parseInt(process.env.LOCATION_PARTY_COUNTRY_THRESHOLD || '10', 10);

    // Build query to count users matching this location
    const query = {
        'homeLocation.countryCode': locationFilter.countryCode.toUpperCase(),
        isActive: true
    };

    if (locationFilter.city) {
        // City-level: count users with matching city
        query['homeLocation.city'] = { 
            $regex: new RegExp(`^${locationFilter.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') 
        };
        const userCount = await User.countDocuments(query);
        return userCount >= cityThreshold;
    } else if (locationFilter.region) {
        // Region-level: count users with matching region (no specific city)
        query['homeLocation.region'] = { 
            $regex: new RegExp(`^${locationFilter.region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') 
        };
        // Exclude users with specific cities (they belong to city parties)
        query['homeLocation.city'] = { $in: [null, ''] };
        const userCount = await User.countDocuments(query);
        return userCount >= regionThreshold;
    } else {
        // Country-level: count users with matching country (no city or region)
        query['homeLocation.city'] = { $in: [null, ''] };
        query['homeLocation.region'] = { $in: [null, ''] };
        const userCount = await User.countDocuments(query);
        return userCount >= countryThreshold;
    }
}

/**
 * Auto-join user to location parties matching their homeLocation
 * Joins at city, region, and country levels
 */
async function autoJoinLocationParties(user) {
    if (!user || !user.homeLocation || !user.homeLocation.countryCode) {
        return [];
    }

    const joinedParties = [];
    const locationFilters = [];

    // Create location filters for city, region, and country levels
    if (user.homeLocation.city) {
        locationFilters.push({
            countryCode: user.homeLocation.countryCode.toUpperCase(),
            city: user.homeLocation.city,
            region: user.homeLocation.region || null,
            country: user.homeLocation.country || null
        });
    }

    if (user.homeLocation.region) {
        locationFilters.push({
            countryCode: user.homeLocation.countryCode.toUpperCase(),
            city: null,
            region: user.homeLocation.region,
            country: user.homeLocation.country || null
        });
    }

    // Always add country level
    locationFilters.push({
        countryCode: user.homeLocation.countryCode.toUpperCase(),
        city: null,
        region: null,
        country: user.homeLocation.country || null
    });

    // Find or create parties for each location filter
    for (const locationFilter of locationFilters) {
        try {
            // Check if party exists
            let party = await Party.findOne({
                type: 'location',
                'locationFilter.countryCode': locationFilter.countryCode,
                ...(locationFilter.city && {
                    'locationFilter.city': { $regex: new RegExp(`^${locationFilter.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
                }),
                ...(locationFilter.region && !locationFilter.city && {
                    'locationFilter.region': { $regex: new RegExp(`^${locationFilter.region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
                }),
                ...(!locationFilter.city && !locationFilter.region && {
                    $or: [
                        { 'locationFilter.city': { $exists: false } },
                        { 'locationFilter.city': null }
                    ],
                    $or: [
                        { 'locationFilter.region': { $exists: false } },
                        { 'locationFilter.region': null }
                    ]
                })
            });

            // Create party if it doesn't exist
            if (!party) {
                // Check threshold before creating
                const meetsThreshold = await shouldCreateLocationParty(locationFilter);
                if (!meetsThreshold) {
                    const level = locationFilter.city ? 'city' : locationFilter.region ? 'region' : 'country';
                    const threshold = locationFilter.city 
                        ? parseInt(process.env.LOCATION_PARTY_CITY_THRESHOLD || '3', 10)
                        : locationFilter.region
                        ? parseInt(process.env.LOCATION_PARTY_REGION_THRESHOLD || '5', 10)
                        : parseInt(process.env.LOCATION_PARTY_COUNTRY_THRESHOLD || '10', 10);
                    
                    console.log(`   ⚠️  ${level}-level location party does not meet threshold (${threshold} users), skipping creation`);
                    continue; // Skip creating this party
                }

                const tuneableUser = await User.findOne({ username: 'Tuneable' });
                if (!tuneableUser) {
                    console.error('⚠️  Cannot auto-join location parties: Tuneable user not found');
                    continue;
                }

                let partyName;
                if (locationFilter.city) {
                    partyName = `${locationFilter.city} Party`;
                } else if (locationFilter.region) {
                    partyName = `${locationFilter.region} Party`;
                } else if (locationFilter.country) {
                    partyName = `${locationFilter.country} Party`;
                } else {
                    partyName = `${locationFilter.countryCode} Party`;
                }

                const objectId = new mongoose.Types.ObjectId();
                const partyCode = deriveCodeFromPartyId(objectId);

                party = new Party({
                    _id: objectId,
                    name: partyName,
                    location: locationFilter.city 
                        ? `${locationFilter.city}, ${locationFilter.country || locationFilter.countryCode}`
                        : locationFilter.region
                        ? `${locationFilter.region}, ${locationFilter.country || locationFilter.countryCode}`
                        : locationFilter.country || locationFilter.countryCode,
                    host: tuneableUser._id,
                    partyCode,
                    partiers: [],
                    type: 'location',
                    locationFilter,
                    privacy: 'public',
                    status: 'active',
                    startTime: new Date(),
                    mediaSource: 'youtube',
                    minimumBid: 0.01, // 1p default
                    tags: [],
                    description: `Community party for ${locationFilter.city || locationFilter.region || ''}${locationFilter.city || locationFilter.region ? ', ' : ''}${locationFilter.country || locationFilter.countryCode}`
                });

                await party.save();
                console.log(`📍 Auto-created location party: ${partyName}`);
            }

            // Check if user is already joined
            const isAlreadyJoined = user.joinedParties && user.joinedParties.some(
                jp => jp.partyId && jp.partyId.toString() === party._id.toString()
            );

            if (!isAlreadyJoined) {
                // Add to user's joinedParties
                if (!user.joinedParties) {
                    user.joinedParties = [];
                }
                user.joinedParties.push({
                    partyId: party._id,
                    joinedAt: new Date(),
                    role: 'partier'
                });

                // Add user to party's partiers array
                if (!party.partiers) {
                    party.partiers = [];
                }
                if (!party.partiers.some(p => p && p.toString() === user._id.toString())) {
                    party.partiers.push(user._id);
                }

                await party.save();
                joinedParties.push(party);
                console.log(`✅ Auto-joined user ${user.username} to location party: ${party.name}`);
            }
        } catch (error) {
            console.error(`Error auto-joining location party:`, error);
            // Continue with other parties even if one fails
        }
    }

    // Save user with updated joinedParties
    if (joinedParties.length > 0) {
        await user.save();
    }

    return joinedParties;
}

/**
 * Auto-join user to tag parties based on media tags
 * Called after user places a bid on tagged media
 * Uses fuzzy matching and threshold checks
 */
async function autoJoinTagParties(user, media) {
    if (!user || !media || !media.tags || !Array.isArray(media.tags) || media.tags.length === 0) {
        return [];
    }

    const joinedParties = [];

    for (const tag of media.tags) {
        try {
            const normalizedTag = capitalizeTag(tag);
            
            // Check if tag party already exists (using fuzzy matching)
            let party = await getExistingTagParty(tag);

            if (!party) {
                // Check if threshold is met before creating
                const meetsThreshold = await shouldCreateTagParty(tag);
                if (!meetsThreshold) {
                    console.log(`   ⚠️  Tag "${normalizedTag}" does not meet threshold (${TAG_PARTY_THRESHOLD} media items), skipping party creation`);
                    continue;
                }
                
                // Create tag party using tagPartyService
                const { createTagParty } = require('../services/tagPartyService');
                party = await createTagParty(tag);
                
                if (!party) {
                    console.log(`   ⚠️  Failed to create tag party for "${normalizedTag}"`);
                    continue;
                }
            }

            // Check if user is already joined
            const isAlreadyJoined = user.joinedParties && user.joinedParties.some(
                jp => jp.partyId && jp.partyId.toString() === party._id.toString()
            );

            if (!isAlreadyJoined) {
                // Add to user's joinedParties
                if (!user.joinedParties) {
                    user.joinedParties = [];
                }
                user.joinedParties.push({
                    partyId: party._id,
                    joinedAt: new Date(),
                    role: 'partier'
                });

                // Add user to party's partiers array
                if (!party.partiers) {
                    party.partiers = [];
                }
                if (!party.partiers.some(p => p && p.toString() === user._id.toString())) {
                    party.partiers.push(user._id);
                }

                await party.save();
                joinedParties.push(party);
                console.log(`✅ Auto-joined user ${user.username} to tag party: ${party.name}`);
            }
        } catch (error) {
            console.error(`Error auto-joining tag party for tag "${tag}":`, error);
            // Continue with other tags even if one fails
        }
    }

    // Save user with updated joinedParties
    if (joinedParties.length > 0) {
        await user.save();
    }

    return joinedParties;
}

module.exports = {
    autoJoinLocationParties,
    autoJoinTagParties,
    shouldCreateLocationParty
};

