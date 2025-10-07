const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User"); // Import User model

const SECRET_KEY = process.env.JWT_SECRET || "defaultsecretkey";

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
        const decoded = jwt.verify(token, SECRET_KEY);

        // Fetch user by UUID (new approach) or fallback to _id (legacy support)
        let user;
        
        // Check if userId looks like a UUID (contains hyphens) or ObjectId (24 hex chars)
        if (decoded.userId && decoded.userId.includes('-')) {
            // UUID format - look up by uuid field
            user = await User.findOne({ uuid: decoded.userId }).select("_id uuid username email");
        } else if (mongoose.Types.ObjectId.isValid(decoded.userId)) {
            // Legacy ObjectId format - look up by _id for backward compatibility
            user = await User.findById(decoded.userId).select("_id uuid username email");
        } else {
            throw new Error("Invalid userId format in token");
        }

        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        // Attach the full user object to req.user
        req.user = user;

        console.log("✅ Authenticated User:", req.user.username, "(UUID:", req.user.uuid + ")");
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid token", details: err.message });
    }
};
