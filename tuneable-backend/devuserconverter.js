const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('./models/user'); // Adjust the path to your User model

// Generate a consistent ObjectId for the dev-user
const devUserId = new mongoose.Types.ObjectId(
    crypto.createHash('md5').update('dev-user').digest('hex').substring(0, 24)
);

// Create or validate the existence of the dev-user
async function createDevUser() {
    try {
        const existingUser = await User.findById(devUserId);
        if (existingUser) {
            console.log('Dev user already exists:', existingUser);
            return existingUser;
        }

        const devUser = {
            _id: devUserId,
            username: 'dev-user',
            email: 'dev@example.com',
            password: bcrypt.hashSync('password123', 10), // Secure hashed password
            role: 'developer',
        };

        const newUser = await User.create(devUser);
        console.log('Dev user created successfully:', newUser);
        return newUser;
    } catch (error) {
        console.error('Error creating dev user:', error);
    }
}

module.exports = createDevUser;
