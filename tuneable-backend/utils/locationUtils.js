/**
 * Location utility functions for processing and normalizing location data
 * Used by User, Label, and Collective models
 */

// Country name to country code mapping (ISO 3166-1 alpha-2)
const countryCodeMap = {
  'United Kingdom': 'GB',
  'Afghanistan': 'AF',
  'Albania': 'AL',
  'Algeria': 'DZ',
  'Andorra': 'AD',
  'Angola': 'AO',
  'Antigua and Barbuda': 'AG',
  'Argentina': 'AR',
  'Armenia': 'AM',
  'Australia': 'AU',
  'Austria': 'AT',
  'Azerbaijan': 'AZ',
  'Bahamas': 'BS',
  'Bahrain': 'BH',
  'Bangladesh': 'BD',
  'Barbados': 'BB',
  'Belarus': 'BY',
  'Belgium': 'BE',
  'Belize': 'BZ',
  'Benin': 'BJ',
  'Bhutan': 'BT',
  'Bolivia': 'BO',
  'Bosnia and Herzegovina': 'BA',
  'Botswana': 'BW',
  'Brazil': 'BR',
  'Brunei': 'BN',
  'Bulgaria': 'BG',
  'Burkina Faso': 'BF',
  'Burundi': 'BI',
  'Cambodia': 'KH',
  'Cameroon': 'CM',
  'Canada': 'CA',
  'Cape Verde': 'CV',
  'Central African Republic': 'CF',
  'Chad': 'TD',
  'Chile': 'CL',
  'China': 'CN',
  'Colombia': 'CO',
  'Comoros': 'KM',
  'Congo': 'CG',
  'Costa Rica': 'CR',
  'Croatia': 'HR',
  'Cuba': 'CU',
  'Cyprus': 'CY',
  'Czech Republic': 'CZ',
  'Democratic Republic of the Congo': 'CD',
  'Denmark': 'DK',
  'Djibouti': 'DJ',
  'Dominica': 'DM',
  'Dominican Republic': 'DO',
  'East Timor': 'TL',
  'Ecuador': 'EC',
  'Egypt': 'EG',
  'El Salvador': 'SV',
  'England': 'GB-ENG',
  'Equatorial Guinea': 'GQ',
  'Eritrea': 'ER',
  'Estonia': 'EE',
  'Ethiopia': 'ET',
  'Fiji': 'FJ',
  'Finland': 'FI',
  'France': 'FR',
  'Gabon': 'GA',
  'Gambia': 'GM',
  'Georgia': 'GE',
  'Germany': 'DE',
  'Ghana': 'GH',
  'Greece': 'GR',
  'Grenada': 'GD',
  'Guatemala': 'GT',
  'Guinea': 'GN',
  'Guinea-Bissau': 'GW',
  'Guyana': 'GY',
  'Haiti': 'HT',
  'Honduras': 'HN',
  'Hungary': 'HU',
  'Iceland': 'IS',
  'India': 'IN',
  'Indonesia': 'ID',
  'Iran': 'IR',
  'Iraq': 'IQ',
  'Ireland': 'IE',
  'Israel': 'IL',
  'Italy': 'IT',
  'Ivory Coast': 'CI',
  'Jamaica': 'JM',
  'Japan': 'JP',
  'Jordan': 'JO',
  'Kazakhstan': 'KZ',
  'Kenya': 'KE',
  'Kiribati': 'KI',
  'Kosovo': 'XK',
  'Kuwait': 'KW',
  'Kyrgyzstan': 'KG',
  'Laos': 'LA',
  'Latvia': 'LV',
  'Lebanon': 'LB',
  'Lesotho': 'LS',
  'Liberia': 'LR',
  'Libya': 'LY',
  'Liechtenstein': 'LI',
  'Lithuania': 'LT',
  'Luxembourg': 'LU',
  'Macau': 'MO',
  'Madagascar': 'MG',
  'Malawi': 'MW',
  'Malaysia': 'MY',
  'Maldives': 'MV',
  'Mali': 'ML',
  'Malta': 'MT',
  'Marshall Islands': 'MH',
  'Mauritania': 'MR',
  'Mauritius': 'MU',
  'Mexico': 'MX',
  'Micronesia': 'FM',
  'Moldova': 'MD',
  'Monaco': 'MC',
  'Mongolia': 'MN',
  'Montenegro': 'ME',
  'Morocco': 'MA',
  'Mozambique': 'MZ',
  'Myanmar': 'MM',
  'Namibia': 'NA',
  'Nauru': 'NR',
  'Nepal': 'NP',
  'Netherlands': 'NL',
  'New Zealand': 'NZ',
  'Nicaragua': 'NI',
  'Niger': 'NE',
  'Nigeria': 'NG',
  'North Korea': 'KP',
  'North Macedonia': 'MK',
  'Norway': 'NO',
  'Oman': 'OM',
  'Pakistan': 'PK',
  'Palau': 'PW',
  'Palestine': 'PS',
  'Panama': 'PA',
  'Papua New Guinea': 'PG',
  'Paraguay': 'PY',
  'Peru': 'PE',
  'Philippines': 'PH',
  'Poland': 'PL',
  'Portugal': 'PT',
  'Qatar': 'QA',
  'Republic of the Congo': 'CG',
  'Romania': 'RO',
  'Russia': 'RU',
  'Rwanda': 'RW',
  'Saint Kitts and Nevis': 'KN',
  'Saint Lucia': 'LC',
  'Saint Vincent and the Grenadines': 'VC',
  'Samoa': 'WS',
  'San Marino': 'SM',
  'Sao Tome and Principe': 'ST',
  'Saudi Arabia': 'SA',
  'Scotland': 'GB-SCT',
  'Senegal': 'SN',
  'Serbia': 'RS',
  'Seychelles': 'SC',
  'Sierra Leone': 'SL',
  'Singapore': 'SG',
  'Slovakia': 'SK',
  'Slovenia': 'SI',
  'Solomon Islands': 'SB',
  'Somalia': 'SO',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  'South Sudan': 'SS',
  'Spain': 'ES',
  'Sri Lanka': 'LK',
  'Sudan': 'SD',
  'Suriname': 'SR',
  'Swaziland': 'SZ',
  'Sweden': 'SE',
  'Switzerland': 'CH',
  'Syria': 'SY',
  'Taiwan': 'TW',
  'Tajikistan': 'TJ',
  'Tanzania': 'TZ',
  'Thailand': 'TH',
  'Togo': 'TG',
  'Tonga': 'TO',
  'Trinidad and Tobago': 'TT',
  'Tunisia': 'TN',
  'Turkey': 'TR',
  'Turkmenistan': 'TM',
  'Tuvalu': 'TV',
  'Uganda': 'UG',
  'Ukraine': 'UA',
  'United Arab Emirates': 'AE',
  'United States': 'US',
  'Uruguay': 'UY',
  'Uzbekistan': 'UZ',
  'Vanuatu': 'VU',
  'Vatican City': 'VA',
  'Venezuela': 'VE',
  'Vietnam': 'VN',
  'Wales': 'GB-WLS',
  'Yemen': 'YE',
  'Zambia': 'ZM',
  'Zimbabwe': 'ZW',
  'Other': 'XX'
};

