const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Country name to country code mapping
const countryCodeMap = {
  'United Kingdom': 'GB',
  'Afghanistan': 'AF',
  'Albania': 'AL',
  'Algeria': 'DZ',
  'Andorra': 'AD',
  'Angola': 'AO',
  'Antigua and Barbuda': 'AG',
  'Argentina': 'AR',
  'Armenia': 'AM',
  'Australia': 'AU',
  'Austria': 'AT',
  'Azerbaijan': 'AZ',
  'Bahamas': 'BS',
  'Bahrain': 'BH',
  'Bangladesh': 'BD',
  'Barbados': 'BB',
  'Belarus': 'BY',
  'Belgium': 'BE',
  'Belize': 'BZ',
  'Benin': 'BJ',
  'Bhutan': 'BT',
  'Bolivia': 'BO',
  'Bosnia and Herzegovina': 'BA',
  'Botswana': 'BW',
  'Brazil': 'BR',
  'Brunei': 'BN',
  'Bulgaria': 'BG',
  'Burkina Faso': 'BF',
  'Burundi': 'BI',
  'Cambodia': 'KH',
  'Cameroon': 'CM',
  'Canada': 'CA',
  'Cape Verde': 'CV',
  'Central African Republic': 'CF',
  'Chad': 'TD',
  'Chile': 'CL',
  'China': 'CN',
  'Colombia': 'CO',
  'Comoros': 'KM',
  'Congo': 'CG',
  'Costa Rica': 'CR',
  'Croatia': 'HR',
  'Cuba': 'CU',
  'Cyprus': 'CY',
  'Czech Republic': 'CZ',
  'Democratic Republic of the Congo': 'CD',
  'Denmark': 'DK',
  'Djibouti': 'DJ',
  'Dominica': 'DM',
  'Dominican Republic': 'DO',
  'East Timor': 'TL',
  'Ecuador': 'EC',
  'Egypt': 'EG',
  'El Salvador': 'SV',
  'England': 'GB-ENG',
  'Equatorial Guinea': 'GQ',
  'Eritrea': 'ER',
  'Estonia': 'EE',
  'Ethiopia': 'ET',
  'Fiji': 'FJ',
  'Finland': 'FI',
  'France': 'FR',
  'Gabon': 'GA',
  'Gambia': 'GM',
  'Georgia': 'GE',
  'Germany': 'DE',
  'Ghana': 'GH',
  'Greece': 'GR',
  'Grenada': 'GD',
  'Guatemala': 'GT',
  'Guinea': 'GN',
  'Guinea-Bissau': 'GW',
  'Guyana': 'GY',
  'Haiti': 'HT',
  'Honduras': 'HN',
  'Hungary': 'HU',
  'Iceland': 'IS',
  'India': 'IN',
  'Indonesia': 'ID',
  'Iran': 'IR',
  'Iraq': 'IQ',
  'Ireland': 'IE',
  'Israel': 'IL',
  'Italy': 'IT',
  'Ivory Coast': 'CI',
  'Jamaica': 'JM',
  'Japan': 'JP',
  'Jordan': 'JO',
  'Kazakhstan': 'KZ',
  'Kenya': 'KE',
  'Kiribati': 'KI',
  'Kosovo': 'XK',
  'Kuwait': 'KW',
  'Kyrgyzstan': 'KG',
  'Laos': 'LA',
  'Latvia': 'LV',
  'Lebanon': 'LB',
  'Lesotho': 'LS',
  'Liberia': 'LR',
  'Libya': 'LY',
  'Liechtenstein': 'LI',
  'Lithuania': 'LT',
  'Luxembourg': 'LU',
  'Macau': 'MO',
  'Madagascar': 'MG',
  'Malawi': 'MW',
  'Malaysia': 'MY',
  'Maldives': 'MV',
  'Mali': 'ML',
  'Malta': 'MT',
  'Marshall Islands': 'MH',
  'Mauritania': 'MR',
  'Mauritius': 'MU',
  'Mexico': 'MX',
  'Micronesia': 'FM',
  'Moldova': 'MD',
  'Monaco': 'MC',
  'Mongolia': 'MN',
  'Montenegro': 'ME',
  'Morocco': 'MA',
  'Mozambique': 'MZ',
  'Myanmar': 'MM',
  'Namibia': 'NA',
  'Nauru': 'NR',
  'Nepal': 'NP',
  'Netherlands': 'NL',
  'New Zealand': 'NZ',
  'Nicaragua': 'NI',
  'Niger': 'NE',
  'Nigeria': 'NG',
  'North Korea': 'KP',
  'North Macedonia': 'MK',
  'Norway': 'NO',
  'Oman': 'OM',
  'Pakistan': 'PK',
  'Palau': 'PW',
  'Palestine': 'PS',
  'Panama': 'PA',
  'Papua New Guinea': 'PG',
  'Paraguay': 'PY',
  'Peru': 'PE',
  'Philippines': 'PH',
  'Poland': 'PL',
  'Portugal': 'PT',
  'Qatar': 'QA',
  'Republic of the Congo': 'CG',
  'Romania': 'RO',
  'Russia': 'RU',
  'Rwanda': 'RW',
  'Saint Kitts and Nevis': 'KN',
  'Saint Lucia': 'LC',
  'Saint Vincent and the Grenadines': 'VC',
  'Samoa': 'WS',
  'San Marino': 'SM',
  'Sao Tome and Principe': 'ST',
  'Saudi Arabia': 'SA',
  'Scotland': 'GB-SCT',
  'Senegal': 'SN',
  'Serbia': 'RS',
  'Seychelles': 'SC',
  'Sierra Leone': 'SL',
  'Singapore': 'SG',
  'Slovakia': 'SK',
  'Slovenia': 'SI',
  'Solomon Islands': 'SB',
  'Somalia': 'SO',
  'South Africa': 'ZA',
  'South Korea': 'KR',
  'South Sudan': 'SS',
  'Spain': 'ES',
  'Sri Lanka': 'LK',
  'Sudan': 'SD',
  'Suriname': 'SR',
  'Swaziland': 'SZ',
  'Sweden': 'SE',
  'Switzerland': 'CH',
  'Syria': 'SY',
  'Taiwan': 'TW',
  'Tajikistan': 'TJ',
  'Tanzania': 'TZ',
  'Thailand': 'TH',
  'Togo': 'TG',
  'Tonga': 'TO',
  'Trinidad and Tobago': 'TT',
  'Tunisia': 'TN',
  'Turkey': 'TR',
  'Turkmenistan': 'TM',
  'Tuvalu': 'TV',
  'Uganda': 'UG',
  'Ukraine': 'UA',
  'United Arab Emirates': 'AE',
  'United States': 'US',
  'Uruguay': 'UY',
  'Uzbekistan': 'UZ',
  'Vanuatu': 'VU',
  'Vatican City': 'VA',
  'Venezuela': 'VE',
  'Vietnam': 'VN',
  'Wales': 'GB-WLS',
  'Yemen': 'YE',
  'Zambia': 'ZM',
  'Zimbabwe': 'ZW',
  'Other': 'XX'
}; // Added geoip-lite
const User = require('../models/User');
const InviteRequest = require('../models/InviteRequest');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
// const { transformResponse } = require('../utils/uuidTransform'); // Removed - using ObjectIds directly
// const { resolveId } = require('../utils/idResolver'); // Removed - using ObjectIds directly
const { sendUserRegistrationNotification, sendEmailVerification } = require('../utils/emailService');
const { createProfilePictureUpload, getPublicUrl } = require('../utils/r2Upload');

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || 'JWT Secret failed to fly';

// Configure upload using R2 or local fallback
const upload = createProfilePictureUpload();
    
// Generate unique personal invite code
const deriveCodeFromUserId = (userId) => {
  return crypto.createHash('md5').update(userId.toString()).digest('hex').substring(0, 5).toUpperCase();
};

// @route   GET /api/users/validate-invite/:code
// @desc    Validate an invite code
// @access  Public
router.get('/validate-invite/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code || code.length !== 5) {
      return res.json({ valid: false });
    }
    
    const inviter = await User.findOne({ personalInviteCode: code.toUpperCase() });
    
    if (inviter) {
      return res.json({ 
        valid: true, 
        inviterUsername: inviter.username 
      });
    } else {
      return res.json({ valid: false });
    }
  } catch (error) {
    console.error('Error validating invite code:', error);
    res.json({ valid: false });
  }
});

// Detect user location from IP address
router.get('/detect-location', async (req, res) => {
  try {
    // Extract IP address for geolocation
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    console.log(`Location detection IP: ${ip}`);
    
    // Get geolocation data from IPinfo Lite
    let geoData = null;
    try {
      const response = await axios.get(`https://api.ipinfo.io/lite/${ip}`, {
        timeout: 5000
      });
      geoData = response.data;
      console.log(`IPinfo Lite response: ${JSON.stringify(geoData)}`);
    } catch (error) {
      console.log(`IPinfo Lite error: ${error.message}`);
    }
    
    // Return location data for frontend
    if (geoData && geoData.country) {
      res.json({
        success: true,
        location: {
          city: null, // IPinfo Lite doesn't provide city
          region: null, // IPinfo Lite doesn't provide region
          country: geoData.country,
          countryCode: geoData.country_code
        }
      });
    } else {
      res.json({
        success: false,
        message: 'Could not detect location from IP address'
      });
    }
  } catch (error) {
    console.error('Location detection error:', error);
    res.status(500).json({ error: 'Failed to detect location' });
  }
});

