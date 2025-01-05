const mongoose = require('mongoose');
require('dotenv').config();

// Import your User model
const User = require('./models/user'); // Adjust the path to your User model

async function fetchUsers() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        // Fetch users
        const users = await User.find({});
        console.log('Users:', users);
    } catch (error) {
        console.error('Error fetching users:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the script
fetchUsers();
    