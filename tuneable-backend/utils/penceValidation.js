/**
 * Pence Validation Utility
 * 
 * Provides validation functions for monetary amounts stored in PENCE (integer).
 * All monetary amounts in the database are stored as integers in pence,
 * not as decimals in pounds. Example: £1.50 = 150 pence.
 * 
 * @module utils/penceValidation
 */

/**
 * Validate that an amount is a valid integer in pence
 * @param {number} amount - Amount to validate (should be in pence)
 * @param {string} context - Context for error messages (e.g., "bid amount", "balance")
 * @param {boolean} allowZero - Whether zero is allowed (default: true)
 * @returns {number} Validated amount as integer
 * @throws {Error} If amount is invalid (not a number, negative when zero not allowed, or has decimals)
 */
function validatePenceAmount(amount, context = 'amount', allowZero = true) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error(`Invalid ${context}: must be a number (expected pence as integer)`);
  }
  
  if (amount < 0) {
    throw new Error(`Invalid ${context}: cannot be negative (got ${amount} pence)`);
  }
  
  if (!allowZero && amount === 0) {
    throw new Error(`Invalid ${context}: cannot be zero`);
  }
  
  if (!Number.isInteger(amount)) {
    const rounded = Math.round(amount);
    console.warn(`⚠️  ${context} is not an integer: ${amount}. Rounding to ${rounded} pence`);
    return rounded;
  }
  
  return amount;
}

/**
 * Validate that a pounds amount can be converted to pence
 * @param {number} pounds - Amount in pounds (decimal)
 * @param {string} context - Context for error messages
 * @returns {number} Validated amount converted to pence (integer)
 * @throws {Error} If amount is invalid
 */
function validatePoundsAndConvertToPence(pounds, context = 'amount') {
  if (typeof pounds !== 'number' || isNaN(pounds)) {
    throw new Error(`Invalid ${context}: must be a number (expected pounds as decimal)`);
  }
  
  if (pounds < 0) {
    throw new Error(`Invalid ${context}: cannot be negative (got £${pounds})`);
  }
  
  // Convert to pence and validate the result is a valid integer
  const pence = Math.round(pounds * 100);
  return validatePenceAmount(pence, `${context} (converted from pounds)`);
}

/**
 * Check if a value is a valid pence amount (integer >= 0)
 * @param {number} amount - Amount to check
 * @returns {boolean} True if valid pence amount
 */
function isValidPenceAmount(amount) {
  return typeof amount === 'number' && 
         !isNaN(amount) && 
         amount >= 0 && 
         Number.isInteger(amount);
}

module.exports = {
  validatePenceAmount,
  validatePoundsAndConvertToPence,
  isValidPenceAmount
};

