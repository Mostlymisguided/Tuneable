const mongoose = require('mongoose');

const adminSettingsSchema = new mongoose.Schema({
  // Single document pattern - only one settings document exists
  _id: { type: String, default: 'settings' },
  
  // YouTube API quota settings
  youtubeQuota: {
    disableSearchThreshold: { 
      type: Number, 
      default: 95, 
      min: 0, 
      max: 100 
    }, // Percentage at which to disable search
    enabled: { 
      type: Boolean, 
      default: true 
    } // Master switch to enable/disable threshold checking
  },
  
  // Stripe payment settings
  stripe: {
    walletTopUpMode: {
      type: String,
      enum: ['test', 'live'],
      default: 'live' // Default to live mode for production
    } // Controls whether wallet top-ups use test or live Stripe keys
  },
  
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

// Ensure only one document exists
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ _id: 'settings' });
  if (!settings) {
    settings = await this.create({ _id: 'settings' });
  }
  return settings;
};

module.exports = mongoose.models.AdminSettings || mongoose.model('AdminSettings', adminSettingsSchema);

