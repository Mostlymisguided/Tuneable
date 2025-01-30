const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || 'bananasarebluewhenpigsfly';

// Register a new user
router.post(
  '/register',
  [
    check('username').notEmpty().withMessage('Username is required'),
    check('email').isEmail().withMessage('Valid email is required'),
    check('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
  ],
  async (req, res) => {
    console.log('Incoming registration request:', req.body); // Debug log for registration input

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { username, email, password, homeLocation } = req.body;

      const existingUser = await User.findOne({ $or: [{ email }, { username }] });
      if (existingUser) {
        console.error('Email or username already in use:', { email, username });
        return res.status(400).json({ error: 'Email or username already in use' });
      }

/*      const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
      console.log('Original password:', password);
      console.log('Hashed password:', hashedPassword); */

      const user = new User({
        username,
        email,
        password,
        homeLocation: homeLocation || {},
      });
      await user.save();
      console.log('User registered successfully:', user);

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          homeLocation: user.homeLocation,
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
    console.log('Incoming login request:', req.body); // Debug log for login input

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        console.warn('No user found with email:', email);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        console.warn('Password mismatch for email:', email);
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      console.log('Entered password:', password);
      console.log('Stored hashed password:', user.password);
      
      const token = jwt.sign(
        { userId: user._id, email: user.email, username: user.username, role: 'user' },
        SECRET_KEY,
        { expiresIn: '24h' }
      );
      console.log('Generated token:', token);

      res.json({
        message: 'Login successful!',
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
        },
      });
    } catch (error) {
      console.error('Error logging in:', error.message);
      res.status(500).json({ error: 'Error logging in', details: error.message });
    }
  }
);

// Protected profile route
router.get('/profile', authMiddleware, async (req, res) => {
  console.log('Fetching profile for userId:', req.user.userId); // Debug log for profile access

  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      console.warn('User not found for userId:', req.user.userId);
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User profile', user });
  } catch (error) {
    console.error('Error fetching user profile:', error.message);
    res.status(500).json({ error: 'Error fetching user data', details: error.message });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  console.log('Updating profile for userId:', req.user.userId, 'with data:', req.body); // Debug log

  try {
    const { avatar, bio, preferences } = req.body;

    const updatedFields = {};
    if (avatar) updatedFields.avatar = avatar;
    if (bio) updatedFields.bio = bio;
    if (preferences) updatedFields.preferences = preferences;

    const user = await User.findByIdAndUpdate(req.user.userId, updatedFields, {
      new: true,
    }).select('-password');
    if (!user) {
      console.warn('User not found for update with userId:', req.user.userId);
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Profile updated successfully', user });
  } catch (error) {
    console.error('Error updating profile:', error.message);
    res.status(500).json({ error: 'Error updating profile', details: error.message });
  }
});

module.exports = router;
