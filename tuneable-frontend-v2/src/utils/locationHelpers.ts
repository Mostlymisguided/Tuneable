// Location matching and formatting utilities

export interface Location {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  detectedFromIP?: boolean;
}

/**
 * Check if user location matches party location filter
 */
export function isLocationMatch(
  partyFilter: { city?: string; countryCode: string },
  userLocation: Location | null | undefined
): boolean {
  if (!userLocation || !userLocation.countryCode) {
    return false;
  }
  
  // Country code must match
  if (partyFilter.countryCode.toUpperCase() !== userLocation.countryCode.toUpperCase()) {
    return false;
  }
  
  // If party specifies a city, user must match that city
  if (partyFilter.city) {
    return userLocation.city?.toLowerCase() === partyFilter.city.toLowerCase();
  }
  
  // If party is country-level, any city in that country matches
  return true;
}

/**
 * Format location for display
 */
export function formatLocation(location: Location | null | undefined): string {
  if (!location) {
    return 'Unknown Location';
  }
  
  if (location.city && location.country) {
    return `${location.city}, ${location.country}`;
  }
  if (location.city && location.countryCode) {
    return `${location.city}, ${location.countryCode}`;
  }
  if (location.city) {
    return location.city;
  }
  if (location.country) {
    return location.country;
  }
  if (location.countryCode) {
    return location.countryCode;
  }
  
  return 'Unknown Location';
}

/**
 * Format location filter for display
 */
export function formatLocationFilter(filter: { city?: string; country?: string; countryCode?: string }): string {
  if (filter.city && filter.country) {
    return `${filter.city}, ${filter.country}`;
  }
  if (filter.city && filter.countryCode) {
    return `${filter.city}, ${filter.countryCode}`;
  }
  if (filter.city) {
    return filter.city;
  }
  if (filter.country) {
    return filter.country;
  }
  if (filter.countryCode) {
    return filter.countryCode;
  }
  
  return 'Unknown Location';
}