/**
 * Normalize and process location data
 * @param {Object} locationData - Raw location data from request
 * @param {Object} existingLocation - Existing location data (for updates)
 * @returns {Object|null} - Normalized location object or null if invalid
 */
function processLocation(locationData, existingLocation = null) {
  // If no location data provided, return existing or null
  if (!locationData || (typeof locationData === 'object' && Object.keys(locationData).length === 0)) {
    return existingLocation || null;
  }

  // Validate location data structure
  if (typeof locationData !== 'object') {
    return existingLocation || null;
  }

  // Extract and normalize fields
  const city = locationData.city ? String(locationData.city).trim() : null;
  const region = locationData.region ? String(locationData.region).trim() : null;
  const country = locationData.country ? String(locationData.country).trim() : null;
  
  // If no meaningful location data (no city or country), return existing or null
  if (!city && !country) {
    return existingLocation || null;
  }

  // Derive countryCode from country name
  let countryCode = locationData.countryCode || null;
  if (country && !countryCode) {
    countryCode = countryCodeMap[country] || null;
  }
  // If countryCode was provided directly, validate it's a string
  if (countryCode && typeof countryCode !== 'string') {
    countryCode = null;
  }

  // Validate and normalize coordinates
  let coordinates = null;
  if (locationData.coordinates) {
    const coords = locationData.coordinates;
    if (typeof coords === 'object' && coords !== null) {
      const lat = typeof coords.lat === 'number' ? coords.lat : (coords.lat ? parseFloat(coords.lat) : null);
      const lng = typeof coords.lng === 'number' ? coords.lng : (coords.lng ? parseFloat(coords.lng) : null);
      
      // Validate coordinate ranges
      if (lat !== null && lng !== null && 
          !isNaN(lat) && !isNaN(lng) &&
          lat >= -90 && lat <= 90 &&
          lng >= -180 && lng <= 180) {
        coordinates = { lat, lng };
      }
    }
  }

  // Build normalized location object
  const normalizedLocation = {
    city: city || null,
    region: region || null,
    country: country || null,
    countryCode: countryCode || null,
    coordinates: coordinates || null
  };

  // Remove null values for cleaner storage (optional - MongoDB handles nulls fine)
  Object.keys(normalizedLocation).forEach(key => {
    if (normalizedLocation[key] === null) {
      delete normalizedLocation[key];
    }
  });

  return normalizedLocation;
}

