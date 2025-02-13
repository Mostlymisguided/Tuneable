const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  cellPhone:{ type: String }, 
  givenName:{ type: String },
  familyName:{ type: String },
  profilePic: { type: String, default: null }, // Stores URL or file path
  personalInviteCode: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 }, // New field for wallet balance
  homeLocation: {
    city: { type: String, default: null },
    country: { type: String, default: null },
    //Add what3words
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  preferences: {
    theme: { type: String, default: 'light' },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
  },
  role: { 
    type: [String], 
    enum: ['user', 'admin', 'artist', 'host', 'moderator', 'attendee', 'dj'], 
    default: ['user'] 
  },
  isActive: { type: Boolean, default: true },
}, { 
 
  toJSON: { virtuals: true }, 
  toObject: { virtuals: true } 
});

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
  return this.findById(userId).select('-password');
};

// Static method to find a user by email
userSchema.statics.findByEmail = async function(email) {
  return this.findOne({ email }).select('-password');
};

//comment to check debug restart

module.exports = mongoose.model('User', userSchema);