// Register a new user with profile picture upload
router.post(
  '/register',
  upload.single('profilePic'),
  [
    check('username').notEmpty().withMessage('Username is required'),
    check('email').isEmail().withMessage('Valid email is required'),
    check('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    // check('inviteCode')
    //   .isLength(4)
    //   .withMessage('Invite Code must be 4 characters long'),
  ],
  async (req, res) => {
    console.log('Incoming registration request:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { username, email, password, cellPhone, givenName, familyName, homeLocation, locations, parentInviteCode } = req.body;
      
      // Validate invite code (required)
      if (!parentInviteCode || parentInviteCode.length !== 5) {
        return res.status(400).json({ error: 'Valid invite code is required to register' });
      }
      
      const inviter = await User.findOne({ personalInviteCode: parentInviteCode.toUpperCase() });
      if (!inviter) {
        return res.status(400).json({ error: 'Invalid invite code' });
      }
      
      // Check if inviter has invite credits (admins have unlimited credits)
      const isInviterAdmin = inviter.role && inviter.role.includes('admin');
      if (!isInviterAdmin) {
        // Check if inviter has invite credits
        if (!inviter.inviteCredits || inviter.inviteCredits <= 0) {
          return res.status(400).json({ error: 'This invite code has no remaining invites' });
        }
      }
      
      // Determine primary location from form data
      const defaultLocation = { 
        city: null, 
        region: null, 
        country: null, 
        countryCode: null 
      };
      
      let homeLocationData;
      
      // Support legacy locations.primary/secondary for backward compatibility, but prefer homeLocation/secondaryLocation
      const locationData = homeLocation || locations?.primary;
      
      if (locationData && Object.keys(locationData).length > 0 && 
          (locationData.city || locationData.country)) {
        homeLocationData = {
          city: locationData.city || null,
          region: locationData.region || null,
          country: locationData.country || null,
          countryCode: locationData.country ? countryCodeMap[locationData.country] || null : null,
          coordinates: locationData.coordinates || null,
          detectedFromIP: false // Since user confirmed/edited it in the form
        };
        console.log('Using user-provided location:', homeLocationData);
      } else {
        // No location provided - use null values
        homeLocationData = {
          ...defaultLocation,
          detectedFromIP: false
        };
        console.log('No location provided by user:', homeLocationData);
      }
      
      // Handle secondary location
      let secondaryLocationData = null;
      if (locations?.secondary && Object.keys(locations.secondary).length > 0 &&
          (locations.secondary.city || locations.secondary.country)) {
        secondaryLocationData = {
          city: locations.secondary.city || null,
          region: locations.secondary.region || null,
          country: locations.secondary.country || null,
          countryCode: locations.secondary.country ? countryCodeMap[locations.secondary.country] || null : null,
          coordinates: locations.secondary.coordinates || null
        };
      }
      
      // Case-insensitive check for existing email or username
      // Escape special regex characters to prevent regex injection
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existingUser = await User.findOne({ 
        $or: [
          { email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') } },
          { username: { $regex: new RegExp(`^${escapeRegex(username)}$`, 'i') } }
        ] 
      });
      if (existingUser) {
        console.error('Email or username already in use:', { email, username });
        // Return field-specific error (case-insensitive comparison)
        if (existingUser.email && existingUser.email.toLowerCase() === email.toLowerCase()) {
          return res.status(400).json({ 
            error: 'Email already in use',
            field: 'email' 
          });
        }
        if (existingUser.username && existingUser.username.toLowerCase() === username.toLowerCase()) {
          return res.status(400).json({ 
            error: 'Username already in use',
            field: 'username' 
          });
        }
        // Fallback for edge cases
        return res.status(400).json({ error: 'Email or username already in use' });
      }
      
      // Generate unique personal invite code
      const userId = new mongoose.Types.ObjectId();
      const personalInviteCode = deriveCodeFromUserId(userId);
      
      // Default string fields to empty string if falsy
      const user = new User({
        _id: userId,
        username,
        email,
        password,
        personalInviteCode,
        parentInviteCode: parentInviteCode.toUpperCase(),
        cellPhone: cellPhone || '',
        givenName: givenName || '',
        familyName: familyName || '',
        homeLocation: homeLocationData,
        secondaryLocation: secondaryLocationData
      });
      await user.save();
      
      // Set profile picture URL using custom domain (R2_PUBLIC_URL)
      // req.file.key contains the S3 key, use it with getPublicUrl for custom domain
      const profilePic = req.file 
        ? (req.file.key ? getPublicUrl(req.file.key) : (req.file.location || getPublicUrl(`profile-pictures/${req.file.filename}`)))
        : null;
      user.profilePic = profilePic;
      await user.save();
      
      console.log('User registered successfully:', user);

      // Give beta users £1.11 credit on sign up
      try {
        const { giveBetaSignupCredit } = require('../utils/betaCreditHelper');
        await giveBetaSignupCredit(user);
      } catch (betaCreditError) {
        console.error('Failed to give beta signup credit:', betaCreditError);
        // Don't fail registration if beta credit fails
      }

      // Decrement inviter's invite credits (unless admin - admins have unlimited)
      if (!isInviterAdmin && inviter.inviteCredits > 0) {
        inviter.inviteCredits -= 1;
        await inviter.save();
        console.log(`✅ Decremented invite credits for ${inviter.username}. Remaining: ${inviter.inviteCredits}`);
      }

      // Auto-join new user to Global Party
      try {
        const Party = require('../models/Party');
        const globalParty = await Party.getGlobalParty();
        if (globalParty && !globalParty.partiers.includes(user._id)) {
          // Add user to Global Party's partiers array
          globalParty.partiers.push(user._id);
          await globalParty.save();
          
          // Add Global Party to user's joinedParties array
          user.joinedParties.push({
            partyId: globalParty._id, // Using ObjectId directly
            role: 'partier'
          });
          await user.save();
          
          console.log('✅ Auto-joined new user to Global Party:', user.username);
        }
      } catch (globalPartyError) {
        console.error('Failed to auto-join user to Global Party:', globalPartyError);
        // Don't fail registration if Global Party join fails
      }

      // Send email notification to admin
      try {
        await sendUserRegistrationNotification(user);
      } catch (emailError) {
        console.error('Failed to send registration notification email:', emailError);
        // Don't fail the request if email fails
      }

      // Send email verification if user has email
      if (user.email) {
        try {
          const token = user.generateEmailVerificationToken();
          await user.save();
          await sendEmailVerification(user, token);
        } catch (emailError) {
          console.error('Failed to send email verification:', emailError);
          // Don't fail the request if email verification fails
        }
      }

      // Generate JWT token for auto-login using UUID
      const token = jwt.sign(
        { 
          userId: user.uuid,  // Use UUID instead of _id
          email: user.email, 
          username: user.username 
        },
        SECRET_KEY,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        message: 'User registered successfully',
        token,  // Include token for auto-login
        user: user,
      });
    } catch (error) {
      console.error('Error registering user:', error.message);
      res.status(500).json({ error: 'Error registering user', details: error.message });
    }
  }
);

// Login user
router.post(
  '/login',
  [
    check('email').isEmail().withMessage('Valid email is required'),
    check('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid email or password format', details: errors.array() });
      }

      const { email, password } = req.body;
      
      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        console.log(`Login attempt failed: User not found for email: ${email}`);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Check if user is active
      if (!user.isActive) {
        console.log(`Login attempt failed: Inactive user: ${email}`);
        return res.status(401).json({ error: 'Account is inactive. Please contact support.' });
      }

      // ✅ If locked time has passed, automatically unlock account
      if (user.accountLockedUntil && user.accountLockedUntil <= new Date()) {
        user.failedLoginAttempts = 0;
        user.accountLockedUntil = null;
        // ✅ Restore account to active if it was suspended
        if (!user.isActive) {
          user.isActive = true;
          console.log(`✅ Automatically unlocked and reactivated account for user ${user._id} (lock expired)`);
        }
        await user.save();
      }

      // Check if account is locked (after auto-unlock check)
      if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
        const minutesRemaining = Math.ceil((user.accountLockedUntil - new Date()) / 60000);
        return res.status(423).json({ 
          error: `Account temporarily locked. Please try again in ${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''}.`,
          lockedUntil: user.accountLockedUntil,
          minutesRemaining: minutesRemaining
        });
      }

      // Compare password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        console.log(`Login attempt failed: Invalid password for email: ${email}`);
        
        // Increment failed login attempts
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        user.lastFailedLoginAttempt = new Date();
        
        // Lock account after 6 failed attempts
        if (user.failedLoginAttempts >= 6) {
          // Lock account for 30 minutes
          const lockoutDuration = 30 * 60 * 1000; // 30 minutes
          user.accountLockedUntil = new Date(Date.now() + lockoutDuration);
          await user.save();
          
          return res.status(423).json({ 
            error: 'Account locked due to too many failed login attempts. Please try again in 30 minutes.',
            lockedUntil: user.accountLockedUntil,
            minutesRemaining: 30,
            failedAttempts: user.failedLoginAttempts
          });
        }
        
        // Save failed attempt count
        await user.save();
        
        // Return error with remaining attempts
        const remainingAttempts = 6 - user.failedLoginAttempts;
        return res.status(401).json({ 
          error: 'Invalid email or password',
          failedAttempts: user.failedLoginAttempts,
          remainingAttempts: remainingAttempts
        });
      }
      
      // Successful login - reset failed attempts
      user.failedLoginAttempts = 0;
      user.accountLockedUntil = null;
      user.lastFailedLoginAttempt = null;
      user.lastLoginAt = new Date();
      await user.save();
      
      // Generate JWT token using UUID
      const token = jwt.sign({ 
        userId: user.uuid,  // Use UUID instead of _id
        email: user.email, 
        username: user.username 
      }, SECRET_KEY, { expiresIn: '24h' });

      console.log(`✅ Login successful for user: ${user.username} (${user.email})`);
      res.json({ message: 'Login successful!', token, user });
    } catch (error) {
      console.error('Login error:', error);
      // Don't expose error details in production for security
      const isDevelopment = process.env.NODE_ENV !== 'production';
      res.status(500).json({ 
        error: 'An error occurred during login. Please try again.',
        ...(isDevelopment && { details: error.message })
      });
    }
  }
);

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Calculate user statistics
    const Bid = require('../models/Bid');
    const userBids = await Bid.find({ userId: user._id });
    
    const globalUserBids = userBids.length;
    const totalAmountBid = userBids.reduce((sum, bid) => sum + bid.amount, 0);
    const globalUserBidAvg = globalUserBids > 0 ? totalAmountBid / globalUserBids : 0;
    
    // Calculate global user aggregate rank (simplified)
    const allUsers = await User.find({}).select('_id');
    const userAggregateRank = allUsers.length; // Placeholder - would need proper ranking calculation
    
    // Add statistics to user object
    const userWithStats = {
      ...user.toObject(),
      globalUserAggregateRank: userAggregateRank,
      globalUserBidAvg: globalUserBidAvg,
      globalUserBids: globalUserBids,
    };
    
    res.json({ message: 'User profile', user: userWithStats });
  } catch (error) {
    res.status(500).json({ error: 'Error ing user profile', details: error.message });
  }
});

// Get list of users invited by the current user
router.get('/invited', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Find all users who used this user's personalInviteCode
    const invitedUsers = await User.find({ 
      parentInviteCode: user.personalInviteCode 
    })
    .select('-password -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires')
    .sort({ createdAt: -1 })
    .lean();
    
    res.json({ 
      invitedUsers,
      count: invitedUsers.length 
    });
  } catch (error) {
    console.error('Error fetching invited users:', error);
    res.status(500).json({ error: 'Error fetching invited users', details: error.message });
  }
});

