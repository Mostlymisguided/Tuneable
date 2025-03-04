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
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || 'JWT Secret failed to fly';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
      const userId = req.user?.userId || 'placeholder';
      const timestamp = Date.now();
      const fileExt = path.extname(file.originalname);
      cb(null, `${userId}-${timestamp}-profilepic${fileExt}`);
  }
});

const upload = multer({ storage: storage });
    
// Generate unique personal invite code
const deriveCodeFromUserId = (userId) => {
  return crypto.createHash('md5').update(userId.toString()).digest('hex').substring(0, 5).toUpperCase();
};

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
    check('inviteCode')
      .isLength(4)
      .withMessage('Invite Code must be 4 characters long'),
  ],
  async (req, res) => {
    console.log('Incoming registration request:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { username, email, password, inviteCode, cellPhone, givenName, familyName, homeLocation } = req.body;
      
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
        parentInviteCode: inviteCode,
        cellPhone: cellPhone || '',
        givenName: givenName || '',
        familyName: familyName || '',
        homeLocation: locationInfo,
      });
      await user.save();
      
      const timestamp = Date.now();
      const profilePic = req.file 
        ? `/uploads/${user._id}-${timestamp}-profilepic${req.file.originalname.substring(req.file.originalname.lastIndexOf('.'))}` 
        : null;
      user.profilePic = profilePic;
      await user.save();
      
      console.log('User registered successfully:', user);

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          personalInviteCode: user.personalInviteCode,
          cellPhone: user.cellPhone,
          givenName: user.givenName,
          familyName: user.familyName,
          homeLocation: user.homeLocation,
          profilePic: user.profilePic,
        },
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
      const token = jwt.sign({ userId: user._id, email: user.email, username: user.username }, SECRET_KEY, { expiresIn: '24h' });
      res.json({ message: 'Login successful!', token, user });
    } catch (error) {
      res.status(500).json({ error: 'Error logging in', details: error.message });
    }
  }
);

// Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User profile', user });
  } catch (error) {
    res.status(500).json({ error: 'Error ing user profile', details: error.message });
  }
});

// Update user profile (excluding profile picture)
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { profilePic, ...updatedFields } = req.body; // Ensure profilePic isn't overwritten

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updatedFields,
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ message: 'Profile updated successfully', user });
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

      const profilePicPath = `/uploads/${req.file.filename}`;

      console.log(`📸 Saving profile pic: ${profilePicPath} for user ${req.user.userId}`);

      const user = await User.findByIdAndUpdate(
          req.user.userId,
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

module.exports = router;
