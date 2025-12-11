const Party = require('../models/Party');
const User = require('../models/User');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Generate unique party code
const deriveCodeFromPartyId = (objectId) => {
    return crypto.createHash('md5').update(objectId.toString()).digest('hex').substring(0, 6).toUpperCase();
};

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
 */
async function autoJoinTagParties(user, media) {
    if (!user || !media || !media.tags || !Array.isArray(media.tags) || media.tags.length === 0) {
        return [];
    }

    const joinedParties = [];
    const { capitalizeTag } = require('../services/tagPartyService');

    for (const tag of media.tags) {
        try {
            const normalizedTag = capitalizeTag(tag);
            const lowerTag = normalizedTag.toLowerCase().trim();

            // Find or create tag party
            let party = await Party.findOne({
                type: 'tag',
                $or: [
                    { slug: lowerTag },
                    { tags: { $in: [new RegExp(`^${lowerTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')] } }
                ]
            });

            if (!party) {
                // Create tag party
                const tuneableUser = await User.findOne({ username: 'Tuneable' });
                if (!tuneableUser) {
                    console.error('⚠️  Cannot auto-join tag parties: Tuneable user not found');
                    continue;
                }

                const objectId = new mongoose.Types.ObjectId();
                const partyCode = deriveCodeFromPartyId(objectId);

                party = new Party({
                    _id: objectId,
                    name: `${normalizedTag} Party`,
                    location: 'Global',
                    host: tuneableUser._id,
                    partyCode,
                    partiers: [],
                    type: 'tag',
                    privacy: 'public',
                    status: 'active',
                    startTime: new Date(),
                    mediaSource: 'youtube',
                    minimumBid: 0.01, // 1p default
                    tags: [normalizedTag],
                    slug: lowerTag,
                    description: `Community party for ${normalizedTag} music`
                });

                await party.save();
                console.log(`🏷️  Auto-created tag party: ${normalizedTag}`);
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
    autoJoinTagParties
};