// Get user's tune library (all media they've bid on with metrics)
router.get('/me/tune-library', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const Bid = require('../models/Bid');
    const Media = require('../models/Media');
    const TuneBytesTransaction = require('../models/TuneBytesTransaction');
    
    // Get all bids for this user (active only)
    const userBids = await Bid.find({ 
      userId: user._id,
      status: 'active'
    }).lean();
    
    if (userBids.length === 0) {
      return res.json({ 
        library: [],
        total: 0
      });
    }
    
    // Group bids by mediaId and calculate aggregates
    const mediaAggregates = {};
    
    userBids.forEach(bid => {
      // Skip bids without mediaId
      if (!bid.mediaId) {
        console.warn('Bid missing mediaId:', bid._id);
        return;
      }
      
      const mediaId = bid.mediaId.toString();
      
      if (!mediaAggregates[mediaId]) {
        mediaAggregates[mediaId] = {
          mediaId: mediaId,
          userBidTotal: 0,
          bidCount: 0,
          lastBidAt: bid.createdAt,
          firstBidAt: bid.createdAt
        };
      }
      
      mediaAggregates[mediaId].userBidTotal += bid.amount || 0;
      mediaAggregates[mediaId].bidCount += 1;
      
      if (new Date(bid.createdAt) > new Date(mediaAggregates[mediaId].lastBidAt)) {
        mediaAggregates[mediaId].lastBidAt = bid.createdAt;
      }
      if (new Date(bid.createdAt) < new Date(mediaAggregates[mediaId].firstBidAt)) {
        mediaAggregates[mediaId].firstBidAt = bid.createdAt;
      }
    });
    
    // Get all unique media IDs
    const mediaIds = Object.keys(mediaAggregates)
      .map(id => {
        if (mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        return id;
      })
      .filter(id => id !== null && id !== undefined);
    
    if (mediaIds.length === 0) {
      return res.json({ 
        library: [],
        total: 0
      });
    }
    
    // Fetch media details
    const mediaItems = await Media.find({ _id: { $in: mediaIds } })
      .select('title artist coverArt duration bpm globalMediaAggregate uuid _id tags')
      .lean();
    
    // Create media lookup
    const mediaLookup = {};
    mediaItems.forEach(media => {
      mediaLookup[media._id.toString()] = media;
    });
    
    // Get TuneBytes earned per media for this user (only if we have mediaIds)
    let tuneBytesByMedia = [];
    if (mediaIds.length > 0) {
      try {
        const userIdObjId = mongoose.Types.ObjectId.isValid(user._id) 
          ? new mongoose.Types.ObjectId(user._id) 
          : user._id;
        
        tuneBytesByMedia = await TuneBytesTransaction.aggregate([
          {
            $match: {
              userId: userIdObjId,
              status: 'confirmed',
              mediaId: { $in: mediaIds }
            }
          },
          {
            $group: {
              _id: '$mediaId',
              totalTuneBytes: { $sum: '$tuneBytesEarned' }
            }
          }
        ]);
      } catch (tuneBytesError) {
        console.error('Error fetching TuneBytes:', tuneBytesError);
        console.error('TuneBytes error stack:', tuneBytesError.stack);
        // Continue without TuneBytes data
      }
    }
    
    // Create TuneBytes lookup
    const tuneBytesLookup = {};
    tuneBytesByMedia.forEach(item => {
      if (item._id) {
        tuneBytesLookup[item._id.toString()] = item.totalTuneBytes;
      }
    });
    
    // Get total bid counts per media (for calculating average)
    let bidCountsByMedia = [];
    try {
      bidCountsByMedia = await Bid.aggregate([
        {
          $match: {
            mediaId: { $in: mediaIds },
            status: 'active'
          }
        },
        {
          $group: {
            _id: '$mediaId',
            totalBidCount: { $sum: 1 }
          }
        }
      ]);
    } catch (bidCountError) {
      console.error('Error fetching bid counts:', bidCountError);
      // Continue without bid count data
    }
    
    // Create bid count lookup
    const bidCountLookup = {};
    bidCountsByMedia.forEach(item => {
      if (item._id) {
        bidCountLookup[item._id.toString()] = item.totalBidCount;
      }
    });
    
    // Build library items
    const library = Object.values(mediaAggregates)
      .map(aggregate => {
        const media = mediaLookup[aggregate.mediaId];
        if (!media) {
          console.warn('Media not found for mediaId:', aggregate.mediaId);
          return null;
        }
        
        try {
          // Transform artist array to string
          let artistName = 'Unknown Artist';
          if (Array.isArray(media.artist) && media.artist.length > 0) {
            artistName = media.artist[0].name || media.artist[0] || 'Unknown Artist';
          } else if (typeof media.artist === 'string') {
            artistName = media.artist;
          }
          
          const globalMediaAggregate = media.globalMediaAggregate || 0;
          const totalBidCount = bidCountLookup[aggregate.mediaId] || 1;
          const globalMediaAggregateAvg = totalBidCount > 0 
            ? globalMediaAggregate / totalBidCount 
            : 0;
          
          return {
            mediaId: media._id?.toString() || media._id,
            mediaUuid: media.uuid || media._id?.toString() || media._id,
            title: media.title || 'Unknown Title',
            artist: artistName,
            coverArt: media.coverArt || null,
            duration: media.duration || null,
            bpm: media.bpm || null,
            tags: media.tags || [],
            globalMediaAggregate: globalMediaAggregate,
            globalMediaAggregateAvg: globalMediaAggregateAvg,
            globalUserMediaAggregate: aggregate.userBidTotal || 0,
            bidCount: aggregate.bidCount || 0,
            tuneBytesEarned: tuneBytesLookup[aggregate.mediaId] || 0,
            lastBidAt: aggregate.lastBidAt,
            firstBidAt: aggregate.firstBidAt
          };
        } catch (buildError) {
          console.error('Error building library item for mediaId:', aggregate.mediaId, buildError);
          return null;
        }
      })
      .filter(item => item !== null); // Remove any null items from missing media
    
    // Sort by last bid date (most recent first) by default
    library.sort((a, b) => {
      try {
        return new Date(b.lastBidAt).getTime() - new Date(a.lastBidAt).getTime();
      } catch (sortError) {
        return 0;
      }
    });
    
    res.json({ 
      library,
      total: library.length
    });
  } catch (error) {
    console.error('Error fetching tune library:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Error fetching tune library', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get user's tip history (all individual bids/tips)
// @route   GET /api/users/me/tip-history
// @desc    Get chronological list of all tips/bids for the authenticated user
// @access  Private
router.get('/me/tip-history', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const Bid = require('../models/Bid');
    const Media = require('../models/Media');
    const Party = require('../models/Party');
    
    // Query parameters for filtering and pagination
    const {
      partyId,
      mediaId,
      status,
      startDate,
      endDate,
      bidScope,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    const query = {
      userId: user._id
    };
    
    // Filter by party
    if (partyId) {
      query.partyId = partyId;
    }
    
    // Filter by media
    if (mediaId) {
      query.mediaId = mediaId;
    }
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by bid scope
    if (bidScope) {
      query.bidScope = bidScope;
    }
    
    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate as string);
      }
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get total count for pagination
    const total = await Bid.countDocuments(query);
    
    // Fetch bids with populated media and party details
    const bids = await Bid.find(query)
      .populate('mediaId', 'title artist coverArt duration uuid _id tags')
      .populate('partyId', 'name partyCode uuid _id type')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Calculate summary statistics
    const allBids = await Bid.find({ userId: user._id }).lean();
    const totalTips = allBids.length;
    const totalAmount = allBids.reduce((sum, bid) => sum + (bid.amount || 0), 0);
    const averageTip = totalTips > 0 ? totalAmount / totalTips : 0;
    const activeTips = allBids.filter(bid => bid.status === 'active').length;
    const vetoedTips = allBids.filter(bid => bid.status === 'vetoed').length;
    
    // Format response
    const formattedBids = bids.map(bid => {
      const media = bid.mediaId && typeof bid.mediaId === 'object' ? bid.mediaId : null;
      const party = bid.partyId && typeof bid.partyId === 'object' ? bid.partyId : null;
      
      return {
      _id: bid._id,
      uuid: bid.uuid,
      amount: bid.amount, // In pence
      amountPounds: (bid.amount / 100).toFixed(2),
      status: bid.status || 'active',
      bidScope: bid.bidScope || 'party',
      isInitialBid: bid.isInitialBid || false,
      createdAt: bid.createdAt,
      updatedAt: bid.updatedAt,
      // Media details
      media: media ? {
        _id: media._id,
        uuid: media.uuid,
        title: media.title,
        artist: media.artist,
        coverArt: media.coverArt,
        duration: media.duration,
        tags: media.tags || []
      } : null,
      // Party details
      party: party ? {
        _id: party._id,
        uuid: party.uuid,
        name: party.name,
        partyCode: party.partyCode,
        type: party.type
      } : null,
      // Denormalized fields (if available)
      mediaTitle: bid.mediaTitle,
      mediaArtist: bid.mediaArtist,
      mediaCoverArt: bid.mediaCoverArt,
      partyName: bid.partyName,
      partyType: bid.partyType,
      // Veto info (if applicable)
      vetoedBy: bid.vetoedBy,
      vetoedReason: bid.vetoedReason,
      vetoedAt: bid.vetoedAt
      };
    });
    
    res.json({
      success: true,
      tips: formattedBids,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      stats: {
        totalTips,
        totalAmount, // In pence
        totalAmountPounds: (totalAmount / 100).toFixed(2),
        averageTip, // In pence
        averageTipPounds: (averageTip / 100).toFixed(2),
        activeTips,
        vetoedTips
      }
    });
  } catch (error) {
    console.error('Error fetching tip history:', error);
    res.status(500).json({ 
      error: 'Error fetching tip history', 
      details: error.message 
    });
  }
});

// Get user's wallet transaction history
// @route   GET /api/users/me/wallet-history
// @desc    Get chronological list of all wallet transactions for the authenticated user
// @access  Private
router.get('/me/wallet-history', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const WalletTransaction = require('../models/WalletTransaction');
    
    // Query parameters for filtering and pagination
    const {
      type,
      status,
      paymentMethod,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    const query = {
      userId: user._id
    };
    
    // Filter by type
    if (type) {
      query.type = type;
    }
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by payment method
    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }
    
    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Get total count for pagination
    const total = await WalletTransaction.countDocuments(query);
    
    // Fetch transactions
    const transactions = await WalletTransaction.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Calculate summary statistics
    const allTransactions = await WalletTransaction.find({ userId: user._id }).lean();
    const totalTopUps = allTransactions
      .filter(t => t.type === 'topup' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalTransactions = allTransactions.length;
    const totalRefunds = allTransactions
      .filter(t => t.type === 'refund' && t.status === 'completed')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    // Format response
    const formattedTransactions = transactions.map(tx => ({
      _id: tx._id,
      uuid: tx.uuid,
      amount: tx.amount, // In pence
      amountPounds: (tx.amount / 100).toFixed(2),
      type: tx.type,
      status: tx.status || 'completed',
      paymentMethod: tx.paymentMethod || 'stripe',
      balanceBefore: tx.balanceBefore,
      balanceBeforePounds: tx.balanceBefore ? (tx.balanceBefore / 100).toFixed(2) : null,
      balanceAfter: tx.balanceAfter,
      balanceAfterPounds: tx.balanceAfter ? (tx.balanceAfter / 100).toFixed(2) : null,
      description: tx.description,
      stripeSessionId: tx.stripeSessionId,
      stripePaymentIntentId: tx.stripePaymentIntentId,
      metadata: tx.metadata || {},
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt
    }));
    
    res.json({
      success: true,
      transactions: formattedTransactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      stats: {
        totalTopUps, // In pence
        totalTopUpsPounds: (totalTopUps / 100).toFixed(2),
        totalRefunds, // In pence
        totalRefundsPounds: (totalRefunds / 100).toFixed(2),
        totalTransactions
      }
    });
  } catch (error) {
    console.error('Error fetching wallet history:', error);
    res.status(500).json({ 
      error: 'Error fetching wallet history', 
      details: error.message 
    });
  }
});

