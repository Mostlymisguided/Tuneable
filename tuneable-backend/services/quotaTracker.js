/**
 * API Quota Tracking Service
 * Tracks daily API quota usage with automatic reset
 * Now persisted to MongoDB for deployment resilience
 */

const Quota = require('../models/Quota');
const AdminSettings = require('../models/AdminSettings');

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
async function getTodayQuota() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  try {
    let quota = await Quota.findOne({ date: today });
    
    if (!quota) {
      console.log(`🔄 Initializing quota tracking for ${today}`);
      quota = await Quota.create({
        date: today,
        usage: 0,
        history: []
      });
    }
    
    return quota;
  } catch (error) {
    console.error('Error getting quota:', error);
    // Fallback to in-memory if DB fails
    return {
      usage: 0,
      date: today,
      resetDate: today,
      history: [],
      save: async () => {} // No-op for fallback
    };
  }
}

/**
 * Record quota usage
 * @param {number} units - Quota units consumed
 * @param {string} operation - Description of the operation
 * @param {object} metadata - Additional metadata
 */
async function recordQuotaUsage(units, operation, metadata = {}) {
  const quota = await getTodayQuota();
  
  quota.usage += units;
  
  quota.history.push({
    timestamp: new Date(),
    units,
    operation,
    metadata,
    totalUsage: quota.usage
  });
  
  // Keep only last 100 entries in history
  if (quota.history.length > 100) {
    quota.history = quota.history.slice(-100);
  }
  
  await quota.save();
  
  const percentage = (quota.usage / DAILY_QUOTA_LIMIT) * 100;
  
  console.log(`📊 Quota usage: ${quota.usage}/${DAILY_QUOTA_LIMIT} units (${percentage.toFixed(1)}%) - ${operation}`);
  
  return {
    usage: quota.usage,
    limit: DAILY_QUOTA_LIMIT,
    remaining: DAILY_QUOTA_LIMIT - quota.usage,
    percentage: percentage,
    resetDate: quota.date || quota.resetDate
  };
}

/**
 * Get current quota status
 */
async function getQuotaStatus() {
  const quota = await getTodayQuota();
  const percentage = (quota.usage / DAILY_QUOTA_LIMIT) * 100;
  
  // Get admin settings for threshold
  let threshold = 95; // Default threshold
  let thresholdEnabled = true; // Default enabled
  try {
    const settings = await AdminSettings.getSettings();
    threshold = settings.youtubeQuota?.disableSearchThreshold ?? 95;
    thresholdEnabled = settings.youtubeQuota?.enabled !== false;
  } catch (error) {
    console.error('Error loading admin settings, using defaults:', error);
  }
  
  // Calculate reset time (midnight UTC tomorrow)
  const dateString = quota.date || quota.resetDate;
  const resetDate = new Date(dateString + 'T00:00:00Z');
  resetDate.setUTCDate(resetDate.getUTCDate() + 1);
  const resetTime = resetDate.toISOString();
  
  // Check if search should be disabled based on admin threshold
  const isDisabled = thresholdEnabled && percentage >= threshold;
  
  return {
    usage: quota.usage,
    limit: DAILY_QUOTA_LIMIT,
    remaining: Math.max(0, DAILY_QUOTA_LIMIT - quota.usage),
    percentage: percentage,
    resetDate: dateString,
    resetTime: resetTime,
    status: percentage >= 90 ? 'critical' : percentage >= 70 ? 'warning' : percentage >= 50 ? 'caution' : 'healthy',
    canSearch: !isDisabled, // Based on admin threshold
    searchDisabled: isDisabled, // Explicit flag
    threshold: threshold, // Include threshold in response for admin UI
    thresholdEnabled: thresholdEnabled
  };
}

/**
 * Get quota history
 */
async function getQuotaHistory(limit = 50) {
  const quota = await getTodayQuota();
  return quota.history.slice(-limit);
}

/**
 * Reset quota manually (admin only)
 */
async function resetQuota() {
  const today = new Date().toISOString().split('T')[0];
  
  await Quota.findOneAndUpdate(
    { date: today },
    { 
      usage: 0,
      history: []
    },
    { upsert: true, new: true }
  );
  
  console.log('🔄 Quota manually reset');
  return await getQuotaStatus();
}

module.exports = {
  recordQuotaUsage,
  getQuotaStatus,
  getQuotaHistory,
  resetQuota,
  QUOTA_COSTS,
  DAILY_QUOTA_LIMIT
};
