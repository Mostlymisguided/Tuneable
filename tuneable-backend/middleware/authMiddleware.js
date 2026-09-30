const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User"); // Import User model
const { isTokenRevoked } = require("../utils/sessionRevocation");
const { getJwtSecret } = require("../config/jwtSecret");

module.exports = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Malformed token" });
    }

    try {
        const decoded = jwt.verify(token, getJwtSecret());

        // Fetch user by UUID (new approach) or fallback to _id (legacy support)
        let user;
        
        // Check if userId looks like a UUID (contains hyphens) or ObjectId (24 hex chars)
        if (decoded.userId && decoded.userId.includes('-')) {
            // UUID format - look up by uuid field
            user = await User.findOne({ uuid: decoded.userId }).select("_id uuid username email role googleAccessToken isActive walletFrozenAt passwordChangedAt");
        } else if (mongoose.Types.ObjectId.isValid(decoded.userId)) {
            // Legacy ObjectId format - look up by _id for backward compatibility
            user = await User.findById(decoded.userId).select("_id uuid username email role googleAccessToken isActive walletFrozenAt passwordChangedAt");
        } else {
            throw new Error("Invalid userId format in token");
        }

        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (isTokenRevoked(decoded, user)) {
            return res.status(401).json({ error: "Session expired. Please sign in again.", code: "SESSION_REVOKED" });
        }

        if (user.isActive === false) {
            return res.status(403).json({ error: "Account is inactive", code: "ACCOUNT_INACTIVE" });
        }

        // Attach the full user object to req.user
        req.user = user;

        console.log("✅ Authenticated User:", req.user.username, "(UUID:", req.user.uuid + ")");
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid token", details: err.message });
    }
};
