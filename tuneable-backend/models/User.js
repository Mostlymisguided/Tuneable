const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { uuidv7 } = require('uuidv7');

const userSchema = new mongoose.Schema({
  uuid: { type: String, unique: true, default: uuidv7 },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: false, unique: true, sparse: true },
  password: { type: String }, // Made optional for OAuth users
  // OAuth fields
  facebookId: { type: String, unique: true, sparse: true },
  facebookAccessToken: { type: String },
  googleId: { type: String, unique: true, sparse: true },
  googleAccessToken: { type: String },
  googleRefreshToken: { type: String },
  soundcloudId: { type: String, unique: true, sparse: true },
  soundcloudUsername: { type: String },
  soundcloudAccessToken: { type: String },
  instagramId: { type: String, unique: true, sparse: true },
  instagramUsername: { type: String },
  instagramAccessToken: { type: String },
  cellPhone:{ type: String }, 
  givenName:{ type: String },
  familyName:{ type: String },
  profilePic: { type: String, default: null }, // Stores URL or file path
  personalInviteCode: { type: String, required: true, unique: true },
  parentInviteCode: { type: String, required: false },
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
    enum: ['user', 'admin', 'creator', 'artist', 'host', 'moderator', 'attendee', 'dj'], 
    default: ['user'] 
  },
  isActive: { type: Boolean, default: true },
  
  // Creator profile for verified creators/artists
  creatorProfile: {
    artistName: { type: String },
    bio: { type: String, maxlength: 500 },
    genres: [String],
    roles: [String], // ['artist', 'producer', 'songwriter', etc.]
    website: { type: String },
    socialMedia: {
      instagram: String,
      facebook: String,
      soundcloud: String,
      spotify: String,
      youtube: String,
      twitter: String
    },
    label: String,
    management: String,
    distributor: String,
    
    // Verification status
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified'
    },
    verificationMethod: String, // 'oauth', 'manual', 'admin'
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  // OAuth verification flags
  oauthVerified: {
    instagram: { type: Boolean, default: false },
    facebook: { type: Boolean, default: false },
    soundcloud: { type: Boolean, default: false }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true }, 
  toObject: { virtuals: true } 
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

// Indexes

//comment to check debug restart

module.exports = mongoose.model('User', userSchema);
