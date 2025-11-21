const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

const SECRET_KEY = process.env.JWT_SECRET || "defaultsecretkey";

/**
 * Optional auth middleware - allows unauthenticated access but populates req.user if token is present
 * This is useful for public routes that can be viewed without login but may have enhanced features for logged-in users
 */
module.exports = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    // If no auth header, continue without user (for public access)
    if (!authHeader) {
        req.user = null;
        return next();
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);

        // Fetch user by UUID (new approach) or fallback to _id (legacy support)
        let user;
        
        if (decoded.userId && decoded.userId.includes('-')) {
            // UUID format - look up by uuid field
            user = await User.findOne({ uuid: decoded.userId }).select("_id uuid username email role googleAccessToken");
        } else if (mongoose.Types.ObjectId.isValid(decoded.userId)) {
            // Legacy ObjectId format - look up by _id for backward compatibility
            user = await User.findById(decoded.userId).select("_id uuid username email role googleAccessToken");
        } else {
            req.user = null;
            return next();
        }

        if (user) {
            req.user = user;
            console.log("✅ Authenticated User:", req.user.username, "(UUID:", req.user.uuid + ")");
        } else {
            req.user = null;
        }
    } catch (err) {
        // Invalid token - continue without user (for public access)
        req.user = null;
    }
    
    next();
};

