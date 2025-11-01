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
      
      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        console.error('Email or username already in use:', { email, username });
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
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
      // Generate JWT token using UUID
      const token = jwt.sign({ 
        userId: user.uuid,  // Use UUID instead of _id
        email: user.email, 
        username: user.username 
      }, SECRET_KEY, { expiresIn: '24h' });

      res.json({ message: 'Login successful!', token, user });
    } catch (error) {
      res.status(500).json({ error: 'Error logging in', details: error.message });
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

    // Update the social media URL in creatorProfile
    const updateField = `creatorProfile.socialMedia.${platform}`;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { [updateField]: url },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ 
      message: `${platform} URL updated successfully`, 
      user,
      socialMedia: user.creatorProfile?.socialMedia 
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
// @access  Public (for viewing user profiles)
router.get('/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user by UUID or ObjectId
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

    // Get user's bidding history with media details
    const Bid = require('../models/Bid');
    const Media = require('../models/Media');
    
    const userBids = await Bid.find({ userId: user._id })
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
    const isOwnProfile = req.user && (
      req.user.userId?.toString() === user._id.toString() || 
      req.user._id?.toString() === user._id.toString()
    );

    // Build user object
    const userResponse = {
      id: user.uuid, // Use UUID as primary ID for external API
      uuid: user.uuid,
      _id: user._id,
      username: user.username,
      profilePic: user.profilePic,
      email: user.email,
      balance: user.balance,
      personalInviteCode: user.personalInviteCode,
      cellPhone: user.cellPhone || '',
      homeLocation: user.homeLocation || null,
      secondaryLocation: user.secondaryLocation || null,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      globalUserAggregateRank: userAggregateRank,
      globalUserBidAvg: globalUserBidAvg,
      globalUserBids: globalUserBids,
      creatorProfile: user.creatorProfile,
    };

    // If anonymous mode is enabled and not viewing own profile, hide names and social media
    if (user.preferences?.anonymousMode && !isOwnProfile) {
      // Remove givenName and familyName from response
      // They're not explicitly included above, but we'll ensure they're not
      delete userResponse.givenName;
      delete userResponse.familyName;
      // Also hide from creatorProfile if it exists
      if (userResponse.creatorProfile) {
        delete userResponse.creatorProfile.artistName; // If artistName contains real name
        // Hide social media links in anonymous mode
        if (userResponse.creatorProfile.socialMedia) {
          delete userResponse.creatorProfile.socialMedia;
        }
      }
    } else {
      // Include names if not anonymous or viewing own profile
      if (user.givenName !== undefined) userResponse.givenName = user.givenName;
      if (user.familyName !== undefined) userResponse.familyName = user.familyName;
    }

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

    // Generate a one-time use invite code
    const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase().substring(0, 5);
    
    request.status = 'approved';
    request.inviteCode = inviteCode;
    request.approvedBy = req.user._id;
    request.approvedAt = new Date();
    await request.save();

    // TODO: Send email with invite code
    
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

module.exports = router;