// Get creator stats (for creators/admins)
// @route   GET /api/users/me/creator-stats
// @desc    Get creator statistics (media count, labels owned, bid amounts, etc.)
// @access  Private (creator/admin only)
router.get('/me/creator-stats', authMiddleware, async (req, res) => {
  try {
    const Media = require('../models/Media');
    const Label = require('../models/Label');
    const Bid = require('../models/Bid');
    const User = require('../models/User');

    const userId = req.user._id;

    // Get media where user is owner
    // Note: Media schema doesn't have isActive field, so we don't filter by it
    const ownedMedia = await Media.find({
      'mediaOwners.userId': userId
    }).select('_id title globalMediaAggregate createdAt');

    // Get media where user is verified creator (across all creator roles)
    const creatorRoles = [
      'artist.userId', 'producer.userId', 'featuring.userId',
      'songwriter.userId', 'composer.userId',
      'host.userId', 'guest.userId', 'narrator.userId',
      'director.userId', 'cinematographer.userId', 'editor.userId',
      'author.userId'
    ];

    // Note: Media schema doesn't have isActive field, so we don't filter by it
    const creatorMediaQuery = {
      $or: creatorRoles.map(role => ({ [role]: userId }))
    };

    const creatorMedia = await Media.find(creatorMediaQuery)
      .select('_id title globalMediaAggregate createdAt');

    // Combine and deduplicate media IDs
    const allMediaIds = [
      ...new Set([
        ...ownedMedia.map(m => m._id.toString()),
        ...creatorMedia.map(m => m._id.toString())
      ])
    ];

    // Get total bid amount on all creator's media
    let totalBidAmount = [{ total: 0 }];
    if (allMediaIds.length > 0) {
      totalBidAmount = await Bid.aggregate([
        {
          $match: {
            mediaId: { $in: allMediaIds.map(id => new mongoose.Types.ObjectId(id)) },
            status: 'active'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]);
    }

    // Get labels where user is owner or admin
    const labels = await Label.find({
      'admins.userId': userId
    }).select('_id name slug logo verificationStatus stats admins');

    const labelsOwned = labels.filter(label => 
      label.admins.some(admin => 
        admin.userId.toString() === userId.toString() && admin.role === 'owner'
      )
    ).length;

    const labelsAdmin = labels.length - labelsOwned;

    // Get user's label affiliations (artists/producers/etc. affiliated with labels)
    const user = await User.findById(userId).select('labelAffiliations');
    const activeAffiliations = (user?.labelAffiliations || []).filter(
      affiliation => affiliation.status === 'active'
    );

    // Get label details for affiliations
    const affiliationLabelIds = activeAffiliations.map(aff => aff.labelId);
    const affiliationLabels = await Label.find({
      _id: { $in: affiliationLabelIds }
    }).select('_id name slug logo verificationStatus stats').lean();

    // Create a map of affiliation labels to avoid duplicates
    const affiliationLabelMap = {};
    affiliationLabels.forEach(label => {
      affiliationLabelMap[label._id.toString()] = label;
    });

    // Get all media for admin labels to calculate bid totals and release counts
    const adminLabelIds = labels.map(l => l._id);
    // Query handles both ObjectId and string formats for robustness
    const adminLabelIdsStrings = adminLabelIds.map(id => id.toString());
    const adminLabelMedia = await Media.find({
      $or: [
        { 'label.labelId': { $in: adminLabelIds } }, // Match ObjectId format
        { 'label.labelId': { $in: adminLabelIdsStrings } } // Match string format
      ]
    }).select('_id label').lean();
    
    // Create a map of mediaId -> labelIds for quick lookup
    const mediaToLabelMap = {};
    const adminLabelIdsSet = new Set(adminLabelIds.map(id => id.toString()));
    
    adminLabelMedia.forEach(media => {
      const mediaIdStr = media._id.toString();
      if (!mediaToLabelMap[mediaIdStr]) {
        mediaToLabelMap[mediaIdStr] = [];
      }
      if (media.label && Array.isArray(media.label)) {
        media.label.forEach(label => {
          if (label.labelId) {
            // Compare as strings to handle both ObjectId and string formats
            const labelIdStr = label.labelId.toString();
            if (adminLabelIdsSet.has(labelIdStr)) {
              if (!mediaToLabelMap[mediaIdStr].includes(labelIdStr)) {
                mediaToLabelMap[mediaIdStr].push(labelIdStr);
              }
            }
          }
        });
      }
    });
    
    console.log(`[Creator Stats] Built media to label map:`, Object.keys(mediaToLabelMap).length, 'media items mapped to labels');
    
    const adminLabelMediaIds = adminLabelMedia.map(m => m._id);
    
    // Calculate total bid amounts and release counts for admin labels
    let adminLabelBidTotals = {};
    let adminLabelReleaseCounts = {};
    
    // Count releases per label
    adminLabelMedia.forEach(media => {
      if (media.label && Array.isArray(media.label)) {
        media.label.forEach(label => {
          if (label.labelId) {
            const labelIdStr = label.labelId.toString();
            // Check if this labelId matches any of our admin labels
            if (adminLabelIds.some(id => id.toString() === labelIdStr)) {
              adminLabelReleaseCounts[labelIdStr] = (adminLabelReleaseCounts[labelIdStr] || 0) + 1;
            }
          }
        });
      }
    });
    
    if (adminLabelMediaIds.length > 0) {
      // Get all bids for these media
      const bids = await Bid.find({
        mediaId: { $in: adminLabelMediaIds },
        status: 'active'
      }).select('mediaId amount').lean();
      
      console.log(`[Creator Stats] Found ${bids.length} bids for ${adminLabelMediaIds.length} admin label media`);
      console.log(`[Creator Stats] Media to label map:`, Object.keys(mediaToLabelMap).length, 'media items');
      
      // Sum bids by label
      bids.forEach(bid => {
        const mediaIdStr = bid.mediaId.toString();
        const labelIds = mediaToLabelMap[mediaIdStr] || [];
        if (labelIds.length === 0) {
          console.log(`[Creator Stats] Warning: No label mapping found for media ${mediaIdStr}, bid amount: ${bid.amount}`);
        }
        labelIds.forEach(labelIdStr => {
          const currentTotal = adminLabelBidTotals[labelIdStr] || 0;
          adminLabelBidTotals[labelIdStr] = currentTotal + (bid.amount || 0);
          console.log(`[Creator Stats] Adding bid ${bid.amount} to label ${labelIdStr}, new total: ${adminLabelBidTotals[labelIdStr]}`);
        });
      });
      
      console.log(`[Creator Stats] Final admin label bid totals:`, adminLabelBidTotals);
    }

    // Format labels with role information
    const formattedAdminLabels = labels.map(label => {
      const adminEntry = label.admins.find(admin => 
        admin.userId.toString() === userId.toString()
      );
      // Use calculated total from bids, fallback to stored stats
      const calculatedTotal = adminLabelBidTotals[label._id.toString()] !== undefined
        ? adminLabelBidTotals[label._id.toString()]
        : (label.stats?.globalLabelAggregate || 0);
      
      // Calculate release count from actual media (fallback to stored stats)
      const calculatedReleaseCount = adminLabelReleaseCounts[label._id.toString()] !== undefined
        ? adminLabelReleaseCounts[label._id.toString()]
        : (label.stats?.releaseCount || 0);
      
      return {
        _id: label._id,
        name: label.name,
        slug: label.slug,
        profilePicture: label.profilePicture,
        verificationStatus: label.verificationStatus,
        globalLabelAggregate: calculatedTotal,
        artistCount: label.stats?.artistCount || 0,
        releaseCount: calculatedReleaseCount,
        role: adminEntry?.role || 'admin', // 'owner' or 'admin'
        relationshipType: 'admin' // To distinguish from affiliations
      };
    });

    // Get all media for affiliation labels to calculate bid totals and release counts
    // Note: affiliationLabelIds was already defined above, reuse it
    // Query handles both ObjectId and string formats for robustness
    const affiliationLabelIdsStrings = affiliationLabelIds.map(id => id.toString());
    const affiliationLabelMedia = await Media.find({
      $or: [
        { 'label.labelId': { $in: affiliationLabelIds } }, // Match ObjectId format
        { 'label.labelId': { $in: affiliationLabelIdsStrings } } // Match string format
      ]
    }).select('_id label').lean();
    
    // Create a map of mediaId -> labelIds for quick lookup
    const affiliationMediaToLabelMap = {};
    const affiliationLabelIdsSet = new Set(affiliationLabelIds.map(id => id.toString()));
    
    affiliationLabelMedia.forEach(media => {
      const mediaIdStr = media._id.toString();
      if (!affiliationMediaToLabelMap[mediaIdStr]) {
        affiliationMediaToLabelMap[mediaIdStr] = [];
      }
      if (media.label && Array.isArray(media.label)) {
        media.label.forEach(label => {
          if (label.labelId) {
            // Compare as strings to handle both ObjectId and string formats
            const labelIdStr = label.labelId.toString();
            if (affiliationLabelIdsSet.has(labelIdStr)) {
              if (!affiliationMediaToLabelMap[mediaIdStr].includes(labelIdStr)) {
                affiliationMediaToLabelMap[mediaIdStr].push(labelIdStr);
              }
            }
          }
        });
      }
    });
    
    const affiliationLabelMediaIds = affiliationLabelMedia.map(m => m._id);
    
    // Calculate total bid amounts and release counts for affiliation labels
    let affiliationLabelBidTotals = {};
    let affiliationLabelReleaseCounts = {};
    
    // Count releases per label
    affiliationLabelMedia.forEach(media => {
      if (media.label && Array.isArray(media.label)) {
        media.label.forEach(label => {
          if (label.labelId) {
            const labelIdStr = label.labelId.toString();
            // Check if this labelId matches any of our affiliation labels
            if (affiliationLabelIds.some(id => id.toString() === labelIdStr)) {
              affiliationLabelReleaseCounts[labelIdStr] = (affiliationLabelReleaseCounts[labelIdStr] || 0) + 1;
            }
          }
        });
      }
    });
    
    if (affiliationLabelMediaIds.length > 0) {
      // Get all bids for these media
      const bids = await Bid.find({
        mediaId: { $in: affiliationLabelMediaIds },
        status: 'active'
      }).select('mediaId amount').lean();
      
      // Sum bids by label
      bids.forEach(bid => {
        const mediaIdStr = bid.mediaId.toString();
        const labelIds = affiliationMediaToLabelMap[mediaIdStr] || [];
        labelIds.forEach(labelIdStr => {
          affiliationLabelBidTotals[labelIdStr] = (affiliationLabelBidTotals[labelIdStr] || 0) + (bid.amount || 0);
        });
      });
    }

    // Format affiliation labels with role information
    const formattedAffiliationLabels = activeAffiliations.map(affiliation => {
      const label = affiliationLabelMap[affiliation.labelId.toString()];
      if (!label) return null; // Skip if label not found
      
      // Use calculated total from bids, fallback to stored stats
      const calculatedTotal = affiliationLabelBidTotals[label._id.toString()] !== undefined
        ? affiliationLabelBidTotals[label._id.toString()]
        : (label.stats?.globalLabelAggregate || 0);
      
      // Calculate release count from actual media (fallback to stored stats)
      const calculatedReleaseCount = affiliationLabelReleaseCounts[label._id.toString()] !== undefined
        ? affiliationLabelReleaseCounts[label._id.toString()]
        : (label.stats?.releaseCount || 0);
      
      return {
        _id: label._id,
        name: label.name,
        slug: label.slug,
        profilePicture: label.profilePicture,
        verificationStatus: label.verificationStatus,
        globalLabelAggregate: calculatedTotal,
        artistCount: label.stats?.artistCount || 0,
        releaseCount: calculatedReleaseCount,
        role: affiliation.role, // 'artist', 'producer', 'manager', 'staff'
        relationshipType: 'affiliation' // To distinguish from admin roles
      };
    }).filter(Boolean); // Remove null entries

    // Combine and deduplicate (if user is both admin and affiliate, show admin role)
    const allLabelsMap = new Map();
    
    // Add admin labels first (they take precedence)
    formattedAdminLabels.forEach(label => {
      allLabelsMap.set(label._id.toString(), label);
    });
    
    // Add affiliation labels (only if not already in map)
    formattedAffiliationLabels.forEach(label => {
      if (!allLabelsMap.has(label._id.toString())) {
        allLabelsMap.set(label._id.toString(), label);
      }
    });

    const allLabels = Array.from(allLabelsMap.values());

    // Get recent media (last 5)
    // Note: Media schema doesn't have isActive field, so we don't filter by it
    const recentMedia = await Media.find({
      $or: [
        { 'mediaOwners.userId': userId },
        ...creatorRoles.map(role => ({ [role]: userId }))
      ]
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('_id uuid title artist coverArt globalMediaAggregate createdAt');

    res.json({
      stats: {
        totalMedia: allMediaIds.length,
        ownedMedia: ownedMedia.length,
        creatorMedia: creatorMedia.length,
        totalBidAmount: totalBidAmount[0]?.total || 0,
        labelsOwned,
        labelsAdmin,
        labelsAffiliated: activeAffiliations.length,
        totalLabels: allLabels.length
      },
      recentMedia,
      labels: allLabels
    });
  } catch (error) {
    console.error('Error fetching creator stats:', error);
    res.status(500).json({
      error: 'Error fetching creator stats',
      details: error.message
    });
  }
});

// Get user's owned media (media where user is mediaOwner)
// @route   GET /api/users/me/my-media
// @desc    Get media where current user is a media owner
// @access  Private
router.get('/me/my-media', authMiddleware, async (req, res) => {
  try {
    const Media = require('../models/Media');
    const Bid = require('../models/Bid');

    const userId = req.user._id;
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query for media where user is owner
    // Note: Media schema doesn't have isActive field, so we don't filter by it
    const query = {
      'mediaOwners.userId': userId
    };

    // Build sort object
    const sortObj = {};
    if (sortBy === 'globalMediaAggregate' || sortBy === 'totalBidAmount') {
      sortObj.globalMediaAggregate = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'title') {
      sortObj.title = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'createdAt' || sortBy === 'uploadedAt') {
      sortObj.createdAt = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortObj.createdAt = -1; // Default
    }

    // Fetch media with pagination
    const media = await Media.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .select('_id uuid title artist coverArt globalMediaAggregate createdAt uploadedAt mediaOwners');

    const total = await Media.countDocuments(query);

    // Get bid counts and totals for each media
    const mediaIds = media.map(m => m._id);
    console.log(`[My Media] Querying bids for ${mediaIds.length} media items`);
    console.log(`[My Media] Media IDs:`, mediaIds.map(id => id.toString()));
    
    // First, let's check if bids exist for these media
    const allBids = await Bid.find({
      mediaId: { $in: mediaIds },
      status: 'active'
    }).select('mediaId amount').lean();
    
    console.log(`[My Media] Found ${allBids.length} total bids for these media`);
    allBids.forEach(bid => {
      console.log(`[My Media] Bid: mediaId=${bid.mediaId.toString()}, amount=${bid.amount}`);
    });
    
    const bidStats = await Bid.aggregate([
      {
        $match: {
          mediaId: { $in: mediaIds },
          status: 'active'
        }
      },
      {
        $group: {
          _id: '$mediaId',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    console.log(`[My Media] Found ${bidStats.length} media with bids for ${mediaIds.length} media items`);
    
    const bidCountMap = {};
    const bidTotalMap = {};
    bidStats.forEach(item => {
      const mediaIdStr = item._id.toString();
      bidCountMap[mediaIdStr] = item.count;
      bidTotalMap[mediaIdStr] = item.totalAmount;
      console.log(`[My Media] Media ${mediaIdStr}: ${item.count} bids, total: ${item.totalAmount}`);
    });

    // Format response with ownership info
    const formattedMedia = media.map(m => {
      const ownerInfo = m.mediaOwners.find(owner => 
        owner.userId.toString() === userId.toString()
      );

      // Extract artist name
      let artistName = 'Unknown Artist';
      if (Array.isArray(m.artist) && m.artist.length > 0) {
        artistName = m.artist[0].name || m.artist[0] || 'Unknown Artist';
      } else if (typeof m.artist === 'string') {
        artistName = m.artist;
      }

      // Calculate total bid amount from actual bids (fallback to stored value if bids not found)
      const mediaIdStr = m._id.toString();
      const calculatedTotal = bidTotalMap[mediaIdStr];
      const storedTotal = m.globalMediaAggregate || 0;
      const totalBidAmount = calculatedTotal !== undefined 
        ? calculatedTotal 
        : storedTotal;
      
      if (calculatedTotal === undefined) {
        console.log(`[My Media] Warning: No bid stats found for media ${mediaIdStr} (${m.title}), using stored value: ${storedTotal}`);
      } else {
        console.log(`[My Media] Media ${mediaIdStr} (${m.title}): calculated=${calculatedTotal}, stored=${storedTotal}, using=${totalBidAmount}`);
      }

      return {
        _id: m._id,
        uuid: m.uuid,
        title: m.title,
        artist: artistName,
        coverArt: m.coverArt,
        globalMediaAggregate: totalBidAmount, // Use calculated total from bids
        bidCount: bidCountMap[mediaIdStr] || 0,
        createdAt: m.createdAt,
        uploadedAt: m.uploadedAt || m.createdAt,
        ownershipPercentage: ownerInfo?.percentage || 0,
        ownershipRole: ownerInfo?.role || 'creator',
        isVerifiedOwner: ownerInfo?.verified || false
      };
    });

    res.json({
      media: formattedMedia,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching user owned media:', error);
    res.status(500).json({
      error: 'Error fetching owned media',
      details: error.message
    });
  }
});

// Update user profile (excluding profile picture)
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { profilePic, homeLocation, secondaryLocation, locations, ...updatedFields } = req.body; // Ensure profilePic isn't overwritten

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Handle location updates
    // Support both new format (homeLocation/secondaryLocation) and legacy (locations)
    if (homeLocation !== undefined || (locations && locations.primary !== undefined)) {
      const locationData = homeLocation || locations?.primary;
      if (locationData) {
        user.homeLocation = {
          ...user.homeLocation,
          city: locationData.city !== undefined ? locationData.city : user.homeLocation?.city,
          region: locationData.region !== undefined ? locationData.region : user.homeLocation?.region,
          country: locationData.country !== undefined ? locationData.country : user.homeLocation?.country,
          countryCode: locationData.country && countryCodeMap[locationData.country]
            ? countryCodeMap[locationData.country]
            : (user.homeLocation?.countryCode || null),
          coordinates: locationData.coordinates !== undefined ? locationData.coordinates : user.homeLocation?.coordinates,
          detectedFromIP: locationData.detectedFromIP !== undefined ? locationData.detectedFromIP : (user.homeLocation?.detectedFromIP || false)
        };
      }
    }
    
    if (secondaryLocation !== undefined || (locations && locations.secondary !== undefined)) {
      const secondaryData = secondaryLocation !== undefined ? secondaryLocation : locations?.secondary;
      if (secondaryData === null || (secondaryData && Object.keys(secondaryData).length === 0 && !secondaryData.city && !secondaryData.country)) {
        // Remove secondary location
        user.secondaryLocation = null;
      } else if (secondaryData) {
        user.secondaryLocation = {
          ...user.secondaryLocation,
          city: secondaryData.city !== undefined ? secondaryData.city : user.secondaryLocation?.city,
          region: secondaryData.region !== undefined ? secondaryData.region : user.secondaryLocation?.region,
          country: secondaryData.country !== undefined ? secondaryData.country : user.secondaryLocation?.country,
          countryCode: secondaryData.country && countryCodeMap[secondaryData.country]
            ? countryCodeMap[secondaryData.country]
            : (user.secondaryLocation?.countryCode || null),
          coordinates: secondaryData.coordinates !== undefined ? secondaryData.coordinates : user.secondaryLocation?.coordinates
        };
      }
    }

    // Update other fields
    Object.assign(user, updatedFields);
    await user.save();

    const updatedUser = await User.findById(user._id).select('-password');
    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    res.status(500).json({ error: 'Error updating profile', details: error.message });
  }
});

// Update social media URL
router.put('/profile/social-media', authMiddleware, async (req, res) => {
  try {
    const { platform, url } = req.body;
    
    if (!platform || !url) {
      return res.status(400).json({ error: 'Platform and URL are required' });
    }

    const validPlatforms = ['facebook', 'instagram', 'soundcloud', 'spotify', 'youtube', 'twitter'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    // Validate URL format
    const urlPatterns = {
      facebook: /^https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9.]+/,
      instagram: /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._]+/,
      soundcloud: /^https?:\/\/(www\.)?soundcloud\.com\/[a-zA-Z0-9._-]+/,
      spotify: /^https?:\/\/(open\.)?spotify\.com\/[a-zA-Z0-9/]+/,
      youtube: /^https?:\/\/(www\.)?youtube\.com\/[a-zA-Z0-9/]+/,
      twitter: /^https?:\/\/(www\.)?twitter\.com\/[a-zA-Z0-9_]+/
    };

    if (!urlPatterns[platform].test(url)) {
      return res.status(400).json({ error: `Invalid ${platform} URL format` });
    }

    // Update the social media URL in top-level socialMedia
    const updateField = `socialMedia.${platform}`;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { [updateField]: url },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ 
      message: `${platform} URL updated successfully`, 
      user,
      socialMedia: user.socialMedia 
    });
  } catch (error) {
    res.status(500).json({ error: 'Error updating social media URL', details: error.message });
  }
});

// Profile Picture Upload Route
// @route   PUT /api/users/notification-preferences
// @desc    Update user notification preferences
// @access  Private
router.put('/notification-preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user._id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const {
      bid_received,
      bid_outbid,
      comment_reply,
      tune_bytes_earned,
      email,
      anonymousMode,
    } = req.body;

    // Initialize preferences if they don't exist
    if (!user.preferences) {
      user.preferences = {};
    }
    if (!user.preferences.notifications) {
      user.preferences.notifications = {};
    }
    if (!user.preferences.notifications.types) {
      user.preferences.notifications.types = {};
    }

    // Update notification types (only the ones that are optional)
    if (bid_received !== undefined) user.preferences.notifications.types.bid_received = bid_received;
    if (bid_outbid !== undefined) user.preferences.notifications.types.bid_outbid = bid_outbid;
    if (comment_reply !== undefined) user.preferences.notifications.types.comment_reply = comment_reply;
    if (tune_bytes_earned !== undefined) user.preferences.notifications.types.tune_bytes_earned = tune_bytes_earned;

    // Update delivery methods (only email - SMS removed)
    if (email !== undefined) user.preferences.notifications.email = email;

    // Update privacy settings
    if (anonymousMode !== undefined) user.preferences.anonymousMode = anonymousMode;

    await user.save();

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      preferences: user.preferences.notifications,
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

router.put('/profile-pic', authMiddleware, upload.single('profilePic'), async (req, res) => {
  try {
      if (!req.file) {
          console.log("❌ No file uploaded");
          return res.status(400).json({ error: 'No file uploaded' });
      }

      // Use custom domain URL via getPublicUrl (uses R2_PUBLIC_URL env var)
      // req.file.key contains the S3 key (e.g., "profile-pictures/userId-timestamp.jpg")
      // req.file.location is the default R2 URL, but we want the custom domain
      const profilePicPath = req.file.key ? getPublicUrl(req.file.key) : (req.file.location || getPublicUrl(`profile-pictures/${req.file.filename}`));

      console.log(`📸 Saving profile pic: ${profilePicPath} for user ${req.user.userId}`);

      const user = await User.findByIdAndUpdate(
          req.user._id,
          { $set: { profilePic: profilePicPath } },
          { new: true, projection: { profilePic: 1, _id: 1 } }
      );

      if (!user) {
          console.log("❌ User not found");
          return res.status(404).json({ error: 'User not found' });
      }

      console.log("✅ Profile picture updated:", user.profilePic);
      res.json({ message: 'Profile picture updated successfully', user });
  } catch (error) {
      console.error('Error updating profile picture:', error.message);
      res.status(500).json({ error: 'Error updating profile picture', details: error.message });
  }
});

// Temporary route to make a user admin (for testing)
router.post('/make-admin/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Add admin role if not already present
    if (!user.role.includes('admin')) {
      user.role.push('admin');
      await user.save();
    }
    
    res.json({ 
      message: 'User promoted to admin', 
      user: { 
        _id: user._id, 
        username: user.username, 
        role: user.role 
      } 
    });
  } catch (error) {
    console.error('Error promoting user to admin:', error);
    res.status(500).json({ error: 'Failed to promote user to admin' });
  }
});

// @route   GET /api/users/:userId/profile
// @desc    Get comprehensive user profile with bidding history
// @access  Public (for viewing user profiles), but authenticated users see their own data
router.get('/:userId/profile', async (req, res) => {
  try {
    // Optionally check for authentication token - don't fail if missing
    // This allows public access while still detecting if user is viewing their own profile
    const jwt = require('jsonwebtoken');
    const SECRET_KEY = process.env.JWT_SECRET || 'defaultsecretkey';
    
    let authenticatedUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        if (token) {
          const decoded = jwt.verify(token, SECRET_KEY);
          // Fetch user by UUID or ObjectId
          if (decoded.userId && decoded.userId.includes('-')) {
            authenticatedUser = await User.findOne({ uuid: decoded.userId }).select('_id uuid username email role');
          } else if (mongoose.Types.ObjectId.isValid(decoded.userId)) {
            authenticatedUser = await User.findById(decoded.userId).select('_id uuid username email role');
          }
        }
      } catch (tokenError) {
        // Invalid token, but that's OK - continue without authentication
        console.log('⚠️  Optional auth failed (invalid token):', tokenError.message);
      }
    }
    
    // Set req.user if authenticated, otherwise leave it undefined
    if (authenticatedUser) {
      req.user = authenticatedUser;
      console.log('✅ Optional auth successful for:', authenticatedUser.username);
    }
    
    const { userId } = req.params;

    // Find user by UUID or ObjectId
    // First try without lean() to get full Mongoose document
    let user;
    if (userId.includes('-')) {
      // UUID format
      user = await User.findOne({ uuid: userId });
    } else if (mongoose.Types.ObjectId.isValid(userId)) {
      // ObjectId format
      user = await User.findById(userId);
    } else {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Convert to plain object to ensure all fields are accessible
    // Use toObject() with { flattenMaps: true } to handle nested objects properly
    const userObj = user.toObject ? user.toObject({ flattenMaps: true }) : user;

    // Get user's bidding history with media details
    const Bid = require('../models/Bid');
    const Media = require('../models/Media');
    
    const userBids = await Bid.find({ userId: userObj._id })
      .populate({
        path: 'mediaId',
        model: 'Media',
        select: 'title artist coverArt duration globalMediaAggregate uuid _id contentType contentForm', // Updated to schema grammar
      })
      .populate({
        path: 'partyId',
        model: 'Party',
        select: 'name partyCode uuid _id',
      })
      .sort({ createdAt: -1 }) // Most recent bids first
      .limit(50); // Limit to 50 most recent bids

    // Calculate bidding statistics
    const totalBids = userBids.length;
    const totalAmountBid = userBids.reduce((sum, bid) => sum + bid.amount, 0);
    const averageBidAmount = totalBids > 0 ? totalAmountBid / totalBids : 0;
    
    // Calculate global user statistics
    const globalUserBids = totalBids;
    const globalUserBidAvg = averageBidAmount;
    
    // Calculate global user aggregate rank
    // This is a simplified calculation - in production, this would be more complex
    const allUsers = await User.find({}).select('_id');
    const userAggregateRank = allUsers.length; // Placeholder - would need proper ranking calculation
    
    // Get unique media items bid on
    const uniqueMedia = [...new Set(userBids.map(bid => bid.mediaId?._id?.toString()).filter(Boolean))];
    
    // Get top 5 highest bids
    const topBids = [...userBids]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // Group bids by media for display
    const bidsByMedia = {};
    userBids.forEach(bid => {
      if (bid.mediaId) {
        const mediaId = bid.mediaId._id.toString();
        if (!bidsByMedia[mediaId]) {
          // Transform Media artist array to string for frontend compatibility
          const artistName = Array.isArray(bid.mediaId.artist) && bid.mediaId.artist.length > 0
            ? bid.mediaId.artist[0].name
            : 'Unknown Artist';
            
          bidsByMedia[mediaId] = {
            media: {
              ...bid.mediaId.toObject ? bid.mediaId.toObject() : bid.mediaId,
              artist: artistName, // Transform for frontend compatibility
              tags: bid.mediaId.tags || []
            },
            bids: [],
            totalAmount: 0,
            bidCount: 0,
          };
        }
        bidsByMedia[mediaId].bids.push(bid);
        bidsByMedia[mediaId].totalAmount += bid.amount;
        bidsByMedia[mediaId].bidCount += 1;
      }
    });

    // Convert to array and sort by total amount bid
    const mediaWithBids = Object.values(bidsByMedia)  
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // Check if user is viewing their own profile (authenticated)
    // Also check if userId in URL matches the user being viewed (even without auth)
    // This handles cases where the route is public but user is viewing themselves
    const isOwnProfile = req.user && (
      req.user.userId?.toString() === userObj._id.toString() || 
      req.user._id?.toString() === userObj._id.toString() ||
      req.user.uuid === userObj.uuid
    );
    
    // If no authenticated user, check if the userId in the request matches the profile
    // This allows users to see their own profile data even when not authenticated
    // (though in practice, most profile views will be authenticated)
    const profileOwnerViewingSelf = !req.user && (
      userId === userObj.uuid || 
      userId === userObj._id.toString()
    );
    
    // Combine both checks - show social media if viewing own profile OR if no auth but IDs match
    const shouldShowSocialMedia = isOwnProfile || profileOwnerViewingSelf;

    // Build user object
    // Debug: Check socialMedia field on user document
    console.log('🔍 User document socialMedia:', {
      hasSocialMedia: !!userObj.socialMedia,
      socialMediaType: typeof userObj.socialMedia,
      socialMediaValue: userObj.socialMedia,
      socialMediaKeys: userObj.socialMedia ? Object.keys(userObj.socialMedia) : [],
      fullUserObj: JSON.stringify(userObj, null, 2).substring(0, 500) // First 500 chars
    });
    
    // Explicitly access socialMedia - ensure it's included
    // Access from both the original user document and converted object
    const socialMediaFromDoc = user.socialMedia || {};
    const socialMediaFromObj = userObj.socialMedia || {};
    
    // Use whichever has data, preferring the converted object
    // Include the object even if it only has null values - the keys matter
    const socialMediaData = (socialMediaFromObj && typeof socialMediaFromObj === 'object' && !Array.isArray(socialMediaFromObj))
      ? { ...socialMediaFromObj }
      : (socialMediaFromDoc && typeof socialMediaFromDoc === 'object' && !Array.isArray(socialMediaFromDoc))
        ? { ...socialMediaFromDoc }
        : {};
    
    console.log('📦 Final socialMediaData:', socialMediaData);
    console.log('📦 socialMediaFromDoc:', socialMediaFromDoc);
    console.log('📦 socialMediaFromObj:', socialMediaFromObj);
    console.log('📦 socialMediaData type check:', {
      isObject: typeof socialMediaData === 'object',
      isArray: Array.isArray(socialMediaData),
      hasKeys: Object.keys(socialMediaData).length > 0,
      keys: Object.keys(socialMediaData),
      stringified: JSON.stringify(socialMediaData)
    });
    
    const userResponse = {
      id: userObj.uuid, // Use UUID as primary ID for external API
      uuid: userObj.uuid,
      _id: userObj._id,
      username: userObj.username,
      profilePic: userObj.profilePic,
      email: userObj.email,
      balance: userObj.balance,
      personalInviteCode: userObj.personalInviteCode,
      cellPhone: userObj.cellPhone || '',
      homeLocation: userObj.homeLocation || null,
      secondaryLocation: userObj.secondaryLocation || null,
      role: userObj.role,
      isActive: userObj.isActive,
      createdAt: userObj.createdAt,
      updatedAt: userObj.updatedAt,
      globalUserAggregateRank: userAggregateRank,
      globalUserBidAvg: globalUserBidAvg,
      globalUserBids: globalUserBids,
      socialMedia: socialMediaData,
      creatorProfile: userObj.creatorProfile,
      // Include preferences if viewing own profile
      preferences: (isOwnProfile || profileOwnerViewingSelf) ? userObj.preferences : undefined,
    };

    // If anonymous mode is enabled and not viewing own profile, hide names and social media
    console.log('🔒 Anonymous mode check:', {
      hasPreferences: !!userObj.preferences,
      anonymousMode: userObj.preferences?.anonymousMode,
      isOwnProfile: isOwnProfile,
      profileOwnerViewingSelf: profileOwnerViewingSelf,
      shouldShowSocialMedia: shouldShowSocialMedia,
      reqUser: req.user ? { id: req.user._id, userId: req.user.userId, uuid: req.user.uuid } : null,
      userObjId: userObj._id,
      userObjUuid: userObj.uuid,
      requestUserId: userId,
      willHideSocialMedia: userObj.preferences?.anonymousMode && !shouldShowSocialMedia
    });
    
    if (userObj.preferences?.anonymousMode && !shouldShowSocialMedia) {
      // Remove givenName and familyName from response
      // They're not explicitly included above, but we'll ensure they're not
      delete userResponse.givenName;
      delete userResponse.familyName;
      // Also hide from creatorProfile if it exists
      if (userResponse.creatorProfile) {
        delete userResponse.creatorProfile.artistName; // If artistName contains real name
      }
      // Hide social media links in anonymous mode (now top-level)
      console.log('🔒 Hiding socialMedia due to anonymous mode');
      if (userResponse.socialMedia) {
        delete userResponse.socialMedia;
      }
    } else {
      // Include names if not anonymous or viewing own profile
      if (userObj.givenName !== undefined) userResponse.givenName = userObj.givenName;
      if (userObj.familyName !== undefined) userResponse.familyName = userObj.familyName;
      console.log('✅ SocialMedia will be included in response (anonymous mode disabled OR viewing own profile):', userResponse.socialMedia);
    }
    
    // Final check before sending
    console.log('📤 Final userResponse before sending:', {
      hasSocialMedia: !!userResponse.socialMedia,
      socialMediaKeys: userResponse.socialMedia ? Object.keys(userResponse.socialMedia) : []
    });

    // Final verification before sending
    console.log('📤 About to send response:', {
      userResponseHasSocialMedia: !!userResponse.socialMedia,
      userResponseSocialMediaValue: userResponse.socialMedia,
      userResponseKeys: Object.keys(userResponse)
    });
    
    res.json({
      message: 'User profile fetched successfully',
      user: userResponse,
      stats: {
        totalBids,
        totalAmountBid,
        averageBidAmount,
        uniqueSongsCount: uniqueMedia.length, // Renamed but keeping field name for frontend compatibility
      },
      topBids,
      mediaWithBids, // Updated to use media terminology
    });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Error fetching user profile', details: error.message });
  }
});

// @route   POST /api/users/request-invite
// @desc    Submit a request for an invite code
// @access  Public
router.post('/request-invite', async (req, res) => {
  try {
    const { email, name, reason } = req.body;
    
    if (!email || !name || !reason) {
      return res.status(400).json({ error: 'Email, name, and reason are required' });
    }
    
    // Check if email already has a pending request
    const existingRequest = await InviteRequest.findOne({ 
      email: email.toLowerCase().trim(),
      status: 'pending'
    });
    
    if (existingRequest) {
      return res.status(400).json({ 
        error: 'You already have a pending invite request. We will review it soon!' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'An account with this email already exists' 
      });
    }
    
    // Extract IP address
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    const inviteRequest = new InviteRequest({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      reason: reason.trim(),
      ipAddress: ip
    });
    
    await inviteRequest.save();
    
    res.status(201).json({
      message: 'Invite request submitted successfully. We will review it and get back to you soon!',
      request: {
        email: inviteRequest.email,
        name: inviteRequest.name,
        status: inviteRequest.status
      }
    });
  } catch (error) {
    console.error('Error submitting invite request:', error);
    res.status(500).json({ error: 'Failed to submit invite request' });
  }
});

// @route   GET /api/users/referrals
// @desc    Get user's referrals (people they invited)
// @access  Private
router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    
    // Find all users who used this user's invite code
    const referrals = await User.find({ 
      parentInviteCode: user.personalInviteCode 
    })
      .select('username profilePic createdAt homeLocation secondaryLocation uuid')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      personalInviteCode: user.personalInviteCode,
      referralCount: referrals.length,
      referrals: referrals.map(r => ({
        username: r.username,
        profilePic: r.profilePic,
        joinedAt: r.createdAt,
        location: r.homeLocation || null, // Return home location, or null
        uuid: r.uuid
      }))
    });
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ error: 'Failed to fetch referrals' });
  }
});

