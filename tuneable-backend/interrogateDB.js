const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables

// Import models
const User = require('./models/user'); // Adjust paths as needed
const Party = require('./models/party');
const Bid = require('./models/bid');
const Song = require('./models/song');

// Connect to MongoDB
async function connectToDB() {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/tuneable';
        console.log('Connecting to MongoDB at:', uri);
        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error;
    }
}

// Fetch all users
async function fetchUsers() {
    try {
        const users = await User.find({});
        console.log('\n--- All Users ---');
        console.log(users);

        const userCount = await User.countDocuments({});
        console.log('\n--- Total Number of Users ---');
        console.log(userCount);
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

// Fetch all bids
async function fetchBids() {
    try {
        const bids = await Bid.find({}).populate('userId partyId songId');
        console.log('\n--- All Bids ---');
        console.log(bids);

        const bidCount = await Bid.countDocuments({});
        console.log('\n--- Total Number of Bids ---');
        console.log(bidCount);
    } catch (error) {
        console.error('Error fetching bids:', error);
    }
}

// Fetch all parties
async function fetchParties() {
    try {
        const parties = await Party.find({}).populate('host attendees songs');
        console.log('\n--- All Parties ---');
        console.log(parties);

        const partyCount = await Party.countDocuments({});
        console.log('\n--- Total Number of Parties ---');
        console.log(partyCount);
    } catch (error) {
        console.error('Error fetching parties:', error);
    }
}

// Fetch all songs
async function fetchSongs() {
    try {
        const songs = await Song.find({});
        console.log('\n--- All Songs ---');
        console.log(songs);

        const songCount = await Song.countDocuments({});
        console.log('\n--- Total Number of Songs ---');
        console.log(songCount);
    } catch (error) {
        console.error('Error fetching songs:', error);
    }
}

// Interrogate the database
async function interrogateDB() {
    try {
        console.log('\n--- Fetching Users ---');
        await fetchUsers();

        console.log('\n--- Fetching Bids ---');
        await fetchBids();

        console.log('\n--- Fetching Parties ---');
        await fetchParties();

        console.log('\n--- Fetching Songs ---');
        await fetchSongs();
    } catch (error) {
        console.error('Error interrogating the database:', error);
    } finally {
        mongoose.connection.close();
    }
}

// Run the script
(async () => {
    try {
        await connectToDB();
        await interrogateDB();
    } catch (error) {
        console.error('Script failed:', error);
    }
})();