/**
 * Merge location data safely (for updates)
 * Merges new location data with existing location, preserving existing values when new ones aren't provided
 * @param {Object} newLocationData - New location data from request
 * @param {Object} existingLocation - Existing location data from database
 * @returns {Object|null} - Merged location object or null
 */
function mergeLocation(newLocationData, existingLocation = null) {
  // If no new location data, return existing
  if (!newLocationData || (typeof newLocationData === 'object' && Object.keys(newLocationData).length === 0)) {
    return existingLocation || null;
  }

  // If no existing location, process new location as-is
  if (!existingLocation) {
    return processLocation(newLocationData);
  }

  // Merge: use new values if provided, otherwise keep existing
  const mergedData = {
    city: newLocationData.city !== undefined ? newLocationData.city : existingLocation.city,
    region: newLocationData.region !== undefined ? newLocationData.region : existingLocation.region,
    country: newLocationData.country !== undefined ? newLocationData.country : existingLocation.country,
    countryCode: newLocationData.countryCode !== undefined ? newLocationData.countryCode : existingLocation.countryCode,
    coordinates: newLocationData.coordinates !== undefined ? newLocationData.coordinates : existingLocation.coordinates
  };

  // Process merged data to normalize and derive countryCode if needed
  return processLocation(mergedData);
}

const MAPBOX_LOCATION_FIELDS = [
  'placeProvider',
  'placeId',
  'featureType',
  'ancestorIds',
  'ancestors',
  'label',
  'display',
  'resolvedAt',
];

/**
 * Merge legacy city/region/country fields with Mapbox-resolved metadata.
 * @param {Object} locationData - From client or mapboxGeocodingService
 * @param {Object|null} existingLocation
 * @returns {Object|null}
 */
function applyResolvedLocation(locationData, existingLocation = null) {
  if (!locationData || (typeof locationData === 'object' && Object.keys(locationData).length === 0)) {
    return existingLocation || null;
  }

  const base = processLocation(locationData, existingLocation) || {};
  const merged = { ...base };

  for (const field of MAPBOX_LOCATION_FIELDS) {
    if (locationData[field] !== undefined && locationData[field] !== null) {
      merged[field] = locationData[field];
    } else if (existingLocation?.[field] !== undefined && merged[field] === undefined) {
      merged[field] = existingLocation[field];
    }
  }

  if (locationData.detectedFromIP !== undefined) {
    merged.detectedFromIP = locationData.detectedFromIP;
  } else if (merged.detectedFromIP === undefined) {
    merged.detectedFromIP = existingLocation?.detectedFromIP || false;
  }

  if (!merged.display && (merged.city || merged.country)) {
    merged.display = [merged.city, merged.region, merged.country].filter(Boolean).join(', ');
  }

  if (!merged.city && !merged.country && !merged.placeId) {
    return existingLocation || null;
  }

  return merged;
}

/**
 * True when location has enough text/geo to be useful for display or geocoding.
 */
function hasUsableLocation(location) {
  return !!(location?.placeId || location?.city || location?.country || location?.countryCode);
}

/**
 * Prefer non-IP home locations when inferring media origin from a linked artist.
 */
function isStrongArtistHomeLocation(location) {
  if (!hasUsableLocation(location)) return false;
  if (location.detectedFromIP) return false;
  return !!(location.placeId || location.city || location.country || location.countryCode);
}

/**
 * Reverse lookup: ISO country code → display name (first match in countryCodeMap).
 */
function countryNameFromCode(code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  for (const [name, mapped] of Object.entries(countryCodeMap)) {
    if (String(mapped).toUpperCase() === upper) return name;
  }
  return null;
}