// @route   GET /api/users/admin/all
// @desc    Get all users (admin only)
// @access  Private (Admin)
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { limit = 100, skip = 0, search } = req.query;
    
    // Build query
    const query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password') // Exclude passwords
      .select('-passwordResetToken -passwordResetExpires') // Exclude reset tokens
      .select('-emailVerificationToken -emailVerificationExpires') // Exclude verification tokens
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await User.countDocuments(query);

    res.json({
      users,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// @route   POST /api/users/admin/replenish-invite-credits
// @desc    Replenish invite credits for a user (admin only)
// @access  Private (Admin)
router.post('/admin/replenish-invite-credits', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId, credits } = req.body;
    
    if (!userId || credits === undefined || credits < 0) {
      return res.status(400).json({ error: 'userId and valid credits amount are required' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Set or add credits (depending on if we want to set or add)
    // For now, we'll add credits to existing amount
    const currentCredits = targetUser.inviteCredits || 0;
    targetUser.inviteCredits = currentCredits + parseInt(credits);
    await targetUser.save();

    res.json({
      message: `Successfully added ${credits} invite credits to ${targetUser.username}`,
      user: {
        _id: targetUser._id,
        username: targetUser.username,
        inviteCredits: targetUser.inviteCredits
      }
    });
  } catch (error) {
    console.error('Error replenishing invite credits:', error);
    res.status(500).json({ error: 'Failed to replenish invite credits' });
  }
});

// @route   GET /api/users/admin/invite-requests
// @desc    Get all invite requests (admin only)
// @access  Private (Admin)
router.get('/admin/invite-requests', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { status } = req.query;
    const filter = status ? { status } : {};
    
    const requests = await InviteRequest.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      requests,
      count: requests.length
    });
  } catch (error) {
    console.error('Error fetching invite requests:', error);
    res.status(500).json({ error: 'Failed to fetch invite requests' });
  }
});

