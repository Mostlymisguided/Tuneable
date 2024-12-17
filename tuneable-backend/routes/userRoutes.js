const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

const SECRET_KEY = "YOUR_SUPER_SECRET_KEY"; // Replace with an actual secret or ENV variable

// POST: Register a new user
router.post('/register', async (req, res) => {
    try {
      const { username, email, password } = req.body;
  
      // Create a new user instance
      const user = new User({ username, email, password });
      await user.save();  // the pre('save') hook will hash the password
  
      // Return a response without exposing the password
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
        }
      });
    } catch (error) {
      res.status(500).json({ 
        error: 'Error registering user', 
        details: error.message 
      });
    }
  });

// Login route
router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // 1. Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
  
      // 2. Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
  
      // 3. Generate JWT token
      const token = jwt.sign(
        { userId: user._id, email: user.email },
        SECRET_KEY,
        { expiresIn: '1h' } // Token expires in 1 hour
      );
  
      // 4. Return token
      res.json({
        message: 'Login successful!',
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Error logging in', details: error.message });
    }
  });

    // Protected route example

    /*
    router.get('/profile', authMiddleware, async (req, res) => {
        try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            message: 'User profile',
            user: {
            _id: user._id,
            username: user.username,
            email: user.email,
            },
        });
        } catch (error) {
        res.status(500).json({ error: 'Error fetching user data', details: error.message });
        }

        
    });*/

module.exports = router;