/**
 * True when location has text/coords usable for Mapbox resolve but no placeId yet
 * (pre-Mapbox manual edits, failed geocodes, etc.).
 */
function needsMapboxEnrichment(location) {
  if (!location || location.placeId) return false;
  if (hasUsableLocation(location)) return true;
  const lat = location.coordinates?.lat;
  const lng = location.coordinates?.lng;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

/**
 * Geocode/reverse-geocode a text-or-coords location into full Mapbox fields.
 * Preserves existing city/region/country when merging. No-op without token or placeId.
 *
 * @param {Object|null|undefined} location
 * @returns {Promise<Object|null>}
 */
async function ensureMapboxResolvedLocation(location) {
  if (!location || typeof location !== 'object') return location || null;
  if (location.placeId) return applyResolvedLocation(location);
  if (!process.env.MAPBOX_ACCESS_TOKEN) return applyResolvedLocation(location);

  const { geocodeQuery, reverseGeocode } = require('../services/mapboxGeocodingService');

  let resolved = null;
  const hasPlaceText = !!(location.city || location.region);
  const countryLabel =
    location.country || countryNameFromCode(location.countryCode) || null;
  const query = [location.city, location.region, countryLabel].filter(Boolean).join(', ');
  const countryHint = location.countryCode
    ? String(location.countryCode).toLowerCase()
    : undefined;

  // Prefer forward geocode when we have place/country text so country-only
  // centroids are not reverse-geocoded into an arbitrary locality.
  if (query) {
    try {
      const forwardOpts = {};
      if (hasPlaceText) {
        if (countryHint) forwardOpts.country = countryHint;
      } else {
        // Country-only: restrict to country features so "Europe" doesn't
        // resolve to a French commune named Europe.
        forwardOpts.types = 'country';
      }
      resolved = await geocodeQuery(query, forwardOpts);
    } catch (err) {
      console.warn(
        `ensureMapboxResolvedLocation: forward geocode failed for "${query}":`,
        err.message
      );
    }
  }

  const lat = Number(location.coordinates?.lat);
  const lng = Number(location.coordinates?.lng);
  if (!resolved?.placeId && Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      resolved = await reverseGeocode(lng, lat);
    } catch (err) {
      console.warn(
        `ensureMapboxResolvedLocation: reverse geocode failed for ${lng},${lat}:`,
        err.message
      );
    }
  }

  if (!resolved?.placeId) {
    return applyResolvedLocation(location);
  }

  return applyResolvedLocation(resolved, location);
}

/**
 * Apply a resolved location onto media.primaryLocation + locationSource.
 * Never overwrites locationSource === 'manual' unless forceManual.
 *
 * @returns {boolean} whether media was changed
 */
function applyLocationToMedia(media, location, source, { forceManual = false } = {}) {
  if (!media || !hasUsableLocation(location)) return false;
  if (media.locationSource === 'manual' && !forceManual) return false;

  const incoming = { ...location };
  if (!incoming.country && incoming.countryCode) {
    incoming.country = countryNameFromCode(incoming.countryCode) || incoming.country;
  }
  // Avoid "Ireland, Ireland" when city was set to the country name
  if (
    incoming.city
    && incoming.country
    && String(incoming.city).toLowerCase() === String(incoming.country).toLowerCase()
  ) {
    incoming.city = null;
  }

  const merged = applyResolvedLocation(incoming, media.primaryLocation);
  if (!hasUsableLocation(merged)) return false;

  if (!merged.country && merged.countryCode) {
    merged.country = countryNameFromCode(merged.countryCode) || merged.country;
  }
  if (
    merged.city
    && merged.country
    && String(merged.city).toLowerCase() === String(merged.country).toLowerCase()
  ) {
    merged.city = null;
  }
  if (!merged.display) {
    merged.display = formatLocationDisplay(merged);
  } else if (
    merged.city
    && merged.country
    && merged.display === `${merged.city}, ${merged.country}`
    && merged.city.toLowerCase() === merged.country.toLowerCase()
  ) {
    merged.display = merged.country;
  }

  media.primaryLocation = merged;
  media.locationSource = source || media.locationSource || null;
  if (typeof media.markModified === 'function') {
    media.markModified('primaryLocation');
  }
  return true;
}

/**
 * Home for bid stamps: prefer homeLocation, fall back to secondaryLocation.
 */
