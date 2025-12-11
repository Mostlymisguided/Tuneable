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

