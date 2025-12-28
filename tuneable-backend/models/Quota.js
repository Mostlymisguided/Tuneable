const mongoose = require('mongoose');

const quotaSchema = new mongoose.Schema({
  date: { 
    type: String, 
    required: true, 
    unique: true
  }, // YYYY-MM-DD format (unique automatically creates index)
  usage: { 
    type: Number, 
    default: 0,
    min: 0
  },
  history: [{
    timestamp: { type: Date, default: Date.now },
    units: Number,
    operation: String,
    metadata: mongoose.Schema.Types.Mixed,
    totalUsage: Number
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Note: date field already has unique: true which automatically creates an index

module.exports = mongoose.models.Quota || mongoose.model('Quota', quotaSchema);

