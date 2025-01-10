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
    notifications: { type: Boolean, default: true } // Enable/disable notifications
  }
}, { timestamps: true });

// Pre-save hook to hash the password
/* userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
}); */

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
