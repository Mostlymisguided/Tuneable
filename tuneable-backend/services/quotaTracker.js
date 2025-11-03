/**
 * API Quota Tracking Service
 * Tracks daily API quota usage with automatic reset
 */

// In-memory storage for quota (could be moved to Redis for production)
let quotaData = {
  usage: 0,
  resetDate: null,
  history: []
};

// YouTube API quota costs (units per operation)
const QUOTA_COSTS = {
  SEARCH_LIST: 100,           // search.list API call
  VIDEOS_LIST_BASIC: 1,        // videos.list with basic parts (per 50 videos)
  VIDEOS_LIST_SNIPPET: 2,      // videos.list with snippet (per 50 videos)
  VIDEOS_LIST_CONTENT_DETAILS: 1, // videos.list with contentDetails (per 50 videos)
  VIDEO_CATEGORIES: 1,         // videoCategories.list
  PLAYLIST_ITEMS: 1            // playlistItems.list (per 50 items)
};

// Daily quota limit
const DAILY_QUOTA_LIMIT = 10000;

/**
 * Get or initialize quota tracking for today
 */
function getTodayQuota() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Reset if it's a new day
  if (!quotaData.resetDate || quotaData.resetDate !== today) {
    console.log(`🔄 Resetting quota tracking for ${today}`);
    quotaData = {
      usage: 0,
      resetDate: today,
      history: []
    };
  }
  
  return quotaData;
}

/**
 * Record quota usage
 * @param {number} units - Quota units consumed
 * @param {string} operation - Description of the operation
 * @param {object} metadata - Additional metadata
 */
function recordQuotaUsage(units, operation, metadata = {}) {
  const quota = getTodayQuota();
  
  quota.usage += units;
  
  quota.history.push({
    timestamp: new Date().toISOString(),
    units,
    operation,
    metadata,
    totalUsage: quota.usage
  });
  
  // Keep only last 100 entries in history
  if (quota.history.length > 100) {
    quota.history = quota.history.slice(-100);
  }
  
  const percentage = (quota.usage / DAILY_QUOTA_LIMIT) * 100;
  
  console.log(`📊 Quota usage: ${quota.usage}/${DAILY_QUOTA_LIMIT} units (${percentage.toFixed(1)}%) - ${operation}`);
  
  return {
    usage: quota.usage,
    limit: DAILY_QUOTA_LIMIT,
    remaining: DAILY_QUOTA_LIMIT - quota.usage,
    percentage: percentage,
    resetDate: quota.resetDate
  };
}

/**
 * Get current quota status
 */
function getQuotaStatus() {
  const quota = getTodayQuota();
  const percentage = (quota.usage / DAILY_QUOTA_LIMIT) * 100;
  
  // Calculate reset time (midnight UTC tomorrow)
  const resetDate = new Date(quota.resetDate + 'T00:00:00Z');
  resetDate.setUTCDate(resetDate.getUTCDate() + 1);
  const resetTime = resetDate.toISOString();
  
  return {
    usage: quota.usage,
    limit: DAILY_QUOTA_LIMIT,
    remaining: Math.max(0, DAILY_QUOTA_LIMIT - quota.usage),
    percentage: percentage,
    resetDate: quota.resetDate,
    resetTime: resetTime,
    status: percentage >= 90 ? 'critical' : percentage >= 70 ? 'warning' : percentage >= 50 ? 'caution' : 'healthy',
    canSearch: quota.usage < DAILY_QUOTA_LIMIT * 0.95 // Allow searches if under 95%
  };
}

/**
 * Get quota history
 */
function getQuotaHistory(limit = 50) {
  const quota = getTodayQuota();
  return quota.history.slice(-limit);
}

/**
 * Reset quota manually (admin only)
 */
function resetQuota() {
  const today = new Date().toISOString().split('T')[0];
  quotaData = {
    usage: 0,
    resetDate: today,
    history: []
  };
  console.log('🔄 Quota manually reset');
  return getQuotaStatus();
}

module.exports = {
  recordQuotaUsage,
  getQuotaStatus,
  getQuotaHistory,
  resetQuota,
  QUOTA_COSTS,
  DAILY_QUOTA_LIMIT
};
