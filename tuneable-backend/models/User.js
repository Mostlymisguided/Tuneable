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
  profilePic: { type: String, default: 'https://uploads.tuneable.stream/profile-pictures/default-profile.png' }, // Stores URL or file path
  personalInviteCode: { type: String, required: true, unique: true },
  parentInviteCode: { type: String, required: false },
  balance: { type: Number, default: 0 }, // Wallet balance stored in PENCE (integer), not pounds
  // Example: 1050 represents £10.50, 3300 represents £33.00
  inviteCredits: { type: Number, default: 10 }, // Invite credits for inviting new users
  tuneBytes: { 
    type: Number, 
    default: 0 
  },
  tuneBytesHistory: [{
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
    earnedAmount: Number,
    earnedAt: { type: Date, default: Date.now },
    bidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid' },
    discoveryRank: Number, // 1st, 2nd, 3rd bidder, etc.
    reason: { type: String, enum: ['discovery', 'popularity_growth'] }
  }],
  homeLocation: {
    city: { type: String },
    region: { type: String }, // State, province, or region
    country: { type: String },
    countryCode: { type: String }, // ISO 3166-1 alpha-2 (e.g., "US", "GB", "FR")
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    detectedFromIP: { type: Boolean, default: false } // Track if auto-detected from IP
  },
  secondaryLocation: {
    city: { type: String },
    region: { type: String },
    country: { type: String },
    countryCode: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    }
  },
  preferences: {
    theme: { type: String, default: 'light' },
    anonymousMode: { type: Boolean, default: false },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      types: {
        bid_received: { type: Boolean, default: true },
        bid_outbid: { type: Boolean, default: true },
        comment_reply: { type: Boolean, default: true },
        creator_approved: { type: Boolean, default: true },
        creator_rejected: { type: Boolean, default: true },
        claim_approved: { type: Boolean, default: true },
        claim_rejected: { type: Boolean, default: true },
        tune_bytes_earned: { type: Boolean, default: true },
        admin_announcement: { type: Boolean, default: true },
      },
    },
  },
  role: { 
    type: [String], 
    enum: ['user', 'admin', 'creator', 'host', 'moderator', 'partier', 'dj'], 
    default: ['user'] 
  },
  isActive: { type: Boolean, default: true },
  
  // Email verification
  emailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },
  
  // Password reset
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  
  // Last login tracking
  lastLoginAt: { type: Date },
  
  // Social media links (available to all users)
  socialMedia: {
    instagram: String,
    facebook: String,
    soundcloud: String,
    spotify: String,
    youtube: String,
    twitter: String
  },
  
  // Creator profile for verified creators/artists
  creatorProfile: {
    artistName: { type: String },
    bio: { type: String, maxlength: 500 },
    genres: [String],
    roles: [String], // ['artist', 'producer', 'songwriter', etc.]
    website: { type: String },
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
    soundcloud: { type: Boolean, default: false },
    google: { type: Boolean, default: false }
  },
  
  // Label affiliations
  labelAffiliations: [{
    labelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Label', required: true },
    role: { type: String, enum: ['artist', 'producer', 'manager', 'staff'], required: true },
    status: { type: String, enum: ['pending', 'active', 'inactive'], default: 'pending' },
    joinedAt: { type: Date, default: Date.now },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Party affiliations - track which parties user has joined
  joinedParties: [{
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    joinedAt: { type: Date, default: Date.now },
    role: { type: String, enum: ['partier', 'host', 'moderator'], default: 'partier' }
  }],
  
  // Tag rankings - cached top tags by bid aggregate (performance optimization)
  tagRankings: [{
    tag: { type: String, required: true },
    aggregate: { type: Number, required: true }, // Total bid amount for this tag
    rank: { type: Number, required: true }, // User's rank for this tag (1-indexed)
    totalUsers: { type: Number, required: true }, // Total users who bid on this tag
    percentile: { type: Number, required: true }, // Percentile ranking (0-100)
    lastUpdated: { type: Date, default: Date.now }
  }],
  tagRankingsUpdatedAt: { type: Date } // Last time tag rankings were recalculated
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

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = token;
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = token;
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  return token;
};

// Verify email with token
userSchema.methods.verifyEmail = function(token) {
  if (this.emailVerificationToken === token && 
      this.emailVerificationExpires > Date.now()) {
    this.emailVerified = true;
    this.emailVerificationToken = undefined;
    this.emailVerificationExpires = undefined;
    return true;
  }
  return false;
};

// Reset password with token
userSchema.methods.resetPassword = function(token, newPassword) {
  if (this.passwordResetToken === token && 
      this.passwordResetExpires > Date.now()) {
    this.password = newPassword;
    this.passwordResetToken = undefined;
    this.passwordResetExpires = undefined;
    return true;
  }
  return false;
};

// Indexes

//comment to check debug restart

module.exports = mongoose.model('User', userSchema);
