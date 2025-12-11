// Script: migrateLocations.js
// Purpose: Normalize legacy location data to the current schema (homeLocation/secondaryLocation)
// Usage:  node scripts/migrateLocations.js
// Env:    MONGODB_URI must be set

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// Extended country name -> ISO 3166-1 alpha-2 map
const COUNTRY_MAP = {
  'United Kingdom': 'GB',
  'England': 'GB',
  'Scotland': 'GB',
  'Wales': 'GB',
  'Northern Ireland': 'GB',
  'United States': 'US',
  'United States of America': 'US',
  'USA': 'US',
  'Canada': 'CA',
  'Mexico': 'MX',
  'Brazil': 'BR',
  'Argentina': 'AR',
  'Chile': 'CL',
  'Colombia': 'CO',
  'Peru': 'PE',
  'Australia': 'AU',
  'New Zealand': 'NZ',
  'Ireland': 'IE',
  'France': 'FR',
  'Germany': 'DE',
  'Spain': 'ES',
  'Portugal': 'PT',
  'Italy': 'IT',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Belgium': 'BE',
  'Netherlands': 'NL',
  'Luxembourg': 'LU',
  'Denmark': 'DK',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Finland': 'FI',
  'Iceland': 'IS',
  'Poland': 'PL',
  'Czech Republic': 'CZ',
  'Czechia': 'CZ',
  'Slovakia': 'SK',
  'Hungary': 'HU',
  'Romania': 'RO',
  'Bulgaria': 'BG',
  'Greece': 'GR',
  'Turkey': 'TR',
  'Croatia': 'HR',
  'Slovenia': 'SI',
  'Serbia': 'RS',
  'Bosnia and Herzegovina': 'BA',
  'North Macedonia': 'MK',
  'Albania': 'AL',
  'Estonia': 'EE',
  'Latvia': 'LV',
  'Lithuania': 'LT',
  'Russia': 'RU',
  'Ukraine': 'UA',
  'Belarus': 'BY',
  'India': 'IN',
  'Pakistan': 'PK',
  'Bangladesh': 'BD',
  'Sri Lanka': 'LK',
  'Nepal': 'NP',
  'China': 'CN',
  'Hong Kong': 'HK',
  'Taiwan': 'TW',
  'Japan': 'JP',
  'South Korea': 'KR',
  'Singapore': 'SG',
  'Malaysia': 'MY',
  'Indonesia': 'ID',
  'Philippines': 'PH',
  'Thailand': 'TH',
  'Vietnam': 'VN',
  'Cambodia': 'KH',
  'Laos': 'LA',
  'Myanmar': 'MM',
  'United Arab Emirates': 'AE',
  'Saudi Arabia': 'SA',
  'Qatar': 'QA',
  'Kuwait': 'KW',
  'Bahrain': 'BH',
  'Oman': 'OM',
  'Jordan': 'JO',
  'Israel': 'IL',
  'Egypt': 'EG',
  'Morocco': 'MA',
  'Tunisia': 'TN',
  'Kenya': 'KE',
  'Nigeria': 'NG',
  'Ghana': 'GH',
  'South Africa': 'ZA',
  'Ethiopia': 'ET',
};

const AUDIT_ONLY = false; // set true to only report and not write

function normalizeLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const countryCode =
    loc.countryCode ||
    (loc.country && COUNTRY_MAP[loc.country]) ||
    null;
  return {
    city: loc.city || null,
    region: loc.region || null,
    country: loc.country || null,
    countryCode,
    coordinates: loc.coordinates || null,
    detectedFromIP: !!loc.detectedFromIP,
  };
}

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const cursor = User.find({}).cursor();
  let updated = 0;
  let audited = 0;

  for await (const user of cursor) {
    let changed = false;

    const home = normalizeLocation(user.homeLocation);
    if (home && JSON.stringify(home) !== JSON.stringify(user.homeLocation)) {
      user.homeLocation = home;
      changed = true;
    }

    const secondary = normalizeLocation(user.secondaryLocation);
    if (secondary && JSON.stringify(secondary) !== JSON.stringify(user.secondaryLocation)) {
      user.secondaryLocation = secondary;
      changed = true;
    }

    // Backfill from legacy locations.primary/secondary if present
    if (!home && user.locations?.primary) {
      const normalized = normalizeLocation(user.locations.primary);
      if (normalized) {
        user.homeLocation = normalized;
        changed = true;
      }
    }
    if (!secondary && user.locations?.secondary) {
      const normalized = normalizeLocation(user.locations.secondary);
      if (normalized) {
        user.secondaryLocation = normalized;
        changed = true;
      }
    }

    if (changed && !AUDIT_ONLY) {
      await user.save();
      updated += 1;
    }
    audited += 1;
    if (audited % 500 === 0) {
      console.log(`Audited ${audited}, updated ${updated}`);
    }
  }

  console.log(`Done. Audited ${audited}, updated ${updated}${AUDIT_ONLY ? ' (audit only)' : ''}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

