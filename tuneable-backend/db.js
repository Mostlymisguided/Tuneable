const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Use the MONGO_URI from environment variables if available, otherwise default to localhost
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tuneable';
    
    // Connection options for better reliability
    const options = {
      serverSelectionTimeoutMS: 5000, // How long to try selecting a server
      socketTimeoutMS: 45000, // How long to wait for a socket connection
      connectTimeoutMS: 10000, // How long to wait for initial connection
      maxPoolSize: 10, // Maximum number of connections in the pool
      minPoolSize: 2, // Minimum number of connections in the pool
      retryWrites: true, // Retry writes if they fail
      w: 'majority' // Write concern
    };
    
    console.log('Connecting to MongoDB...');
    // Don't log the full URI for security (might contain credentials)
    const uriDisplay = mongoURI.includes('@') 
      ? mongoURI.split('@')[1] 
      : mongoURI;
    console.log('MongoDB URI:', uriDisplay);
    
    await mongoose.connect(mongoURI, options);
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    
    // Provide helpful error messages
    if (err.name === 'MongooseServerSelectionError') {
      console.error('\n💡 Troubleshooting tips:');
      console.error('   1. Check if your IP address is whitelisted in MongoDB Atlas');
      console.error('   2. Verify your connection string is correct');
      console.error('   3. Check your network connectivity');
      console.error('   4. Ensure MongoDB Atlas cluster is running');
      console.error('\n   MongoDB Atlas IP Whitelist: https://www.mongodb.com/docs/atlas/security-whitelist/');
    } else if (err.name === 'MongoNetworkError') {
      console.error('\n💡 Network error - check your internet connection and firewall settings');
    } else if (err.message.includes('authentication')) {
      console.error('\n💡 Authentication error - check your MongoDB username and password');
    }
    
    // Don't exit immediately - let the app continue (it will retry on operations)
    // process.exit(1); // Commented out to allow app to start even if DB is temporarily unavailable
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB disconnected');
  } catch (err) {
    console.error('MongoDB disconnection error:', err);
  }
};

module.exports = { connectDB, disconnectDB };
