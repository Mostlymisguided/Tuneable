const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Import User model
const User = require('./tuneable-backend/models/User');

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/tuneable');
    console.log('✅ Connected to MongoDB');
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: 'test@example.com' });
    if (existingUser) {
      console.log('👤 Test user already exists:', existingUser.email);
      return;
    }
    
    // Create test user
    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = new User({
      username: 'testuser',
      email: 'test@example.com',
      password: hashedPassword
    });
    
    await user.save();
    console.log('✅ Test user created:', user.email);
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    console.log('🔑 JWT Token:', token);
    console.log('📝 Add this token to localStorage in your browser:');
    console.log(`localStorage.setItem('token', '${token}');`);
    
  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

createTestUser();