// @route   PATCH /api/users/admin/invite-requests/:id/approve
// @desc    Approve an invite request and send code (admin only)
// @access  Private (Admin)
router.patch('/admin/invite-requests/:id/approve', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const request = await InviteRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    // Use the approving admin's personal invite code
    // Fetch the full admin user object to get their personalInviteCode
    const admin = await User.findById(req.user._id);
    if (!admin || !admin.personalInviteCode) {
      return res.status(500).json({ error: 'Admin user or invite code not found' });
    }
    
    const inviteCode = admin.personalInviteCode;
    
    request.status = 'approved';
    request.inviteCode = inviteCode;
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();
    await request.save();

    // Send email with invite code
    try {
      const { sendInviteApprovalEmail } = require('../utils/emailService');
      await sendInviteApprovalEmail(request, inviteCode).catch(err => 
        console.error('Error sending invite approval email:', err)
      );
    } catch (error) {
      console.error('Error setting up invite approval email:', error);
    }
    
    res.json({
      message: 'Invite request approved',
      request,
      inviteCode
    });
  } catch (error) {
    console.error('Error approving invite request:', error);
    res.status(500).json({ error: 'Failed to approve invite request' });
  }
});

// @route   PATCH /api/users/admin/invite-requests/:id/reject
// @desc    Reject an invite request (admin only)
// @access  Private (Admin)
router.patch('/admin/invite-requests/:id/reject', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { reason } = req.body;
    const request = await InviteRequest.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    request.status = 'rejected';
    request.rejectedReason = reason || null;
    await request.save();

    // Send email notification
    try {
      const { sendInviteRejectionEmail } = require('../utils/emailService');
      await sendInviteRejectionEmail(request, reason || null).catch(err => 
        console.error('Error sending invite rejection email:', err)
      );
    } catch (error) {
      console.error('Error setting up invite rejection email:', error);
    }

    res.json({
      message: 'Invite request rejected',
      request
    });
  } catch (error) {
    console.error('Error rejecting invite request:', error);
    res.status(500).json({ error: 'Failed to reject invite request' });
  }
});

// @route   GET /api/users/:userId/tag-rankings
// @desc    Get tag rankings for a specific user (their top tags by bid aggregate)
// @access  Public
router.get('/:userId/tag-rankings', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, refresh = false } = req.query;

    console.log('🏷️ User tag rankings request for:', userId, refresh ? '(force refresh)' : '');

    // Resolve user ID (handle both UUID and ObjectId)
    const User = require('../models/User');
    const mongoose = require('mongoose');
    const tagRankingsService = require('../services/tagRankingsService');
    
    // Find user by UUID or ObjectId
    let actualUserId;
    let user;
    
    if (userId.includes('-')) {
      // UUID format
      user = await User.findOne({ uuid: userId }).select('_id tagRankings tagRankingsUpdatedAt');
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      actualUserId = user._id;
    } else if (mongoose.Types.ObjectId.isValid(userId)) {
      // ObjectId format
      actualUserId = new mongoose.Types.ObjectId(userId);
      user = await User.findById(actualUserId).select('_id tagRankings tagRankingsUpdatedAt');
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Check if we have cached rankings and they're recent (unless forcing refresh)
    const hasCachedRankings = user.tagRankings && user.tagRankings.length > 0;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const isStale = !user.tagRankingsUpdatedAt || user.tagRankingsUpdatedAt < oneHourAgo;
    
    let tagRankings = [];

    if (hasCachedRankings && !refresh && !isStale) {
      // Use cached rankings
      tagRankings = user.tagRankings || [];
      console.log(`✅ Using cached tag rankings (${tagRankings.length} tags, updated ${user.tagRankingsUpdatedAt})`);
    } else {
      // Calculate and update tag rankings
      console.log(`🔄 Calculating tag rankings ${hasCachedRankings ? '(stale cache)' : '(no cache)'}`);
      tagRankings = await tagRankingsService.calculateAndUpdateUserTagRankings(
        actualUserId, 
        parseInt(limit), 
        refresh === 'true' || refresh === true
      );
    }

    // Limit results to requested limit
    const limitedRankings = tagRankings.slice(0, parseInt(limit));

    console.log('✅ Returning', limitedRankings.length, 'tag rankings');

    res.json({
      tagRankings: limitedRankings,
      totalTags: tagRankings.length,
      cached: hasCachedRankings && !refresh && !isStale,
      lastUpdated: user.tagRankingsUpdatedAt
    });
  } catch (error) {
    console.error('Error fetching user tag rankings:', error);
    res.status(500).json({ error: 'Failed to fetch tag rankings', details: error.message });
  }
});
// ========================================
// TUNEBYTES ROUTES
// ========================================

// @route   GET /api/users/:userId/tunebytes
// @desc    Get user's TuneBytes statistics and history
// @access  Private
router.get('/:userId/tunebytes', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user._id;

    // Users can only view their own TuneBytes data
    if (userId !== requestingUserId.toString()) {
      return res.status(403).json({ error: 'You can only view your own TuneBytes data' });
    }

    const tuneBytesService = require('../services/tuneBytesService');
    const stats = await tuneBytesService.getUserTuneBytesStats(userId);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching user TuneBytes stats:', error);
    res.status(500).json({ error: 'Failed to fetch TuneBytes statistics' });
  }
});

