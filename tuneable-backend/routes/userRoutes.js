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
  'United States': 'US',
  'United Kingdom': 'GB',
  'Canada': 'CA',
  'Australia': 'AU',
  'Germany': 'DE',
  'France': 'FR',
  'Spain': 'ES',
  'Italy': 'IT',
  'Netherlands': 'NL',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Ireland': 'IE',
  'Belgium': 'BE',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Portugal': 'PT',
  'Poland': 'PL',
  'Czech Republic': 'CZ',
  'Hungary': 'HU',
  'Romania': 'RO',
  'Bulgaria': 'BG',
  'Croatia': 'HR',
  'Slovenia': 'SI',
  'Slovakia': 'SK',
  'Estonia': 'EE',
  'Latvia': 'LV',
  'Lithuania': 'LT',
  'Japan': 'JP',
  'South Korea': 'KR',
  'China': 'CN',
  'India': 'IN',
  'Brazil': 'BR',
  'Mexico': 'MX',
  'Argentina': 'AR',
  'Chile': 'CL',
  'Colombia': 'CO',
  'Peru': 'PE',
  'South Africa': 'ZA',
  'Nigeria': 'NG',
  'Kenya': 'KE',
  'Egypt': 'EG',
  'Morocco': 'MA',
  'Turkey': 'TR',
  'Israel': 'IL',
  'United Arab Emirates': 'AE',
  'Saudi Arabia': 'SA',
  'New Zealand': 'NZ',
  'Singapore': 'SG',
  'Malaysia': 'MY',
  'Thailand': 'TH',
  'Indonesia': 'ID',
  'Philippines': 'PH',
  'Vietnam': 'VN',
  'Taiwan': 'TW',
  'Hong Kong': 'HK'
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
      const { username, email, password, cellPhone, givenName, familyName, homeLocation, parentInviteCode } = req.body;
      
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
      
      let primaryLocation;
      
      // Use location data provided by frontend (which may be auto-detected)
      if (homeLocation && Object.keys(homeLocation).length > 0 && 
          (homeLocation.city || homeLocation.country)) {
        primaryLocation = {
          city: homeLocation.city || null,
          region: homeLocation.region || null,
          country: homeLocation.country || null,
          countryCode: homeLocation.country ? countryCodeMap[homeLocation.country] || null : null,
          coordinates: homeLocation.coordinates || null,
          detectedFromIP: false // Since user confirmed/edited it in the form
        };
        console.log('Using user-provided location:', primaryLocation);
      } else {
        // No location provided - use null values
        primaryLocation = {
          ...defaultLocation,
          detectedFromIP: false
        };
        console.log('No location provided by user:', primaryLocation);
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
        locations: {
          primary: primaryLocation
        }
      });
      await user.save();
      
      // Set profile picture URL (R2 location or local path)
      const profilePic = req.file 
        ? (req.file.location || getPublicUrl(`profile-pictures/${req.file.filename}`))
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
    const { profilePic, ...updatedFields } = req.body; // Ensure profilePic isn't overwritten

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updatedFields,
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ message: 'Profile updated successfully', user });
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
router.put('/profile-pic', authMiddleware, upload.single('profilePic'), async (req, res) => {
  try {
      if (!req.file) {
          console.log("❌ No file uploaded");
          return res.status(400).json({ error: 'No file uploaded' });
      }

      // Get profile picture URL (works for both R2 and local)
      const profilePicPath = req.file.location || getPublicUrl(`profile-pictures/${req.file.filename}`);

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

    res.json({
      message: 'User profile fetched successfully',
      user: {
        id: user.uuid, // Use UUID as primary ID for external API
        uuid: user.uuid,
        username: user.username,
        profilePic: user.profilePic,
        email: user.email,
        balance: user.balance,
        personalInviteCode: user.personalInviteCode,
        homeLocation: user.homeLocation,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        globalUserAggregateRank: userAggregateRank,
        globalUserBidAvg: globalUserBidAvg,
        globalUserBids: globalUserBids,
        creatorProfile: user.creatorProfile,
      },
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
      .select('username profilePic createdAt homeLocation uuid')
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      personalInviteCode: user.personalInviteCode,
      referralCount: referrals.length,
      referrals: referrals.map(r => ({
        username: r.username,
        profilePic: r.profilePic,
        joinedAt: r.createdAt,
        location: r.homeLocation,
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
    const { limit = 20 } = req.query;

    console.log('🏷️ User tag rankings request for:', userId);

    // Resolve user ID
    const User = require('../models/User');
    const Bid = require('../models/Bid');
    const Media = require('../models/Media');
    
    // Use ObjectId directly (no resolution needed)
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Get all active bids by this user
    const userBids = await Bid.find({ 
      userId: userId,
      status: 'active'
    })
      .populate('mediaId', 'tags')
      .lean();

    console.log(`📊 Found ${userBids.length} active bids for user`);

    // Aggregate by tag (GlobalUserTagAggregate)
    const tagAggregates = {};
    userBids.forEach(bid => {
      if (bid.mediaId?.tags) {
        bid.mediaId.tags.forEach(tag => {
          tagAggregates[tag] = (tagAggregates[tag] || 0) + bid.amount;
        });
      }
    });

    console.log(`📊 User has bid on ${Object.keys(tagAggregates).length} different tags`);

    // Calculate GlobalUserTagAggregateRank for each tag
    const tagRankings = [];
    
    for (const [tag, userAggregate] of Object.entries(tagAggregates)) {
      // Get all bids on media with this tag
      const mediaWithTag = await Media.find({ tags: tag }).select('_id').lean();
      const mediaIds = mediaWithTag.map(m => m._id);
      
      // Get all bids on these media items
      const allBidsForTag = await Bid.find({
        mediaId: { $in: mediaIds },
        status: 'active'
      }).lean();
      
      // Aggregate by user
      const userTagTotals = {};
      allBidsForTag.forEach(bid => {
        const uid = bid.userId.toString();
        userTagTotals[uid] = (userTagTotals[uid] || 0) + bid.amount;
      });
      
      // Sort users by aggregate
      const sortedUsers = Object.entries(userTagTotals)
        .sort(([, a], [, b]) => b - a);
      
      // Find this user's rank
      const rankIndex = sortedUsers.findIndex(([uid]) => uid === resolvedUserId.toString());
      const rank = rankIndex + 1;
      const totalUsers = sortedUsers.length;
      const percentile = totalUsers > 0 ? ((totalUsers - rank) / totalUsers * 100).toFixed(1) : '0';
      
      tagRankings.push({
        tag,
        aggregate: userAggregate,
        rank,
        totalUsers,
        percentile: parseFloat(percentile)
      });
      
      console.log(`  Tag "${tag}": £${userAggregate.toFixed(2)} - Rank #${rank} of ${totalUsers}`);
    }

    // Sort by aggregate (highest first)
    tagRankings.sort((a, b) => b.aggregate - a.aggregate);

    // Limit results
    const limitedRankings = tagRankings.slice(0, parseInt(limit));

    console.log('✅ Returning', limitedRankings.length, 'tag rankings');

    res.json({
      tagRankings: limitedRankings,
      totalTags: tagRankings.length
    });
  } catch (error) {
    console.error('Error fetching user tag rankings:', error);
    res.status(500).json({ error: 'Failed to fetch tag rankings' });
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
