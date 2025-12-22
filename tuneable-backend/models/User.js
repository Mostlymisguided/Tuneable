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
  // Legacy field - kept for backward compatibility, will be migrated to personalInviteCodes
  personalInviteCode: { type: String, required: false, unique: true, sparse: true },
  // New multiple invite codes structure
  personalInviteCodes: [{
    code: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    label: { type: String }, // Optional label like "Reddit", "Twitter", etc.
    createdAt: { type: Date, default: Date.now },
    usageCount: { type: Number, default: 0 } // Track how many users signed up with this code
  }],
  parentInviteCode: { type: String, required: false },
  parentInviteCodeId: { type: mongoose.Schema.Types.ObjectId }, // Reference to specific invite code object (optional, for tracking)
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
  // ========================================
  // ARTIST ESCROW (Phase 1: Internal Ledger)
  // ========================================
  artistEscrowBalance: { 
    type: Number, 
    default: 0 
  }, // Artist revenue in PENCE (integer), not pounds - unclaimed until payout
  // Example: 1050 represents £10.50, 3300 represents £33.00
  artistEscrowHistory: [{
    mediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media' },
    bidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid' },
    amount: { type: Number, required: true }, // In pence
    allocatedAt: { type: Date, default: Date.now },
    claimedAt: { type: Date },
    status: { type: String, enum: ['pending', 'claimed'], default: 'pending' },
    _id: false
  }],
  totalEscrowEarned: { 
    type: Number, 
    default: 0 
  }, // Cumulative total escrow earned in PENCE (integer) - tracks all-time earnings for payout eligibility
  // Example: 3300 represents £33.00 total earned
  lastPayoutTotalEarned: { 
    type: Number, 
    default: 0 
  }, // Total escrow earned at the time of last payout in PENCE (integer) - used to calculate subsequent payout eligibility
  // Example: 3300 means last payout was when total earned was £33.00
  stripeConnectAccountId: { 
    type: String 
  }, // For future Stripe Connect migration (Phase 2)
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
    defaultTip: { 
      type: Number, 
      default: 0.11, // 11p default
      min: [0.01, 'Default tip must be at least £0.01']
    },
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
  
  // Email unsubscribe
  unsubscribeToken: { type: String },
  unsubscribeTokenExpires: { type: Date },
  
  // Last login tracking
  lastLoginAt: { type: Date },
  
  // Account lockout for failed login attempts
  failedLoginAttempts: { type: Number, default: 0 },
  accountLockedUntil: { type: Date, default: null },
  lastFailedLoginAttempt: { type: Date, default: null },
  
  // User warnings system
  warnings: [{
    type: {
      type: String,
      enum: ['info', 'warning', 'final_warning', 'suspension_notice'],
      required: true
    },
    message: { type: String, required: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    issuedAt: { type: Date, default: Date.now },
    acknowledgedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }, // null = never expires
    reason: { type: String }, // Reason for warning (e.g., "Spam", "Harassment")
    _id: false
  }],
  warningCount: { type: Number, default: 0 }, // Total count of warnings (for escalation)
  finalWarningCount: { type: Number, default: 0 }, // Count of final warnings
  
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
    status: { type: String, enum: ['pending', 'active'], default: 'pending' },
    joinedAt: { type: Date, default: Date.now },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Pending admin invitations to labels
  pendingLabelAdminInvites: [{
    labelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Label', required: true },
    invitedAt: { type: Date, default: Date.now },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Party affiliations - track which parties user has joined
  joinedParties: [{
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    joinedAt: { type: Date, default: Date.now },
    role: { type: String, enum: ['partier', 'host', 'moderator'], default: 'partier' }
  }],
  
  // Followed parties - track which parties user follows (but hasn't joined)
  followedParties: [{
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true },
    followedAt: { type: Date, default: Date.now }
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

// Generate unsubscribe token
userSchema.methods.generateUnsubscribeToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  this.unsubscribeToken = token;
  this.unsubscribeTokenExpires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  return token;
};

// Helper method to find user by invite code (checks both old and new structure)
userSchema.statics.findByInviteCode = async function(code) {
  if (!code || code.length !== 5) {
    return null;
  }
  const upperCode = code.toUpperCase();
  
  // First check new structure (personalInviteCodes array)
  const userByNewCode = await this.findOne({
    'personalInviteCodes.code': upperCode,
    'personalInviteCodes.isActive': true
  });
  if (userByNewCode) {
    return userByNewCode;
  }
  
  // Fallback to legacy personalInviteCode field for backward compatibility
  return await this.findOne({ personalInviteCode: upperCode });
};

// Helper method to get active invite codes
userSchema.methods.getActiveInviteCodes = function() {
  if (this.personalInviteCodes && this.personalInviteCodes.length > 0) {
    return this.personalInviteCodes.filter(ic => ic.isActive);
  }
  // Fallback to legacy code if array is empty
  if (this.personalInviteCode) {
    return [{ code: this.personalInviteCode, isActive: true, label: 'Primary', createdAt: this.createdAt || new Date(), usageCount: 0 }];
  }
  return [];
};

// Helper method to get primary invite code (for backward compatibility)
userSchema.methods.getPrimaryInviteCode = function() {
  const activeCodes = this.getActiveInviteCodes();
  if (activeCodes.length > 0) {
    return activeCodes[0].code;
  }
  // Fallback to legacy field
  return this.personalInviteCode || null;
};

// Helper method to find specific invite code object by code string
userSchema.methods.findInviteCodeObject = function(code) {
  if (!this.personalInviteCodes || this.personalInviteCodes.length === 0) {
    // If no array, check legacy field
    if (this.personalInviteCode === code.toUpperCase()) {
      return { code: this.personalInviteCode, isActive: true, _id: null };
    }
    return null;
  }
  return this.personalInviteCodes.find(ic => ic.code === code.toUpperCase());
};

// Virtual for backward compatibility - returns primary code
userSchema.virtual('primaryInviteCode').get(function() {
  return this.getPrimaryInviteCode();
});

// Indexes
// Index for invite code lookups
userSchema.index({ 'personalInviteCodes.code': 1 });
// Note: personalInviteCode already has unique: true which creates an index automatically

//comment to check debug restart

module.exports = mongoose.model('User', userSchema);