// @route   GET /api/users/:userId/tunebytes/history
// @desc    Get user's TuneBytes transaction history
// @access  Private
router.get('/:userId/tunebytes/history', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user._id;
    const { limit = 50, offset = 0 } = req.query;

    // Users can only view their own TuneBytes data
    if (userId !== requestingUserId.toString()) {
      return res.status(403).json({ error: 'You can only view your own TuneBytes data' });
    }

    const TuneBytesTransaction = require('../models/TuneBytesTransaction');
    const transactions = await TuneBytesTransaction.find({ 
      userId: new mongoose.Types.ObjectId(userId),
      status: 'confirmed'
    })
    .populate('mediaId', 'title artist coverArt')
    .populate('bidId', 'amount createdAt')
    .sort({ createdAt: -1 })
    .skip(parseInt(offset))
    .limit(parseInt(limit));

    const totalCount = await TuneBytesTransaction.countDocuments({ 
      userId: new mongoose.Types.ObjectId(userId),
      status: 'confirmed'
    });

    res.json({
      success: true,
      transactions,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
      }
    });

  } catch (error) {
    console.error('Error fetching TuneBytes history:', error);
    res.status(500).json({ error: 'Failed to fetch TuneBytes history' });
  }
});

// @route   POST /api/users/:userId/tunebytes/recalculate
// @desc    Recalculate TuneBytes for a specific media item
// @access  Private (Admin only)
router.post('/:userId/tunebytes/recalculate', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { mediaId } = req.body;
    const requestingUserId = req.user._id;

    // Check if user is admin
    const User = require('../models/User');
    const requestingUser = await User.findById(requestingUserId);
    if (!requestingUser.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!mediaId) {
      return res.status(400).json({ error: 'mediaId is required' });
    }

    const tuneBytesService = require('../services/tuneBytesService');
    const result = await tuneBytesService.recalculateTuneBytesForMedia(mediaId);

    res.json({
      success: true,
      message: 'TuneBytes recalculated successfully',
      result
    });

  } catch (error) {
    console.error('Error recalculating TuneBytes:', error);
    res.status(500).json({ error: 'Failed to recalculate TuneBytes' });
  }
});

// Get user's collective memberships
// @route   GET /api/users/me/collective-memberships
// @desc    Get collectives where user is a member
// @access  Private
router.get('/me/collective-memberships', authMiddleware, async (req, res) => {
  try {
    const Collective = require('../models/Collective');
    const userId = req.user._id;
    
    // Find collectives where user is a member (and hasn't left)
    const collectives = await Collective.find({
      'members.userId': userId,
      'members.leftAt': { $exists: false } // Only active members
    })
    .select('name slug profilePicture verificationStatus stats members')
    .lean();
    
    // Format collectives with member role information and stats
    const formattedCollectives = collectives.map(collective => {
      const memberInfo = collective.members.find(
        m => m.userId.toString() === userId.toString() && !m.leftAt
      );
      return {
        _id: collective._id,
        name: collective.name,
        slug: collective.slug,
        profilePicture: collective.profilePicture,
        verificationStatus: collective.verificationStatus,
        role: memberInfo?.role || 'member', // 'founder', 'member', 'admin'
        instrument: memberInfo?.instrument || null,
        joinedAt: memberInfo?.joinedAt || null,
        verified: memberInfo?.verified || false,
        memberCount: collective.stats?.memberCount || 0,
        releaseCount: collective.stats?.releaseCount || 0,
        globalCollectiveAggregate: collective.stats?.globalCollectiveAggregate || 0
      };
    });
    
    res.json({
      collectives: formattedCollectives
    });
  } catch (error) {
    console.error('Error fetching collective memberships:', error);
    res.status(500).json({
      error: 'Error fetching collective memberships',
      details: error.message
    });
  }
});

// Get user's label affiliations
router.get('/me/labels', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'labelAffiliations.labelId',
        select: 'name slug logo verificationStatus stats.artistCount stats.releaseCount stats.globalLabelAggregate'
      })
      .select('labelAffiliations');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Filter to only active affiliations
    const activeAffiliations = (user.labelAffiliations || []).filter(
      (affiliation) => affiliation.status === 'active'
    );

    // Format the response
    const formattedAffiliations = activeAffiliations.map((affiliation) => ({
      labelId: affiliation.labelId?._id || affiliation.labelId,
      role: affiliation.role,
      status: affiliation.status,
      joinedAt: affiliation.joinedAt,
      label: affiliation.labelId ? {
        _id: affiliation.labelId._id,
        name: affiliation.labelId.name,
        slug: affiliation.labelId.slug,
        profilePicture: affiliation.labelId.profilePicture,
        verificationStatus: affiliation.labelId.verificationStatus,
        stats: affiliation.labelId.stats
      } : null
    }));

    res.json({
      labelAffiliations: formattedAffiliations,
      count: formattedAffiliations.length
    });
  } catch (error) {
    console.error('Error fetching user label affiliations:', error);
    res.status(500).json({ error: 'Failed to fetch label affiliations', details: error.message });
  }
});

// Admin: Get all vetoed bids
router.get('/admin/bids/vetoed', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const Bid = require('../models/Bid');
    const { page = 1, limit = 50, sortBy = 'vetoedAt', sortOrder = 'desc' } = req.query;

    // Build query
    const query = { status: 'vetoed' };

    // Build sort object
    const sort = {};
    if (sortBy === 'vetoedAt') {
      sort.vetoedAt = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'createdAt') {
      sort.createdAt = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'amount') {
      sort.amount = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.vetoedAt = -1; // Default sort
    }

    // Fetch vetoed bids with populated references
    const bids = await Bid.find(query)
      .populate('userId', 'username profilePic uuid')
      .populate('mediaId', 'title artist coverArt _id')
      .populate('partyId', 'name type')
      .populate('vetoedBy', 'username uuid')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Bid.countDocuments(query);

    // Format response
    const formattedBids = bids.map(bid => ({
      _id: bid._id,
      uuid: bid.uuid,
      amount: bid.amount, // In pence
      createdAt: bid.createdAt,
      vetoedAt: bid.vetoedAt,
      vetoedReason: bid.vetoedReason,
      user: {
        _id: bid.userId?._id || bid.userId,
        username: bid.username || bid.userId?.username || 'Unknown',
        profilePic: bid.userId?.profilePic,
        uuid: bid.userId?.uuid || bid.user_uuid
      },
      media: {
        _id: bid.mediaId?._id || bid.mediaId,
        title: bid.mediaTitle || bid.mediaId?.title || 'Unknown',
        artist: bid.mediaArtist || (Array.isArray(bid.mediaId?.artist) ? bid.mediaId.artist[0]?.name : bid.mediaId?.artist) || 'Unknown',
        coverArt: bid.mediaCoverArt || bid.mediaId?.coverArt
      },
      party: {
        _id: bid.partyId?._id || bid.partyId,
        name: bid.partyName || bid.partyId?.name || 'Unknown',
        type: bid.partyType || bid.partyId?.type || 'unknown'
      },
      vetoedBy: bid.vetoedBy ? {
        _id: bid.vetoedBy._id,
        username: bid.vetoedBy.username,
        uuid: bid.vetoedBy.uuid
      } : null,
      bidScope: bid.bidScope || 'party'
    }));

    res.json({
      bids: formattedBids,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching vetoed bids:', error);
    res.status(500).json({ error: 'Failed to fetch vetoed bids', details: error.message });
  }
});

// Admin: Get all bids with filtering, sorting, and pagination
router.get('/admin/bids', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const Bid = require('../models/Bid');
    const mongoose = require('mongoose');
    const {
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      userId,
      partyId,
      mediaId,
      search,
      bidScope,
      dateFrom,
      dateTo
    } = req.query;

    // Build query
    const query = {};

    // Status filter
    if (status && ['active', 'vetoed', 'refunded'].includes(status)) {
      query.status = status;
    }

    // User filter
    if (userId) {
      if (mongoose.isValidObjectId(userId)) {
        query.userId = userId;
      } else {
        // Search by username (denormalized field)
        query.username = new RegExp(userId, 'i');
      }
    }

    // Party filter
    if (partyId && mongoose.isValidObjectId(partyId)) {
      query.partyId = partyId;
    }

    // Media filter
    if (mediaId && mongoose.isValidObjectId(mediaId)) {
      query.mediaId = mediaId;
    }

    // Bid scope filter
    if (bidScope && ['party', 'global'].includes(bidScope)) {
      query.bidScope = bidScope;
    }

    // Search filter (searches username, media title, party name)
    if (search && search.trim().length > 0) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { username: searchRegex },
        { mediaTitle: searchRegex },
        { mediaArtist: searchRegex },
        { partyName: searchRegex }
      ];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.createdAt.$lte = new Date(dateTo);
      }
    }

    // Build sort object
    const sort = {};
    const validSortFields = ['createdAt', 'amount', 'vetoedAt', 'username', 'mediaTitle', 'partyName'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sort[sortField] = sortOrder === 'asc' ? 1 : -1;

    // Fetch bids with populated references
    const bids = await Bid.find(query)
      .populate('userId', 'username profilePic uuid')
      .populate('mediaId', 'title artist coverArt _id')
      .populate('partyId', 'name type')
      .populate('vetoedBy', 'username uuid')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Bid.countDocuments(query);

    // Format response
    const formattedBids = bids.map(bid => ({
      _id: bid._id,
      uuid: bid.uuid,
      amount: bid.amount, // In pence
      status: bid.status,
      createdAt: bid.createdAt,
      vetoedAt: bid.vetoedAt,
      vetoedReason: bid.vetoedReason,
      isInitialBid: bid.isInitialBid,
      queuePosition: bid.queuePosition,
      queueSize: bid.queueSize,
      platform: bid.platform,
      partyType: bid.partyType,
      bidScope: bid.bidScope || 'party',
      user: {
        _id: bid.userId?._id || bid.userId,
        username: bid.username || bid.userId?.username || 'Unknown',
        profilePic: bid.userId?.profilePic,
        uuid: bid.userId?.uuid || bid.user_uuid
      },
      media: {
        _id: bid.mediaId?._id || bid.mediaId,
        title: bid.mediaTitle || bid.mediaId?.title || 'Unknown',
        artist: bid.mediaArtist || (Array.isArray(bid.mediaId?.artist) ? bid.mediaId.artist[0]?.name : bid.mediaId?.artist) || 'Unknown',
        coverArt: bid.mediaCoverArt || bid.mediaId?.coverArt
      },
      party: {
        _id: bid.partyId?._id || bid.partyId,
        name: bid.partyName || bid.partyId?.name || 'Unknown',
        type: bid.partyType || bid.partyId?.type || 'unknown'
      },
      vetoedBy: bid.vetoedBy ? {
        _id: bid.vetoedBy._id,
        username: bid.vetoedBy.username,
        uuid: bid.vetoedBy.uuid
      } : null
    }));

    res.json({
      bids: formattedBids,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching bids:', error);
    res.status(500).json({ error: 'Failed to fetch bids', details: error.message });
  }
});

// Admin: Veto a single bid
router.post('/admin/bids/:bidId/veto', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user.role || !req.user.role.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const Bid = require('../models/Bid');
    const User = require('../models/User');
    const mongoose = require('mongoose');
    const { bidId } = req.params;
    const { reason } = req.body || {};

    if (!mongoose.isValidObjectId(bidId)) {
      return res.status(400).json({ error: 'Invalid bid ID format' });
    }

    // Find the bid
    const bid = await Bid.findById(bidId).populate('userId', 'balance uuid username');
    
    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    // Check if bid is already vetoed or refunded
    if (bid.status !== 'active') {
      return res.status(400).json({ 
        error: `Bid is already ${bid.status}`,
        currentStatus: bid.status
      });
    }

    // Refund the user's balance
    const user = bid.userId;
    if (!user) {
      return res.status(404).json({ error: 'User associated with bid not found' });
    }

    // Refund the bid amount (balance is stored in pence)
    await User.findByIdAndUpdate(user._id, {
      $inc: { balance: bid.amount }
    });

    console.log(`💰 Refunding £${(bid.amount / 100).toFixed(2)} to user ${user.username} for vetoed bid ${bidId}`);

    // Update bid status to vetoed
    bid.status = 'vetoed';
    bid.vetoedBy = req.user._id;
    bid.vetoedBy_uuid = req.user.uuid;
    bid.vetoedReason = reason || null;
    bid.vetoedAt = new Date();
    await bid.save();

    res.json({
      message: 'Bid vetoed successfully',
      bid: {
        _id: bid._id,
        uuid: bid.uuid,
        amount: bid.amount,
        status: bid.status,
        vetoedAt: bid.vetoedAt,
        vetoedReason: bid.vetoedReason
      },
      refundedAmount: bid.amount,
      refundedTo: {
        userId: user._id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Error vetoing bid:', error);
    res.status(500).json({ error: 'Failed to veto bid', details: error.message });
  }
});

// Search users by username, email, or artist name (authenticated users only)
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { search, limit = 10 } = req.query;
    
    if (!search || search.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const searchRegex = new RegExp(search.trim(), 'i');
    const users = await User.find({
      $or: [
        { username: searchRegex },
        { email: searchRegex },
        { 'creatorProfile.artistName': searchRegex }
      ],
      isActive: true
    })
    .select('_id username profilePic uuid creatorProfile.artistName')
    .limit(parseInt(limit))
    .lean();
    
    // Format response - include artistName if available, but don't expose email
    const formattedUsers = users.map(user => ({
      _id: user._id,
      id: user._id,
      username: user.username,
      profilePic: user.profilePic,
      uuid: user.uuid,
      artistName: user.creatorProfile?.artistName || null
    }));
    
    res.json({ users: formattedUsers });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users', details: error.message });
  }
});

