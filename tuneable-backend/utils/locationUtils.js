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

module.exports = {
  countryCodeMap,
  processLocation,
  mergeLocation
};

