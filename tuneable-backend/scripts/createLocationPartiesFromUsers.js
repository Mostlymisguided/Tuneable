// Script: createLocationPartiesFromUsers.js
// Purpose: Create location parties (city/region/country) from existing user homeLocation data
// Usage:   node scripts/createLocationPartiesFromUsers.js
// Env:     MONGODB_URI must be set

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { uuidv7 } = require('uuidv7');
const Party = require('../models/Party');
const User = require('../models/User');

function deriveCodeFromPartyId(objectId) {
  return crypto.createHash('md5').update(objectId.toString()).digest('hex').substring(0, 6).toUpperCase();
}

async function getTuneableHost() {
  const tuneable = await User.findOne({ username: 'Tuneable' });
  if (!tuneable) {
    throw new Error('Tuneable user not found. Please create it first.');
  }
  return tuneable;
}

function partyNameFromFilter(filter) {
  if (filter.city) return `${filter.city} Party`;
  if (filter.region) return `${filter.region} Party`;
  if (filter.country) return `${filter.country} Party`;
  return `${filter.countryCode} Party`;
}

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

async function ensureLocationParty(filter, hostId) {
  if (!filter.countryCode) return null;

  const query = {
    type: 'location',
    'locationFilter.countryCode': filter.countryCode,
    ...(filter.city ? { 'locationFilter.city': { $regex: new RegExp(`^${filter.city}$`, 'i') } } : {}),
    ...(filter.region ? { 'locationFilter.region': { $regex: new RegExp(`^${filter.region}$`, 'i') } } : {}),
  };

  const existing = await Party.findOne(query);
  if (existing) return existing;

  // Check threshold before creating
  const locationFilter = {
    countryCode: filter.countryCode,
    city: filter.city || null,
    region: filter.region || null,
    country: filter.country || null
  };
  
  const meetsThreshold = await shouldCreateLocationParty(locationFilter);
  if (!meetsThreshold) {
    const level = locationFilter.city ? 'city' : locationFilter.region ? 'region' : 'country';
    const threshold = locationFilter.city 
      ? parseInt(process.env.LOCATION_PARTY_CITY_THRESHOLD || '3', 10)
      : locationFilter.region
      ? parseInt(process.env.LOCATION_PARTY_REGION_THRESHOLD || '5', 10)
      : parseInt(process.env.LOCATION_PARTY_COUNTRY_THRESHOLD || '10', 10);
    
    console.log(`   ⚠️  ${level}-level location party does not meet threshold (${threshold} users), skipping creation`);
    return null; // Skip creating this party
  }

  const objectId = new mongoose.Types.ObjectId();
  const partyCode = deriveCodeFromPartyId(objectId);

  const party = new Party({
    _id: objectId,
    uuid: uuidv7(),
    name: partyNameFromFilter(filter),
    location: filter.city
      ? `${filter.city}, ${filter.country || filter.countryCode}`
      : filter.region
        ? `${filter.region}, ${filter.country || filter.countryCode}`
        : filter.country || filter.countryCode,
    host: hostId,
    partyCode,
    partiers: [],
    type: 'location',
    locationFilter: {
      city: filter.city || null,
      region: filter.region || null,
      country: filter.country || null,
      countryCode: filter.countryCode,
    },
    privacy: 'public',
    status: 'active',
    startTime: new Date(),
    mediaSource: 'youtube',
    minimumBid: 0.01, // Default bid: 1p
    tags: [],
    description: `Community party for ${filter.city ? filter.city + ', ' : filter.region ? filter.region + ', ' : ''}${filter.country || filter.countryCode}`,
  });

  await party.save();
  return party;
}

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const host = await getTuneableHost();

  // Gather unique location filters from users
  const users = await User.find({
    'homeLocation.countryCode': { $exists: true, $ne: null },
  }).select('homeLocation').lean();

  const filters = new Map();
  const addFilter = (key, filter) => {
    if (!filter.countryCode) return;
    filters.set(key, filter);
  };

  for (const u of users) {
    const loc = u.homeLocation;
    if (!loc || !loc.countryCode) continue;

    // Country level
    addFilter(`country:${loc.countryCode.toUpperCase()}`, {
      countryCode: loc.countryCode.toUpperCase(),
      country: loc.country || null,
    });

    // Region level
    if (loc.region) {
      addFilter(`region:${loc.region}:${loc.countryCode.toUpperCase()}`, {
        region: loc.region,
        countryCode: loc.countryCode.toUpperCase(),
        country: loc.country || null,
      });
    }

    // City level
    if (loc.city) {
      addFilter(`city:${loc.city}:${loc.countryCode.toUpperCase()}`, {
        city: loc.city,
        countryCode: loc.countryCode.toUpperCase(),
        country: loc.country || null,
      });
    }
  }

  console.log(`Discovered ${filters.size} unique location filters`);

  let created = 0;
  for (const [key, filter] of filters.entries()) {
    const party = await ensureLocationParty(filter, host._id);
    if (party) {
      created += 1;
      console.log(`✅ Party ensured: ${party.name} (${key})`);
    }
  }

  console.log(`Done. Created/ensured ${created} location parties.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

