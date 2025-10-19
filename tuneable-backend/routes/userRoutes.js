const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const geoip = require('geoip-lite'); // Added geoip-lite
const User = require('../models/User');
const InviteRequest = require('../models/InviteRequest');
const authMiddleware = require('../middleware/authMiddleware');
const { transformResponse } = require('../utils/uuidTransform');
const { sendUserRegistrationNotification } = require('../utils/emailService');
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
      
      // Extract IP address using x-forwarded-for if available, otherwise fallback to connection IP
      const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      // Lookup geolocation based on IP address
      const geo = geoip.lookup(ip);
      console.log(`Registration IP: ${ip}, Geo: ${JSON.stringify(geo)}`);
      
      // Determine homeLocation with fallback logic:
      const defaultLocation = { city: 'Antarctica', country: 'Antarctica' };
      let locationInfo;
      // Check if a homeLocation object was provided and has keys
      if (homeLocation && Object.keys(homeLocation).length > 0) {
        // If both city and country are empty strings, use the default Antarctica location
        if (
          (!homeLocation.city || homeLocation.city.trim() === '') &&
          (!homeLocation.country || homeLocation.country.trim() === '')
        ) {
          locationInfo = defaultLocation;
        } else {
          locationInfo = homeLocation;
        }
      } else if (geo) {
        locationInfo = geo;
      } else {
        locationInfo = defaultLocation;
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
        homeLocation: locationInfo,
      });
      await user.save();
      
      // Set profile picture URL (R2 location or local path)
      const profilePic = req.file 
        ? (req.file.location || getPublicUrl(`profile-pictures/${req.file.filename}`))
        : null;
      user.profilePic = profilePic;
      await user.save();
      
      console.log('User registered successfully:', user);

      // Send email notification to admin
      try {
        await sendUserRegistrationNotification(user);
      } catch (emailError) {
        console.error('Failed to send registration notification email:', emailError);
        // Don't fail the request if email fails
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

      res.status(201).json(transformResponse({
        message: 'User registered successfully',
        token,  // Include token for auto-login
        user: user,
      }));
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

      res.json(transformResponse({ message: 'Login successful!', token, user }));
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
    res.json(transformResponse({ message: 'User profile', user }));
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

    res.json(transformResponse({ message: 'Profile updated successfully', user }));
  } catch (error) {
    res.status(500).json({ error: 'Error updating profile', details: error.message });
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
      res.json(transformResponse({ message: 'Profile picture updated successfully', user }));
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
            song: {
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
    const songsWithBids = Object.values(bidsByMedia)
      .sort((a, b) => b.totalAmount - a.totalAmount);

    res.json(transformResponse({
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
      },
      stats: {
        totalBids,
        totalAmountBid,
        averageBidAmount,
        uniqueSongsCount: uniqueMedia.length, // Renamed but keeping field name for frontend compatibility
      },
      topBids,
      songsWithBids, // Keeping field name for frontend compatibility
    }));

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
    
    res.status(201).json(transformResponse({
      message: 'Invite request submitted successfully. We will review it and get back to you soon!',
      request: {
        email: inviteRequest.email,
        name: inviteRequest.name,
        status: inviteRequest.status
      }
    }));
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
    
    res.json(transformResponse({
      personalInviteCode: user.personalInviteCode,
      referralCount: referrals.length,
      referrals: referrals.map(r => ({
        username: r.username,
        profilePic: r.profilePic,
        joinedAt: r.createdAt,
        location: r.homeLocation,
        uuid: r.uuid
      }))
    }));
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ error: 'Failed to fetch referrals' });
  }
});

module.exports = router;
