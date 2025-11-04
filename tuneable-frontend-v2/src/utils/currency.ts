/**
 * Currency utility functions for converting between pence and pounds
 * 
 * All amounts in the database are stored in PENCE (integer)
 * Frontend should convert to pounds for display
 */

/**
 * Convert pence to formatted pounds string
 * @param pence - Amount in pence (integer)
 * @returns Formatted string like "£0.33" or "£10.50"
 */
export const penceToPounds = (pence: number | null | undefined): string => {
  if (pence === null || pence === undefined || isNaN(pence)) {
    return '£0.00';
  }
  return `£${(pence / 100).toFixed(2)}`;
};

/**
 * Convert pence to pounds number
 * @param pence - Amount in pence (integer)
 * @returns Amount in pounds (decimal)
 */
export const penceToPoundsNumber = (pence: number | null | undefined): number => {
  if (pence === null || pence === undefined || isNaN(pence)) {
    return 0;
  }
  return pence / 100;
};

/**
 * Convert pounds to pence
 * @param pounds - Amount in pounds (decimal)
 * @returns Amount in pence (integer)
 */
export const poundsToPence = (pounds: number | null | undefined): number => {
  if (pounds === null || pounds === undefined || isNaN(pounds)) {
    return 0;
  }
  return Math.round(pounds * 100);
};

/**
 * Format pence as currency string with optional minimum decimals
 * @param pence - Amount in pence (integer)
 * @param minDecimals - Minimum number of decimal places (default: 2)
 * @returns Formatted string
 */
export const formatCurrency = (
  pence: number | null | undefined,
  minDecimals: number = 2
): string => {
  if (pence === null || pence === undefined || isNaN(pence)) {
    return '£0.00';
  }
  const pounds = pence / 100;
  return `£${pounds.toFixed(minDecimals)}`;
};