function getUserBidLocation(user) {
  if (!user) return null;
  if (hasUsableLocation(user.homeLocation)) {
    return user.homeLocation;
  }
  if (hasUsableLocation(user.secondaryLocation)) {
    return user.secondaryLocation;
  }
  return user.homeLocation || user.secondaryLocation || null;
}

function collectAncestorIds(location) {
  if (!location) return [];
  const placeId = location.placeId || null;
  const ancestorIds = Array.isArray(location.ancestorIds) ? location.ancestorIds : [];
  if (placeId) {
    return [...new Set([placeId, ...ancestorIds])];
  }
  return [...new Set(ancestorIds)];
}

/**
 * True when a location can produce Mapbox ancestor IDs for bid/chart stamps.
 */
function isStampableLocation(location) {
  return collectAncestorIds(location).length > 0;
}

function formatLocationDisplay(location) {
  if (!location) return null;
  return (
    location.display ||
    [location.city, location.region, location.country].filter(Boolean).join(', ') ||
    null
  );
}

/**
 * Country-level Mapbox place from a resolved location (self or ancestors).
 */
function extractCountryFromLocation(location) {
  if (!location) return null;

  if (location.featureType === 'country' && location.placeId) {
    const name = location.country || location.label || location.display || null;
    if (!name) return null;
    return {
      placeId: location.placeId,
      country: name,
      countryCode: location.countryCode || '',
    };
  }

  const ancestors = Array.isArray(location.ancestors) ? location.ancestors : [];
  const countryAncestor = ancestors.find((a) => a.placetype === 'country');
  if (countryAncestor?.placeId) {
    return {
      placeId: countryAncestor.placeId,
      country: countryAncestor.label || location.country || 'Country',
      countryCode: countryAncestor.countryCode || location.countryCode || '',
    };
  }

  if (location.country) {
    return {
      placeId: null,
      country: location.country,
      countryCode: location.countryCode || '',
    };
  }

  return null;
}

/**
 * Short place label for chips (city/town), excluding country-only homes.
 */
function extractPlaceLabel(location) {
  if (!location || location.featureType === 'country') return null;

  if (location.city) return location.city;
  if (location.label && location.featureType && location.featureType !== 'country') {
    return location.label;
  }

  const display = formatLocationDisplay(location);
  if (!display) return null;
  const parts = display.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[0];
  return null;
}

/**
 * Snapshot home (+ optional current) location onto a Bid for Tunefeed / local charts.
 * Ancestor IDs are the union of both places so one tip can influence charts in both.
 */
function getBidLocationSnapshot(homeLocation, currentLocation = null) {
  const home = hasUsableLocation(homeLocation) ? homeLocation : null;
  const current = hasUsableLocation(currentLocation) ? currentLocation : null;

  const bidderLocationAncestorIds = [
    ...new Set([...collectAncestorIds(home), ...collectAncestorIds(current)]),
  ];

  if (!bidderLocationAncestorIds.length) {
    return {};
  }

  const country = extractCountryFromLocation(home) || extractCountryFromLocation(current);
  const placeLabel = extractPlaceLabel(home) || extractPlaceLabel(current);
  const primary = home || current;

  return {
    bidderHomePlaceId: home?.placeId || null,
    bidderCurrentPlaceId: current?.placeId || null,
    bidderLocationAncestorIds,
    bidderLocationDisplay: formatLocationDisplay(home) || formatLocationDisplay(current),
    bidderCountryPlaceId: country?.placeId || null,
    bidderCountry: country?.country || null,
    bidderCountryCode: country?.countryCode || null,
    bidderPlaceLabel: placeLabel || null,
    bidderFeatureType: primary?.featureType || null,
  };
}

/**
 * Build bid location fields from the user profile plus optional tip-time current location.
 */
function buildBidLocationSnapshot(user, currentLocationInput = null) {
  const home = getUserBidLocation(user);
  const current = currentLocationInput
    ? applyResolvedLocation(currentLocationInput)
    : null;
  return getBidLocationSnapshot(home, current);
}

module.exports = {
  countryCodeMap,
  countryNameFromCode,
  processLocation,
  mergeLocation,
  applyResolvedLocation,
  hasUsableLocation,
  isStrongArtistHomeLocation,
  needsMapboxEnrichment,
  ensureMapboxResolvedLocation,
  applyLocationToMedia,
  getUserBidLocation,
  getBidLocationSnapshot,
  buildBidLocationSnapshot,
  collectAncestorIds,
  isStampableLocation,
  extractCountryFromLocation,
  extractPlaceLabel,
  formatLocationDisplay,
};

