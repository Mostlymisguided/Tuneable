const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'bananasarebluewhenpigsfly';
const DEV_TOKEN = process.env.DEV_WEB_TOKEN; // Replace with your actual dev token
const DEV_USER_ID = '677c1bf9b3b165a02481566a'; // Valid ObjectId for dev-user

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (process.env.NODE_ENV !== 'production') {
        console.log('Incoming Authorization Header:', authHeader);
    }

    if (!authHeader) {
        console.error('No Authorization header provided');
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        console.error('Malformed Authorization header:', authHeader);
        return res.status(401).json({ error: 'Malformed token' });
    }

    // Allow permanent dev token for development mode
    if (token === DEV_TOKEN) {
        req.user = {
            userId: DEV_USER_ID, // Use the valid ObjectId for dev-user
            role: 'developer',
        };
        if (process.env.NODE_ENV !== 'production') {
            console.log('Using DEV_TOKEN for authentication:', req.user);
        }
        return next();
    }

    // Verify JWT token
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            console.error('JWT verification failed:', err.message);
            return res.status(401).json({ error: 'Invalid token', details: err.message });
        }

        // Check `userId` format
        const { userId } = decoded;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.error('Invalid userId format in token:', userId);
            return res.status(400).json({ error: 'Invalid userId format in token' });
        }

        // Add decoded token data to `req.user`
        req.user = decoded;
        if (process.env.NODE_ENV !== 'production') {
            console.log('Token verified successfully. Decoded token:', decoded);
        }

        next();
    });
};
