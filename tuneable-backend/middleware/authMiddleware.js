const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET || "bananasarebluewhenpigsfly";
const DEV_TOKEN = process.env.DEV_WEB_TOKEN; // Development token
const DEV_USER_ID = "677c1bf9b3b165a02481566a"; // Valid ObjectId for dev-user

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Debug log for incoming authorization header
  if (process.env.NODE_ENV !== "production") {
    console.log("Incoming Authorization Header:", authHeader);
  }

  // Check if the Authorization header exists
  if (!authHeader) {
    console.error("No Authorization header provided");
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    console.error("Malformed Authorization header:", authHeader);
    return res.status(401).json({ error: "Malformed token" });
  }

  try {
    // Verify the token using the secret key
    const decoded = jwt.verify(token, SECRET_KEY);

    // Debug log for token verification
    if (process.env.NODE_ENV !== "production") {
      console.log("Token verified successfully. Decoded token:", decoded);
    }

    // Validate the userId format
    if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
      console.error("Invalid userId format in token:", decoded.userId);
      throw new Error("Invalid userId format in token");
    }

    // Attach user data to the request
    req.user = decoded;

    console.log("Authenticated user:", req.user);
    next();
  } catch (err) {
    // Handle DEV_TOKEN in development mode
    if (process.env.NODE_ENV !== "production" && token === DEV_TOKEN) {
      console.warn("Using DEV_TOKEN for authentication");

      req.user = {
        userId: DEV_USER_ID,
        role: "developer",
      };

      console.log("Authenticated as developer with DEV_TOKEN:", req.user);
      return next();
    }

    console.error("JWT verification failed:", err.message);
    res.status(401).json({ error: "Invalid token", details: err.message });
  }
};