// ============================================
// USER WARNINGS SYSTEM
// ============================================

// Get user's warnings (authenticated users can see their own, admins can see any)
router.get('/warnings', authMiddleware, async (req, res) => {
  try {
    const userId = req.query.userId || req.user._id;
    const isAdmin = req.user.role && req.user.role.includes('admin');
    
    // Users can only see their own warnings unless they're admin
    if (userId !== req.user._id.toString() && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const user = await User.findById(userId).select('warnings warningCount finalWarningCount');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Filter out expired warnings
    const now = new Date();
    const activeWarnings = user.warnings.filter(warning => {
      return !warning.expiresAt || warning.expiresAt > now;
    });
    
    // ✅ Recalculate warning counts to ensure accuracy (only count non-expired)
    const activeWarningCount = activeWarnings.filter(w => 
      w.type === 'warning' || w.type === 'final_warning' || w.type === 'suspension_notice'
    ).length;
    const activeFinalWarningCount = activeWarnings.filter(w => w.type === 'final_warning').length;
    
    // Update stored counts if they differ (for consistency)
    if (user.warningCount !== activeWarningCount || user.finalWarningCount !== activeFinalWarningCount) {
      user.warningCount = activeWarningCount;
      user.finalWarningCount = activeFinalWarningCount;
      await user.save();
    }
    
    // Populate issuedBy field
    await User.populate(activeWarnings, { path: 'issuedBy', select: 'username _id' });
    
    res.json({
      warnings: activeWarnings,
      warningCount: activeWarningCount, // Use recalculated count
      finalWarningCount: activeFinalWarningCount, // Use recalculated count
      hasUnacknowledged: activeWarnings.some(w => !w.acknowledgedAt)
    });
  } catch (error) {
    console.error('Error fetching warnings:', error);
    res.status(500).json({ error: 'Failed to fetch warnings', details: error.message });
  }
});

// Acknowledge a warning (mark as read)
// ✅ Improved: Uses issuedAt timestamp as identifier for more robust matching
router.post('/warnings/:warningIndex/acknowledge', authMiddleware, async (req, res) => {
  try {
    const { warningIndex } = req.params;
    const userId = req.user._id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // ✅ Filter to only active (non-expired) warnings for index matching
    const now = new Date();
    const activeWarnings = user.warnings.filter(w => !w.expiresAt || w.expiresAt > now);
    
    const index = parseInt(warningIndex);
    if (isNaN(index) || index < 0 || index >= activeWarnings.length) {
      return res.status(400).json({ error: 'Invalid warning index' });
    }
    
    // Find the warning in the full array using issuedAt as unique identifier
    const targetWarning = activeWarnings[index];
    const warningInArray = user.warnings.find(w => 
      w.issuedAt && targetWarning.issuedAt &&
      w.issuedAt.getTime() === targetWarning.issuedAt.getTime() &&
      w.type === targetWarning.type &&
      w.message === targetWarning.message
    );
    
    if (!warningInArray) {
      return res.status(404).json({ error: 'Warning not found' });
    }
    
    // Check if warning is expired
    if (warningInArray.expiresAt && warningInArray.expiresAt < now) {
      return res.status(400).json({ error: 'Warning has expired' });
    }
    
    // Mark as acknowledged
    if (!warningInArray.acknowledgedAt) {
      warningInArray.acknowledgedAt = new Date();
      await user.save();
    }
    
    res.json({ message: 'Warning acknowledged', warning: warningInArray });
  } catch (error) {
    console.error('Error acknowledging warning:', error);
    res.status(500).json({ error: 'Failed to acknowledge warning', details: error.message });
  }
});

// Admin: Issue warning to user
router.post('/admin/warnings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, type, message, reason, expiresInDays } = req.body;
    
    if (!userId || !type || !message) {
      return res.status(400).json({ error: 'Missing required fields: userId, type, message' });
    }
    
    const validTypes = ['info', 'warning', 'final_warning', 'suspension_notice'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid warning type' });
    }
    
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate expiration date
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays));
    }
    
    // Create warning
    const warning = {
      type,
      message: message.trim(),
      reason: reason?.trim() || null,
      issuedBy: req.user._id,
      issuedAt: new Date(),
      acknowledgedAt: null,
      expiresAt
    };
    
    targetUser.warnings.push(warning);
    
    // ✅ Recalculate warning counts based on non-expired warnings only
    const now = new Date();
    const activeWarnings = targetUser.warnings.filter(w => !w.expiresAt || w.expiresAt > now);
    
    // Count only non-expired warnings
    targetUser.warningCount = activeWarnings.filter(w => 
      w.type === 'warning' || w.type === 'final_warning' || w.type === 'suspension_notice'
    ).length;
    
    targetUser.finalWarningCount = activeWarnings.filter(w => w.type === 'final_warning').length;
    
    await targetUser.save();
    
    // ✅ Automatic escalation logic (using recalculated counts)
    const WARNING_THRESHOLD = 3; // After 3 warnings, temp ban
    const FINAL_WARNING_THRESHOLD = 2; // After 2 final warnings, temp ban
    const TEMP_BAN_DAYS = 7; // 7 day temp ban
    
    // Use the recalculated counts (only non-expired warnings)
    if (targetUser.warningCount >= WARNING_THRESHOLD || targetUser.finalWarningCount >= FINAL_WARNING_THRESHOLD) {
      // Apply temporary ban
      const banUntil = new Date();
      banUntil.setDate(banUntil.getDate() + TEMP_BAN_DAYS);
      targetUser.accountLockedUntil = banUntil;
      targetUser.isActive = false;
      
      // Add suspension notice
      targetUser.warnings.push({
        type: 'suspension_notice',
        message: `Your account has been temporarily suspended for ${TEMP_BAN_DAYS} days due to multiple warnings.`,
        reason: 'Automatic suspension after multiple warnings',
        issuedBy: req.user._id,
        issuedAt: new Date(),
        acknowledgedAt: null,
        expiresAt: banUntil
      });
      
      await targetUser.save();
      
      // Send email notification
      try {
        const emailService = require('../utils/emailService');
        await emailService.sendWarningEmail(targetUser.email, {
          type: 'suspension_notice',
          message: `Your account has been temporarily suspended for ${TEMP_BAN_DAYS} days due to multiple warnings.`,
          reason: 'Automatic suspension after multiple warnings'
        });
      } catch (emailError) {
        console.error('Error sending warning email:', emailError);
        // Don't fail the request if email fails
      }
      
      // Create platform notification
      try {
        const notificationService = require('../services/notificationService');
        await notificationService.createNotification({
          userId: targetUser._id,
          type: 'warning',
          title: 'Account Suspended',
          message: `Your account has been temporarily suspended for ${TEMP_BAN_DAYS} days due to multiple warnings.`,
          link: '/profile',
          linkText: 'View Profile',
          relatedUserId: req.user._id
        });
      } catch (notifError) {
        console.error('Error creating warning notification:', notifError);
        // Don't fail the request if notification fails
      }
    } else {
      // Send email notification for regular warnings
      try {
        const emailService = require('../utils/emailService');
        await emailService.sendWarningEmail(targetUser.email, {
          type,
          message: message.trim(),
          reason: reason?.trim() || null
        });
      } catch (emailError) {
        console.error('Error sending warning email:', emailError);
        // Don't fail the request if email fails
      }
      
      // Create platform notification
      try {
        const notificationService = require('../services/notificationService');
        
        // Generate appropriate title based on warning type
        let title = 'Warning Issued';
        if (type === 'info') {
          title = 'Information Notice';
        } else if (type === 'warning') {
          title = 'Warning Issued';
        } else if (type === 'final_warning') {
          title = 'Final Warning';
        } else if (type === 'suspension_notice') {
          title = 'Account Suspension Notice';
        }
        
        await notificationService.createNotification({
          userId: targetUser._id,
          type: 'warning',
          title,
          message: message.trim(),
          link: '/profile',
          linkText: 'View Profile',
          relatedUserId: req.user._id
        });
      } catch (notifError) {
        console.error('Error creating warning notification:', notifError);
        // Don't fail the request if notification fails
      }
    }
    
    // Populate issuedBy for response
    await User.populate(warning, { path: 'issuedBy', select: 'username _id' });
    
    res.json({
      message: 'Warning issued successfully',
      warning,
      warningCount: targetUser.warningCount,
      finalWarningCount: targetUser.finalWarningCount,
      accountLocked: !!targetUser.accountLockedUntil
    });
  } catch (error) {
    console.error('Error issuing warning:', error);
    res.status(500).json({ error: 'Failed to issue warning', details: error.message });
  }
});

// Admin: Get all warnings for a user
router.get('/admin/users/:userId/warnings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('warnings warningCount finalWarningCount username email');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // ✅ Recalculate warning counts to ensure accuracy
    const now = new Date();
    const activeWarnings = user.warnings.filter(w => !w.expiresAt || w.expiresAt > now);
    const activeWarningCount = activeWarnings.filter(w => 
      w.type === 'warning' || w.type === 'final_warning' || w.type === 'suspension_notice'
    ).length;
    const activeFinalWarningCount = activeWarnings.filter(w => w.type === 'final_warning').length;
    
    // Populate issuedBy for all warnings
    await User.populate(user.warnings, { path: 'issuedBy', select: 'username _id' });
    
    res.json({
      warnings: user.warnings, // Return all warnings (including expired) for history
      activeWarnings: activeWarnings, // Also return active warnings separately
      warningCount: activeWarningCount, // Use recalculated count
      finalWarningCount: activeFinalWarningCount, // Use recalculated count
      username: user.username,
      email: user.email
    });
  } catch (error) {
    console.error('Error fetching user warnings:', error);
    res.status(500).json({ error: 'Failed to fetch user warnings', details: error.message });
  }
});

// Admin: Manually unlock a user account
router.post('/admin/users/:userId/unlock', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.accountLockedUntil) {
      return res.status(400).json({ error: 'User account is not locked' });
    }
    
    // Unlock account
    user.accountLockedUntil = null;
    user.isActive = true;
    await user.save();
    
    // Create notification
    try {
      const notificationService = require('../services/notificationService');
      await notificationService.createNotification({
        userId: user._id,
        type: 'info',
        title: 'Account Unlocked',
        message: 'Your account has been manually unlocked by an administrator.',
        link: '/profile',
        linkText: 'View Profile',
        relatedUserId: req.user._id
      });
    } catch (notifError) {
      console.error('Error creating unlock notification:', notifError);
    }
    
    res.json({
      message: 'Account unlocked successfully',
      userId: userId,
      username: user.username
    });
  } catch (error) {
    console.error('Error unlocking account:', error);
    res.status(500).json({ error: 'Failed to unlock account', details: error.message });
  }
});

// Admin: Revoke/Delete a warning
router.delete('/admin/users/:userId/warnings/:warningIndex', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, warningIndex } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const index = parseInt(warningIndex);
    if (isNaN(index) || index < 0 || index >= user.warnings.length) {
      return res.status(400).json({ error: 'Invalid warning index' });
    }
    
    const warning = user.warnings[index];
    
    // Remove warning from array
    user.warnings.splice(index, 1);
    
    // ✅ Recalculate warning counts
    const now = new Date();
    const activeWarnings = user.warnings.filter(w => !w.expiresAt || w.expiresAt > now);
    user.warningCount = activeWarnings.filter(w => 
      w.type === 'warning' || w.type === 'final_warning' || w.type === 'suspension_notice'
    ).length;
    user.finalWarningCount = activeWarnings.filter(w => w.type === 'final_warning').length;
    
    // ✅ If account was locked due to warnings and count is now below threshold, unlock
    if (user.accountLockedUntil && user.warningCount < 3 && user.finalWarningCount < 2) {
      user.accountLockedUntil = null;
      user.isActive = true;
      
      // Create notification about unlock
      try {
        const notificationService = require('../services/notificationService');
        await notificationService.createNotification({
          userId: user._id,
          type: 'info',
          title: 'Account Unlocked',
          message: 'Your account has been unlocked as a warning was revoked.',
          link: '/profile',
          linkText: 'View Profile',
          relatedUserId: req.user._id
        });
      } catch (notifError) {
        console.error('Error creating unlock notification:', notifError);
      }
    }
    
    await user.save();
    
    res.json({
      message: 'Warning revoked successfully',
      warning: warning,
      warningCount: user.warningCount,
      finalWarningCount: user.finalWarningCount,
      accountUnlocked: !user.accountLockedUntil
    });
  } catch (error) {
    console.error('Error revoking warning:', error);
    res.status(500).json({ error: 'Failed to revoke warning', details: error.message });
  }
});

module.exports = router;
