const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const SECRET_KEY = process.env.JWT_SECRET || 'defaultsecretkey';

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // Check if the Authorization header exists
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Malformed token' });
    }

    try {
        // Verify the token using the secret key
        const decoded = jwt.verify(token, SECRET_KEY);

        // Validate that userId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
            throw new Error('Invalid userId format in token');
        }

        // Attach user data to the request
        req.user = decoded;

        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token', details: err.message });
    }
};
