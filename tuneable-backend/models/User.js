const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  avatar: { type: String, default: '' }, // URL for the user's avatar
  bio: { type: String, default: '' },    // Short user bio or description
  homeLocation: {
    city: { type: String, default: null },
    country: { type: String, default: null },
  },
  preferences: {                         // User-specific preferences
    theme: { type: String, default: 'light' }, // e.g., light or dark mode
    notifications: { type: Boolean, default: true }, // Enable/disable notifications
  },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }, // User role
  isActive: { type: Boolean, default: true }, // User account status
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual to alias _id as userId
userSchema.virtual('userId').get(function() {
  return this._id.toHexString();
});

// Pre-save hook to hash the password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Static method to find a user by userId
userSchema.statics.findByUserId = async function(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid userId format');
  }
  return this.findById(userId).select('-password'); // Exclude password from results
};

module.exports = mongoose.model('User', userSchema);
