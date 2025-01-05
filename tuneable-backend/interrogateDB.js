const mongoose = require('mongoose');
require('dotenv').config();

// Import your User model (adjust the path as necessary)
const User = require('./models/user'); 

// Connect to MongoDB
async function connectToDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
}

// Example queries
async function interrogateDB() {
    try {
        // Find all users
        const users = await User.find({});
        console.log('All Users:', users);

        // Find a specific user by email
        const specificUser = await User.findOne({ email: 'dev@example.com' });
        console.log('Specific User:', specificUser);

        // Count the number of users
        const userCount = await User.countDocuments({});
        console.log('Total Number of Users:', userCount);

        // Find users with a specific role
        const developers = await User.find({ role: 'developer' });
        console.log('Developers:', developers);
    } catch (error) {
        console.error('Error interrogating the database:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the functions
(async () => {
    await connectToDB();
    await interrogateDB();
})();
