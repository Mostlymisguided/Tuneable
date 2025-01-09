const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

const SECRET_KEY = process.env.JWT_SECRET || 'bananasarebluewhenpigsfly'; // Use ENV variable or fallback

// POST: Register a new user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, homeLocation } = req.body;

    // Check if email or username already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already in use' });
    }

    // Create a new user instance
    const user = new User({
      username,
      email,
      password,
      homeLocation: homeLocation || {}, // Optional homeLocation field
    });
    await user.save(); // The pre('save') hook will hash the password

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        homeLocation: user.homeLocation, // Include homeLocation in response
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error registering user',
      details: error.message,
    });
  }
});

// POST: Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid Email' });
    }

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid Password' });
    }

    // 3. Generate JWT token
const token = jwt.sign(
  { 
    userId: user._id, 
    email: user.email, 
    username: user.username, // Include username in the token
    role: 'user' // Add role or additional claims if needed
  }, 
  SECRET_KEY, 
  { expiresIn: '7d' }
);

    // 4. Return token
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
    res.status(500).json({ error: 'Error logging in', details: error.message });
  }
});

// GET: Protected profile route
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password'); // Exclude password
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User profile',
      user,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user data', details: error.message });
  }
});

// PUT: Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { avatar, bio, preferences } = req.body;

    // Update fields selectively
    const updatedFields = {};
    if (avatar) updatedFields.avatar = avatar;
    if (bio) updatedFields.bio = bio;
    if (preferences) updatedFields.preferences = preferences;

    const user = await User.findByIdAndUpdate(req.user.userId, updatedFields, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error updating profile', details: error.message });
  }
});

module.exports = router;
